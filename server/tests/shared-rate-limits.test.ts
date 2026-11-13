import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { postgresRateLimitStore, pruneRateLimits } from '../src/rate-limit-store';
import { LocalDiskStorage } from '../src/storage';
import { createEnv, type Env } from './helpers';
let e: Env;
beforeAll(async () => { e = await createEnv({ rateLimitStore: 'postgres', rateLimit: { globalPerMin: 4 } }); });
afterAll(async () => { if (e) await e.close(); });

it('shares the request budget between two servers and exempts health checks', async () => {
  const second = await buildApp({ config: e.config, db: e.db, clock: e.clock, storage: new LocalDiskStorage(e.photoDir) });
  try {
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await (i % 2 ? second : e.app).inject({ url: '/v1/me' })).statusCode);
    expect(codes).toEqual([401, 401, 401, 401, 429, 429]);
    expect((await second.inject({ url: '/healthz' })).statusCode).toBe(200);
    expect((await second.inject({ url: '/readyz' })).statusCode).toBe(200);
  } finally { await second.close(); }
});

it('increments atomically across stores, caps denied hits and resets expired windows', async () => {
  const First = postgresRateLimitStore(e.db);
  const Second = postgresRateLimitStore(e.db);
  const a = new First({});
  const b = new Second({});
  const incr = (store: typeof a) => new Promise<{ current: number; ttl: number }>((resolve, reject) => {
    store.incr('parallel-client', (err, r) => err ? reject(err) : resolve(r!), 60_000, 10);
  });
  const results = await Promise.all(Array.from({ length: 40 }, (_, i) => incr(i % 2 ? a : b)));
  expect(results.filter((r) => r.current <= 10).map((r) => r.current).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(Math.max(...results.map((r) => r.current))).toBe(11);
  await e.db.query("UPDATE rate_limit_buckets SET expires_at = now() - interval '1 second'");
  expect(await incr(a)).toMatchObject({ current: 1 });
});

it('prunes expired rows in bounded batches and preserves active counters', async () => {
  await e.db.query("INSERT INTO rate_limit_buckets (key, hits, expires_at) SELECT 'expired-' || i, 1, now() - interval '1 day' FROM generate_series(1, 1100) i");
  await pruneRateLimits(e.db);
  expect(Number((await e.db.query("SELECT count(*) n FROM rate_limit_buckets WHERE key LIKE 'expired-%'")).rows[0].n)).toBeGreaterThanOrEqual(100);
  await pruneRateLimits(e.db);
  expect(Number((await e.db.query("SELECT count(*) n FROM rate_limit_buckets WHERE key LIKE 'expired-%'")).rows[0].n)).toBe(0);
  expect(Number((await e.db.query('SELECT count(*) n FROM rate_limit_buckets WHERE expires_at > now()')).rows[0].n)).toBeGreaterThan(0);
});
