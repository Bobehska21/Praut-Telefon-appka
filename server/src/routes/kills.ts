import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../app';
import { completeKill, createChallenge } from '../kills';
import { uuid } from '../schemas';

const challengeBody = z.object({ targetPlayerId: uuid });
const killBody = z.object({ challengeId: uuid, signature: z.string().min(8).max(200) });

export const killRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  app.post(
    '/kills/challenge',
    { config: { rateLimit: { max: deps.config.rateLimit.challengePerMin, timeWindow: '1 minute', keyGenerator: (r) => r.headers.authorization ?? r.ip } } },
    async (req, reply) => {
      const b = challengeBody.parse(req.body);
      return reply.status(201).send(await createChallenge(deps, req.player.id, b.targetPlayerId));
    },
  );
  app.post('/kills', async (req, reply) => {
    const b = killBody.parse(req.body);
    return reply.status(201).send(await completeKill(deps, req.player.id, b.challengeId, b.signature));
  });
};
