import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../app';
import { withTx } from '../db/pool';
import { dayPoints } from '../domain/points';
import { AppError } from '../errors';
import { photoUrl } from '../players';
import { uuid } from '../schemas';
import { localDay } from '../time';

/** Largest single adjustment; the ledger column is an integer and a typo should not wreck the leaderboard. */
export const MAX_ADJUSTMENT = 100_000;

/**
 * Admin API used by the app (`/v1/admin/*`), as opposed to the token-protected `/admin/*` moderation API.
 * Who is an admin is decided by `accounts.is_admin`, read from the database on EVERY request (never cached and
 * never taken from the client), and nothing in the API can set that flag. Every action writes an `admin_audit` row
 * in the same transaction as the change.
 */
export const adminPlayerRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock } = deps;

  app.addHook('preHandler', async (req) => {
    const r = await db.query<{ is_admin: boolean }>('SELECT is_admin FROM accounts WHERE player_id = $1', [req.player.id]);
    // 404, not 403: a regular user learns nothing about the existence of these routes.
    if (!r.rows[0]?.is_admin) throw new AppError('not_found', 'Not found');
  });

  /** The app calls this to decide whether to show the admin screen (the screen itself grants nothing). */
  app.get('/admin/whoami', async () => ({ admin: true }));

  /** All registered players with an optional search over username and nickname (newest first). */
  app.get('/admin/players', async (req) => {
    const q = z
      .object({ q: z.string().trim().max(40).default(''), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) })
      .parse(req.query);
    // LIKE wildcards typed by the admin are searched for literally.
    const like = `%${q.q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const r = await db.query<{
      id: string; username: string | null; nickname: string; photo_key: string | null; photo_updated_at: Date | null; created_at: Date; points: string; is_admin: boolean | null;
    }>(
      `SELECT p.id, a.username, p.nickname, p.photo_key, p.photo_updated_at, p.created_at, a.is_admin,
              COALESCE((SELECT SUM(l.points) FROM points_ledger l WHERE l.player_id = p.id), 0)::bigint AS points
       FROM players p LEFT JOIN accounts a ON a.player_id = p.id
       WHERE $1 = '%%' OR a.username_lower LIKE $1 OR lower(p.nickname) LIKE $1
       ORDER BY p.created_at DESC, p.id
       LIMIT $2 OFFSET $3`,
      [like, q.limit, q.offset],
    );
    return r.rows.map((x) => ({
      id: x.id, username: x.username, nickname: x.nickname, photoUrl: photoUrl(x), createdAt: x.created_at, pointsTotal: Number(x.points), isAdmin: x.is_admin === true,
    }));
  });

  app.post('/admin/players/:id/points', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = z
      .object({
        points: z.number().int().refine((n) => n !== 0, 'points must not be 0').refine((n) => Math.abs(n) <= MAX_ADJUSTMENT, `at most ${MAX_ADJUSTMENT}`),
        note: z.string().trim().max(200).optional(),
      })
      .parse(req.body);
    const now = clock.now();
    return withTx(db, async (c) => {
      const t = (await c.query<{ id: string; timezone: string }>('SELECT id, timezone FROM players WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!t) throw new AppError('not_found', 'Player not found');
      const day = localDay(now, t.timezone);
      await c.query("INSERT INTO points_ledger (player_id, kind, day, points, created_at) VALUES ($1, 'admin_adjust', $2, $3, $4)", [id, day, b.points, now]);
      await c.query(
        'INSERT INTO admin_audit (action, target_player_id, actor_player_id, note, details, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        ['points.adjust', id, req.player.id, b.note || null, JSON.stringify({ points: b.points, day }), now],
      );
      const net = (await dayPoints(c, id, day)).net;
      return { playerId: id, points: b.points, pointsToday: net };
    });
  });
};
