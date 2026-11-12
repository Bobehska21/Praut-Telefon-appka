import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MIN, call, createEnv, grantFocusMinutes, makeWasteman, registerPlayer, signChallenge, type Env, type Player,
} from './helpers';

let env: Env;
beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.close();
});

const DAY = '2026-03-10';
let tokenSeq = 0;
async function ble(p: Player, day = DAY) {
  const token = (0x100000000000 + ++tokenSeq).toString(16).padStart(12, '0');
  const r = await call(env, p, 'PUT', '/v1/me/ble-token', { token, day });
  expect(r.statusCode, r.body).toBe(200);
  return token;
}
const nearby = async (p: Player, tokens: string[]) => (await call(env, p, 'POST', '/v1/nearby', { tokens })).json();

async function doKill(killer: Player, victim: Player) {
  const c = (await call(env, killer, 'POST', '/v1/kills/challenge', { targetPlayerId: victim.id })).json();
  return call(env, killer, 'POST', '/v1/kills', { challengeId: c.challengeId, signature: signChallenge(victim, c, killer.id) });
}
/** Kills a fresh wasteman victim. */
async function killFresh(killer: Player) {
  const v = await registerPlayer(env);
  await makeWasteman(env, v);
  const r = await doKill(killer, v);
  expect(r.statusCode, r.body).toBe(201);
  return v;
}

describe('ble tokens and nearby', () => {
  it('returns visible players with status, canKill and nothing internal', async () => {
    const me = await registerPlayer(env);
    const w = await registerPlayer(env, { nickname: 'waste', rankKey: 'adept', level: 7 });
    const f = await registerPlayer(env, { nickname: 'foc' });
    const i = await registerPlayer(env, { nickname: 'idl' });
    const [tw, tf, ti] = [await ble(w), await ble(f), await ble(i)];
    await makeWasteman(env, w);
    await call(env, f, 'POST', '/v1/focus/start');

    let res = await nearby(me, [tw, tf, ti, 'ffffffffffff']);
    expect(res).toHaveLength(3);
    const byTok = Object.fromEntries(res.map((x: { token: string }) => [x.token, x]));
    expect(Object.keys(byTok[tw]).sort()).toEqual(
      ['canKill', 'immuneUntil', 'killBlockedReason', 'level', 'missingMinutes', 'nickname', 'photoUrl', 'playerId', 'rankKey', 'status', 'token'],
    );
    expect(byTok[tw]).toMatchObject({ playerId: w.id, nickname: 'waste', rankKey: 'adept', level: 7, status: 'wasteman', canKill: false, killBlockedReason: 'needs_minutes', missingMinutes: 90, photoUrl: null });
    expect(byTok[tf]).toMatchObject({ status: 'focus', canKill: false, killBlockedReason: 'needs_minutes' });
    expect(byTok[ti].status).toBe('idle');

    await grantFocusMinutes(env, me, 90);
    res = await nearby(me, [tw, tf, ti]);
    const t2 = Object.fromEntries(res.map((x: { token: string }) => [x.token, x]));
    expect(t2[tw]).toMatchObject({ canKill: true, killBlockedReason: null, missingMinutes: 0 });
    expect(t2[tf]).toMatchObject({ canKill: false, killBlockedReason: 'not_wasteman' });
  });

  it('shows immune status with immuneUntil, and lost focus as idle', async () => {
    const me = await registerPlayer(env);
    await grantFocusMinutes(env, me, 90);
    const v = await registerPlayer(env);
    const t = await ble(v);
    await makeWasteman(env, v);
    expect((await doKill(me, v)).statusCode).toBe(201);
    const [n] = await nearby(me, [t]);
    expect(n).toMatchObject({ status: 'immune', canKill: false, killBlockedReason: 'immune' });
    expect(new Date(n.immuneUntil).getTime()).toBe(env.clock.now().getTime() + 60 * MIN);

    const f = await registerPlayer(env);
    const tf = await ble(f);
    await call(env, f, 'POST', '/v1/focus/start');
    env.clock.advance(11 * MIN);
    expect((await nearby(me, [tf]))[0].status).toBe('idle');
  });

  it('hides multiplayer-off, banned and blocked players (both directions)', async () => {
    const me = await registerPlayer(env);
    const off = await registerPlayer(env, { multiplayerEnabled: false });
    const banned = await registerPlayer(env);
    const blockedByMe = await registerPlayer(env);
    const blockedMe = await registerPlayer(env);
    const ok = await registerPlayer(env);
    const toks = [await ble(off), await ble(banned), await ble(blockedByMe), await ble(blockedMe), await ble(ok)];
    await env.db.query('UPDATE players SET banned_at = now() WHERE id = $1', [banned.id]);
    await call(env, me, 'POST', '/v1/blocks', { playerId: blockedByMe.id });
    await call(env, blockedMe, 'POST', '/v1/blocks', { playerId: me.id });
    const res = await nearby(me, toks);
    expect(res.map((x: { playerId: string }) => x.playerId)).toEqual([ok.id]);
    // symmetric: they do not see me either
    const myTok = await ble(me);
    expect(await nearby(blockedMe, [myTok])).toEqual([]);
    expect(await nearby(blockedByMe, [myTok])).toEqual([]);
    expect((await nearby(ok, [myTok])).length).toBe(1);
  });

  it('a requester with multiplayer off sees nobody; own token is never returned', async () => {
    const me = await registerPlayer(env, { multiplayerEnabled: false });
    const other = await registerPlayer(env);
    const t = await ble(other);
    expect(await nearby(me, [t])).toEqual([]);
    const mine = await registerPlayer(env);
    expect(await nearby(mine, [await ble(mine)])).toEqual([]);
  });

  it('validates tokens, days and conflicts', async () => {
    const p = await registerPlayer(env);
    const q = await registerPlayer(env);
    expect((await call(env, p, 'PUT', '/v1/me/ble-token', { token: 'xyz', day: DAY })).statusCode).toBe(400);
    expect((await call(env, p, 'PUT', '/v1/me/ble-token', { token: 'aabbccddeeff', day: '2026-02-30' })).statusCode).toBe(400);
    expect((await call(env, p, 'PUT', '/v1/me/ble-token', { token: 'aabbccddeeff', day: '2026-03-20' })).statusCode).toBe(400);
    expect((await call(env, p, 'PUT', '/v1/me/ble-token', { token: 'AABBCCDDEEFF', day: DAY })).statusCode).toBe(200);
    expect((await call(env, q, 'PUT', '/v1/me/ble-token', { token: 'aabbccddeeff', day: DAY })).statusCode).toBe(409);
    expect((await call(env, p, 'PUT', '/v1/me/ble-token', { token: '112233445566', day: DAY })).statusCode).toBe(200); // rotate same day
    expect((await call(env, p, 'POST', '/v1/nearby', { tokens: Array(51).fill('aabbccddeeff') })).statusCode).toBe(400);
    expect((await call(env, p, 'POST', '/v1/nearby', { tokens: ['nope'] })).statusCode).toBe(400);
  });
});

describe('leaderboard', () => {
  it('orders by kills, ties by earliest last kill, excludes multiplayer-off and banned, shows own rank', async () => {
    const outer = env;
    env = await createEnv();
    try {
    const A = await registerPlayer(env, { nickname: 'A' });
    const B = await registerPlayer(env, { nickname: 'B' });
    const C = await registerPlayer(env, { nickname: 'C' });
    const off = await registerPlayer(env, { nickname: 'off' });
    const bad = await registerPlayer(env, { nickname: 'bad' });
    const nobody = await registerPlayer(env, { nickname: 'nobody' });
    for (const p of [A, B, C, off, bad]) await grantFocusMinutes(env, p, 90);

    await killFresh(B); env.clock.advance(1000);
    await killFresh(C); env.clock.advance(1000);
    await killFresh(A); await killFresh(A);
    await killFresh(off); await killFresh(off); await killFresh(off);
    await killFresh(bad); await killFresh(bad); await killFresh(bad);
    await call(env, off, 'PUT', '/v1/me', { nickname: 'off', rankKey: 'novice', level: 1, multiplayerEnabled: false, timezone: 'UTC' });
    await env.db.query('UPDATE players SET banned_at = now() WHERE id = $1', [bad.id]);

    const lb = (await call(env, nobody, 'GET', '/v1/leaderboard')).json();
    expect(lb.date).toBe('2026-03-10');
    expect(lb.top.map((r: { nickname: string; kills: number }) => [r.nickname, r.kills])).toEqual([['A', 2], ['B', 1], ['C', 1]]);
    expect(lb.top[0]).toMatchObject({ rank: 1, rankKey: 'novice', level: 1, photoUrl: null, isMe: false });
    expect(Object.keys(lb.top[0]).sort()).toEqual(['isMe', 'kills', 'level', 'nickname', 'photoUrl', 'rank', 'rankKey']);
    expect(lb.me).toEqual({ rank: null, kills: 0 });
    const lbC = (await call(env, C, 'GET', '/v1/leaderboard')).json();
    expect(lbC.me).toEqual({ rank: 3, kills: 1 });
    expect(lbC.top[2].isMe).toBe(true);
    expect((await call(env, A, 'GET', '/v1/leaderboard?date=2026-03-09')).json().top).toEqual([]);
    expect((await call(env, A, 'GET', '/v1/leaderboard?date=bad')).statusCode).toBe(400);
      } finally {
      await env.close();
      env = outer;
    }
  });

  it('is limited to 50 rows but still reports the requester rank', async () => {
    const e2 = await createEnv();
    try {
      const me = await registerPlayer(e2, { nickname: 'me' });
      await e2.db.query(
        `INSERT INTO players (token_hash, public_key, multiplayer_enabled)
         SELECT sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'k', true FROM generate_series(1, 55)`,
      );
      await e2.db.query(
        `INSERT INTO kills (killer_id, victim_id, killer_points, victim_points_lost, created_at)
         SELECT p.id, NULL, 50, 0, $1::timestamptz + (row_number() OVER ())::int * interval '1 second'
         FROM players p WHERE p.id <> $2 AND p.public_key = 'k'`,
        [e2.clock.now(), me.id],
      );
      await e2.db.query('INSERT INTO kills (killer_id, victim_id, killer_points, victim_points_lost, created_at) VALUES ($1, NULL, 50, 0, $2)', [me.id, new Date(e2.clock.now().getTime() + 999_000)]);
      const lb = (await call(e2, me, 'GET', '/v1/leaderboard')).json();
      expect(lb.top).toHaveLength(50);
      expect(lb.me).toEqual({ rank: 56, kills: 1 });
    } finally {
      await e2.close();
    }
  });

  it('uses LEADERBOARD_TZ for the day boundary', async () => {
    const e2 = await createEnv({ leaderboardTz: 'Pacific/Kiritimati' });
    try {
      const k = await registerPlayer(e2, { nickname: 'k' });
      await grantFocusMinutes(e2, k, 90);
      const v = await registerPlayer(e2); await makeWasteman(e2, v);
      const c = (await call(e2, k, 'POST', '/v1/kills/challenge', { targetPlayerId: v.id })).json();
      await call(e2, k, 'POST', '/v1/kills', { challengeId: c.challengeId, signature: signChallenge(v, c, k.id) });
      // 12:00Z on Mar 10 is already Mar 11 in UTC+14
      expect((await call(e2, k, 'GET', '/v1/leaderboard')).json()).toMatchObject({ date: '2026-03-11', top: [{ kills: 1 }] });
      expect((await call(e2, k, 'GET', '/v1/leaderboard?date=2026-03-10')).json().top).toEqual([]);
    } finally {
      await e2.close();
    }
  });
});

describe('timezone day boundary', () => {
  it('credits minutes to the player local day', async () => {
    const e2 = await createEnv();
    try {
      e2.clock.set('2026-03-10T09:58:00Z'); // 23:58 on Mar 10 in UTC+14, still Mar 10 in UTC
      const kiri = await registerPlayer(e2, { timezone: 'Pacific/Kiritimati' });
      const utc = await registerPlayer(e2, { timezone: 'UTC' });
      for (const p of [kiri, utc]) await call(e2, p, 'POST', '/v1/focus/start');
      e2.clock.advance(60_000); // 23:59 local
      for (const p of [kiri, utc]) await call(e2, p, 'POST', '/v1/focus/heartbeat');
      e2.clock.advance(90_000); // 00:00:30 on Mar 11 local
      for (const p of [kiri, utc]) await call(e2, p, 'POST', '/v1/focus/heartbeat');
      const days = async (p: Player) =>
        (await e2.db.query('SELECT day, SUM(focus_ms)::int ms FROM points_ledger WHERE player_id = $1 GROUP BY day ORDER BY day', [p.id])).rows;
      expect(await days(kiri)).toEqual([{ day: '2026-03-10', ms: 60_000 }, { day: '2026-03-11', ms: 90_000 }]);
      expect(await days(utc)).toEqual([{ day: '2026-03-10', ms: 150_000 }]);
      expect((await call(e2, kiri, 'GET', '/v1/me/stats')).json().focusMinutesToday).toBe(1);
      expect((await call(e2, utc, 'GET', '/v1/me/stats')).json().focusMinutesToday).toBe(2);
    } finally {
      await e2.close();
    }
  });

  it('the 90-minute gate uses the killer local day', async () => {
    const e2 = await createEnv();
    try {
      const k = await registerPlayer(e2, { timezone: 'Pacific/Kiritimati' });
      await grantFocusMinutes(e2, k, 100, '2026-03-10'); // yesterday there (local today is Mar 11)
      const v = await registerPlayer(e2); await makeWasteman(e2, v);
      expect((await call(e2, k, 'POST', '/v1/kills/challenge', { targetPlayerId: v.id })).json().error.code).toBe('needs_minutes');
      await grantFocusMinutes(e2, k, 90, '2026-03-11');
      expect((await call(e2, k, 'POST', '/v1/kills/challenge', { targetPlayerId: v.id })).statusCode).toBe(201);
    } finally {
      await e2.close();
    }
  });
});

describe('events long poll', () => {
  it('returns [] after the wait and wakes up when a kill arrives', async () => {
    const k = await registerPlayer(env, { nickname: 'K' });
    await grantFocusMinutes(env, k, 90);
    const v = await registerPlayer(env);
    await makeWasteman(env, v);
    const t0 = Date.now();
    expect((await call(env, v, 'GET', '/v1/events?wait=1')).json()).toEqual([]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);

    const pending = call(env, v, 'GET', '/v1/events?wait=10');
    await new Promise((r) => setTimeout(r, 150));
    expect((await doKill(k, v)).statusCode).toBe(201);
    const res = await pending;
    expect(res.json()).toHaveLength(1);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect((await call(env, v, 'GET', '/v1/events?wait=26')).statusCode).toBe(400);
    expect((await call(env, v, 'GET', '/v1/events?after=-1')).statusCode).toBe(400);
  });
});

describe('erasure', () => {
  it('DELETE /me keeps kill rows with the player reference nulled and removes the photo', async () => {
    const k = await registerPlayer(env);
    await grantFocusMinutes(env, k, 90);
    const v = await registerPlayer(env);
    await makeWasteman(env, v);
    await doKill(k, v);
    expect((await call(env, v, 'DELETE', '/v1/me')).statusCode).toBe(204);
    const row = (await env.db.query('SELECT killer_id, victim_id FROM kills WHERE killer_id = $1', [k.id])).rows[0];
    expect(row).toEqual({ killer_id: k.id, victim_id: null });
    expect((await call(env, k, 'GET', '/v1/me/stats')).json().killsTotal).toBe(1);
    const k2 = await registerPlayer(env);
    expect((await call(env, k2, 'DELETE', '/v1/me')).statusCode).toBe(204);
    expect((await call(env, k, 'POST', '/v1/kills/challenge', { targetPlayerId: k2.id })).statusCode).toBe(404);
  });
});
