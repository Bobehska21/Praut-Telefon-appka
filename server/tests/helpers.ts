import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';
import { createPool, type Db } from '../src/db/pool';
import { migrate } from '../src/db/migrate';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://focus:focus_local_dev@localhost:5433/focus_dev';

export interface TestDb {
  db: Db;
  schema: string;
  close(): Promise<void>;
}

/** Creates an isolated schema in the local test database, migrates it and returns a pool bound to it. */
export async function createTestDb(): Promise<TestDb> {
  const schema = `t_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const db = createPool({ connectionString: TEST_DATABASE_URL, max: 10, statementTimeoutMs: 15_000, schema });
  await migrate(db, resolve('migrations'), 'up');
  return {
    db,
    schema,
    async close() {
      await db.end();
      const a = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await a.connect();
      await a.query(`DROP SCHEMA ${schema} CASCADE`);
      await a.end();
    },
  };
}

// ---- app harness ----
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';
import { LocalDiskStorage } from '../src/storage';
import { canonicalKillString } from '../src/crypto';

export class TestClock {
  constructor(private t: number) {}
  now() {
    return new Date(this.t);
  }
  advance(ms: number) {
    this.t += ms;
  }
  set(iso: string) {
    this.t = new Date(iso).getTime();
  }
}

export const MIN = 60_000;
/** A mid-day UTC instant so +/- a few hours stay on the same UTC day. */
export const T0 = '2026-03-10T12:00:00Z';

export interface Env {
  app: FastifyInstance;
  db: Db;
  clock: TestClock;
  config: Config;
  photoDir: string;
  close(): Promise<void>;
}

export const ADMIN_TOKEN = 'test-admin-token-0123456789abcdef0123456789';

export async function createEnv(overrides: Partial<Omit<Config, 'rateLimit'>> & { rateLimit?: Partial<Config['rateLimit']> } = {}): Promise<Env> {
  const t = await createTestDb();
  const photoDir = await mkdtemp(join(tmpdir(), 'focus-photos-'));
  const base = loadConfig({ DATABASE_URL: TEST_DATABASE_URL, ADMIN_TOKEN, LOG_LEVEL: 'silent', PHOTO_DIR: photoDir });
  const { rateLimit, ...rest } = overrides;
  const config: Config = {
    ...base,
    eventsPollMs: 20,
    ...rest,
    rateLimit: { globalPerMin: 100000, registerPerHour: 100000, challengePerMin: 100000, reportPerHour: 100000, ...rateLimit },
  };
  const clock = new TestClock(new Date(T0).getTime());
  const app = await buildApp({ config, db: t.db, clock, storage: new LocalDiskStorage(photoDir) });
  await app.ready();
  return {
    app,
    db: t.db,
    clock,
    config,
    photoDir,
    async close() {
      await app.close();
      await t.close();
      await rm(photoDir, { recursive: true, force: true });
    },
  };
}

export interface Player {
  id: string;
  token: string;
  privateKey: KeyObject;
  publicKey: string;
}

export function newKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { privateKey, publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') };
}

export async function registerPlayer(env: Env, profile: Record<string, unknown> | null = {}): Promise<Player> {
  const kp = newKeyPair();
  const res = await env.app.inject({ method: 'POST', url: '/v1/register', payload: { publicKey: kp.publicKey } });
  if (res.statusCode !== 201) throw new Error(`register failed ${res.statusCode} ${res.body}`);
  const { playerId, token } = res.json();
  const p: Player = { id: playerId, token, privateKey: kp.privateKey, publicKey: kp.publicKey };
  if (profile !== null) {
    const r = await call(env, p, 'PUT', '/v1/me', {
      nickname: '', rankKey: 'novice', level: 1, multiplayerEnabled: true, timezone: 'UTC', ...profile,
    });
    if (r.statusCode !== 200) throw new Error(`profile failed ${r.statusCode} ${r.body}`);
  }
  return p;
}

export function call(env: Env, p: Player | null, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = {}) {
  return env.app.inject({
    method,
    url,
    ...(payload !== undefined ? { payload: payload as object } : {}),
    headers: { ...(p ? { authorization: `Bearer ${p.token}` } : {}), ...headers },
  });
}

export function signChallenge(victim: Player, c: { challengeId: string; nonce: string }, killerId: string): string {
  return sign('sha256', Buffer.from(canonicalKillString(c.challengeId, c.nonce, victim.id, killerId)), { key: victim.privateKey, dsaEncoding: 'der' }).toString('base64');
}

/** Fast setup: writes focus minutes straight into the ledger for the player's local day (UTC in tests). */
export async function grantFocusMinutes(env: Env, p: Player, minutes: number, day = env.clock.now().toISOString().slice(0, 10)) {
  await env.db.query(
    "INSERT INTO points_ledger (player_id, kind, day, focus_ms, points) VALUES ($1, 'minute', $2, $3, $4)",
    [p.id, day, minutes * MIN, minutes + Math.max(0, minutes - 90)],
  );
}

/** Puts a player into wasteman through the real API (start, manual stop). */
export async function makeWasteman(env: Env, p: Player) {
  await call(env, p, 'POST', '/v1/focus/start');
  await call(env, p, 'POST', '/v1/focus/stop', { reason: 'manual' });
}
