import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../app';
import { AppError } from '../errors';
import { getPlayer } from '../players';
import { uuid } from '../schemas';

export const blockRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db } = deps;

  app.post('/blocks', async (req, reply) => {
    const { playerId } = z.object({ playerId: uuid }).parse(req.body);
    if (playerId === req.player.id) throw new AppError('forbidden', 'You cannot block yourself');
    if (!(await getPlayer(db, playerId))) throw new AppError('not_found', 'Player not found');
    await db.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.player.id, playerId]);
    return reply.status(201).send({ playerId });
  });

  app.delete('/blocks/:playerId', async (req, reply) => {
    const { playerId } = z.object({ playerId: uuid }).parse(req.params);
    await db.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [req.player.id, playerId]);
    return reply.status(204).send();
  });

  app.get('/blocks', async (req) => {
    const r = await db.query<{ id: string; nickname: string; rank_key: string; level: number; created_at: Date }>(
      `SELECT p.id, p.nickname, p.rank_key, p.level, b.created_at FROM blocks b JOIN players p ON p.id = b.blocked_id
       WHERE b.blocker_id = $1 ORDER BY b.created_at DESC LIMIT 500`,
      [req.player.id],
    );
    return r.rows.map((x) => ({ playerId: x.id, nickname: x.nickname, rankKey: x.rank_key, level: x.level, blockedAt: x.created_at }));
  });
};
