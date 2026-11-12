import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SHIELD_BLOCK_IMMUNITY_MS, SHIELD_MAX, SHIELD_SESSION_MS, shieldAbsorbs, shieldAward } from '../src/domain/shields';
import { MIN, call, createEnv, grantFocusMinutes, makeWasteman, registerPlayer, signChallenge, type Env, type Player } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.close();
});

const HB = 90_000;
const post = (p: Player, path: string, body?: unknown, e: Env = env) => call(e, p, 'POST', path, body);
const me = async (p: Player, e: Env = env) => (await call(e, p, 'GET', '/v1/me')).json();
const events = async (p: Player, e: Env = env) => (await call(e, p, 'GET', '/v1/events?after=0')).json();
const setCredit = (e: Env, p: Player, ms: number) =>
  e.db.query('UPDATE focus_sessions SET credited_ms = $2 WHERE player_id = $1 AND ended_at IS NULL', [p.id, ms]);
const sessions = async (p: Player) =>
  (await env.db.query('SELECT credited_ms, shield_awarded, end_reason FROM focus_sessions WHERE player_id = $1 ORDER BY id', [p.id])).rows;
/** One heartbeat that credits exactly 90 s. */
async function beat(p: Player, e: Env = env) {
  e.clock.advance(HB);
  return post(p, '/v1/focus/heartbeat', undefined, e);
}

describe('pure rules', () => {
  it('constants', () => {
    expect(SHIELD_SESSION_MS).toBe(5 * 3_600_000);
    expect(SHIELD_MAX).toBe(3);
    expect(SHIELD_BLOCK_IMMUNITY_MS).toBe(10 * 60_000);
  });
  it('shieldAward: boundary, once per session, cap', () => {
    expect(shieldAward(0, HB, false, 0)).toMatchObject({ markAwarded: false, granted: false, shields: 0, creditedAfter: HB });
    expect(shieldAward(SHIELD_SESSION_MS - HB - 1, HB, false, 0)).toMatchObject({ markAwarded: false, granted: false });
    expect(shieldAward(SHIELD_SESSION_MS - HB, HB, false, 0)).toMatchObject({ markAwarded: true, granted: true, shields: 1 });
    expect(shieldAward(SHIELD_SESSION_MS, HB, true, 1)).toMatchObject({ markAwarded: false, granted: false, shields: 1 });
    expect(shieldAward(SHIELD_SESSION_MS - HB, HB, false, 3)).toMatchObject({ markAwarded: true, granted: false, shields: 3 });
    expect(shieldAward(SHIELD_SESSION_MS - HB, HB, false, 2)).toMatchObject({ granted: true, shields: 3 });
  });
  it('shieldAbsorbs', () => {
    expect(shieldAbsorbs(0)).toEqual({ blocked: false, remaining: 0 });
    expect(shieldAbsorbs(1)).toEqual({ blocked: true, remaining: 0 });
    expect(shieldAbsorbs(3)).toEqual({ blocked: true, remaining: 2 });
  });
});

describe('earning shields', () => {
  it('5 h of real 90 s heartbeats earn exactly one shield, at the 200th heartbeat', async () => {
    const e = await createEnv();
    try {
      const p = await registerPlayer(e);
      await post(p, '/v1/focus/start', undefined, e);
      for (let i = 1; i <= 199; i++) await beat(p, e);
      expect((await me(p, e)).shields).toBe(0);
      await beat(p, e); // 200 x 90 s = 5 h of credit
      expect((await me(p, e)).shields).toBe(1);
      for (let i = 0; i < 5; i++) await beat(p, e);
      expect((await me(p, e)).shields).toBe(1); // one per session
      const ev = (await events(p, e)).filter((x: { kind: string }) => x.kind === 'shield_earned');
      expect(ev).toHaveLength(1);
      expect(ev[0].payload).toEqual({ shields: 1 });
    } finally {
      await e.close();
    }
  });

  it('is awarded exactly at 5 h of credit, not 1 ms before', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start');
    await setCredit(env, p, SHIELD_SESSION_MS - HB - 1);
    await beat(p);
    expect((await me(p)).shields).toBe(0);
    expect((await sessions(p))[0]).toMatchObject({ credited_ms: SHIELD_SESSION_MS - 1, shield_awarded: false });
    env.clock.advance(1); // +1 ms of credit reaches exactly 5 h
    await post(p, '/v1/focus/heartbeat');
    expect((await me(p)).shields).toBe(1);
    expect((await sessions(p))[0]).toMatchObject({ credited_ms: SHIELD_SESSION_MS, shield_awarded: true });
  });

  it('time only counts from heartbeat credit: the 90 s cap applies, a phone left on does not earn it', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start');
    env.clock.advance(5 * 3_600_000 - 1); // 5 h of wall clock with no heartbeat in between: lost, and nothing is credited
    await post(p, '/v1/focus/heartbeat');
    expect((await me(p)).shields).toBe(0);
  });

  it('a manual stop closes the session: the next one starts from 0 (final credit still counts)', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start');
    await setCredit(env, p, SHIELD_SESSION_MS - 2 * HB);
    env.clock.advance(HB);
    await post(p, '/v1/focus/heartbeat');
    env.clock.advance(HB);
    await post(p, '/v1/focus/stop', { reason: 'manual' }); // 4h59 of credit before this stop would not be enough without it
    expect((await me(p)).shields).toBe(1); // the stop credited the last 90 s into the same session
    const s1 = await sessions(p);
    expect(s1[0]).toMatchObject({ end_reason: 'manual', shield_awarded: true });

    // a fresh session starts at 0 and does not inherit anything
    await post(p, '/v1/focus/start');
    await beat(p);
    const s2 = await sessions(p);
    expect(s2[1]).toMatchObject({ credited_ms: HB, shield_awarded: false, end_reason: null });
  });

  it('manual stop before 5 h, then more time, does not add up across sessions', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start');
    await setCredit(env, p, SHIELD_SESSION_MS - 3 * HB);
    await beat(p);
    await post(p, '/v1/focus/stop', { reason: 'manual' });
    await post(p, '/v1/focus/start');
    await setCredit(env, p, SHIELD_SESSION_MS - 3 * HB);
    await beat(p);
    expect((await me(p)).shields).toBe(0);
  });

  it('a restart (focus/start while focus) closes the session', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start');
    await setCredit(env, p, SHIELD_SESSION_MS - 2 * HB);
    await beat(p);
    await post(p, '/v1/focus/start'); // restart
    await beat(p);
    await beat(p);
    expect((await me(p)).shields).toBe(0);
    const s = await sessions(p);
    expect(s[0]).toMatchObject({ end_reason: 'restart', shield_awarded: false });
    expect(s[1]).toMatchObject({ credited_ms: 2 * HB, end_reason: null });
  });

  it('a lost gap (> 10 min without heartbeat) closes the session', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start');
    await setCredit(env, p, SHIELD_SESSION_MS - HB);
    env.clock.advance(10 * MIN + 1);
    const lost = (await post(p, '/v1/focus/heartbeat')).json();
    expect(lost).toMatchObject({ state: 'idle', lost: true });
    expect((await me(p)).shields).toBe(0); // the heartbeat that would have completed it came too late
    await post(p, '/v1/focus/start');
    await beat(p);
    expect((await me(p)).shields).toBe(0);
    const s = await sessions(p);
    expect(s[0]).toMatchObject({ end_reason: 'lost', shield_awarded: false });
    expect(s[1].credited_ms).toBe(HB);
  });

  it('exactly 10 minutes of silence is not yet a gap', async () => {
    const p = await registerPlayer(env);
    await post(p, '/v1/focus/start');
    await setCredit(env, p, SHIELD_SESSION_MS - HB);
    env.clock.advance(10 * MIN);
    await post(p, '/v1/focus/heartbeat'); // credits 90 s (cap) and completes the session
    expect((await me(p)).shields).toBe(1);
  });

  it('caps at 3: the session is still marked awarded, but no further notification', async () => {
    const p = await registerPlayer(env);
    for (let i = 1; i <= 4; i++) {
      await post(p, '/v1/focus/start');
      await setCredit(env, p, SHIELD_SESSION_MS - HB);
      await beat(p);
      expect((await me(p)).shields).toBe(Math.min(i, 3));
      expect((await sessions(p))[i - 1].shield_awarded).toBe(true);
    }
    const ev = (await events(p)).filter((x: { kind: string }) => x.kind === 'shield_earned');
    expect(ev.map((x: { payload: { shields: number } }) => x.payload.shields)).toEqual([1, 2, 3]);
  });
});

/** Visible killer with 90 minutes and a wasteman victim holding `shields`. */
async function setup(shields: number, victimMinutes = 40) {
  const killer = await registerPlayer(env, { nickname: 'Hunter' });
  const victim = await registerPlayer(env, { nickname: 'Prey' });
  await grantFocusMinutes(env, killer, 90);
  if (victimMinutes) await grantFocusMinutes(env, victim, victimMinutes);
  await makeWasteman(env, victim);
  await env.db.query('UPDATE players SET shields = $2 WHERE id = $1', [victim.id, shields]);
  return { killer, victim };
}
async function challenge(killer: Player, victim: Player) {
  return call(env, killer, 'POST', '/v1/kills/challenge', { targetPlayerId: victim.id });
}
async function attack(killer: Player, victim: Player) {
  const c = (await challenge(killer, victim)).json();
  const body = { challengeId: c.challengeId, signature: signChallenge(victim, c, killer.id) };
  return { res: await call(env, killer, 'POST', '/v1/kills', body), body };
}

describe('a shield absorbs a kill', () => {
  it('no points, no penalty, no kill counted, 10-minute immunity, notification, identical replay', async () => {
    const { killer, victim } = await setup(2);
    const t = env.clock.now().getTime();
    const { res, body } = await attack(killer, victim);
    expect(res.statusCode).toBe(201);
    const result = res.json();
    expect(result).toMatchObject({ victimPlayerId: victim.id, pointsGained: 0, victimPointsLost: 0, shieldBlocked: true });
    expect(new Date(result.victimImmuneUntil).getTime()).toBe(t + 10 * MIN);
    expect(Object.keys(result)).not.toContain('shields');

    // nothing counted as a kill, anywhere
    expect((await env.db.query('SELECT COUNT(*)::int n FROM kills WHERE killer_id = $1 OR victim_id = $2', [killer.id, victim.id])).rows[0].n).toBe(0);
    expect((await env.db.query("SELECT COUNT(*)::int n FROM points_ledger WHERE player_id = ANY($1) AND kind IN ('kill','penalty')", [[killer.id, victim.id]])).rows[0].n).toBe(0);
    expect((await call(env, killer, 'GET', '/v1/me/stats')).json()).toMatchObject({ killsToday: 0, killsTotal: 0, pointsToday: 90 });
    expect((await call(env, victim, 'GET', '/v1/me/stats')).json()).toMatchObject({ deathsToday: 0, deathsTotal: 0, pointsToday: 40 });
    const lb = (await call(env, killer, 'GET', '/v1/leaderboard')).json();
    expect(lb.me).toEqual({ rank: null, kills: 0 });
    expect(lb.top).toEqual([]);

    // the victim: one shield used, short immunity, still wasteman, notified (and not told they were killed)
    const v = await me(victim);
    expect(v).toMatchObject({ shields: 1, state: 'wasteman' });
    expect(new Date(v.immuneUntil).getTime()).toBe(t + 10 * MIN);
    const ev = await events(victim);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: 'shield_blocked', payload: { killerNickname: 'Hunter', shields: 1 } });

    // replay (also after time passed) returns the identical result and consumes nothing
    env.clock.advance(5 * MIN);
    const replay = await call(env, killer, 'POST', '/v1/kills', body);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(result);
    expect((await me(victim)).shields).toBe(1);
    expect(await events(victim)).toHaveLength(1);
  });

  it('immunity is 10 minutes (not 1 hour); then the next shield, then a normal kill with shieldBlocked false', async () => {
    const { killer, victim } = await setup(2, 40);
    expect((await attack(killer, victim)).res.json().shieldBlocked).toBe(true);
    const other = await registerPlayer(env);
    await grantFocusMinutes(env, other, 90);
    env.clock.advance(10 * MIN - 1);
    expect((await challenge(other, victim)).json().error.code).toBe('immune');
    env.clock.advance(1);
    const second = await attack(other, victim);
    expect(second.res.json()).toMatchObject({ shieldBlocked: true, pointsGained: 0 });
    expect((await me(victim)).shields).toBe(0);
    env.clock.advance(10 * MIN);
    const third = await attack(killer, victim);
    expect(third.res.statusCode).toBe(201);
    expect(third.res.json()).toMatchObject({ shieldBlocked: false, pointsGained: 50, victimPointsLost: 10 });
    expect((await call(env, killer, 'GET', '/v1/me/stats')).json().killsTotal).toBe(1);
    expect((await events(victim)).map((x: { kind: string }) => x.kind)).toEqual(['shield_blocked', 'shield_blocked', 'killed']);
  });

  it('preconditions come first and consume no shield (needs_minutes, not_wasteman, blocked, ...)', async () => {
    const { victim } = await setup(1);
    const lazy = await registerPlayer(env);
    expect((await challenge(lazy, victim)).json().error).toMatchObject({ code: 'needs_minutes', missingMinutes: 90 });
    const killer = await registerPlayer(env);
    await grantFocusMinutes(env, killer, 90);
    await call(env, victim, 'POST', '/v1/blocks', { playerId: killer.id });
    expect((await challenge(killer, victim)).json().error.code).toBe('blocked');
    await call(env, victim, 'DELETE', `/v1/blocks/${killer.id}`);
    await post(victim, '/v1/focus/start'); // no longer wasteman
    expect((await challenge(killer, victim)).json().error.code).toBe('not_wasteman');
    expect((await me(victim)).shields).toBe(1);
  });

  it('a shield-blocked challenge that fails a later check stores the error as before (victim restarted focus first)', async () => {
    const { killer, victim } = await setup(1);
    const c = (await challenge(killer, victim)).json();
    await post(victim, '/v1/focus/start');
    const res = await call(env, killer, 'POST', '/v1/kills', { challengeId: c.challengeId, signature: signChallenge(victim, c, killer.id) });
    expect(res.json().error.code).toBe('not_wasteman');
    expect((await me(victim)).shields).toBe(1);
  });

  it('two killers racing on a shielded wasteman: exactly one consumes the shield, the other gets immune (20 iterations)', async () => {
    for (let i = 0; i < 20; i++) {
      const victim = await registerPlayer(env);
      await makeWasteman(env, victim);
      await env.db.query('UPDATE players SET shields = 1 WHERE id = $1', [victim.id]);
      const k1 = await registerPlayer(env);
      const k2 = await registerPlayer(env);
      await grantFocusMinutes(env, k1, 90);
      await grantFocusMinutes(env, k2, 90);
      const c1 = (await challenge(k1, victim)).json();
      const c2 = (await challenge(k2, victim)).json();
      const [a, b] = await Promise.all([
        call(env, k1, 'POST', '/v1/kills', { challengeId: c1.challengeId, signature: signChallenge(victim, c1, k1.id) }),
        call(env, k2, 'POST', '/v1/kills', { challengeId: c2.challengeId, signature: signChallenge(victim, c2, k2.id) }),
      ]);
      expect([a.statusCode, b.statusCode].sort(), `iteration ${i}`).toEqual([201, 409]);
      const [win, lose] = a.statusCode === 201 ? [a, b] : [b, a];
      expect(win.json().shieldBlocked).toBe(true);
      expect(lose.json().error.code).toBe('immune');
      expect((await me(victim)).shields).toBe(0);
      expect((await events(victim)).filter((x: { kind: string }) => x.kind === 'shield_blocked')).toHaveLength(1);
    }
  });
});

describe('shields stay private', () => {
  it('never appear in what other players (or the killer) see', async () => {
    const { killer, victim } = await setup(3);
    await env.db.query('UPDATE players SET multiplayer_enabled = true WHERE id = ANY($1)', [[killer.id, victim.id]]);
    const token = '0a0b0c0d0e0f';
    expect((await call(env, victim, 'PUT', '/v1/me/ble-token', { token, day: '2026-03-10' })).statusCode).toBe(200);
    const bodies: string[] = [];
    bodies.push((await call(env, killer, 'POST', '/v1/nearby', { tokens: [token] })).body);
    expect(JSON.parse(bodies[0]!)).toHaveLength(1); // the victim really is in the response
    bodies.push((await call(env, killer, 'GET', '/v1/leaderboard')).body);
    await call(env, killer, 'POST', '/v1/blocks', { playerId: victim.id });
    bodies.push((await call(env, killer, 'GET', '/v1/blocks')).body);
    await call(env, killer, 'DELETE', `/v1/blocks/${victim.id}`);
    bodies.push((await call(env, killer, 'GET', `/v1/photos/${victim.id}`)).body);
    bodies.push((await call(env, killer, 'GET', '/v1/me/stats')).body);
    bodies.push((await attack(killer, victim)).res.body);
    for (const b of bodies) expect(b).not.toContain('shields');
    expect((await me(victim)).shields).toBe(2); // the owner does see it, and GET and PUT /me both carry it
    const put = await call(env, victim, 'PUT', '/v1/me', { nickname: 'Prey', rankKey: 'novice', level: 1, multiplayerEnabled: true, timezone: 'UTC' });
    expect(put.json().shields).toBe(2);
  });
});

describe('dev helper creditSession', () => {
  it('adds session credit when in focus (so a shield can be tested without waiting 5 h)', async () => {
    const e = await createEnv({ devFakeMinutes: true });
    try {
      const p = await registerPlayer(e);
      // idle: creditSession has nothing to credit, minutes still count
      const idle = await post(p, '/v1/dev/focus-minutes', { minutes: 10, creditSession: true }, e);
      expect(idle.json()).toEqual({ focusMinutesToday: 10, shields: 0 });
      await post(p, '/v1/focus/start', undefined, e);
      expect((await post(p, '/v1/dev/focus-minutes', { minutes: 120 }, e)).json().shields).toBe(0); // no creditSession: unchanged
      expect((await post(p, '/v1/dev/focus-minutes', { minutes: 299, creditSession: true }, e)).json().shields).toBe(0);
      const r = await post(p, '/v1/dev/focus-minutes', { minutes: 1, creditSession: true }, e);
      expect(r.json()).toMatchObject({ shields: 1, focusMinutesToday: 10 + 120 + 299 + 1 });
      expect((await me(p, e)).shields).toBe(1);
      expect((await events(p, e)).map((x: { kind: string }) => x.kind)).toEqual(['shield_earned']);
      expect((await post(p, '/v1/dev/focus-minutes', { minutes: 5, creditSession: 'yes' }, e)).statusCode).toBe(400);
    } finally {
      await e.close();
    }
  });
});
