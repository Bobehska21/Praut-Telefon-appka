import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MIN, call, createEnv, grantFocusMinutes, makeWasteman, newKeyPair, registerPlayer, signChallenge, type Env, type Player,
} from './helpers';

let env: Env;
beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.close();
});

/** A visible killer with 90 minutes and a wasteman victim. */
async function pair(opts: { killerMinutes?: number; victimProfile?: Record<string, unknown> } = {}) {
  const killer = await registerPlayer(env, { nickname: 'killer' });
  const victim = await registerPlayer(env, { nickname: 'victim', ...opts.victimProfile });
  await grantFocusMinutes(env, killer, opts.killerMinutes ?? 90);
  await makeWasteman(env, victim);
  return { killer, victim };
}

async function challenge(killer: Player, victim: Player) {
  return call(env, killer, 'POST', '/v1/kills/challenge', { targetPlayerId: victim.id });
}

async function kill(killer: Player, victim: Player, tamper?: (s: string) => string) {
  const ch = await challenge(killer, victim);
  if (ch.statusCode !== 201) return { ch, res: ch };
  const c = ch.json();
  const sig = signChallenge(victim, c, killer.id);
  const res = await call(env, killer, 'POST', '/v1/kills', { challengeId: c.challengeId, signature: tamper ? tamper(sig) : sig });
  return { ch, res, c, sig };
}

describe('kill happy path', () => {
  it('awards 50 to the killer, penalises the victim, makes them immune for 1 hour and notifies', async () => {
    const killer = await registerPlayer(env, { nickname: 'Hunter' });
    const victim = await registerPlayer(env, { nickname: 'Prey' });
    await grantFocusMinutes(env, killer, 90);
    await grantFocusMinutes(env, victim, 40); // gross 40 -> penalty floor(10)
    await makeWasteman(env, victim);

    const { res } = await kill(killer, victim);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ victimPlayerId: victim.id, pointsGained: 50, victimPointsLost: 10 });

    expect((await call(env, killer, 'GET', '/v1/me/stats')).json()).toMatchObject({ killsToday: 1, killsTotal: 1, pointsToday: 90 + 50 });
    expect((await call(env, victim, 'GET', '/v1/me/stats')).json()).toMatchObject({ deathsToday: 1, deathsTotal: 1, pointsToday: 30 });

    const events = (await call(env, victim, 'GET', '/v1/events')).json();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'killed', payload: { killerNickname: 'Hunter', pointsLost: 10 } });
    expect((await call(env, victim, 'GET', '/v1/events')).json()).toEqual([]); // delivered
    expect((await call(env, victim, 'GET', `/v1/events?after=0`)).json()).toHaveLength(1); // cursor replay
    expect((await call(env, victim, 'GET', `/v1/events?after=${events[0].id}&wait=1`)).json()).toEqual([]);
  });

  it('the penalty never takes the victim below 0 net for the day', async () => {
    const victim = await registerPlayer(env, { nickname: 'poor' });
    await grantFocusMinutes(env, victim, 40); // gross 40
    await makeWasteman(env, victim);
    const lost: number[] = [];
    for (let i = 0; i < 6; i++) {
      const killer = await registerPlayer(env);
      await grantFocusMinutes(env, killer, 90);
      const { res } = await kill(killer, victim);
      expect(res.statusCode).toBe(201);
      lost.push(res.json().victimPointsLost);
      env.clock.advance(61 * MIN); // immunity over (stay within the UTC day: 6 * 61 min < 12 h)
    }
    expect(lost).toEqual([10, 10, 10, 10, 0, 0]);
    expect((await call(env, victim, 'GET', '/v1/me/stats')).json().pointsToday).toBe(0);
  });

  it('victim stays wasteman after immunity ends and can be killed again', async () => {
    const { killer, victim } = await pair();
    expect((await kill(killer, victim)).res.statusCode).toBe(201);
    env.clock.advance(60 * MIN);
    expect((await call(env, victim, 'GET', '/v1/me')).json().state).toBe('wasteman');
    expect((await kill(killer, victim)).res.statusCode).toBe(201);
  });
});

describe('preconditions', () => {
  it('needs_minutes reports the missing minutes (90-minute gate)', async () => {
    const { killer, victim } = await pair({ killerMinutes: 89 });
    const r = await challenge(killer, victim);
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toMatchObject({ code: 'needs_minutes', missingMinutes: 1 });
    await grantFocusMinutes(env, killer, 1);
    expect((await challenge(killer, victim)).statusCode).toBe(201);
  });

  it('minutes from another local day do not count', async () => {
    const killer = await registerPlayer(env);
    const victim = await registerPlayer(env);
    await grantFocusMinutes(env, killer, 200, '2026-03-09');
    await makeWasteman(env, victim);
    expect((await challenge(killer, victim)).json().error).toMatchObject({ code: 'needs_minutes', missingMinutes: 90 });
  });

  it('victim must be wasteman', async () => {
    const killer = await registerPlayer(env);
    await grantFocusMinutes(env, killer, 90);
    const idle = await registerPlayer(env);
    expect((await challenge(killer, idle)).json().error.code).toBe('not_wasteman');
    const focus = await registerPlayer(env);
    await call(env, focus, 'POST', '/v1/focus/start');
    expect((await challenge(killer, focus)).json().error.code).toBe('not_wasteman');
  });

  it('cannot kill yourself, unknown players are 404, multiplayer off blocks both directions', async () => {
    const { killer, victim } = await pair();
    expect((await challenge(killer, killer)).json().error.code).toBe('forbidden');
    expect((await call(env, killer, 'POST', '/v1/kills/challenge', { targetPlayerId: '00000000-0000-4000-8000-000000000000' })).statusCode).toBe(404);
    const profile = { nickname: '', rankKey: 'novice', level: 1, timezone: 'UTC' };
    await call(env, victim, 'PUT', '/v1/me', { ...profile, multiplayerEnabled: false });
    expect((await challenge(killer, victim)).json().error.code).toBe('multiplayer_off');
    await call(env, victim, 'PUT', '/v1/me', { ...profile, multiplayerEnabled: true });
    await call(env, killer, 'PUT', '/v1/me', { ...profile, multiplayerEnabled: false });
    expect((await challenge(killer, victim)).json().error.code).toBe('multiplayer_off');
  });

  it('banned players cannot kill or be killed', async () => {
    const { killer, victim } = await pair();
    await env.db.query('UPDATE players SET banned_at = now() WHERE id = $1', [victim.id]);
    expect((await challenge(killer, victim)).json().error.code).toBe('forbidden');
    await env.db.query('UPDATE players SET banned_at = NULL WHERE id = $1', [victim.id]);
    await env.db.query('UPDATE players SET banned_at = now() WHERE id = $1', [killer.id]);
    expect((await challenge(killer, victim)).json().error.code).toBe('forbidden');
  });

  it('blocking is symmetric', async () => {
    const { killer, victim } = await pair();
    expect((await call(env, victim, 'POST', '/v1/blocks', { playerId: killer.id })).statusCode).toBe(201);
    expect((await challenge(killer, victim)).json().error.code).toBe('blocked'); // victim blocked killer
    await call(env, victim, 'DELETE', `/v1/blocks/${killer.id}`);
    expect((await challenge(killer, victim)).statusCode).toBe(201);
    await call(env, killer, 'POST', '/v1/blocks', { playerId: victim.id });
    expect((await challenge(killer, victim)).json().error.code).toBe('blocked'); // killer blocked victim
    const list = (await call(env, killer, 'GET', '/v1/blocks')).json();
    expect(list.map((b: { playerId: string }) => b.playerId)).toEqual([victim.id]);
  });

  it('immunity lasts exactly one hour', async () => {
    const { killer, victim } = await pair();
    expect((await kill(killer, victim)).res.statusCode).toBe(201);
    const other = await registerPlayer(env);
    await grantFocusMinutes(env, other, 90);
    env.clock.advance(60 * MIN - 1);
    const r = await challenge(other, victim);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('immune');
    env.clock.advance(1); // immune_until <= now
    expect((await challenge(other, victim)).statusCode).toBe(201);
  });

  it('victim starting focus again before the kill makes the kill fail with not_wasteman', async () => {
    const { killer, victim } = await pair();
    const ch = (await challenge(killer, victim)).json();
    await call(env, victim, 'POST', '/v1/focus/start');
    const res = await call(env, killer, 'POST', '/v1/kills', { challengeId: ch.challengeId, signature: signChallenge(victim, ch, killer.id) });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('not_wasteman');
  });
});

describe('proof of proximity', () => {
  it('rejects a bad signature without consuming the challenge', async () => {
    const { killer, victim } = await pair();
    const c = (await challenge(killer, victim)).json();
    const wrongKey = { ...victim, privateKey: newKeyPair().privateKey };
    const bad = await call(env, killer, 'POST', '/v1/kills', { challengeId: c.challengeId, signature: signChallenge(wrongKey, c, killer.id) });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('bad_signature');
    const garbage = await call(env, killer, 'POST', '/v1/kills', { challengeId: c.challengeId, signature: 'AAAAAAAAAAAA' });
    expect(garbage.json().error.code).toBe('bad_signature');
    const good = await call(env, killer, 'POST', '/v1/kills', { challengeId: c.challengeId, signature: signChallenge(victim, c, killer.id) });
    expect(good.statusCode).toBe(201);
  });

  it('a signature for a different canonical string (other killer) does not verify', async () => {
    const { killer, victim } = await pair();
    const c = (await challenge(killer, victim)).json();
    const other = await registerPlayer(env);
    const res = await call(env, killer, 'POST', '/v1/kills', { challengeId: c.challengeId, signature: signChallenge(victim, c, other.id) });
    expect(res.json().error.code).toBe('bad_signature');
  });

  it('expires after 20 s and the failure is stored (retry returns the same error)', async () => {
    const { killer, victim } = await pair();
    const c = (await challenge(killer, victim)).json();
    env.clock.advance(20_000);
    const body = { challengeId: c.challengeId, signature: signChallenge(victim, c, killer.id) };
    const r1 = await call(env, killer, 'POST', '/v1/kills', body);
    expect(r1.statusCode).toBe(410);
    expect(r1.json().error.code).toBe('expired');
    const r2 = await call(env, killer, 'POST', '/v1/kills', body);
    expect(r2.statusCode).toBe(410);
    expect(r2.json()).toEqual(r1.json());
  });

  it('is still valid one millisecond before expiry', async () => {
    const { killer, victim } = await pair();
    const c = (await challenge(killer, victim)).json();
    env.clock.advance(19_999);
    expect((await call(env, killer, 'POST', '/v1/kills', { challengeId: c.challengeId, signature: signChallenge(victim, c, killer.id) })).statusCode).toBe(201);
  });

  it('is idempotent: replay after success returns the same result and does not kill twice', async () => {
    const { killer, victim } = await pair();
    const first = await kill(killer, victim);
    const replay = await call(env, killer, 'POST', '/v1/kills', { challengeId: first.c.challengeId, signature: first.sig });
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.res.json());
    expect((await call(env, killer, 'GET', '/v1/me/stats')).json().killsTotal).toBe(1);
    expect((await call(env, victim, 'GET', '/v1/events')).json()).toHaveLength(1);
  });

  it('a retry after a failed precondition returns the stored error', async () => {
    const { killer, victim } = await pair();
    const c = (await challenge(killer, victim)).json();
    await call(env, victim, 'POST', '/v1/focus/start');
    const body = { challengeId: c.challengeId, signature: signChallenge(victim, c, killer.id) };
    const r1 = await call(env, killer, 'POST', '/v1/kills', body);
    await call(env, victim, 'POST', '/v1/focus/stop', { reason: 'manual' }); // wasteman again: still the stored error
    const r2 = await call(env, killer, 'POST', '/v1/kills', body);
    expect(r1.json().error.code).toBe('not_wasteman');
    expect(r2.statusCode).toBe(409);
    expect(r2.json()).toEqual(r1.json());
  });

  it("another player cannot complete someone else's challenge", async () => {
    const { killer, victim } = await pair();
    const c = (await challenge(killer, victim)).json();
    const thief = await registerPlayer(env);
    const res = await call(env, thief, 'POST', '/v1/kills', { challengeId: c.challengeId, signature: signChallenge(victim, c, killer.id) });
    expect(res.statusCode).toBe(404);
  });

  it('validates input', async () => {
    const { killer } = await pair();
    expect((await call(env, killer, 'POST', '/v1/kills', { challengeId: 'nope', signature: 'x' })).statusCode).toBe(400);
    expect((await call(env, killer, 'POST', '/v1/kills/challenge', {})).statusCode).toBe(400);
  });
});

describe('concurrency', () => {
  beforeEach(() => undefined);

  it('two killers racing on one wasteman: exactly one 201 and one 409 (20 iterations)', async () => {
    for (let i = 0; i < 20; i++) {
      const victim = await registerPlayer(env, { nickname: `v${i}` });
      await grantFocusMinutes(env, victim, 40);
      await makeWasteman(env, victim);
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
      const loser = a.statusCode === 409 ? a : b;
      expect(['immune', 'already_killed']).toContain(loser.json().error.code);
      const deaths = (await call(env, victim, 'GET', '/v1/me/stats')).json();
      expect(deaths.deathsTotal).toBe(1);
      expect(deaths.pointsToday).toBe(30); // penalised exactly once
    }
  });

  it('the same challenge submitted twice at once yields one kill and two identical successes', async () => {
    const { killer, victim } = await pair();
    const c = (await challenge(killer, victim)).json();
    const body = { challengeId: c.challengeId, signature: signChallenge(victim, c, killer.id) };
    const [a, b] = await Promise.all([call(env, killer, 'POST', '/v1/kills', body), call(env, killer, 'POST', '/v1/kills', body)]);
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(a.json()).toEqual(b.json());
    expect((await call(env, killer, 'GET', '/v1/me/stats')).json().killsTotal).toBe(1);
  });

  it('victim restarting focus racing a kill: whichever gets the lock first wins, state stays consistent (20 iterations)', async () => {
    const outcomes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const { killer, victim } = await pair();
      const c = (await challenge(killer, victim)).json();
      const [k, s] = await Promise.all([
        call(env, killer, 'POST', '/v1/kills', { challengeId: c.challengeId, signature: signChallenge(victim, c, killer.id) }),
        call(env, victim, 'POST', '/v1/focus/start'),
      ]);
      expect(s.statusCode).toBe(200);
      const deaths = (await call(env, victim, 'GET', '/v1/me/stats')).json().deathsTotal;
      if (k.statusCode === 201) {
        expect(deaths).toBe(1);
        outcomes.add('kill');
      } else {
        expect(k.statusCode).toBe(409);
        expect(k.json().error.code).toBe('not_wasteman');
        expect(deaths).toBe(0);
        outcomes.add('start');
      }
      expect((await call(env, victim, 'GET', '/v1/me')).json().state).toBe('focus'); // start always ends in focus
    }
    expect(outcomes.size).toBeGreaterThan(0);
  });
});
