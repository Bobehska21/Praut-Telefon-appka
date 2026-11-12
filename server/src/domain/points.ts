import type { Queryable } from '../db/pool';

export const HEARTBEAT_CAP_MS = 90_000;
export const BONUS_AFTER_MINUTES = 90;
export const KILL_POINTS = 50;
export const REQUIRED_MINUTES = 90;
export const IMMUNITY_MS = 60 * 60_000;

/** Whole credited minutes in `ms` of focus. */
export function minutesOf(ms: number): number {
  return Math.floor(ms / 60_000);
}

/** Points for a day's cumulative focus time: 1/min, 2/min beyond the first 90 minutes. Monotonic in ms. */
export function pointsForFocusMs(ms: number): number {
  const m = minutesOf(ms);
  return m + Math.max(0, m - BONUS_AFTER_MINUTES);
}

/** floor(25% of gross), never more than the net the victim has that day (net never goes below 0). */
export function killPenalty(grossPositive: number, net: number): number {
  return Math.max(0, Math.min(Math.floor(grossPositive * 0.25), net));
}

export async function focusMsOnDay(db: Queryable, playerId: string, day: string): Promise<number> {
  const r = await db.query<{ ms: number }>(
    "SELECT COALESCE(SUM(focus_ms), 0)::bigint AS ms FROM points_ledger WHERE player_id = $1 AND day = $2 AND kind = 'minute'",
    [playerId, day],
  );
  return r.rows[0]!.ms;
}

export async function dayPoints(db: Queryable, playerId: string, day: string): Promise<{ gross: number; net: number }> {
  const r = await db.query<{ gross: number; net: number }>(
    `SELECT COALESCE(SUM(points) FILTER (WHERE points > 0), 0)::bigint AS gross, COALESCE(SUM(points), 0)::bigint AS net
     FROM points_ledger WHERE player_id = $1 AND day = $2`,
    [playerId, day],
  );
  return r.rows[0]!;
}
