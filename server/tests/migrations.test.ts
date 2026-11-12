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

it('applies, is idempotent, and rolls back cleanly', async () => {
  const tables = async () =>
    (await t.db.query<{ n: string }>('SELECT table_name n FROM information_schema.tables WHERE table_schema = $1', [t.schema])).rows.map((r) => r.n);
  expect(await tables()).toContain('players');
  expect(await migrate(t.db, resolve('migrations'), 'up')).toEqual([]);
  expect(await migrate(t.db, resolve('migrations'), 'down')).toEqual(['0001_init']);
  expect(await tables()).not.toContain('players');
  expect(await migrate(t.db, resolve('migrations'), 'up')).toEqual(['0001_init']);
  expect(await tables()).toContain('kills');
});
