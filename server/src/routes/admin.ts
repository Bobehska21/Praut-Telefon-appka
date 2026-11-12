import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../app';
import { safeEqual } from '../crypto';
import { withTx } from '../db/pool';
import { AppError } from '../errors';
import { effectiveState, type PlayerRow } from '../players';
import { uuid } from '../schemas';

const page = { limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) };
const idParam = z.object({ id: z.coerce.number().int().positive() });

interface ReportRow {
  id: number; reporter_id: string | null; target_id: string | null; kind: string; note: string | null; snapshot_nickname: string;
  snapshot_photo_key: string | null; status: string; resolution: string | null; resolution_note: string | null; resolved_at: Date | null; created_at: Date;
}

const reportView = (r: ReportRow) => ({
  id: r.id,
  reporterPlayerId: r.reporter_id,
  targetPlayerId: r.target_id,
  kind: r.kind,
  note: r.note,
  status: r.status,
  resolution: r.resolution,
  resolutionNote: r.resolution_note,
  resolvedAt: r.resolved_at,
  createdAt: r.created_at,
  snapshot: { nickname: r.snapshot_nickname, hasPhoto: r.snapshot_photo_key !== null, photoUrl: r.snapshot_photo_key ? `/admin/reports/${r.id}/photo` : null },
});

export const adminRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock, storage, config } = deps;

  app.addHook('preHandler', async (req) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    if (!m || !safeEqual(m[1]!, config.adminToken)) throw new AppError('unauthorized', 'Missing or invalid admin token');
  });

  app.get('/reports', async (req) => {
    const q = z.object({ status: z.enum(['open', 'resolved', 'all']).default('open'), ...page }).parse(req.query);
    const r = await db.query<ReportRow>(
      "SELECT * FROM reports WHERE ($1 = 'all' OR status = $1) ORDER BY created_at, id LIMIT $2 OFFSET $3",
      [q.status, q.limit, q.offset],
    );
    return r.rows.map(reportView);
  });

  app.get('/reports/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const r = (await db.query<ReportRow>('SELECT * FROM reports WHERE id = $1', [id])).rows[0];
    if (!r) throw new AppError('not_found', 'Report not found');
    const target = r.target_id ? (await db.query<PlayerRow>('SELECT * FROM players WHERE id = $1', [r.target_id])).rows[0] : undefined;
    return {
      ...reportView(r),
      target: target ? { nickname: target.nickname, banned: target.banned_at !== null, hasPhoto: target.photo_key !== null } : null,
    };
  });

  app.get('/reports/:id/photo', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const r = (await db.query<{ snapshot_photo_key: string | null }>('SELECT snapshot_photo_key FROM reports WHERE id = $1', [id])).rows[0];
    const data = r?.snapshot_photo_key ? await storage.get(r.snapshot_photo_key) : null;
    if (!data) throw new AppError('not_found', 'No snapshot photo');
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'no-store').send(data);
  });

  app.post('/reports/:id/resolve', async (req) => {
    const { id } = idParam.parse(req.params);
    const b = z.object({ action: z.enum(['dismiss', 'remove_photo', 'reset_nickname', 'ban']), note: z.string().max(500).optional() }).parse(req.body);
    const now = clock.now();
    const removedPhoto = await withTx(db, async (c) => {
      const r = (await c.query<ReportRow>('SELECT * FROM reports WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!r) throw new AppError('not_found', 'Report not found');
      if (r.status !== 'open') throw new AppError('conflict', 'Report already resolved');
      if (b.action !== 'dismiss' && !r.target_id) throw new AppError('conflict', 'The reported player no longer exists');
      let photoKey: string | null = null;
      if (b.action === 'remove_photo') {
        const old = await c.query<{ photo_key: string | null }>('SELECT photo_key FROM players WHERE id = $1 FOR UPDATE', [r.target_id]);
        photoKey = old.rows[0]?.photo_key ?? null;
        await c.query('UPDATE players SET photo_key = NULL, photo_updated_at = NULL WHERE id = $1', [r.target_id]);
      } else if (b.action === 'reset_nickname') {
        await c.query("UPDATE players SET nickname = '' WHERE id = $1", [r.target_id]);
      } else if (b.action === 'ban') {
        await c.query('UPDATE players SET banned_at = $2, ban_reason = $3 WHERE id = $1', [r.target_id, now, b.note ?? null]);
      }
      await c.query(
        "UPDATE reports SET status = 'resolved', resolution = $2, resolution_note = $3, resolved_at = $4 WHERE id = $1",
        [id, b.action, b.note ?? null, now],
      );
      await c.query('INSERT INTO admin_audit (action, target_player_id, report_id, details, created_at) VALUES ($1, $2, $3, $4, $5)', [
        `report.${b.action}`, r.target_id, id, JSON.stringify({ note: b.note ?? null }), now,
      ]);
      return photoKey;
    });
    if (removedPhoto) await storage.delete(removedPhoto);
    return { id, status: 'resolved', resolution: b.action };
  });

  app.get('/players', async (req) => {
    const q = z.object({ search: z.string().max(40).optional(), banned: z.enum(['true', 'false']).optional(), ...page }).parse(req.query);
    const like = q.search ? `%${q.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
    const exact = q.search && uuid.safeParse(q.search).success ? q.search : null;
    const r = await db.query<PlayerRow>(
      `SELECT * FROM players
       WHERE ($1::text IS NULL OR nickname ILIKE $1 OR id = $2::uuid)
         AND ($3::boolean IS NULL OR (banned_at IS NOT NULL) = $3)
       ORDER BY created_at DESC, id LIMIT $4 OFFSET $5`,
      [like, exact, q.banned === undefined ? null : q.banned === 'true', q.limit, q.offset],
    );
    const now = clock.now();
    return r.rows.map((p) => ({
      playerId: p.id, nickname: p.nickname, rankKey: p.rank_key, level: p.level, multiplayerEnabled: p.multiplayer_enabled,
      state: effectiveState(p, now), banned: p.banned_at !== null, banReason: p.ban_reason, hasPhoto: p.photo_key !== null, createdAt: p.created_at,
    }));
  });

  app.post('/players/:playerId/unban', async (req) => {
    const { playerId } = z.object({ playerId: uuid }).parse(req.params);
    const now = clock.now();
    await withTx(db, async (c) => {
      const r = await c.query('UPDATE players SET banned_at = NULL, ban_reason = NULL WHERE id = $1', [playerId]);
      if (r.rowCount === 0) throw new AppError('not_found', 'Player not found');
      await c.query('INSERT INTO admin_audit (action, target_player_id, details, created_at) VALUES ($1, $2, $3, $4)', ['player.unban', playerId, '{}', now]);
    });
    return { playerId, banned: false };
  });
};
