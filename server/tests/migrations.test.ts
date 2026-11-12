import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate';
import { createTestDb, type TestDb } from './helpers';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

const dir = resolve('migrations');
const tables = async () =>
  (await t.db.query<{ n: string }>('SELECT table_name n FROM information_schema.tables WHERE table_schema = $1', [t.schema])).rows.map((r) => r.n);

it('applies, is idempotent, and rolls back cleanly', async () => {
  expect(await tables()).toEqual(expect.arrayContaining(['players', 'accounts', 'auth_tokens', 'login_attempts']));
  expect(await migrate(t.db, dir, 'up')).toEqual([]);
  expect(await migrate(t.db, dir, 'down', 2)).toEqual(['0002_accounts', '0001_init']);
  expect(await tables()).not.toContain('players');
  expect(await migrate(t.db, dir, 'up')).toEqual(['0001_init', '0002_accounts']);
});

it('0002 backfills existing tokens, and its down migration restores players.token_hash NOT NULL', async () => {
  await migrate(t.db, dir, 'down'); // revert 0002 only
  expect(await tables()).not.toContain('accounts');
  await t.db.query("INSERT INTO players (token_hash, public_key) VALUES (sha256('legacy'), 'k')");
  await migrate(t.db, dir, 'up');
  const legacy = await t.db.query("SELECT 1 FROM auth_tokens WHERE token_hash = sha256('legacy')");
  expect(legacy.rowCount).toBe(1);

  // A player created by the new code has no legacy hash; down must still succeed.
  await t.db.query('INSERT INTO players (public_key) VALUES (\'k2\')');
  await migrate(t.db, dir, 'down');
  const nulls = await t.db.query('SELECT 1 FROM players WHERE token_hash IS NULL');
  expect(nulls.rowCount).toBe(0);
  await migrate(t.db, dir, 'up');
});
