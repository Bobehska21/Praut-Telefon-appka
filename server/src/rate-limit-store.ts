import { createHash } from 'node:crypto';
import type { FastifyRateLimitStore, FastifyRateLimitStoreCtor } from '@fastify/rate-limit';
import type { Db } from './db/pool';
import { AppError } from './errors';

type Callback = Parameters<FastifyRateLimitStore['incr']>[1];

/** One fixed window per scope/client, shared by every replica. Raw IPs and bearer tokens are never stored. */
export function postgresRateLimitStore(db: Db): FastifyRateLimitStoreCtor {
  return class PgStore implements FastifyRateLimitStore {
    private scope = 'global';

    child(options: Parameters<FastifyRateLimitStore['child']>[0]): FastifyRateLimitStore {
      const info = (options as unknown as { routeInfo?: { method: unknown; url: string } }).routeInfo;
      if (!info) throw new Error('A route-specific rate limit requires routeInfo');
      const child = new PgStore();
      child.scope = JSON.stringify([info.method, info.url]);
      return child;
    }

    incr(key: string, callback: Callback, timeWindow: number, max: number): void {
      const bucket = createHash('sha256').update(JSON.stringify([this.scope, key])).digest('hex');
      // The row lock acquired by ON CONFLICT makes increments atomic even across independent processes.
      void db.query<{ current: number; ttl: number }>(
        `INSERT INTO rate_limit_buckets AS b (key, hits, expires_at)
         VALUES ($1, 1, statement_timestamp() + $2 * interval '1 millisecond')
         ON CONFLICT (key) DO UPDATE SET
           hits = CASE WHEN b.expires_at <= statement_timestamp() THEN 1 ELSE LEAST(b.hits + 1, $3 + 1) END,
           expires_at = CASE WHEN b.expires_at <= statement_timestamp()
             THEN statement_timestamp() + $2 * interval '1 millisecond' ELSE b.expires_at END
         RETURNING hits::int AS current,
           GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - statement_timestamp())) * 1000))::int AS ttl`,
        [bucket, timeWindow, max],
      ).then(
        (r) => callback(null, r.rows[0]!),
        () => callback(new AppError('unavailable', 'Rate limit storage unavailable')),
      );
    }
  };
}

/** Bounded cleanup, safe for multiple replicas; active buckets are never removed. */
export async function pruneRateLimits(db: Db): Promise<void> {
  await db.query(`DELETE FROM rate_limit_buckets WHERE key IN (
    SELECT key FROM rate_limit_buckets WHERE expires_at <= statement_timestamp()
    ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED
  )`);
}
