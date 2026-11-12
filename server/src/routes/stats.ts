import type { FastifyPluginAsync } from 'fastify';
import type { Deps } from '../app';
import { focusMsOnDay, minutesOf } from '../domain/points';
import { localDay } from '../time';

export const statsRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock } = deps;
  app.get('/me/stats', async (req) => {
    const p = req.player;
    const now = clock.now();
    const day = localDay(now, p.timezone);
    const [pts, kills, deaths, ms] = await Promise.all([
      db.query<{ today: number; total: number }>(
        'SELECT COALESCE(SUM(points) FILTER (WHERE day = $2), 0)::bigint AS today, COALESCE(SUM(points), 0)::bigint AS total FROM points_ledger WHERE player_id = $1',
        [p.id, day],
      ),
      // "today" = the player's local day, as a half-open range of instants.
      db.query<{ today: number; total: number }>(
        `SELECT COUNT(*) FILTER (WHERE created_at >= ($2::date)::timestamp AT TIME ZONE $3 AND created_at < (($2::date) + 1)::timestamp AT TIME ZONE $3)::bigint AS today,
                COUNT(*)::bigint AS total FROM kills WHERE killer_id = $1`,
        [p.id, day, p.timezone],
      ),
      db.query<{ today: number; total: number }>(
        `SELECT COUNT(*) FILTER (WHERE created_at >= ($2::date)::timestamp AT TIME ZONE $3 AND created_at < (($2::date) + 1)::timestamp AT TIME ZONE $3)::bigint AS today,
                COUNT(*)::bigint AS total FROM kills WHERE victim_id = $1`,
        [p.id, day, p.timezone],
      ),
      focusMsOnDay(db, p.id, day),
    ]);
    return {
      killsToday: kills.rows[0]!.today,
      killsTotal: kills.rows[0]!.total,
      deathsToday: deaths.rows[0]!.today,
      deathsTotal: deaths.rows[0]!.total,
      pointsToday: pts.rows[0]!.today,
      pointsTotal: pts.rows[0]!.total,
      focusMinutesToday: minutesOf(ms),
    };
  });
};
