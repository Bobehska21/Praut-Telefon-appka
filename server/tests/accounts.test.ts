import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, verifyPassword } from '../src/auth/password';
import {
  ADMIN_TOKEN, call, createEnv, grantFocusMinutes, makeWasteman, newKeyPair, registerPlayer, signChallenge, type Env, type Player,
} from './helpers';

let env: Env;
beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.close();
});

const reg = (payload: Record<string, unknown>) => env.app.inject({ method: 'POST', url: '/v1/auth/register', payload });
const login = (username: string, password: string, extra: { publicKey?: string; ip?: string } = {}, e: Env = env) =>
  e.app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { username, password, publicKey: extra.publicKey ?? newKeyPair().publicKey },
    ...(extra.ip ? { remoteAddress: extra.ip } : {}),
  });
const fresh = (name: string) => ({ username: name, password: 'password-123', publicKey: newKeyPair().publicKey });

describe('register', () => {
  it('creates an account and stores a scrypt hash, not the password', async () => {
    const body = fresh('Alice_01');
    const r = await reg(body);
    expect(r.statusCode).toBe(201);
    expect(Object.keys(r.json()).sort()).toEqual(['playerId', 'token']);
    const row = (await env.db.query('SELECT username, username_lower, password_hash FROM accounts WHERE player_id = $1', [r.json().playerId])).rows[0];
    expect(row.username).toBe('Alice_01'); // display case kept
    expect(row.username_lower).toBe('alice_01');
    expect(row.password_hash).toMatch(/^scrypt\$10\$8\$3\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(row.password_hash).not.toContain(body.password);
    expect((await call(env, { token: r.json().token } as Player, 'GET', '/v1/me')).statusCode).toBe(200);
  });

  it('usernames are unique case-insensitively (409 username_taken)', async () => {
    expect((await reg(fresh('CaseTest'))).statusCode).toBe(201);
    for (const name of ['casetest', 'CASETEST', 'cAsEtEsT']) {
      const r = await reg(fresh(name));
      expect(r.statusCode).toBe(409);
      expect(r.json()).toEqual({ error: { code: 'username_taken', message: expect.any(String) } });
    }
    const before = (await env.db.query('SELECT COUNT(*)::int n FROM players')).rows[0].n;
    await reg(fresh('casetest'));
    expect((await env.db.query('SELECT COUNT(*)::int n FROM players')).rows[0].n).toBe(before); // failed register leaves no orphan player
  });

  it('validates username, password, key and timezone', async () => {
    const bad: Record<string, unknown>[] = [
      { username: 'ab' }, { username: 'a'.repeat(21) }, { username: 'has space' }, { username: 'a@b.cz' }, { username: 'čeština' },
      { username: 'blbec' }, { username: 'bl.bec' }, { username: 'n_i_g_g_e_r' }, // blocklisted, also with separators
      { password: 'short' }, { password: 'x'.repeat(129) }, { password: 12345678 },
      { publicKey: 'x'.repeat(100) }, { timezone: 'Mars/Base' },
    ];
    for (const b of bad) {
      const r = await reg({ ...fresh(`ok${Math.random().toString(36).slice(2, 8)}`), ...b });
      expect(r.statusCode, JSON.stringify(b)).toBe(400);
      expect(r.json().error.code).toBe('validation');
      expect(JSON.stringify(r.json())).not.toContain('password-123');
    }
    expect((await reg({ ...fresh('tzuser'), timezone: 'Europe/Prague' })).statusCode).toBe(201);
    const id = (await env.db.query("SELECT player_id FROM accounts WHERE username = 'tzuser'")).rows[0].player_id;
    expect((await env.db.query('SELECT timezone FROM players WHERE id = $1', [id])).rows[0].timezone).toBe('Europe/Prague');
    expect((await reg({ ...fresh('p8chars'), password: '12345678' })).statusCode).toBe(201);
    expect((await reg({ ...fresh('p128chars'), password: 'x'.repeat(128) })).statusCode).toBe(201);
  });

  it('the anonymous POST /v1/register is gone', async () => {
    const r = await env.app.inject({ method: 'POST', url: '/v1/register', payload: { publicKey: newKeyPair().publicKey } });
    expect(r.statusCode).toBe(404);
  });
});

describe('login', () => {
  it('returns playerId, token and a profile shaped like GET /v1/me; username is case-insensitive', async () => {
    const p = await registerPlayer(env, { nickname: 'Shown', rankKey: 'adept', level: 5 });
    const r = await login(p.username.toUpperCase(), p.password);
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.playerId).toBe(p.id);
    expect(b.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const me = (await call(env, { token: b.token } as Player, 'GET', '/v1/me')).json();
    expect(b.profile).toEqual(me);
    expect(b.profile).toMatchObject({ nickname: 'Shown', rankKey: 'adept', level: 5 });
    expect(JSON.stringify(b)).not.toContain(p.username); // the private login name is never part of the profile
  });

  it('replaces the device key and revokes every earlier token', async () => {
    const victim = await registerPlayer(env, { nickname: 'v' });
    const killer = await registerPlayer(env);
    await grantFocusMinutes(env, killer, 90);
    await makeWasteman(env, victim);

    const newKey = newKeyPair();
    const r = await login(victim.username, victim.password, { publicKey: newKey.publicKey });
    expect(r.statusCode).toBe(200);
    expect((await call(env, victim, 'GET', '/v1/me')).statusCode).toBe(401); // old token revoked
    expect((await env.db.query('SELECT public_key FROM players WHERE id = $1', [victim.id])).rows[0].public_key).toBe(newKey.publicKey);
    expect((await env.db.query('SELECT COUNT(*)::int n FROM auth_tokens WHERE player_id = $1', [victim.id])).rows[0].n).toBe(1);

    const c = (await call(env, killer, 'POST', '/v1/kills/challenge', { targetPlayerId: victim.id })).json();
    const oldSig = await call(env, killer, 'POST', '/v1/kills', { challengeId: c.challengeId, signature: signChallenge(victim, c, killer.id) });
    expect(oldSig.json().error.code).toBe('bad_signature'); // the old device key no longer proves anything
    const newPlayer = { ...victim, privateKey: newKey.privateKey };
    const ok = await call(env, killer, 'POST', '/v1/kills', { challengeId: c.challengeId, signature: signChallenge(newPlayer, c, killer.id) });
    expect(ok.statusCode).toBe(201);
  });

  it('concurrent logins leave exactly one active token', async () => {
    const p = await registerPlayer(env);
    const rs = await Promise.all(Array.from({ length: 5 }, () => login(p.username, p.password)));
    expect(rs.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect((await env.db.query('SELECT COUNT(*)::int n FROM auth_tokens WHERE player_id = $1', [p.id])).rows[0].n).toBe(1);
  });

  it('wrong password and unknown user give the identical response', async () => {
    const p = await registerPlayer(env);
    const wrong = await login(p.username, 'not-the-password');
    const unknown = await login('nobody-with-this-name', 'not-the-password');
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: { code: 'invalid_credentials', message: expect.any(String) } });
    expect(unknown.json()).toEqual(wrong.json());
    expect(unknown.headers['content-type']).toBe(wrong.headers['content-type']);
  });

  it('an unknown user costs about as much time as a wrong password (dummy hash)', async () => {
    const e2 = await createEnv({ passwordScryptLog2N: 14 });
    try {
      const p = await registerPlayer(e2);
      const time = async (name: string, ip: string) => {
        const t = process.hrtime.bigint();
        await login(name, 'wrong-password', { ip }, e2);
        return Number(process.hrtime.bigint() - t) / 1e6;
      };
      await time('warmup-user', '10.1.0.1'); // creates the dummy hash
      let wrong = 0;
      let unknown = 0;
      for (let i = 0; i < 4; i++) {
        wrong += await time(p.username, `10.1.1.${i}`);
        unknown += await time(`ghost-${i}`, `10.1.2.${i}`);
      }
      expect(unknown / wrong).toBeGreaterThan(0.6);
      expect(wrong / 4).toBeGreaterThan(15); // the hash really is expensive
    } finally {
      await e2.close();
    }
  });

  it('banned players get 403 forbidden only with the right password', async () => {
    const p = await registerPlayer(env);
    await env.db.query('UPDATE players SET banned_at = now() WHERE id = $1', [p.id]);
    expect((await login(p.username, p.password)).json().error.code).toBe('forbidden');
    expect((await login(p.username, p.password)).statusCode).toBe(403);
    expect((await login(p.username, 'wrong-password')).json().error.code).toBe('invalid_credentials');
  });

  it('validates the body', async () => {
    const p = await registerPlayer(env);
    expect((await env.app.inject({ method: 'POST', url: '/v1/auth/login', payload: { username: p.username, password: p.password } })).statusCode).toBe(400);
    expect((await login(p.username, p.password, { publicKey: 'x'.repeat(100) })).statusCode).toBe(400);
    expect((await login('', 'x')).statusCode).toBe(400);
    expect((await login('!!bad name!!', 'whatever-pass')).json().error.code).toBe('invalid_credentials');
  });

  it('upgrades an old, weaker hash on the next login', async () => {
    const p = await registerPlayer(env);
    const weak = await hashPassword(p.password, { log2n: 10, r: 8, p: 1 });
    await env.db.query('UPDATE accounts SET password_hash = $2 WHERE player_id = $1', [p.id, weak]);
    expect(needsRehash(weak, { log2n: 10, r: 8, p: 3 })).toBe(true);
    expect((await login(p.username, p.password)).statusCode).toBe(200);
    const stored = (await env.db.query('SELECT password_hash h FROM accounts WHERE player_id = $1', [p.id])).rows[0].h;
    expect(stored).toMatch(/^scrypt\$10\$8\$3\$/);
    expect((await login(p.username, p.password)).statusCode).toBe(200);
  });
});

describe('logout and password change', () => {
  it('logout revokes the token', async () => {
    const p = await registerPlayer(env);
    expect((await call(env, p, 'POST', '/v1/auth/logout')).statusCode).toBe(204);
    expect((await call(env, p, 'GET', '/v1/me')).statusCode).toBe(401);
    expect((await call(env, p, 'POST', '/v1/auth/logout')).statusCode).toBe(401);
    expect((await login(p.username, p.password)).statusCode).toBe(200); // the account itself is untouched
    expect((await env.app.inject({ method: 'POST', url: '/v1/auth/logout' })).statusCode).toBe(401);
  });

  it('changes the password, revokes the other tokens, keeps the current one', async () => {
    const p = await registerPlayer(env);
    // a second active token (login normally keeps only one, so insert it directly)
    const second = 'B'.repeat(43);
    await env.db.query('INSERT INTO auth_tokens (token_hash, player_id) VALUES ($1, $2)', [createHash('sha256').update(second).digest(), p.id]);

    expect((await call(env, p, 'POST', '/v1/auth/password', { oldPassword: 'wrong-old-password', newPassword: 'brand new pass' })).json().error.code).toBe('invalid_credentials');
    expect((await call(env, p, 'POST', '/v1/auth/password', { oldPassword: p.password, newPassword: 'short' })).statusCode).toBe(400);
    expect((await call(env, p, 'POST', '/v1/auth/password', { oldPassword: p.password, newPassword: 'brand new pass' })).statusCode).toBe(204);

    expect((await call(env, p, 'GET', '/v1/me')).statusCode).toBe(200);
    expect((await call(env, { token: second } as Player, 'GET', '/v1/me')).statusCode).toBe(401);
    expect((await login(p.username, p.password)).statusCode).toBe(401);
    expect((await login(p.username, 'brand new pass')).statusCode).toBe(200);
  });

  it('requires auth', async () => {
    expect((await env.app.inject({ method: 'POST', url: '/v1/auth/password', payload: { oldPassword: 'a', newPassword: 'b'.repeat(8) } })).statusCode).toBe(401);
  });
});

describe('brute-force protection', () => {
  const t = (e: Env, ip: string, name: string, pw = 'wrong-password') => login(name, pw, { ip }, e);

  it('locks one source after 5 failures with exponential backoff capped at 5 minutes, without counting while locked', async () => {
    const e = await createEnv();
    try {
      const p = await registerPlayer(e);
      const ip = '10.2.0.1';
      for (let i = 0; i < 4; i++) expect((await t(e, ip, p.username)).statusCode).toBe(401);
      const fifth = await t(e, ip, p.username);
      expect(fifth.statusCode).toBe(401); // the 5th failure itself is still an ordinary 401, it starts the lock
      // locked: even the correct password is refused, and hammering does not extend the lock
      for (let i = 0; i < 10; i++) {
        const r = await t(e, ip, p.username, p.password);
        expect(r.statusCode).toBe(429);
        expect(r.json().error).toMatchObject({ code: 'rate_limited', retryAfterSeconds: expect.any(Number) });
      }
      const locked = await t(e, ip, p.username, p.password);
      expect(locked.json().error.retryAfterSeconds).toBeLessThanOrEqual(15);
      expect(locked.headers['retry-after']).toBeDefined();

      // backoff: 15, 30, 60, 120, 240, then capped at 300
      const expected = [30, 60, 120, 240, 300, 300];
      e.clock.advance(15_000);
      for (const secs of expected) {
        expect((await t(e, ip, p.username)).statusCode).toBe(401);
        const r = await t(e, ip, p.username, p.password);
        expect(r.statusCode).toBe(429);
        expect(r.json().error.retryAfterSeconds).toBe(secs);
        e.clock.advance(secs * 1000);
      }
      expect((await t(e, ip, p.username, p.password)).statusCode).toBe(200); // lock expired, success clears the counters
      expect((await t(e, ip, p.username)).statusCode).toBe(401);
      expect((await t(e, ip, p.username, p.password)).statusCode).toBe(200); // counter restarted from 0
    } finally {
      await e.close();
    }
  });

  it('behaves the same for usernames that do not exist', async () => {
    const e = await createEnv();
    try {
      for (let i = 0; i < 5; i++) expect((await t(e, '10.2.1.1', 'ghost-user')).statusCode).toBe(401);
      const r = await t(e, '10.2.1.1', 'ghost-user');
      expect(r.statusCode).toBe(429);
      expect(r.json().error.code).toBe('rate_limited');
    } finally {
      await e.close();
    }
  });

  it('a guesser on one address cannot lock the real owner out', async () => {
    const e = await createEnv();
    try {
      const p = await registerPlayer(e);
      for (let i = 0; i < 12; i++) await t(e, '10.3.0.66', p.username);
      expect((await t(e, '10.3.0.66', p.username, p.password)).statusCode).toBe(429);
      expect((await t(e, '10.3.0.7', p.username, p.password)).statusCode).toBe(200); // owner, other address
    } finally {
      await e.close();
    }
  });

  it('distributed guessing triggers the per-username lock, which ends within 5 minutes', async () => {
    const e = await createEnv();
    try {
      const p = await registerPlayer(e);
      for (let i = 0; i < 20; i++) expect((await t(e, `10.4.0.${i}`, p.username)).statusCode).toBe(401);
      const r = await t(e, '10.4.9.9', p.username, p.password);
      expect(r.statusCode).toBe(429);
      expect(r.json().error.retryAfterSeconds).toBeLessThanOrEqual(15);
      e.clock.advance(15_000);
      expect((await t(e, '10.4.9.9', p.username, p.password)).statusCode).toBe(200);

      // keep failing: the lock grows but never beyond the cap
      for (let i = 0; i < 40; i++) {
        e.clock.advance(301_000);
        await t(e, `10.5.0.${i % 250}`, p.username);
      }
      const rows = (await e.db.query("SELECT failures, locked_until FROM login_attempts WHERE key = $1", [`u:${p.username.toLowerCase()}`])).rows[0];
      expect(rows.failures).toBeGreaterThan(0);
      e.clock.advance(301_000);
      expect((await t(e, '10.4.9.9', p.username, p.password)).statusCode).toBe(200);
    } finally {
      await e.close();
    }
  });

  it('the failure counter restarts after 15 quiet minutes', async () => {
    const e = await createEnv();
    try {
      const p = await registerPlayer(e);
      for (let i = 0; i < 4; i++) await t(e, '10.6.0.1', p.username);
      e.clock.advance(16 * 60_000);
      for (let i = 0; i < 4; i++) expect((await t(e, '10.6.0.1', p.username)).statusCode).toBe(401);
      expect((await t(e, '10.6.0.1', p.username, p.password)).statusCode).toBe(200); // never reached 5 in a row
    } finally {
      await e.close();
    }
  });

  it('password change uses the same lock', async () => {
    const e = await createEnv();
    try {
      const p = await registerPlayer(e);
      for (let i = 0; i < 5; i++) expect((await call(e, p, 'POST', '/v1/auth/password', { oldPassword: 'wrong-old-pass', newPassword: 'a-new-password' })).statusCode).toBe(401);
      const r = await call(e, p, 'POST', '/v1/auth/password', { oldPassword: p.password, newPassword: 'a-new-password' });
      expect(r.statusCode).toBe(429);
    } finally {
      await e.close();
    }
  });

  it('applies an in-memory per-IP rate limit to login and register on top of the durable lock', async () => {
    const e = await createEnv({ rateLimit: { loginPerMin: 3, registerPerHour: 2 } });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await login(`name${i}`, 'whatever-pass', {}, e)).statusCode);
      expect(codes).toEqual([401, 401, 401, 429, 429]);
      const regs: number[] = [];
      for (let i = 0; i < 3; i++) regs.push((await e.app.inject({ method: 'POST', url: '/v1/auth/register', payload: fresh(`reguser${i}`) })).statusCode);
      expect(regs).toEqual([201, 201, 429]);
    } finally {
      await e.close();
    }
  });
});

describe('secrets never leave the server', () => {
  it('no response contains a password hash or a password', async () => {
    const e = await createEnv();
    try {
      const reporter = await registerPlayer(e);
      const target = await registerPlayer(e, { nickname: 'Target' });
      await call(e, reporter, 'POST', '/v1/reports', { targetPlayerId: target.id, kind: 'player' });
      const hashes = (await e.db.query('SELECT password_hash FROM accounts')).rows.map((r) => r.password_hash as string);
      expect(hashes.length).toBeGreaterThan(1);
      const bodies: string[] = [];
      const admin = (url: string) => e.app.inject({ url, headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
      const reg = await e.app.inject({ method: 'POST', url: '/v1/auth/register', payload: fresh('leakcheck') });
      const lg = await login('leakcheck', 'password-123', {}, e);
      bodies.push(reg.body, lg.body, (await login('leakcheck', 'bad-pass-word', {}, e)).body);
      for (const [p, url] of [[target, '/v1/me'], [target, '/v1/me/stats'], [target, '/v1/blocks'], [target, `/v1/photos/${target.id}`]] as [Player, string][]) {
        bodies.push((await call(e, p, 'GET', url)).body);
      }
      bodies.push((await admin('/admin/players?limit=200')).body, (await admin('/admin/reports?status=all')).body);
      const reportId = (await admin('/admin/reports')).json()[0].id;
      bodies.push((await admin(`/admin/reports/${reportId}`)).body);
      const all = bodies.join('\n');
      expect(all).not.toContain('scrypt$');
      for (const h of hashes) expect(all).not.toContain(h.split('$')[5]);
      expect(all).not.toContain('password-123');
      expect(all).not.toContain('correct horse battery');
      // admins do see the private login name (to find players), but nothing else about credentials
      expect(JSON.parse((await admin('/admin/players?search=leakcheck')).body)[0]).toMatchObject({ username: 'leakcheck' });
      expect(Object.keys(JSON.parse((await admin('/admin/players?search=leakcheck')).body)[0])).not.toContain('password_hash');
    } finally {
      await e.close();
    }
  });
});

describe('account erasure', () => {
  it('DELETE /me removes the account row and the throttle rows, and frees the username', async () => {
    const p = await registerPlayer(env);
    await login(p.username, 'wrong-password');
    expect((await env.db.query('SELECT COUNT(*)::int n FROM login_attempts WHERE key LIKE $1', [`%${p.username}%`])).rows[0].n).toBeGreaterThan(0);
    expect((await call(env, p, 'DELETE', '/v1/me')).statusCode).toBe(204);
    expect((await env.db.query('SELECT COUNT(*)::int n FROM accounts WHERE player_id = $1', [p.id])).rows[0].n).toBe(0);
    expect((await env.db.query('SELECT COUNT(*)::int n FROM auth_tokens WHERE player_id = $1', [p.id])).rows[0].n).toBe(0);
    expect((await env.db.query('SELECT COUNT(*)::int n FROM login_attempts WHERE key LIKE $1', [`%${p.username}%`])).rows[0].n).toBe(0);
    expect((await login(p.username, p.password)).json().error.code).toBe('invalid_credentials');
    expect((await reg({ username: p.username, password: 'password-123', publicKey: newKeyPair().publicKey })).statusCode).toBe(201);
  });
});

describe('password hashing', () => {
  it('uses a random salt, normalises (NFKC) and rejects malformed or out-of-bounds hashes', async () => {
    const params = { log2n: 10, r: 8, p: 3 };
    const a = await hashPassword('secret-pass', params);
    const b = await hashPassword('secret-pass', params);
    expect(a).not.toBe(b);
    expect(await verifyPassword('secret-pass', a)).toBe(true);
    expect(await verifyPassword('secret-pasS', a)).toBe(false);
    expect(await verifyPassword('ｓｅｃｒｅｔ-pass', a)).toBe(true); // full-width letters fold to ASCII
    expect(await verifyPassword('x', 'garbage')).toBe(false);
    expect(await verifyPassword('x', a.replace('$10$', '$30$'))).toBe(false); // N=2^30 would be a memory bomb
    expect(needsRehash(a, { log2n: 11, r: 8, p: 3 })).toBe(true);
    expect(needsRehash(a, params)).toBe(false);
  });
});
