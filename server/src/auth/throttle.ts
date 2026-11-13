import type { Queryable } from '../db/pool';
import { withTx, type Db } from '../db/pool';

/**
 * Durable (PostgreSQL, shared by all replicas) failed-login throttle with exponential backoff.
 *
 * Two counters per attempt, both keyed by the typed username whether or not the account exists (so the answer
 * never reveals which usernames exist):
 *  - `p:<username>|<ip>`: one source against one username. Locks after 5 failures. This is what stops a guesser
 *    without letting them lock the real owner out, because the owner comes from a different address.
 *  - `u:<username>`: all sources together (distributed guessing). Locks after 20 failures.
 * Lock length doubles per extra failure from 15 s and is capped at 5 minutes. Attempts made while locked are
 * refused without counting, so a lock is never extended by hammering. After 15 quiet minutes the counter restarts.
 * A successful login clears both counters.
 */
export const LOCK_MAX_S = 300;
export const QUIET_RESET_MS = 15 * 60_000;
const BASE_LOCK_S = 15;
export const PAIR_THRESHOLD = 5;
export const USER_THRESHOLD = 20;
const KEEP_MS = 24 * 3_600_000;

export const userKey = (name: string) => `u:${name}`;
export const pairKey = (name: string, ip: string) => `p:${name}|${ip}`;
const threshold = (key: string) => (key.startsWith('u:') ? USER_THRESHOLD : PAIR_THRESHOLD);

/** Seconds until the longest active lock among `keys` ends, or null when none is locked. */
export async function lockedForSeconds(db: Queryable, keys: string[], now: Date): Promise<number | null> {
  const r = await db.query<{ until: Date | null }>(
    'SELECT MAX(locked_until) AS until FROM login_attempts WHERE key = ANY($1::text[]) AND locked_until > $2',
    [keys, now],
  );
  const until = r.rows[0]?.until;
  return until ? Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000)) : null;
}

export async function recordFailure(db: Db, key: string, now: Date): Promise<void> {
  await withTx(db, async (c) => {
    await c.query('INSERT INTO login_attempts (key, failures, last_failed_at) VALUES ($1, 0, $2) ON CONFLICT DO NOTHING', [key, now]);
    const row = (await c.query<{ failures: number; last_failed_at: Date }>('SELECT failures, last_failed_at FROM login_attempts WHERE key = $1 FOR UPDATE', [key])).rows[0]!;
    const quiet = now.getTime() - row.last_failed_at.getTime() > QUIET_RESET_MS;
    const failures = (quiet ? 0 : row.failures) + 1;
    const t = threshold(key);
    const lockS = failures >= t ? Math.min(BASE_LOCK_S * 2 ** (failures - t), LOCK_MAX_S) : 0;
    await c.query('UPDATE login_attempts SET failures = $2, last_failed_at = $3, locked_until = $4 WHERE key = $1', [
      key, failures, now, lockS > 0 ? new Date(now.getTime() + lockS * 1000) : null,
    ]);
    // Housekeeping so rows for made-up usernames cannot pile up.
    await c.query(
      'DELETE FROM login_attempts WHERE key IN (SELECT key FROM login_attempts WHERE last_failed_at < $1 LIMIT 100)',
      [new Date(now.getTime() - KEEP_MS)],
    );
  });
}

export async function clearFailures(db: Queryable, keys: string[]): Promise<void> {
  await db.query('DELETE FROM login_attempts WHERE key = ANY($1::text[])', [keys]);
}
