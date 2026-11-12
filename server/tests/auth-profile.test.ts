import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createEnv, newKeyPair, registerPlayer, type Env } from './helpers';
import { loadConfig } from '../src/config';

let env: Env;
beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.close();
});

describe('config', () => {
  it('fails fast when required variables are missing', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ DATABASE_URL: 'x', ADMIN_TOKEN: 'short' })).toThrow(/ADMIN_TOKEN/);
  });
});

describe('health', () => {
  it('healthz and readyz', async () => {
    expect((await env.app.inject({ url: '/healthz' })).statusCode).toBe(200);
    expect((await env.app.inject({ url: '/readyz' })).statusCode).toBe(200);
  });
});

describe('register and auth', () => {
  it('registers, stores only the token hash', async () => {
    const p = await registerPlayer(env);
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rows = (await env.db.query('SELECT token_hash FROM auth_tokens WHERE player_id = $1', [p.id])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash.toString('base64url')).not.toBe(p.token);
    expect(rows[0].token_hash).toHaveLength(32);
  });

  it('rejects bad public keys', async () => {
    for (const publicKey of ['x'.repeat(100), Buffer.from('not a key'.repeat(20)).toString('base64')]) {
      const r = await env.app.inject({ method: 'POST', url: '/v1/auth/register', payload: { username: 'someone', password: 'password123', publicKey } });
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe('validation');
    }
    const r = await env.app.inject({ method: 'POST', url: '/v1/auth/register', payload: {} });
    expect(r.json().error.code).toBe('validation');
  });

  it('rejects a non-P256 key', async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const k = generateKeyPairSync('ec', { namedCurve: 'secp256k1' }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const r = await env.app.inject({ method: 'POST', url: '/v1/auth/register', payload: { username: 'someone', password: 'password123', publicKey: k } });
    expect(r.statusCode).toBe(400);
  });

  it('requires a valid bearer token on /v1 routes', async () => {
    for (const headers of [{}, { authorization: 'Bearer nope' }, { authorization: `Bearer ${'a'.repeat(43)}` }, { authorization: 'Basic abc' }]) {
      const r = await env.app.inject({ url: '/v1/me', headers });
      expect(r.statusCode).toBe(401);
      expect(r.json()).toEqual({ error: { code: 'unauthorized', message: expect.any(String) } });
    }
  });

  it('unknown routes use the error shape', async () => {
    const r = await env.app.inject({ url: '/nope' });
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe('not_found');
  });

  it('bad JSON gives a validation error without internals', async () => {
    const r = await env.app.inject({ method: 'POST', url: '/v1/auth/register', payload: '{bad', headers: { 'content-type': 'application/json' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('validation');
  });

  it('limits body size', async () => {
    const r = await env.app.inject({ method: 'POST', url: '/v1/auth/register', payload: { publicKey: 'a'.repeat(40_000) } });
    expect(r.statusCode).toBe(413);
  });
});

describe('profile', () => {
  it('GET/PUT /me', async () => {
    const p = await registerPlayer(env, null);
    const g = (await call(env, p, 'GET', '/v1/me')).json();
    expect(g).toMatchObject({ playerId: p.id, nickname: '', multiplayerEnabled: false, state: 'idle', photoUrl: null });
    const put = await call(env, p, 'PUT', '/v1/me', { nickname: '  Cool   Cat ', rankKey: 'adept', level: 12, multiplayerEnabled: true, timezone: 'Europe/Prague' });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ nickname: 'Cool Cat', rankKey: 'adept', level: 12, multiplayerEnabled: true, timezone: 'Europe/Prague' });
  });

  it('validates fields', async () => {
    const p = await registerPlayer(env);
    const ok = { nickname: 'a', rankKey: 'novice', level: 1, multiplayerEnabled: true, timezone: 'UTC' };
    for (const bad of [
      { rankKey: 'god' }, { level: 0 }, { level: 1000 }, { level: 1.5 }, { timezone: 'Mars/Base' },
      { nickname: 'x'.repeat(21) }, { nickname: 'Jan Novák@' }, { nickname: 'a@b.cz' }, { multiplayerEnabled: 'yes' },
    ]) {
      const r = await call(env, p, 'PUT', '/v1/me', { ...ok, ...bad });
      expect(r.statusCode, JSON.stringify(bad)).toBe(400);
      expect(r.json().error.code).toBe('validation');
    }
    const missing = await call(env, p, 'PUT', '/v1/me', { nickname: 'a' });
    expect(missing.statusCode).toBe(400);
  });

  it('allows an empty (anonymous) nickname and rejects blocklisted ones', async () => {
    const p = await registerPlayer(env);
    const base = { rankKey: 'novice', level: 1, multiplayerEnabled: true, timezone: 'UTC' };
    expect((await call(env, p, 'PUT', '/v1/me', { ...base, nickname: '' })).statusCode).toBe(200);
    expect((await call(env, p, 'PUT', '/v1/me', { ...base, nickname: 'blbec' })).statusCode).toBe(400);
  });

  it('DELETE /me erases the player', async () => {
    const p = await registerPlayer(env);
    expect((await call(env, p, 'DELETE', '/v1/me')).statusCode).toBe(204);
    expect((await call(env, p, 'GET', '/v1/me')).statusCode).toBe(401);
  });
});

describe('nickname filter copy', () => {
  it('is byte-identical to the mobile copy', () => {
    for (const f of ['nickname.ts', 'nickname-blocklist.json']) {
      const server = readFileSync(resolve('src', f), 'utf8').replace(/\r\n/g, '\n');
      const mobile = readFileSync(resolve('../mobile/src/features', f), 'utf8').replace(/\r\n/g, '\n');
      expect(server, `${f} differs from mobile/src/features/${f}`).toBe(mobile);
    }
  });
});

void newKeyPair;
