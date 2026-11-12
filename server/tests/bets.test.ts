import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BET_BASE_MS, betOutcome, requiredMsFor } from '../src/domain/bets';
import { call, createEnv, registerPlayer, type Env, type Player } from './helpers';

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

describe('pure rules', () => {
  it('requiredMsFor: 1x has no requirement, others are 15 min per unit', () => {
    expect(requiredMsFor(1)).toBe(0);
    expect(requiredMsFor(2)).toBe(2 * BET_BASE_MS);
    expect(requiredMsFor(5)).toBe(75 * 60_000);
    expect(requiredMsFor(10)).toBe(150 * 60_000);
  });
  it('betOutcome: no bet or no points means nothing happens', () => {
    expect(betOutcome(1, 0, 100, 100)).toEqual({ kind: 'none', points: 0 });
    expect(betOutcome(5, 0, 0, 100)).toEqual({ kind: 'none', points: 0 });
  });
  it('betOutcome: bonus at the exact required time, penalty one ms before', () => {
    expect(betOutcome(5, requiredMsFor(5), 80, 80)).toEqual({ kind: 'bonus', points: 320 });
    expect(betOutcome(5, requiredMsFor(5) - 1, 80, 80)).toEqual({ kind: 'penalty', points: -80 });
  });
  it('betOutcome: the penalty never takes the day below 0', () => {
    expect(betOutcome(10, 0, 50, 30)).toEqual({ kind: 'penalty', points: -30 });
    expect(betOutcome(10, 0, 50, 0)).toEqual({ kind: 'none', points: 0 });
    expect(betOutcome(10, 0, 50, -5)).toEqual({ kind: 'none', points: 0 });
  });
});

describe('bet sessions through the API', () => {
  it('rejects an unknown multiplier and accepts a start without a body (old clients)', async () => {
    const p = await registerPlayer(env);
    expect((await post(p, '/v1/focus/start', { multiplier: 3 })).statusCode).toBe(400);
    expect((await post(p, '/v1/focus/start')).statusCode).toBe(200);
  });

  it('2x session that reaches 30 min and is stopped pays a bonus equal to its points', async () => {
    const p = await registerPlayer(env);
    expect((await post(p, '/v1/focus/start', { multiplier: 2 })).statusCode).toBe(200);
    for (let i = 0; i < 20; i++) await beat(p); // 20 x 90 s = 30 min
    const stop = (await post(p, '/v1/focus/stop', { reason: 'manual' })).json();
    expect(stop.bet).toEqual({ multiplier: 2, outcome: 'bonus', points: 30 });
    expect(await ledger(p, 'bet_bonus')).toEqual([30]);
    expect(await total(p)).toBe(60);
  });

  it('5x session stopped early loses as many points as it earned, but never below 0', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start', { multiplier: 5 });
    for (let i = 0; i < 4; i++) await beat(p); // 6 min = 6 points
    const stop = (await post(p, '/v1/focus/stop', { reason: 'manual' })).json();
    expect(stop.bet).toEqual({ multiplier: 5, outcome: 'penalty', points: -6 }); // 4 x 6 = 24 capped at the day's net of 6
    expect(await total(p)).toBe(0);
  });

  it('a timer that ends too early (expired) is a failed bet too', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start', { multiplier: 2 });
    for (let i = 0; i < 4; i++) await beat(p);
    const stop = (await post(p, '/v1/focus/stop', { reason: 'expired' })).json();
    expect(stop.bet.outcome).toBe('penalty');
  });

  it('1x and a session without a bet never get a bonus or a penalty', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start', { multiplier: 1 });
    for (let i = 0; i < 4; i++) await beat(p);
    const stop = (await post(p, '/v1/focus/stop', { reason: 'manual' })).json();
    expect(stop.bet).toBeUndefined();
    expect(await ledger(p, 'bet_penalty')).toEqual([]);
    expect(await total(p)).toBe(6);
  });

  it('a lost gap on an unfinished bet session is settled as a penalty when the player restarts', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start', { multiplier: 2 });
    for (let i = 0; i < 4; i++) await beat(p);
    env.clock.advance(11 * 60_000); // no heartbeat for more than 10 minutes
    await post(p, '/v1/focus/start');
    expect(await ledger(p, 'bet_penalty')).toEqual([-6]);
    expect(await total(p)).toBe(0);
  });

  it('a restart before reaching the required time forfeits the bet', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start', { multiplier: 2 });
    for (let i = 0; i < 4; i++) await beat(p);
    await post(p, '/v1/focus/start', { multiplier: 2 });
    expect(await ledger(p, 'bet_penalty')).toEqual([-6]);
  });
});
