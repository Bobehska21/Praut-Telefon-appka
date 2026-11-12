import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../app';
import { heartbeat, startFocus, stopFocus } from '../focus';

const stopBody = z.object({ reason: z.enum(['manual', 'expired']) });

export const focusRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock } = deps;
  app.post('/focus/start', async (req) => startFocus(db, req.player.id, clock.now()));
  app.post('/focus/heartbeat', async (req) => heartbeat(db, req.player.id, clock.now()));
  app.post('/focus/stop', async (req) => {
    const b = stopBody.parse(req.body);
    return stopFocus(db, req.player.id, b.reason, clock.now());
  });
};
