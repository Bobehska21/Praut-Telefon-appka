import { readdir } from 'node:fs/promises';
import sharp from 'sharp';
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
const jpeg = () => sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 200, g: 30, b: 30 } } }).jpeg().toBuffer();
const upload = async (p: Player) =>
  e.app.inject({ method: 'PUT', url: '/v1/me/photo', payload: await jpeg(), headers: { authorization: `Bearer ${p.token}`, 'content-type': 'image/jpeg' } });
const events = async (p: Player) => (await call(e, p, 'GET', '/v1/events?after=0')).json() as { kind: string; payload: Record<string, unknown> }[];

describe('admin moderation', () => {
  it('a regular user cannot rename or remove a photo (404), and nothing changes', async () => {
    await ready;
    const user = await registerPlayer(e);
    const victim = await registerPlayer(e, { nickname: 'Original' });
    await upload(victim);
    expect((await call(e, user, 'PUT', `/v1/admin/players/${victim.id}/nickname`, { nickname: 'Hacked' })).statusCode).toBe(404);
    expect((await call(e, user, 'DELETE', `/v1/admin/players/${victim.id}/photo`)).statusCode).toBe(404);
    expect((await call(e, null, 'PUT', `/v1/admin/players/${victim.id}/nickname`, { nickname: 'Hacked' })).statusCode).toBe(401);
    const row = (await e.db.query('SELECT nickname, photo_key FROM players WHERE id = $1', [victim.id])).rows[0];
    expect(row.nickname).toBe('Original');
    expect(row.photo_key).not.toBeNull();
    expect(await events(victim)).toEqual([]);
  });

  it('renames a player, notifies them and audits it; the new name must pass the nickname filter', async () => {
    await ready;
    const a = await makeAdmin();
    const u = await registerPlayer(e, { nickname: 'Original' });
    const r = await call(e, a, 'PUT', `/v1/admin/players/${u.id}/nickname`, { nickname: 'Nice Name', note: 'offensive' });
    expect(r.statusCode).toBe(200);
    expect((await call(e, u, 'GET', '/v1/me')).json().nickname).toBe('Nice Name');
    expect(await events(u)).toEqual([expect.objectContaining({ kind: 'admin_nickname', payload: { nickname: 'Nice Name' } })]);
    const audit = (await e.db.query("SELECT actor_player_id, note, details FROM admin_audit WHERE action = 'nickname.change' AND target_player_id = $1", [u.id])).rows;
    expect(audit).toEqual([{ actor_player_id: a.id, note: 'offensive', details: { from: 'Original', to: 'Nice Name' } }]);

    for (const nickname of ['', 'x'.repeat(21), 'fuck']) {
      expect((await call(e, a, 'PUT', `/v1/admin/players/${u.id}/nickname`, { nickname })).statusCode, nickname).toBe(400);
    }
    expect((await call(e, a, 'PUT', '/v1/admin/players/00000000-0000-4000-8000-000000000000/nickname', { nickname: 'Fine' })).statusCode).toBe(404);
    expect((await call(e, u, 'GET', '/v1/me')).json().nickname).toBe('Nice Name');
  });

  it('a profile sync without a nickname keeps the admin-changed name; one with a nickname (the user edited it) replaces it', async () => {
    await ready;
    const a = await makeAdmin();
    const u = await registerPlayer(e, { nickname: 'Original' });
    await call(e, a, 'PUT', `/v1/admin/players/${u.id}/nickname`, { nickname: 'Nice Name' });
    const profile = { rankKey: 'novice', level: 1, multiplayerEnabled: true, timezone: 'UTC' };
    const kept = await call(e, u, 'PUT', '/v1/me', profile);
    expect(kept.statusCode).toBe(200);
    expect(kept.json().nickname).toBe('Nice Name');
    expect((await call(e, u, 'PUT', '/v1/me', { ...profile, nickname: 'Mine' })).json().nickname).toBe('Mine');
  });

  it('removes a photo (also of a player with multiplayer off, which an admin can still see), deletes the file, notifies and audits', async () => {
    await ready;
    const a = await makeAdmin();
    const u = await registerPlayer(e);
    expect((await upload(u)).statusCode).toBe(200);
    await e.db.query('UPDATE players SET multiplayer_enabled = false WHERE id = $1', [u.id]);
    const other = await registerPlayer(e);
    expect((await call(e, other, 'GET', `/v1/photos/${u.id}`)).statusCode).toBe(404);
    expect((await call(e, a, 'GET', `/v1/photos/${u.id}`)).statusCode).toBe(200); // the admin can review it

    const before = (await readdir(e.photoDir)).length;
    const r = await call(e, a, 'DELETE', `/v1/admin/players/${u.id}/photo`, { note: 'inappropriate' });
    expect(r.statusCode).toBe(200);
    expect(r.json().photoUrl).toBeNull();
    expect((await call(e, u, 'GET', '/v1/me')).json().photoUrl).toBeNull();
    expect((await readdir(e.photoDir)).length).toBe(before - 1);
    expect(await events(u)).toEqual([expect.objectContaining({ kind: 'admin_photo' })]);
    expect((await e.db.query("SELECT actor_player_id, note FROM admin_audit WHERE action = 'photo.remove' AND target_player_id = $1", [u.id])).rows).toEqual([
      { actor_player_id: a.id, note: 'inappropriate' },
    ]);
    // nothing left to remove
    expect((await call(e, a, 'DELETE', `/v1/admin/players/${u.id}/photo`)).statusCode).toBe(409);
  });

  it('a regular user still cannot see a photo of a player with multiplayer off', async () => {
    await ready;
    const u = await registerPlayer(e);
    await upload(u);
    await e.db.query('UPDATE players SET multiplayer_enabled = false WHERE id = $1', [u.id]);
    expect((await call(e, await registerPlayer(e), 'GET', `/v1/photos/${u.id}`)).statusCode).toBe(404);
  });
});
