import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../app';
import { photoUrl } from '../players';
import { dayString } from '../schemas';
import { localDay } from '../time';

export const leaderboardRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock, config } = deps;
  app.get('/leaderboard', async (req) => {
    const q = z.object({ date: dayString.optional() }).parse(req.query);
    const date = q.date ?? localDay(clock.now(), config.leaderboardTz);
    const r = await db.query<{
      id: string; rank: number; kills: number; nickname: string; rank_key: string; level: number; photo_key: string | null; photo_updated_at: Date | null;
    }>(
      `WITH agg AS (
         SELECT k.killer_id AS id, COUNT(*)::int AS kills, MAX(k.created_at) AS last_kill
         FROM kills k JOIN players p ON p.id = k.killer_id
         WHERE k.created_at >= ($1::date)::timestamp AT TIME ZONE $2
           AND k.created_at <  (($1::date) + 1)::timestamp AT TIME ZONE $2
           AND p.multiplayer_enabled AND p.banned_at IS NULL
         GROUP BY k.killer_id
       ), ranked AS (
         SELECT id, kills, ROW_NUMBER() OVER (ORDER BY kills DESC, last_kill ASC, id)::int AS rank FROM agg
       )
       SELECT ranked.id, ranked.rank, ranked.kills, p.nickname, p.rank_key, p.level, p.photo_key, p.photo_updated_at
       FROM ranked JOIN players p ON p.id = ranked.id
       WHERE ranked.rank <= 50 OR ranked.id = $3
       ORDER BY ranked.rank`,
      [date, config.leaderboardTz, req.player.id],
    );
    const me = r.rows.find((x) => x.id === req.player.id);
    return {
      date,
      top: r.rows.filter((x) => x.rank <= 50).map((x) => ({
        rank: x.rank, nickname: x.nickname, rankKey: x.rank_key, level: x.level, photoUrl: photoUrl(x), kills: x.kills, isMe: x.id === req.player.id,
      })),
      me: me ? { rank: me.rank, kills: me.kills } : { rank: null, kills: 0 },
    };
  });
};
