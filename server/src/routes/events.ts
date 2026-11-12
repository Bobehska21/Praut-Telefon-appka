import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../app';

const query = z.object({
  after: z.coerce.number().int().min(0).optional(),
  wait: z.coerce.number().int().min(0).max(25).default(0),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const eventRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock, config } = deps;
  // Long poll. Holds no DB connection while waiting (polls with short queries), so it is safe across replicas.
  app.get('/events', async (req) => {
    const q = query.parse(req.query);
    let aborted = false;
    req.raw.on('close', () => {
      aborted = true;
    });
    const deadline = Date.now() + q.wait * 1000;
    for (;;) {
      const r = await db.query<{ id: number; kind: string; payload: unknown; created_at: Date }>(
        q.after === undefined
          ? 'SELECT id, kind, payload, created_at FROM notifications WHERE player_id = $1 AND delivered_at IS NULL ORDER BY id LIMIT 100'
          : 'SELECT id, kind, payload, created_at FROM notifications WHERE player_id = $1 AND id > $2 ORDER BY id LIMIT 100',
        q.after === undefined ? [req.player.id] : [req.player.id, q.after],
      );
      if (r.rows.length > 0) {
        await db.query('UPDATE notifications SET delivered_at = COALESCE(delivered_at, $2) WHERE id = ANY($1::bigint[])', [
          r.rows.map((x) => x.id), clock.now(),
        ]);
        return r.rows.map((x) => ({ id: x.id, kind: x.kind, payload: x.payload, createdAt: x.created_at }));
      }
      const left = deadline - Date.now();
      if (left <= 0 || aborted || app.shuttingDown) return [];
      await sleep(Math.min(config.eventsPollMs, left));
    }
  });
};
