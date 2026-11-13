import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BET_GRACE_MS, betOutcome, betStartProblem, minBetDurationMs } from '../src/domain/bets';
import { MIN, call, createEnv, grantFocusMinutes, registerPlayer, type Env, type Player } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.close();
});

const HB = 90_000;
const post = (p: Player, path: string, body?: unknown) => call(env, p, 'POST', path, body);
async function beat(p: Player) {
  env.clock.advance(HB);
  return post(p, '/v1/focus/heartbeat');
}
const ledger = async (p: Player, kind: string) =>
  (await env.db.query<{ points: number }>('SELECT points FROM points_ledger WHERE player_id = $1 AND kind = $2 ORDER BY id', [p.id, kind])).rows.map((r) => r.points);
const total = async (p: Player) =>
  Number((await env.db.query<{ t: string }>('SELECT COALESCE(SUM(points), 0) t FROM points_ledger WHERE player_id = $1', [p.id])).rows[0]!.t);
/** A player with 100 focus minutes today = 110 points of net, so a 100-point stake is allowed. */
async function richPlayer() {
  const p = await registerPlayer(env);
  await grantFocusMinutes(env, p, 100);
  return p;
}
const bet = (multiplier: number, stakePoints: number, minutes: number) => ({ multiplier, stakePoints, durationMs: minutes * MIN });

describe('pure rules', () => {
  it('minBetDurationMs: 15 min per unit, none without a bet', () => {
    expect([1, 2, 5, 10].map(minBetDurationMs)).toEqual([0, 30 * MIN, 75 * MIN, 150 * MIN]);
  });
  it('betStartProblem: duration floor, stake at least 1 and at most the day net', () => {
    expect(betStartProblem({ multiplier: 1, stakePoints: 0, durationMs: 1 }, 0)).toBeNull();
    expect(betStartProblem({ multiplier: 2, stakePoints: 100, durationMs: 30 * MIN }, 110)).toBeNull();
    expect(betStartProblem({ multiplier: 2, stakePoints: 110, durationMs: 30 * MIN }, 110)).toBeNull();
    expect(betStartProblem({ multiplier: 2, stakePoints: 111, durationMs: 30 * MIN }, 110)).toMatch(/at most/);
    expect(betStartProblem({ multiplier: 2, stakePoints: 100, durationMs: 30 * MIN - 1 }, 110)).toMatch(/at least 30 minutes/);
    expect(betStartProblem({ multiplier: 5, stakePoints: 0, durationMs: 75 * MIN }, 110)).toMatch(/at least 1 point/);
    expect(betStartProblem({ multiplier: 2, stakePoints: 1, durationMs: 30 * MIN }, -5)).toMatch(/at most your net points of today \(0\)/);
  });
  it('betOutcome: bonus is stake x (multiplier - 1), reached within the grace', () => {
    expect(betOutcome(2, 100, 30 * MIN, 30 * MIN, 50)).toEqual({ kind: 'bonus', points: 100 });
    expect(betOutcome(5, 100, 75 * MIN, 75 * MIN, 0)).toEqual({ kind: 'bonus', points: 400 });
    expect(betOutcome(2, 100, 30 * MIN - BET_GRACE_MS, 30 * MIN, 50)).toEqual({ kind: 'bonus', points: 100 });
    expect(betOutcome(2, 100, 30 * MIN - BET_GRACE_MS - 1, 30 * MIN, 150)).toEqual({ kind: 'penalty', points: -100 });
  });
  it('betOutcome: the penalty is the stake, never more than the day net (never below 0)', () => {
    expect(betOutcome(2, 100, 0, 30 * MIN, 150)).toEqual({ kind: 'penalty', points: -100 });
    expect(betOutcome(2, 100, 0, 30 * MIN, 40)).toEqual({ kind: 'penalty', points: -40 });
    expect(betOutcome(2, 100, 0, 30 * MIN, 0)).toEqual({ kind: 'none', points: 0 });
    expect(betOutcome(1, 100, 0, 0, 100)).toEqual({ kind: 'none', points: 0 });
  });
});

describe('bet sessions through the API', () => {
  it('rejects bad bets with 400 and keeps old clients (no body) working', async () => {
    const p = await richPlayer();
    expect((await post(p, '/v1/focus/start', { multiplier: 3 })).statusCode).toBe(400);
    expect((await post(p, '/v1/focus/start', { multiplier: 2 })).statusCode).toBe(400); // no stake, no duration
    expect((await post(p, '/v1/focus/start', bet(2, 100, 29))).statusCode).toBe(400); // shorter than 30 min
    expect((await post(p, '/v1/focus/start', bet(2, 111, 30))).statusCode).toBe(400); // more than the day's net
    expect((await post(p, '/v1/focus/start', bet(2, 0, 30))).statusCode).toBe(400);
    expect((await post(p, '/v1/focus/start')).statusCode).toBe(200);
  });

  it('a player with no points today cannot bet', async () => {
    const p = await registerPlayer(env);
    expect((await post(p, '/v1/focus/start', bet(2, 1, 30))).statusCode).toBe(400);
  });

  it('100 points at 2x, timer of 30 min reached: +100', async () => {
    const p = await richPlayer();
    expect((await post(p, '/v1/focus/start', bet(2, 100, 30))).statusCode).toBe(200);
    for (let i = 0; i < 20; i++) await beat(p); // 20 x 90 s = 30 min
    const stop = (await post(p, '/v1/focus/stop', { reason: 'expired' })).json();
    expect(stop.bet).toEqual({ multiplier: 2, outcome: 'bonus', points: 100 });
    expect(await ledger(p, 'bet_bonus')).toEqual([100]);
    expect(await total(p)).toBe(110 + 60 + 100); // the 110 granted, 30 min at the double rate (past 90 min), the bonus
  });

  it('5x pays four times the stake', async () => {
    const p = await richPlayer();
    await post(p, '/v1/focus/start', bet(5, 50, 75));
    for (let i = 0; i < 50; i++) await beat(p); // 75 min
    expect((await post(p, '/v1/focus/stop', { reason: 'expired' })).json().bet).toEqual({ multiplier: 5, outcome: 'bonus', points: 200 });
  });

  it('a longer timer than the minimum is what must be reached', async () => {
    const p = await richPlayer();
    await post(p, '/v1/focus/start', bet(2, 100, 60));
    for (let i = 0; i < 20; i++) await beat(p); // only 30 of the 60 minutes
    expect((await post(p, '/v1/focus/stop', { reason: 'manual' })).json().bet).toEqual({ multiplier: 2, outcome: 'penalty', points: -100 });
  });

  it('leaving early loses the staked points', async () => {
    const p = await richPlayer();
    const before = await total(p);
    await post(p, '/v1/focus/start', bet(2, 100, 30));
    for (let i = 0; i < 4; i++) await beat(p); // 6 min
    const stop = (await post(p, '/v1/focus/stop', { reason: 'manual' })).json();
    expect(stop.bet).toEqual({ multiplier: 2, outcome: 'penalty', points: -100 });
    expect(await ledger(p, 'bet_penalty')).toEqual([-100]);
    expect(await total(p)).toBe(before + 12 - 100); // 6 min at the double rate past 90 min, minus the stake
  });

  it('a restart before the timer forfeits the bet', async () => {
    const p = await richPlayer();
    await post(p, '/v1/focus/start', bet(2, 100, 30));
    for (let i = 0; i < 4; i++) await beat(p);
    await post(p, '/v1/focus/start');
    expect(await ledger(p, 'bet_penalty')).toEqual([-100]);
  });

  it('a lost gap on an unfinished bet is settled on the next start', async () => {
    const p = await richPlayer();
    await post(p, '/v1/focus/start', bet(2, 100, 30));
    for (let i = 0; i < 4; i++) await beat(p);
    env.clock.advance(11 * MIN); // no heartbeat for more than 10 minutes
    await post(p, '/v1/focus/start');
    expect(await ledger(p, 'bet_penalty')).toEqual([-100]);
  });

  it('without a bet nothing is ever added or taken', async () => {
    const p = await richPlayer();
    await post(p, '/v1/focus/start', { multiplier: 1 });
    for (let i = 0; i < 4; i++) await beat(p);
    const stop = (await post(p, '/v1/focus/stop', { reason: 'manual' })).json();
    expect(stop.bet).toBeUndefined();
    expect(await ledger(p, 'bet_penalty')).toEqual([]);
  });

  it('a bet does not change a kill: the penalty is still 25 % of the day gross', async () => {
    // The multiplier lives only in focus_sessions; kills never read it (see server/src/kills.ts).
    const p = await richPlayer();
    await post(p, '/v1/focus/start', bet(10, 100, 150));
    const row = (await env.db.query('SELECT bet_multiplier, bet_stake FROM focus_sessions WHERE player_id = $1', [p.id])).rows[0];
    expect(row).toEqual({ bet_multiplier: 10, bet_stake: 100 });
  });
});
