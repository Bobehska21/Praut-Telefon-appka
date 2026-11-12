import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../app';
import { type BetMultiplier } from '../domain/bets';
import { heartbeat, startFocus, stopFocus } from '../focus';

const startBody = z.object({ multiplier: z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10)]).optional() }).optional();
const stopBody = z.object({ reason: z.enum(['manual', 'expired']) });

export const focusRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock } = deps;
  app.post('/focus/start', async (req) => {
    const b = startBody.parse(req.body);
    return startFocus(db, req.player.id, clock.now(), (b?.multiplier ?? 1) as BetMultiplier);
  });
  app.post('/focus/heartbeat', async (req) => heartbeat(db, req.player.id, clock.now()));
  app.post('/focus/stop', async (req) => {
    const b = stopBody.parse(req.body);
    return stopFocus(db, req.player.id, b.reason, clock.now());
  });
};
