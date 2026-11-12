import type { FastifyPluginAsync } from 'fastify';
import type { Db } from '../db/pool';
import { AppError } from '../errors';

export const healthRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  // Liveness: no dependencies.
  app.get('/healthz', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));
  // Readiness: the database is reachable.
  app.get('/readyz', { config: { rateLimit: false } }, async (req) => {
    if (app.shuttingDown) throw new AppError('unavailable', 'Shutting down');
    try {
      await db.query('SELECT 1');
    } catch (e) {
      req.log.warn({ err: (e as Error).message }, 'readiness check failed');
      throw new AppError('unavailable', 'Database unavailable');
    }
    return { status: 'ready' };
  });
};
