import type { PoolClient } from 'pg';
import type { Deps } from './app';
import { newNonce, canonicalKillString, verifyKillSignature } from './crypto';
import { withTx } from './db/pool';
import { killBlocker, type KillBlocker } from './domain/kill-rules';
import { SHIELD_BLOCK_IMMUNITY_MS, shieldAbsorbs } from './domain/shields';
import { IMMUNITY_MS, KILL_POINTS, dayPoints, focusMsOnDay, killPenalty, minutesOf } from './domain/points';
import { AppError, STATUS_BY_CODE, type ErrorCode } from './errors';
import { getPlayer, isBlockedEitherWay, type PlayerRow } from './players';
import { localDay } from './time';

export const CHALLENGE_TTL_MS = 20_000;

interface ChallengeRow {
  id: string;
  killer_id: string;
  victim_id: string;
  nonce: string;
  expires_at: Date;
  status: 'pending' | 'succeeded' | 'failed';
  error_code: string | null;
  error_extra: { message: string; extra: Record<string, unknown> } | null;
  shield_blocked: boolean;
  resolved_at: Date | null;
}

export interface KillResult {
  challengeId: string;
  victimPlayerId: string;
  pointsGained: number;
  victimPointsLost: number;
  victimImmuneUntil: string;
  killedAt: string;
  /** true when a shield absorbed the attack: no points moved, the victim is immune for 10 minutes. */
  shieldBlocked: boolean;
}

function toError(b: { code: string; message: string; extra: Record<string, unknown> }): AppError {
  const code = (b.code in STATUS_BY_CODE ? b.code : 'internal') as ErrorCode;
  return new AppError(code, b.message, b.extra);
}

function storedError(ch: ChallengeRow): AppError {
  const e = ch.error_extra ?? { message: 'Kill failed', extra: {} };
  return toError({ code: ch.error_code ?? 'internal', message: e.message, extra: e.extra });
}

async function killerMinutes(c: { query: PoolClient['query'] } | PoolClient, p: PlayerRow, now: Date): Promise<number> {
  return minutesOf(await focusMsOnDay(c as PoolClient, p.id, localDay(now, p.timezone)));
}

function raise(b: KillBlocker): never {
  throw new AppError(b.code, b.message, b.extra);
}

export async function createChallenge(deps: Deps, killerId: string, targetId: string) {
  const { db, clock } = deps;
  const now = clock.now();
  const [killer, victim] = await Promise.all([getPlayer(db, killerId), getPlayer(db, targetId)]);
  if (!killer) throw new AppError('unauthorized', 'Missing or invalid token');
  if (!victim) throw new AppError('not_found', 'Player not found');
  const blocked = await isBlockedEitherWay(db, killer.id, victim.id);
  const blocker = killBlocker({ killer, victim, blocked, killerMinutes: await killerMinutes(db, killer, now), now });
  if (blocker) raise(blocker);
  const nonce = newNonce();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  const r = await db.query<{ id: string }>(
    'INSERT INTO kill_challenges (killer_id, victim_id, nonce, expires_at, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [killer.id, victim.id, nonce, expiresAt, now],
  );
  return { challengeId: r.rows[0]!.id, nonce, expiresAt: expiresAt.toISOString() };
}

async function resultFor(deps: Deps, ch: ChallengeRow): Promise<KillResult> {
  if (ch.shield_blocked) {
    const at = ch.resolved_at!;
    return {
      challengeId: ch.id,
      victimPlayerId: ch.victim_id,
      pointsGained: 0,
      victimPointsLost: 0,
      victimImmuneUntil: new Date(at.getTime() + SHIELD_BLOCK_IMMUNITY_MS).toISOString(),
      killedAt: at.toISOString(),
      shieldBlocked: true,
    };
  }
  const r = await deps.db.query<{ victim_points_lost: number; killer_points: number; created_at: Date }>(
    'SELECT victim_points_lost, killer_points, created_at FROM kills WHERE challenge_id = $1',
    [ch.id],
  );
  const k = r.rows[0]!;
  return {
    challengeId: ch.id,
    victimPlayerId: ch.victim_id,
    pointsGained: k.killer_points,
    victimPointsLost: k.victim_points_lost,
    victimImmuneUntil: new Date(k.created_at.getTime() + IMMUNITY_MS).toISOString(),
    killedAt: k.created_at.toISOString(),
    shieldBlocked: false,
  };
}

async function loadChallenge(deps: Deps, id: string, killerId: string): Promise<ChallengeRow | null> {
  const r = await deps.db.query<ChallengeRow>('SELECT * FROM kill_challenges WHERE id = $1 AND killer_id = $2', [id, killerId]);
  return r.rows[0] ?? null;
}

async function markFailed(c: Pick<PoolClient, 'query'>, id: string, b: { code: string; message: string; extra: Record<string, unknown> }) {
  await c.query(
    "UPDATE kill_challenges SET status = 'failed', error_code = $2, error_extra = $3 WHERE id = $1 AND status = 'pending'",
    [id, b.code, JSON.stringify({ message: b.message, extra: b.extra })],
  );
}

type Outcome = { ok: true; result: KillResult } | { ok: false; error: AppError } | { replay: ChallengeRow };

export async function completeKill(deps: Deps, killerId: string, challengeId: string, signature: string): Promise<KillResult> {
  const { db, clock } = deps;
  let ch = await loadChallenge(deps, challengeId, killerId);
  if (!ch) throw new AppError('not_found', 'Challenge not found');
  if (ch.status === 'succeeded') return resultFor(deps, ch);
  if (ch.status === 'failed') throw storedError(ch);

  if (ch.expires_at <= clock.now()) {
    const b = { code: 'expired', message: 'Challenge expired', extra: {} };
    await markFailed(db, ch.id, b);
    ch = (await loadChallenge(deps, challengeId, killerId))!;
    if (ch.status === 'succeeded') return resultFor(deps, ch);
    throw ch.status === 'failed' ? storedError(ch) : toError(b);
  }

  const victimKey = (await db.query<{ public_key: string }>('SELECT public_key FROM players WHERE id = $1', [ch.victim_id])).rows[0];
  if (!victimKey) throw new AppError('not_found', 'Player not found');
  // A bad signature does not consume the challenge: nothing was proven either way.
  if (!verifyKillSignature(victimKey.public_key, canonicalKillString(ch.id, ch.nonce, ch.victim_id, killerId), signature)) {
    throw new AppError('bad_signature', 'Signature does not verify');
  }

  const outcome: Outcome = await withTx(db, async (c): Promise<Outcome> => {
    const now = clock.now();
    // Lock both players in a consistent (id) order to avoid deadlocks.
    const locked = await c.query<PlayerRow>('SELECT * FROM players WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[killerId, ch!.victim_id]]);
    const killer = locked.rows.find((p) => p.id === killerId);
    const victim = locked.rows.find((p) => p.id === ch!.victim_id);
    const cur = (await c.query<ChallengeRow>('SELECT * FROM kill_challenges WHERE id = $1 FOR UPDATE', [ch!.id])).rows[0];
    if (!killer || !victim || !cur) throw new AppError('not_found', 'Challenge not found');
    if (cur.status !== 'pending') return { replay: cur };

    const fail = async (b: { code: string; message: string; extra: Record<string, unknown> }): Promise<Outcome> => {
      await markFailed(c, cur.id, b);
      return { ok: false, error: toError(b) };
    };
    if (cur.expires_at <= now) return fail({ code: 'expired', message: 'Challenge expired', extra: {} });

    const blocked = await isBlockedEitherWay(c, killer.id, victim.id);
    const blocker = killBlocker({ killer, victim, blocked, killerMinutes: await killerMinutes(c, killer, now), now });
    if (blocker) return fail(blocker);

    // All preconditions passed. A shield absorbs the attack: nothing counts as a kill (no kills row, no points,
    // no penalty) and the victim gets a short immunity so shields cannot be sniped in a row.
    const absorb = shieldAbsorbs(victim.shields);
    if (absorb.blocked) {
      const immuneUntil = new Date(now.getTime() + SHIELD_BLOCK_IMMUNITY_MS);
      await c.query('UPDATE players SET shields = $2, immune_until = $3 WHERE id = $1', [victim.id, absorb.remaining, immuneUntil]);
      await c.query("INSERT INTO notifications (player_id, kind, payload, created_at) VALUES ($1, 'shield_blocked', $2, $3)", [
        victim.id, JSON.stringify({ killerNickname: killer.nickname, shields: absorb.remaining }), now,
      ]);
      await c.query("UPDATE kill_challenges SET status = 'succeeded', shield_blocked = true, resolved_at = $2 WHERE id = $1", [cur.id, now]);
      return {
        ok: true,
        result: {
          challengeId: cur.id,
          victimPlayerId: victim.id,
          pointsGained: 0,
          victimPointsLost: 0,
          victimImmuneUntil: immuneUntil.toISOString(),
          killedAt: now.toISOString(),
          shieldBlocked: true,
        },
      };
    }

    const victimDay = localDay(now, victim.timezone);
    const { gross, net } = await dayPoints(c, victim.id, victimDay);
    const lost = killPenalty(gross, net);
    const killRow = await c.query<{ created_at: Date }>(
      'INSERT INTO kills (challenge_id, killer_id, victim_id, killer_points, victim_points_lost, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING created_at',
      [cur.id, killer.id, victim.id, KILL_POINTS, lost, now],
    );
    await c.query("INSERT INTO points_ledger (player_id, kind, day, points, created_at) VALUES ($1, 'kill', $2, $3, $4)", [
      killer.id, localDay(now, killer.timezone), KILL_POINTS, now,
    ]);
    if (lost > 0) {
      await c.query("INSERT INTO points_ledger (player_id, kind, day, points, created_at) VALUES ($1, 'penalty', $2, $3, $4)", [
        victim.id, victimDay, -lost, now,
      ]);
    }
    const immuneUntil = new Date(now.getTime() + IMMUNITY_MS);
    await c.query('UPDATE players SET immune_until = $2 WHERE id = $1', [victim.id, immuneUntil]);
    await c.query("INSERT INTO notifications (player_id, kind, payload, created_at) VALUES ($1, 'killed', $2, $3)", [
      victim.id, JSON.stringify({ killerNickname: killer.nickname, pointsLost: lost }), now,
    ]);
    await c.query("UPDATE kill_challenges SET status = 'succeeded' WHERE id = $1", [cur.id]);
    return {
      ok: true,
      result: {
        challengeId: cur.id,
        victimPlayerId: victim.id,
        pointsGained: KILL_POINTS,
        victimPointsLost: lost,
        victimImmuneUntil: immuneUntil.toISOString(),
        killedAt: killRow.rows[0]!.created_at.toISOString(),
        shieldBlocked: false,
      },
    };
  });

  if ('replay' in outcome) {
    if (outcome.replay.status === 'succeeded') return resultFor(deps, outcome.replay);
    throw storedError(outcome.replay);
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.result;
}
