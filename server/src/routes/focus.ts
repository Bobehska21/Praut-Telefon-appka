import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../app';
import { AppError } from '../errors';
import { heartbeat, startFocus, stopFocus } from '../focus';

const startBody = z
  .object({
    multiplier: z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10)]).optional(),
    /** Points staked on the session (required with a multiplier above 1). */
    stakePoints: z.number().int().min(1).max(1_000_000).optional(),
    /** The timer length in ms (required with a multiplier above 1). */
    durationMs: z.number().int().min(1).max(24 * 3_600_000).optional(),
  })
  .optional();
const stopBody = z.object({ reason: z.enum(['manual', 'expired']) });

export const focusRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock } = deps;
  app.post('/focus/start', async (req) => {
    const b = startBody.parse(req.body);
    const multiplier = b?.multiplier ?? 1;
    if (multiplier > 1 && (b?.stakePoints === undefined || b.durationMs === undefined)) {
      throw new AppError('validation', 'A bet needs stakePoints and durationMs');
    }
    const bet = multiplier > 1 ? { multiplier, stakePoints: b!.stakePoints!, durationMs: b!.durationMs! } : undefined;
    return startFocus(db, req.player.id, clock.now(), bet);
  });
  app.post('/focus/heartbeat', async (req) => heartbeat(db, req.player.id, clock.now()));
  app.post('/focus/stop', async (req) => {
    const b = stopBody.parse(req.body);
    return stopFocus(db, req.player.id, b.reason, clock.now());
  });
};
