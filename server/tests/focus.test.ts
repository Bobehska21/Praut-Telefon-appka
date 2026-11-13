import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIN, call, createEnv, registerPlayer, type Env } from './helpers';
import { killPenalty, pointsForFocusMs } from '../src/domain/points';

let env: Env;
beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.close();
});

const post = (p: Awaited<ReturnType<typeof registerPlayer>>, path: string, body?: unknown) => call(env, p, 'POST', path, body);

describe('state machine', () => {
  it('idle -> focus -> wasteman (manual) -> focus (restart)', async () => {
    const p = await registerPlayer(env);
    expect((await post(p, '/v1/focus/start')).json()).toMatchObject({ state: 'focus', focusMinutesToday: 0 });
    env.clock.advance(60_000);
    expect((await post(p, '/v1/focus/stop', { reason: 'manual' })).json().state).toBe('wasteman');
    expect((await call(env, p, 'GET', '/v1/me')).json().state).toBe('wasteman');
    // wasteman stays wasteman, also after a heartbeat or another stop
    expect((await post(p, '/v1/focus/heartbeat')).json().state).toBe('wasteman');
    expect((await post(p, '/v1/focus/stop', { reason: 'manual' })).json().state).toBe('wasteman');
    expect((await post(p, '/v1/focus/start')).json().state).toBe('focus');
  });

  it('expired stop goes to idle, never wasteman', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start');
    env.clock.advance(30_000);
    expect((await post(p, '/v1/focus/stop', { reason: 'expired' })).json().state).toBe('idle');
  });

  it('a player who never focused is idle, and manual stop does not make them wasteman', async () => {
    const p = await registerPlayer(env);
    expect((await post(p, '/v1/focus/stop', { reason: 'manual' })).json().state).toBe('idle');
  });

  it('validates the stop reason', async () => {
    const p = await registerPlayer(env);
    expect((await post(p, '/v1/focus/stop', { reason: 'bored' })).statusCode).toBe(400);
    expect((await post(p, '/v1/focus/stop', {})).statusCode).toBe(400);
  });

  it('no heartbeat for >10 minutes means lost: idle, no wasteman, no credit', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start');
    env.clock.advance(10 * MIN + 1);
    expect((await call(env, p, 'GET', '/v1/me')).json().state).toBe('idle'); // lazily visible
    const r = (await post(p, '/v1/focus/heartbeat')).json();
    expect(r).toMatchObject({ state: 'idle', lost: true, focusMinutesToday: 0 });
    expect((await post(p, '/v1/focus/stop', { reason: 'manual' })).json().state).toBe('idle');
  });

  it('exactly 10 minutes is not yet lost', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start');
    env.clock.advance(10 * MIN);
    const r = (await post(p, '/v1/focus/heartbeat')).json();
    expect(r.state).toBe('focus');
    expect(r.focusMinutesToday).toBe(1); // capped at 90 s
  });
});

describe('heartbeat credit', () => {
  it('credits at most 90 s per heartbeat', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start');
    env.clock.advance(5 * MIN);
    await post(p, '/v1/focus/heartbeat');
    const ms = (await env.db.query("SELECT SUM(focus_ms)::int ms FROM points_ledger WHERE player_id = $1", [p.id])).rows[0].ms;
    expect(ms).toBe(90_000);
  });

  it('credits the exact elapsed time below the cap and loses nothing to rounding', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start');
    for (let i = 0; i < 120; i++) {
      env.clock.advance(1_000);
      await post(p, '/v1/focus/heartbeat');
    }
    const r = (await post(p, '/v1/focus/heartbeat')).json();
    expect(r.focusMinutesToday).toBe(2);
  });

  it('a full 90 minutes of 30 s heartbeats gives 90 points; further minutes give 2 each', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start');
    const points = async () => (await env.db.query('SELECT COALESCE(SUM(points),0)::int s FROM points_ledger WHERE player_id = $1', [p.id])).rows[0].s;
    for (let i = 0; i < 180; i++) {
      env.clock.advance(30_000);
      await post(p, '/v1/focus/heartbeat');
    }
    expect(await points()).toBe(90);
    for (let i = 0; i < 20; i++) {
      env.clock.advance(30_000);
      await post(p, '/v1/focus/heartbeat');
    }
    expect(await points()).toBe(90 + 10 * 2);
    expect((await post(p, '/v1/focus/heartbeat')).json().focusMinutesToday).toBe(100);
  });
});

describe('points math', () => {
  it('pointsForFocusMs', () => {
    expect(pointsForFocusMs(0)).toBe(0);
    expect(pointsForFocusMs(59_999)).toBe(0);
    expect(pointsForFocusMs(90 * MIN)).toBe(90);
    expect(pointsForFocusMs(91 * MIN)).toBe(92);
    expect(pointsForFocusMs(120 * MIN)).toBe(150);
  });
  it('killPenalty is 25% floored and capped at the net', () => {
    expect(killPenalty(100, 100)).toBe(25);
    expect(killPenalty(99, 99)).toBe(24);
    expect(killPenalty(3, 3)).toBe(0);
    expect(killPenalty(100, 10)).toBe(10);
    expect(killPenalty(100, 0)).toBe(0);
    expect(killPenalty(100, -5)).toBe(0);
  });
});
