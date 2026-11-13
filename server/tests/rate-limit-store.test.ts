import { expect, it, vi } from 'vitest';
import type { Db } from '../src/db/pool';
import { postgresRateLimitStore, pruneRateLimits } from '../src/rate-limit-store';
it('fails closed when shared storage is unavailable', async () => {
  const db = { query: vi.fn().mockRejectedValue(new Error('private detail')) } as unknown as Db;
  const Store = postgresRateLimitStore(db);
  const error = await new Promise<Error | null>((resolve) => new Store({}).incr('private-token', (e) => resolve(e), 60_000, 10));
  expect(error).toMatchObject({ status: 503, message: 'Rate limit storage unavailable' });
});
it('uses the same hashed bucket identity across replicas', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ current: 2, ttl: 1000 }] });
  const db = { query } as unknown as Db;
  const Store1 = postgresRateLimitStore(db);
  const Store2 = postgresRateLimitStore(db);
  const increment = (s: InstanceType<typeof Store1>) => new Promise((resolve, reject) => s.incr('Bearer private-token', (e, r) => e ? reject(e) : resolve(r), 60_000, 3));
  expect(await increment(new Store1({}))).toEqual({ current: 2, ttl: 1000 });
  await increment(new Store2({}));
  expect(query.mock.calls[0]![1][0]).toMatch(/^[a-f0-9]{64}$/);
  expect(query.mock.calls[1]![1][0]).toBe(query.mock.calls[0]![1][0]);
  expect(JSON.stringify(query.mock.calls)).not.toContain('private-token');
});
it('bounds cleanup and skips locked rows', async () => {
  const query = vi.fn().mockResolvedValue({});
  await pruneRateLimits({ query } as unknown as Db);
  expect(query.mock.calls[0]![0]).toContain('LIMIT 1000 FOR UPDATE SKIP LOCKED');
});

it('returns 503 through the API error handler without disabling health checks', async () => {
  const { buildApp } = await import('../src/app');
  const { loadConfig } = await import('../src/config');
  const { systemClock } = await import('../src/clock');
  const { LocalDiskStorage } = await import('../src/storage');
  const db = { query: vi.fn().mockRejectedValue(new Error('private detail')) } as unknown as Db;
  const app = await buildApp({
    config: loadConfig({ DATABASE_URL: 'postgresql://localhost/test', ADMIN_TOKEN: 'x'.repeat(32), LOG_LEVEL: 'silent', RATE_LIMIT_STORE: 'postgres' }),
    db, clock: systemClock, storage: new LocalDiskStorage('/tmp/unused-photos'),
  });
  try {
    const r = await app.inject({ url: '/v1/me' });
    expect(r.statusCode).toBe(503);
    expect(r.json()).toEqual({ error: { code: 'unavailable', message: 'Rate limit storage unavailable' } });
    expect((await app.inject({ url: '/healthz' })).statusCode).toBe(200);
  } finally { await app.close(); }
});

it('gives each route a stable, distinct bucket even when route registration order changes', async () => {
  const { default: Fastify } = await import('fastify');
  const { default: rateLimit } = await import('@fastify/rate-limit');
  const query = vi.fn().mockResolvedValue({ rows: [{ current: 1, ttl: 60_000 }] });
  const make = async (routes: string[]) => {
    const app = Fastify();
    await app.register(rateLimit, { store: postgresRateLimitStore({ query } as unknown as Db) });
    for (const route of routes) app.get(route, { config: { rateLimit: { max: 3 } } }, async () => 'ok');
    return app;
  };
  const first = await make(['/a', '/b']);
  const second = await make(['/b', '/a']);
  try {
    await first.inject({ url: '/a' });
    await first.inject({ url: '/b' });
    await second.inject({ url: '/a' });
    expect(query.mock.calls[0]![1][0]).not.toBe(query.mock.calls[1]![1][0]);
    expect(query.mock.calls[0]![1][0]).toBe(query.mock.calls[2]![1][0]);
  } finally { await first.close(); await second.close(); }
});
