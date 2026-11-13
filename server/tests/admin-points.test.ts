import { afterAll, describe, expect, it } from 'vitest';
import { call, createEnv, registerPlayer, type Env, type Player } from './helpers';

let e: Env;
const ready = (async () => {
  e = await createEnv();
})();
afterAll(async () => {
  await ready;
  await e.close();
});

async function makeAdmin(): Promise<Player> {
  const a = await registerPlayer(e);
  await e.db.query('UPDATE accounts SET is_admin = true WHERE player_id = $1', [a.id]);
  return a;
}
const stats = async (p: Player) => (await call(e, p, 'GET', '/v1/me/stats')).json();

describe('admin API (server side authorization)', () => {
  it('a regular user and an anonymous caller cannot reach any admin route (404, nothing reveals the route)', async () => {
    await ready;
    const user = await registerPlayer(e);
    const victim = await registerPlayer(e);
    for (const [method, url, body] of [
      ['GET', '/v1/admin/whoami', undefined],
      ['POST', `/v1/admin/players/${victim.id}/points`, { points: 50 }],
    ] as const) {
      expect((await call(e, user, method, url, body)).statusCode, url).toBe(404);
      expect((await call(e, null, method, url, body)).statusCode, url).toBe(401);
    }
    expect((await stats(victim)).pointsToday).toBe(0);
    expect((await e.db.query('SELECT 1 FROM admin_audit')).rowCount).toBe(0);
  });

  it('the admin flag is read from the database on every request, so revoking it takes effect immediately', async () => {
    await ready;
    const a = await makeAdmin();
    expect((await call(e, a, 'GET', '/v1/admin/whoami')).json()).toEqual({ admin: true });
    await e.db.query('UPDATE accounts SET is_admin = false WHERE player_id = $1', [a.id]);
    expect((await call(e, a, 'GET', '/v1/admin/whoami')).statusCode).toBe(404);
  });

  it('adds and removes points, shows them in the profile stats, and writes an audit row (who, whom, what, why, when)', async () => {
    await ready;
    const a = await makeAdmin();
    const u = await registerPlayer(e);
    const add = await call(e, a, 'POST', `/v1/admin/players/${u.id}/points`, { points: 120, note: 'tournament prize' });
    expect(add.statusCode).toBe(200);
    expect(add.json()).toMatchObject({ points: 120, pointsToday: 120 });
    expect(await stats(u)).toMatchObject({ pointsToday: 120, pointsTotal: 120 });

    const take = await call(e, a, 'POST', `/v1/admin/players/${u.id}/points`, { points: -50 });
    expect(take.json()).toMatchObject({ pointsToday: 70 });
    expect(await stats(u)).toMatchObject({ pointsToday: 70, pointsTotal: 70 });

    const audit = await e.db.query('SELECT action, target_player_id, actor_player_id, note, details, created_at FROM admin_audit WHERE target_player_id = $1 ORDER BY id', [u.id]);
    expect(audit.rows.map((r) => [r.action, r.actor_player_id, r.note, r.details.points])).toEqual([
      ['points.adjust', a.id, 'tournament prize', 120],
      ['points.adjust', a.id, null, -50],
    ]);
    expect(audit.rows[0].created_at).toBeInstanceOf(Date);
  });

  it('lists players with username, points and registration date, and searches by username or nickname', async () => {
    await ready;
    const a = await makeAdmin();
    const u = await registerPlayer(e);
    await call(e, a, 'POST', `/v1/admin/players/${u.id}/points`, { points: 30 });
    await e.db.query("UPDATE players SET nickname = 'Zebra_100%' WHERE id = $1", [u.id]);
    const all = (await call(e, a, 'GET', '/v1/admin/players')).json();
    const row = all.find((x: { id: string }) => x.id === u.id);
    expect(row).toMatchObject({ username: u.username, nickname: 'Zebra_100%', pointsTotal: 30, photoUrl: null, isAdmin: false });
    expect(typeof row.createdAt).toBe('string');
    const search = async (q: string) => (await call(e, a, 'GET', `/v1/admin/players?q=${encodeURIComponent(q)}`)).json().map((x: { id: string }) => x.id);
    expect(await search('zebra')).toEqual([u.id]);
    expect(await search(u.username.toUpperCase())).toContain(u.id);
    expect(await search('100%')).toEqual([u.id]); // % is searched literally, not as a wildcard
    expect(await search('%')).toEqual([u.id]);
    expect(await search('nobody-has-this-name')).toEqual([]);
    expect((await call(e, await registerPlayer(e), 'GET', '/v1/admin/players')).statusCode).toBe(404);
  });

  it('validates input and an unknown target, and leaves no ledger or audit row behind', async () => {
    await ready;
    const a = await makeAdmin();
    const u = await registerPlayer(e);
    const before = (await e.db.query('SELECT count(*)::int n FROM admin_audit')).rows[0].n;
    for (const body of [{ points: 0 }, { points: 1.5 }, { points: 100_001 }, { points: '5' }, {}, { points: 5, note: 'x'.repeat(201) }]) {
      expect((await call(e, a, 'POST', `/v1/admin/players/${u.id}/points`, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await call(e, a, 'POST', '/v1/admin/players/not-a-uuid/points', { points: 5 })).statusCode).toBe(400);
    expect((await call(e, a, 'POST', '/v1/admin/players/00000000-0000-4000-8000-000000000000/points', { points: 5 })).statusCode).toBe(404);
    expect((await e.db.query('SELECT count(*)::int n FROM admin_audit')).rows[0].n).toBe(before);
    expect((await stats(u)).pointsToday).toBe(0);
  });
});
