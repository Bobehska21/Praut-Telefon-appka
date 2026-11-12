import type { PoolClient } from 'pg';
import type { Db } from './db/pool';
import { withTx } from './db/pool';
import { HEARTBEAT_CAP_MS, focusMsOnDay, minutesOf, pointsForFocusMs } from './domain/points';
import { shieldAward } from './domain/shields';
import { LOST_AFTER_MS, type PlayerRow } from './players';
import { localDay } from './time';

export type FocusState = 'idle' | 'focus' | 'wasteman';

export interface FocusResult {
  state: FocusState;
  focusMinutesToday: number;
  lost?: true;
}

export async function lockPlayer(c: PoolClient, id: string): Promise<PlayerRow> {
  return (await c.query<PlayerRow>('SELECT * FROM players WHERE id = $1 FOR UPDATE', [id])).rows[0]!;
}

async function closeSession(c: PoolClient, id: string, at: Date, reason: 'manual' | 'expired' | 'lost' | 'restart') {
  await c.query('UPDATE focus_sessions SET ended_at = $2, end_reason = $3 WHERE player_id = $1 AND ended_at IS NULL', [id, at, reason]);
}

/**
 * Adds focus credit to the player's open session and awards a shield when the session reaches 5 h of credit.
 * `p` must be the row locked FOR UPDATE by the caller (so `p.shields` is current). A session is uninterrupted by
 * construction: stop, restart and a lost gap close it, and the next one starts at credited_ms = 0.
 */
export async function addSessionCredit(c: PoolClient, p: PlayerRow, creditMs: number, now: Date): Promise<void> {
  if (creditMs <= 0) return;
  const s = (
    await c.query<{ id: number; credited_ms: number; shield_awarded: boolean }>(
      'UPDATE focus_sessions SET credited_ms = credited_ms + $2 WHERE player_id = $1 AND ended_at IS NULL RETURNING id, credited_ms, shield_awarded',
      [p.id, creditMs],
    )
  ).rows[0];
  if (!s) return;
  const award = shieldAward(s.credited_ms - creditMs, creditMs, s.shield_awarded, p.shields);
  if (!award.markAwarded) return;
  await c.query('UPDATE focus_sessions SET shield_awarded = true WHERE id = $1', [s.id]);
  if (!award.granted) return;
  await c.query('UPDATE players SET shields = $2 WHERE id = $1', [p.id, award.shields]);
  await c.query("INSERT INTO notifications (player_id, kind, payload, created_at) VALUES ($1, 'shield_earned', $2, $3)", [
    p.id, JSON.stringify({ shields: award.shields }), now,
  ]);
}

/** Credits min(elapsed, 90 s) since the last heartbeat. Returns false when the player was lost (no credit, now idle). */
async function settle(c: PoolClient, p: PlayerRow, now: Date): Promise<'credited' | 'lost'> {
  const last = p.last_heartbeat_at?.getTime() ?? 0;
  const elapsed = now.getTime() - last;
  if (elapsed > LOST_AFTER_MS) {
    await c.query("UPDATE players SET focus_state = 'idle', last_heartbeat_at = NULL WHERE id = $1", [p.id]);
    await closeSession(c, p.id, new Date(last), 'lost');
    return 'lost';
  }
  const credit = Math.min(Math.max(elapsed, 0), HEARTBEAT_CAP_MS);
  const day = localDay(now, p.timezone);
  if (credit > 0) {
    const before = await focusMsOnDay(c, p.id, day);
    const delta = pointsForFocusMs(before + credit) - pointsForFocusMs(before);
    await c.query("INSERT INTO points_ledger (player_id, kind, day, focus_ms, points) VALUES ($1, 'minute', $2, $3, $4)", [
      p.id, day, credit, delta,
    ]);
  }
  await c.query('UPDATE players SET last_heartbeat_at = $2 WHERE id = $1', [p.id, now]);
  await addSessionCredit(c, p, credit, now);
  return 'credited';
}

async function result(c: PoolClient, p: PlayerRow, state: FocusState, now: Date, lost = false): Promise<FocusResult> {
  const ms = await focusMsOnDay(c, p.id, localDay(now, p.timezone));
  return { state, focusMinutesToday: minutesOf(ms), ...(lost ? { lost: true as const } : {}) };
}

export function startFocus(db: Db, playerId: string, now: Date): Promise<FocusResult> {
  return withTx(db, async (c) => {
    const p = await lockPlayer(c, playerId);
    if (p.focus_state === 'focus') {
      const lostFirst = now.getTime() - (p.last_heartbeat_at?.getTime() ?? 0) > LOST_AFTER_MS;
      await closeSession(c, p.id, lostFirst ? (p.last_heartbeat_at ?? now) : now, lostFirst ? 'lost' : 'restart');
    }
    await c.query("UPDATE players SET focus_state = 'focus', focus_started_at = $2, last_heartbeat_at = $2 WHERE id = $1", [p.id, now]);
    await c.query('INSERT INTO focus_sessions (player_id, started_at) VALUES ($1, $2)', [p.id, now]);
    return result(c, p, 'focus', now);
  });
}

export function heartbeat(db: Db, playerId: string, now: Date): Promise<FocusResult> {
  return withTx(db, async (c) => {
    const p = await lockPlayer(c, playerId);
    if (p.focus_state !== 'focus') return result(c, p, p.focus_state, now);
    if ((await settle(c, p, now)) === 'lost') return result(c, p, 'idle', now, true);
    return result(c, p, 'focus', now);
  });
}

export function stopFocus(db: Db, playerId: string, reason: 'manual' | 'expired', now: Date): Promise<FocusResult> {
  return withTx(db, async (c) => {
    const p = await lockPlayer(c, playerId);
    if (p.focus_state !== 'focus') return result(c, p, p.focus_state, now);
    if ((await settle(c, p, now)) === 'lost') return result(c, p, 'idle', now, true);
    const next: FocusState = reason === 'manual' ? 'wasteman' : 'idle';
    await c.query('UPDATE players SET focus_state = $2 WHERE id = $1', [p.id, next]);
    await closeSession(c, p.id, now, reason);
    return result(c, p, next, now);
  });
}
