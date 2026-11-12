import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../app';
import { withTx } from '../db/pool';
import { focusMsOnDay, minutesOf, pointsForFocusMs } from '../domain/points';
import { addSessionCredit } from '../focus';
import type { PlayerRow } from '../players';
import { localDay } from '../time';

/**
 * DEV ONLY (DEV_FAKE_MINUTES=true, refused in production by loadConfig): grants focus minutes without waiting,
 * so the 90-minute kill gate can be passed in two-phone tests. Uses the same ledger rows and points delta as a
 * real heartbeat, so the gate, stats and points stay consistent.
 */
export const devRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock } = deps;
  app.post('/dev/focus-minutes', async (req) => {
    const { minutes, creditSession } = z.object({ minutes: z.number().int().min(1).max(600), creditSession: z.boolean().optional() }).parse(req.body);
    const now = clock.now();
    const day = localDay(now, req.player.timezone);
    const ms = minutes * 60_000;
    const out = await withTx(db, async (c) => {
      const p = (await c.query<PlayerRow>('SELECT * FROM players WHERE id = $1 FOR UPDATE', [req.player.id])).rows[0]!; // same lock as heartbeat
      const before = await focusMsOnDay(c, req.player.id, day);
      const delta = pointsForFocusMs(before + ms) - pointsForFocusMs(before);
      await c.query("INSERT INTO points_ledger (player_id, kind, day, focus_ms, points, created_at) VALUES ($1, 'minute', $2, $3, $4, $5)", [
        req.player.id, day, ms, delta, now,
      ]);
      // Optionally also count it as uninterrupted session time (to test shields without waiting 5 h).
      if (creditSession && p.focus_state === 'focus') await addSessionCredit(c, p, ms, now);
      const shields = (await c.query<{ shields: number }>('SELECT shields FROM players WHERE id = $1', [p.id])).rows[0]!.shields;
      return { total: before + ms, shields };
    });
    return { focusMinutesToday: minutesOf(out.total), shields: out.shields };
  });
};
