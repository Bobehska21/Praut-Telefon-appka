import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../app';
import { killBlocker } from '../domain/kill-rules';
import { REQUIRED_MINUTES, focusMsOnDay, minutesOf } from '../domain/points';
import { AppError } from '../errors';
import { effectiveState, photoUrl, type PlayerRow } from '../players';
import { dayString } from '../schemas';
import { addDays, localDay } from '../time';

const token = z.string().regex(/^[0-9a-fA-F]{12}$/).transform((t) => t.toLowerCase());

export const nearbyRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock } = deps;

  app.put('/me/ble-token', async (req) => {
    const b = z.object({ token, day: dayString }).parse(req.body);
    const today = localDay(clock.now(), req.player.timezone);
    if (b.day < addDays(today, -1) || b.day > addDays(today, 1)) {
      throw new AppError('validation', 'day must be within one day of your local today', { issues: [{ path: 'day' }] });
    }
    try {
      await db.query(
        `INSERT INTO ble_tokens (player_id, day, token) VALUES ($1, $2, $3)
         ON CONFLICT (player_id, day) DO UPDATE SET token = EXCLUDED.token`,
        [req.player.id, b.day, b.token],
      );
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new AppError('conflict', 'Token already in use, pick another');
      throw e;
    }
    return { token: b.token, day: b.day };
  });

  app.post('/nearby', async (req) => {
    const b = z.object({ tokens: z.array(token).max(50) }).parse(req.body);
    const me = req.player;
    const now = clock.now();
    if (b.tokens.length === 0 || !me.multiplayer_enabled || me.banned_at) return [];

    const utcDay = now.toISOString().slice(0, 10);
    const rows = await db.query<PlayerRow & { token: string }>(
      `SELECT p.*, bt.token FROM ble_tokens bt JOIN players p ON p.id = bt.player_id
       WHERE bt.token = ANY($1::text[]) AND bt.day BETWEEN $2 AND $3
         AND p.id <> $4 AND p.multiplayer_enabled AND p.banned_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id = $4 AND bl.blocked_id = p.id) OR (bl.blocker_id = p.id AND bl.blocked_id = $4))`,
      [b.tokens, addDays(utcDay, -1), addDays(utcDay, 1), me.id],
    );
    const myMinutes = minutesOf(await focusMsOnDay(db, me.id, localDay(now, me.timezone)));
    return rows.rows.map((p) => {
      const base = effectiveState(p, now);
      const immune = base === 'wasteman' && p.immune_until !== null && p.immune_until > now;
      const blocker = killBlocker({ killer: me, victim: p, blocked: false, killerMinutes: myMinutes, now });
      return {
        token: p.token,
        playerId: p.id,
        nickname: p.nickname,
        rankKey: p.rank_key,
        level: p.level,
        photoUrl: photoUrl(p),
        status: immune ? 'immune' : base,
        immuneUntil: immune ? p.immune_until : null,
        canKill: blocker === null,
        killBlockedReason: blocker ? blocker.code : null,
        missingMinutes: Math.max(0, REQUIRED_MINUTES - myMinutes),
      };
    });
  });
};
