import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { ADMIN_TOKEN, TEST_DATABASE_URL, call, createEnv, makeWasteman, registerPlayer, type Env } from './helpers';

const envs: Env[] = [];
const make = async (o: Parameters<typeof createEnv>[0] = {}) => {
  const e = await createEnv(o);
  envs.push(e);
  return e;
};
afterAll(async () => {
  for (const e of envs) await e.close();
});

describe('DEV_FAKE_MINUTES', () => {
  it('the route does not exist by default (404, even when authenticated)', async () => {
    const e = await make();
    const p = await registerPlayer(e);
    const r = await call(e, p, 'POST', '/v1/dev/focus-minutes', { minutes: 90 });
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe('not_found');
    expect(loadConfig({ DATABASE_URL: 'x', ADMIN_TOKEN }).devFakeMinutes).toBe(false);
  });

  it('with the flag: requires auth, validates input, grants minutes consistently with stats and the 90-minute gate', async () => {
    const e = await make({ devFakeMinutes: true });
    const killer = await registerPlayer(e);
    const victim = await registerPlayer(e);
    await makeWasteman(e, victim);
    expect((await e.app.inject({ method: 'POST', url: '/v1/dev/focus-minutes', payload: { minutes: 5 } })).statusCode).toBe(401);
    for (const minutes of [0, 601, 1.5, '5']) {
      expect((await call(e, killer, 'POST', '/v1/dev/focus-minutes', { minutes })).statusCode, String(minutes)).toBe(400);
    }

    const gate = async () => (await call(e, killer, 'POST', '/v1/kills/challenge', { targetPlayerId: victim.id })).json();
    expect((await gate()).error).toMatchObject({ code: 'needs_minutes', missingMinutes: 90 });
    const first = await call(e, killer, 'POST', '/v1/dev/focus-minutes', { minutes: 60 });
    expect(first.json()).toMatchObject({ focusMinutesToday: 60 });
    expect((await gate()).error).toMatchObject({ code: 'needs_minutes', missingMinutes: 30 });
    expect((await call(e, killer, 'POST', '/v1/dev/focus-minutes', { minutes: 30 })).json()).toMatchObject({ focusMinutesToday: 90 });
    expect((await gate()).challengeId).toBeDefined(); // gate passed

    const stats = (await call(e, killer, 'GET', '/v1/me/stats')).json();
    expect(stats).toMatchObject({ focusMinutesToday: 90, pointsToday: 90 });
    // beyond 90 minutes the +1 bonus applies exactly as for heartbeats: 10 more minutes = 20 points
    await call(e, killer, 'POST', '/v1/dev/focus-minutes', { minutes: 10 });
    expect((await call(e, killer, 'GET', '/v1/me/stats')).json()).toMatchObject({ focusMinutesToday: 100, pointsToday: 110 });
    const row = (await e.db.query("SELECT kind, day FROM points_ledger WHERE player_id = $1 ORDER BY id LIMIT 1", [killer.id])).rows[0];
    expect(row).toEqual({ kind: 'minute', day: '2026-03-10' });
  });

  it('refuses to start in production', () => {
    const base = { DATABASE_URL: TEST_DATABASE_URL, ADMIN_TOKEN };
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', DEV_FAKE_MINUTES: 'true' })).toThrow(/DEV_FAKE_MINUTES.*production/);
    expect(loadConfig({ ...base, NODE_ENV: 'production', DEV_FAKE_MINUTES: 'false' }).devFakeMinutes).toBe(false);
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).devFakeMinutes).toBe(false);
    expect(loadConfig({ ...base, NODE_ENV: 'development', DEV_FAKE_MINUTES: 'true' }).devFakeMinutes).toBe(true);
  });
});
