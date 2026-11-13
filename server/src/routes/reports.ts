import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../app';
import { AppError } from '../errors';
import { getPlayer } from '../players';
import { uuid } from '../schemas';

const body = z.object({
  targetPlayerId: uuid,
  kind: z.enum(['nickname', 'photo', 'player']),
  note: z.string().max(500).optional(),
});

export const reportRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock, storage, config } = deps;
  app.post(
    '/reports',
    { config: { rateLimit: { max: config.rateLimit.reportPerHour, timeWindow: '1 hour', keyGenerator: (r) => r.headers.authorization ?? r.ip } } },
    async (req, reply) => {
      const b = body.parse(req.body);
      const now = clock.now();
      if (b.targetPlayerId === req.player.id) throw new AppError('forbidden', 'You cannot report yourself');
      // Durable per-reporter limit (the in-memory limiter above is per replica).
      const recent = await db.query<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM reports WHERE reporter_id = $1 AND created_at > $2",
        [req.player.id, new Date(now.getTime() - 3_600_000)],
      );
      if (recent.rows[0]!.n >= config.rateLimit.reportPerHour) throw new AppError('rate_limited', 'Too many reports');
      const target = await getPlayer(db, b.targetPlayerId);
      if (!target) throw new AppError('not_found', 'Player not found');

      // Evidence snapshot: nickname text and a private copy of the photo, so it survives removal or deletion.
      let snapshotKey: string | null = null;
      if (target.photo_key) {
        const photo = await storage.get(target.photo_key);
        if (photo) {
          snapshotKey = `report-${randomUUID()}`;
          await storage.put(snapshotKey, photo);
        }
      }
      await db.query(
        `INSERT INTO reports (reporter_id, target_id, kind, note, snapshot_nickname, snapshot_photo_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.player.id, target.id, b.kind, b.note ?? null, target.nickname, snapshotKey, now],
      );
      return reply.status(201).send({ status: 'received' });
    },
  );
};
