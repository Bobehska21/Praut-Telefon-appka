import type { FastifyPluginAsync } from 'fastify';
import type { Deps } from '../app';
import { AppError } from '../errors';
import { effectiveState, getPlayer, photoUrl, type PlayerRow } from '../players';
import { profileBody } from '../schemas';

export function profileView(p: PlayerRow, now: Date) {
  return {
    playerId: p.id,
    nickname: p.nickname,
    rankKey: p.rank_key,
    level: p.level,
    multiplayerEnabled: p.multiplayer_enabled,
    timezone: p.timezone,
    photoUrl: photoUrl(p),
    state: effectiveState(p, now),
    immuneUntil: p.immune_until && p.immune_until > now ? p.immune_until : null,
    banned: p.banned_at !== null,
  };
}

export const meRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock, storage } = deps;

  app.get('/me', async (req) => {
    const p = (await getPlayer(db, req.player.id))!;
    return profileView(p, clock.now());
  });

  app.put('/me', async (req) => {
    const b = profileBody.parse(req.body);
    const nickname = b.nickname.trim().replace(/\s+/g, ' ');
    const r = await db.query<PlayerRow>(
      `UPDATE players SET nickname = $2, rank_key = $3, level = $4, multiplayer_enabled = $5, timezone = $6
       WHERE id = $1 RETURNING *`,
      [req.player.id, nickname, b.rankKey, b.level, b.multiplayerEnabled, b.timezone],
    );
    return profileView(r.rows[0]!, clock.now());
  });

  app.delete('/me', async (req, reply) => {
    const r = await db.query<{ photo_key: string | null }>('DELETE FROM players WHERE id = $1 RETURNING photo_key', [req.player.id]);
    if (r.rowCount === 0) throw new AppError('not_found', 'Player not found');
    if (r.rows[0]!.photo_key) await storage.delete(r.rows[0]!.photo_key);
    return reply.status(204).send();
  });
};
