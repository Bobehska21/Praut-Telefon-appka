import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { Config } from './config';
import type { Db } from './db/pool';
import type { Clock } from './clock';
import type { PhotoStorage } from './storage';
import { AppError } from './errors';
import { hashToken } from './crypto';
import type { PlayerRow } from './players';
import { healthRoutes } from './routes/health';
import { authRoutes, authedAuthRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { focusRoutes } from './routes/focus';
import { killRoutes } from './routes/kills';
import { eventRoutes } from './routes/events';
import { statsRoutes } from './routes/stats';
import { devRoutes } from './routes/dev';
import { blockRoutes } from './routes/blocks';
import { nearbyRoutes } from './routes/nearby';
import { leaderboardRoutes } from './routes/leaderboard';
import { photoRoutes } from './routes/photos';
import { reportRoutes } from './routes/reports';
import { adminRoutes } from './routes/admin';
import { adminPlayerRoutes } from './routes/admin-players';

export interface Deps {
  config: Config;
  db: Db;
  clock: Clock;
  storage: PhotoStorage;
}

declare module 'fastify' {
  interface FastifyRequest {
    player: PlayerRow;
    tokenHash: Buffer;
  }
  interface FastifyInstance {
    shuttingDown: boolean;
  }
}

export async function buildApp(deps: Deps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    genReqId: (req) => {
      const h = req.headers['x-request-id'];
      return typeof h === 'string' && /^[\w.-]{1,64}$/.test(h) ? h : randomUUID();
    },
    trustProxy: config.trustProxy,
    bodyLimit: 32 * 1024,
  });
  app.shuttingDown = false;
  if (config.devFakeMinutes) {
    app.log.warn('DEV_FAKE_MINUTES is ENABLED: POST /v1/dev/focus-minutes lets any player grant themselves focus minutes. Development only.');
  }
  app.addHook('onClose', async () => {
    app.shuttingDown = true;
  });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      if (typeof err.extra.retryAfterSeconds === 'number') reply.header('retry-after', String(err.extra.retryAfterSeconds));
      return reply.status(err.status).send(err.body());
    }
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, ...((i as { params?: object }).params ?? {}) }));
      return reply.status(400).send(new AppError('validation', 'Invalid request', { issues }).body());
    }
    const e = err as { statusCode?: number; code?: string };
    if (e.statusCode === 429) return reply.status(429).send(new AppError('rate_limited', 'Too many requests').body());
    if (typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500) {
      const msg = e.statusCode === 413 ? 'Body too large' : e.statusCode === 415 ? 'Unsupported media type' : 'Invalid request';
      return reply.status(e.statusCode === 413 || e.statusCode === 415 ? e.statusCode : 400).send(new AppError('validation', msg).body());
    }
    req.log.error({ err: { type: (err as Error).name, message: (err as Error).message } }, 'unhandled error');
    return reply.status(500).send(new AppError('internal', 'Internal error').body());
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send(new AppError('not_found', 'Not found').body()));

  await app.register(rateLimit, {
    global: true,
    max: config.rateLimit.globalPerMin,
    timeWindow: '1 minute',
    errorResponseBuilder: () => new AppError('rate_limited', 'Too many requests'),
  });

  await app.register(healthRoutes, { db });
  await app.register(authRoutes, { deps });

  await app.register(
    async (v1) => {
      v1.addHook('preHandler', async (req: FastifyRequest) => {
        const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '');
        if (!m) throw new AppError('unauthorized', 'Missing or invalid token');
        const tokenHash = hashToken(m[1]!);
        const r = await db.query<PlayerRow>(
          'SELECT p.* FROM auth_tokens t JOIN players p ON p.id = t.player_id WHERE t.token_hash = $1',
          [tokenHash],
        );
        const player = r.rows[0];
        if (!player) throw new AppError('unauthorized', 'Missing or invalid token');
        req.player = player;
        req.tokenHash = tokenHash;
      });
      await v1.register(authedAuthRoutes, { deps });
      await v1.register(meRoutes, { deps });
      await v1.register(focusRoutes, { deps });
      await v1.register(killRoutes, { deps });
      await v1.register(eventRoutes, { deps });
      await v1.register(statsRoutes, { deps });
      if (config.devFakeMinutes) await v1.register(devRoutes, { deps });
      await v1.register(blockRoutes, { deps });
      await v1.register(nearbyRoutes, { deps });
      await v1.register(leaderboardRoutes, { deps });
      await v1.register(photoRoutes, { deps });
      await v1.register(reportRoutes, { deps });
      await v1.register(adminPlayerRoutes, { deps });
    },
    { prefix: '/v1' },
  );

  await app.register(adminRoutes, { deps, prefix: '/admin' });

  return app;
}
