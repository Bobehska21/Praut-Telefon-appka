import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createEnv, grantFocusMinutes, makeWasteman, newKeyPair, registerPlayer, type Env } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await createEnv({ rateLimit: { globalPerMin: 40, registerPerHour: 3, challengePerMin: 2, reportPerHour: 2 } });
});
afterAll(async () => {
  await env.close();
});

describe('rate limits', () => {
  it('limits registration per client', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await env.app.inject({ method: 'POST', url: '/v1/auth/register', payload: { username: `user${Math.random().toString(36).slice(2, 10)}`, password: 'password123', publicKey: newKeyPair().publicKey } })).statusCode);
    expect(codes).toEqual([201, 201, 201, 429, 429]);
    const r = await env.app.inject({ method: 'POST', url: '/v1/auth/register', payload: { username: `user${Math.random().toString(36).slice(2, 10)}`, password: 'password123', publicKey: newKeyPair().publicKey } });
    expect(r.json()).toEqual({ error: { code: 'rate_limited', message: expect.any(String) } });
  });

  it('limits kill challenges and reports per player, and the global rate', async () => {
    const e2 = await createEnv({ rateLimit: { globalPerMin: 1000, registerPerHour: 1000, challengePerMin: 2, reportPerHour: 2 } });
    try {
      const k = await registerPlayer(e2);
      await grantFocusMinutes(e2, k, 90);
      const v = await registerPlayer(e2);
      await makeWasteman(e2, v);
      const ch = [];
      for (let i = 0; i < 3; i++) ch.push((await call(e2, k, 'POST', '/v1/kills/challenge', { targetPlayerId: v.id })).statusCode);
      expect(ch).toEqual([201, 201, 429]);
      const other = await registerPlayer(e2);
      expect((await call(e2, other, 'POST', '/v1/kills/challenge', { targetPlayerId: v.id })).statusCode).toBe(403); // separate bucket (needs_minutes)

      const rep = [];
      for (let i = 0; i < 3; i++) rep.push((await call(e2, k, 'POST', '/v1/reports', { targetPlayerId: v.id, kind: 'player' })).statusCode);
      expect(rep).toEqual([201, 201, 429]);
      expect((await call(e2, other, 'POST', '/v1/reports', { targetPlayerId: v.id, kind: 'player' })).statusCode).toBe(201);
    } finally {
      await e2.close();
    }
  });

  it('global limit applies; health checks are exempt', async () => {
    const e2 = await createEnv({ rateLimit: { globalPerMin: 5 } });
    try {
      const codes = [];
      for (let i = 0; i < 7; i++) codes.push((await e2.app.inject({ url: '/v1/me' })).statusCode);
      expect(codes).toEqual([401, 401, 401, 401, 401, 429, 429]);
      for (let i = 0; i < 20; i++) expect((await e2.app.inject({ url: '/healthz' })).statusCode).toBe(200);
    } finally {
      await e2.close();
    }
  });
});
