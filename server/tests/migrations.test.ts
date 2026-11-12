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
  expect(await migrate(t.db, dir, 'down', 6)).toEqual(['0006_session_bets_validate', '0005_session_bets', '0004_shields_validate', '0003_shields', '0002_accounts', '0001_init']);
  expect(await tables()).not.toContain('players');
  expect(await migrate(t.db, dir, 'up')).toEqual(['0001_init', '0002_accounts', '0003_shields', '0004_shields_validate', '0005_session_bets', '0006_session_bets_validate']);
});

it('0002 backfills existing tokens, and its down migration restores players.token_hash NOT NULL', async () => {
  await migrate(t.db, dir, 'down', 5); // revert 0006, 0005, 0004, 0003 and 0002
  expect(await tables()).not.toContain('accounts');
  await t.db.query("INSERT INTO players (token_hash, public_key) VALUES (sha256('legacy'), 'k')");
  await migrate(t.db, dir, 'up'); // 0002 to 0006
  const legacy = await t.db.query("SELECT 1 FROM auth_tokens WHERE token_hash = sha256('legacy')");
  expect(legacy.rowCount).toBe(1);

  // A player created by the new code has no legacy hash; down must still succeed.
  await t.db.query('INSERT INTO players (public_key) VALUES (\'k2\')');
  await migrate(t.db, dir, 'down', 5);
  const nulls = await t.db.query('SELECT 1 FROM players WHERE token_hash IS NULL');
  expect(nulls.rowCount).toBe(0);
  await migrate(t.db, dir, 'up');
});

it('0003 adds shield columns with safe defaults and its down migration removes them (data loss by design)', async () => {
  const cols = async (table: string) =>
    (await t.db.query<{ c: string }>('SELECT column_name c FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2', [t.schema, table])).rows.map((r) => r.c);
  expect(await cols('players')).toContain('shields');
  expect(await cols('focus_sessions')).toEqual(expect.arrayContaining(['credited_ms', 'shield_awarded']));
  expect(await cols('kill_challenges')).toEqual(expect.arrayContaining(['shield_blocked', 'resolved_at']));

  const id = (await t.db.query<{ id: string }>("INSERT INTO players (public_key) VALUES ('k3') RETURNING id")).rows[0]!.id;
  expect((await t.db.query('SELECT shields FROM players WHERE id = $1', [id])).rows[0].shields).toBe(0);
  await expect(t.db.query('UPDATE players SET shields = 4 WHERE id = $1', [id])).rejects.toThrow(/players_shields_range/);
  await t.db.query("INSERT INTO notifications (player_id, kind, payload) VALUES ($1, 'shield_earned', '{}'), ($1, 'killed', '{}')", [id]);

  expect(await migrate(t.db, dir, 'down', 4)).toEqual(['0006_session_bets_validate', '0005_session_bets', '0004_shields_validate', '0003_shields']);
  expect(await cols('players')).not.toContain('shields');
  expect(await cols('focus_sessions')).not.toContain('credited_ms');
  const left = (await t.db.query('SELECT kind FROM notifications WHERE player_id = $1', [id])).rows.map((r) => r.kind);
  expect(left).toEqual(['killed']); // shield notifications deleted, the old kind kept
  await expect(t.db.query("INSERT INTO notifications (player_id, kind, payload) VALUES ($1, 'shield_earned', '{}')", [id])).rejects.toThrow();
  expect(await migrate(t.db, dir, 'up')).toEqual(['0003_shields', '0004_shields_validate', '0005_session_bets', '0006_session_bets_validate']);
});

const constraints = async (table: string) =>
  (await t.db.query<{ n: string; v: boolean }>(
    "SELECT c.conname n, c.convalidated v FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace s ON s.oid = r.relnamespace WHERE s.nspname = $1 AND r.relname = $2 AND c.contype = 'c' ORDER BY c.conname",
    [t.schema, table],
  )).rows;

it('0003 is expand-only (NOT VALID, old constraint kept); 0004 validates and drops the old one; its down is the inverse', async () => {
  const id = (await t.db.query<{ id: string }>("INSERT INTO players (public_key) VALUES ('k4') RETURNING id")).rows[0]!.id;
  // after both: only the validated new constraints
  expect(await constraints('notifications')).toEqual([{ n: 'notifications_kind_check2', v: true }]);
  expect((await constraints('players')).find((c) => c.n === 'players_shields_range')).toEqual({ n: 'players_shields_range', v: true });

  // down 0004 only: the state right after 0003 (old 'killed'-only constraint enforced, new one NOT VALID or valid, shield rows removed)
  await t.db.query("INSERT INTO notifications (player_id, kind, payload) VALUES ($1, 'shield_blocked', '{}'), ($1, 'killed', '{}')", [id]);
  expect(await migrate(t.db, dir, 'down', 3)).toEqual(['0006_session_bets_validate', '0005_session_bets', '0004_shields_validate']);
  expect((await constraints('notifications')).map((c) => c.n)).toEqual(['notifications_kind_check', 'notifications_kind_check2']);
  expect((await t.db.query('SELECT kind FROM notifications WHERE player_id = $1', [id])).rows.map((r) => r.kind)).toEqual(['killed']);
  await expect(t.db.query("INSERT INTO notifications (player_id, kind, payload) VALUES ($1, 'shield_earned', '{}')", [id])).rejects.toThrow(/notifications_kind_check/);
  await t.db.query("INSERT INTO notifications (player_id, kind, payload) VALUES ($1, 'killed', '{}')", [id]); // old kind still fine

  expect(await migrate(t.db, dir, 'up')).toEqual(['0004_shields_validate', '0005_session_bets', '0006_session_bets_validate']);
  await t.db.query("INSERT INTO notifications (player_id, kind, payload) VALUES ($1, 'shield_earned', '{}')", [id]);
});

it('0005 is expand-only (NOT VALID, old ledger constraint kept); 0006 validates and drops it; its down removes bet rows', async () => {
  const id = (await t.db.query<{ id: string }>("INSERT INTO players (public_key) VALUES ('k5') RETURNING id")).rows[0]!.id;
  expect(await constraints('points_ledger')).toEqual(expect.arrayContaining([{ n: 'points_ledger_kind_check2', v: true }]));
  expect((await constraints('points_ledger')).map((c) => c.n)).not.toContain('points_ledger_kind_check');
  await expect(t.db.query('INSERT INTO focus_sessions (player_id, started_at, bet_multiplier) VALUES ($1, now(), 3)', [id])).rejects.toThrow(/bet_multiplier_check/);

  await t.db.query("INSERT INTO points_ledger (player_id, kind, day, points) VALUES ($1, 'bet_bonus', '2026-03-10', 10), ($1, 'minute', '2026-03-10', 1)", [id]);
  expect(await migrate(t.db, dir, 'down')).toEqual(['0006_session_bets_validate']);
  expect((await constraints('points_ledger')).map((c) => c.n)).toEqual(expect.arrayContaining(['points_ledger_kind_check', 'points_ledger_kind_check2']));
  expect((await t.db.query('SELECT kind FROM points_ledger WHERE player_id = $1', [id])).rows.map((r) => r.kind)).toEqual(['minute']);
  await expect(t.db.query("INSERT INTO points_ledger (player_id, kind, day, points) VALUES ($1, 'bet_bonus', '2026-03-10', 1)", [id])).rejects.toThrow(/points_ledger_kind_check/);

  expect(await migrate(t.db, dir, 'down')).toEqual(['0005_session_bets']);
  expect(await migrate(t.db, dir, 'up')).toEqual(['0005_session_bets', '0006_session_bets_validate']);
});
