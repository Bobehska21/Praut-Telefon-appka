import { readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_TOKEN, call, createEnv, registerPlayer, type Env, type Player } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.close();
});

const put = (p: Player, body: Buffer, type = 'image/jpeg') =>
  env.app.inject({ method: 'PUT', url: '/v1/me/photo', payload: body, headers: { authorization: `Bearer ${p.token}`, 'content-type': type } });

const image = (fmt: 'jpeg' | 'png' | 'webp', w = 600, h = 400) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 30 } } })[fmt]().toBuffer();

describe('photos', () => {
  it('accepts jpeg, png and webp, re-encodes to 256x256 jpeg', async () => {
    for (const fmt of ['jpeg', 'png', 'webp'] as const) {
      const p = await registerPlayer(env);
      const r = await put(p, await image(fmt), `image/${fmt}`);
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().photoUrl).toMatch(new RegExp(`^/v1/photos/${p.id}\\?v=\\d+$`));
      const got = await call(env, p, 'GET', `/v1/photos/${p.id}`);
      expect(got.statusCode).toBe(200);
      expect(got.headers['content-type']).toBe('image/jpeg');
      const meta = await sharp(got.rawPayload).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 256, 256]);
      expect((await call(env, p, 'GET', '/v1/me')).json().photoUrl).toBe(r.json().photoUrl);
    }
  });

  it('strips EXIF / GPS metadata', async () => {
    const p = await registerPlayer(env);
    const withExif = await sharp(await image('jpeg')).withExif({ IFD0: { Copyright: 'secret-copyright' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '50/1 5/1 0/1' } }).jpeg().toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    expect(withExif.includes(Buffer.from('secret-copyright'))).toBe(true);
    expect((await put(p, withExif)).statusCode).toBe(200);
    const out = (await call(env, p, 'GET', `/v1/photos/${p.id}`)).rawPayload;
    expect((await sharp(out).metadata()).exif).toBeUndefined();
    expect(out.includes(Buffer.from('secret-copyright'))).toBe(false);
  });

  it('validates by magic bytes, size and content type', async () => {
    const p = await registerPlayer(env);
    const text = await put(p, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png');
    expect(text.statusCode).toBe(400);
    expect(text.json().error.code).toBe('validation');
    expect((await put(p, Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]))).statusCode).toBe(400); // right magic, not an image
    expect((await put(p, Buffer.alloc(0))).statusCode).toBe(400);
    const big = Buffer.concat([await image('jpeg'), Buffer.alloc(1_048_576)]);
    expect((await put(p, big)).statusCode).toBe(413);
    expect((await put(p, await image('jpeg'), 'text/plain')).statusCode).toBe(400);
    expect((await put(p, await image('jpeg'), 'application/x-www-form-urlencoded')).statusCode).toBe(415);
    expect((await env.app.inject({ method: 'PUT', url: '/v1/me/photo', payload: await image('jpeg'), headers: { 'content-type': 'image/jpeg' } })).statusCode).toBe(401);
  });

  it('DELETE removes the photo; GET is authenticated and respects visibility', async () => {
    const owner = await registerPlayer(env);
    const viewer = await registerPlayer(env);
    await put(owner, await image('png'), 'image/png');
    expect((await env.app.inject({ url: `/v1/photos/${owner.id}` })).statusCode).toBe(401);
    expect((await call(env, viewer, 'GET', `/v1/photos/${owner.id}`)).statusCode).toBe(200);
    await call(env, owner, 'POST', '/v1/blocks', { playerId: viewer.id });
    expect((await call(env, viewer, 'GET', `/v1/photos/${owner.id}`)).statusCode).toBe(404);
    expect((await call(env, owner, 'GET', `/v1/photos/${owner.id}`)).statusCode).toBe(200);
    expect((await call(env, owner, 'DELETE', '/v1/me/photo')).statusCode).toBe(204);
    expect((await call(env, owner, 'GET', `/v1/photos/${owner.id}`)).statusCode).toBe(404);
    expect((await call(env, owner, 'GET', '/v1/me')).json().photoUrl).toBeNull();
  });

  it('replacing a photo removes the old file', async () => {
    const p = await registerPlayer(env);
    await put(p, await image('jpeg'));
    const before = new Set(await readdir(env.photoDir));
    await put(p, await image('png'), 'image/png');
    const after = await readdir(env.photoDir);
    expect(after.filter((f) => !before.has(f))).toHaveLength(1);
    expect(after.filter((f) => before.has(f)).length).toBe(before.size - 1);
  });
});

const admin = (method: 'GET' | 'POST', url: string, payload?: unknown, token: string | null = ADMIN_TOKEN) =>
  env.app.inject({ method, url, ...(payload !== undefined ? { payload: payload as object } : {}), headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('reports and admin', () => {
  it('stores a snapshot that survives the target changing nickname and deleting the photo', async () => {
    const reporter = await registerPlayer(env);
    const target = await registerPlayer(env, { nickname: 'Evidence' });
    await put(target, await image('jpeg'));
    const r = await call(env, reporter, 'POST', '/v1/reports', { targetPlayerId: target.id, kind: 'photo', note: 'rude' });
    expect(r.statusCode).toBe(201);
    await call(env, target, 'PUT', '/v1/me', { nickname: 'Changed', rankKey: 'novice', level: 1, multiplayerEnabled: true, timezone: 'UTC' });
    await call(env, target, 'DELETE', '/v1/me/photo');

    const list = (await admin('GET', '/admin/reports')).json();
    const rep = list.find((x: { targetPlayerId: string }) => x.targetPlayerId === target.id);
    expect(rep).toMatchObject({ kind: 'photo', note: 'rude', status: 'open', reporterPlayerId: reporter.id, snapshot: { nickname: 'Evidence', hasPhoto: true } });
    const one = (await admin('GET', `/admin/reports/${rep.id}`)).json();
    expect(one.target).toMatchObject({ nickname: 'Changed', hasPhoto: false });
    const photo = await admin('GET', `/admin/reports/${rep.id}/photo`);
    expect(photo.statusCode).toBe(200);
    expect((await sharp(photo.rawPayload).metadata()).width).toBe(256);

    // erasure of the target keeps the evidence
    await call(env, target, 'DELETE', '/v1/me');
    const after = (await admin('GET', `/admin/reports/${rep.id}`)).json();
    expect(after.snapshot).toMatchObject({ nickname: 'Evidence', hasPhoto: true });
    expect(after.targetPlayerId).toBeNull();
    expect((await admin('GET', `/admin/reports/${rep.id}/photo`)).statusCode).toBe(200);
    expect((await admin('POST', `/admin/reports/${rep.id}/resolve`, { action: 'ban' })).statusCode).toBe(409);
    expect((await admin('POST', `/admin/reports/${rep.id}/resolve`, { action: 'dismiss' })).statusCode).toBe(200);
  });

  it('validates reports', async () => {
    const a = await registerPlayer(env);
    const b = await registerPlayer(env);
    expect((await call(env, a, 'POST', '/v1/reports', { targetPlayerId: a.id, kind: 'player' })).statusCode).toBe(403);
    expect((await call(env, a, 'POST', '/v1/reports', { targetPlayerId: b.id, kind: 'spam' })).statusCode).toBe(400);
    expect((await call(env, a, 'POST', '/v1/reports', { targetPlayerId: b.id, kind: 'player', note: 'x'.repeat(501) })).statusCode).toBe(400);
    expect((await call(env, a, 'POST', '/v1/reports', { targetPlayerId: '00000000-0000-4000-8000-000000000000', kind: 'player' })).statusCode).toBe(404);
    expect((await env.app.inject({ method: 'POST', url: '/v1/reports', payload: {} })).statusCode).toBe(401);
  });

  it('requires the admin token (constant-time compare) on every /admin route', async () => {
    for (const token of [null, 'wrong', ADMIN_TOKEN.slice(0, -1), `${ADMIN_TOKEN}x`]) {
      for (const [m, u] of [['GET', '/admin/reports'], ['GET', '/admin/players'], ['GET', '/admin/reports/1'], ['POST', '/admin/players/00000000-0000-4000-8000-000000000000/unban']] as const) {
        const r = await admin(m, u, m === 'POST' ? {} : undefined, token);
        expect(r.statusCode, `${m} ${u} ${token}`).toBe(401);
        expect(r.json().error.code).toBe('unauthorized');
      }
    }
    const player = await registerPlayer(env);
    expect((await call(env, player, 'GET', '/admin/reports')).statusCode).toBe(401); // a player token is not an admin token
  });

  it('resolves with each action and writes the audit log', async () => {
    const reporter = await registerPlayer(env);
    const mk = async (nick: string) => {
      const t = await registerPlayer(env, { nickname: nick });
      await put(t, await image('jpeg'));
      await call(env, reporter, 'POST', '/v1/reports', { targetPlayerId: t.id, kind: 'player' });
      const rep = (await admin('GET', '/admin/reports?limit=200')).json().find((x: { targetPlayerId: string }) => x.targetPlayerId === t.id);
      return { t, rep };
    };
    const a = await mk('dismissme');
    expect((await admin('POST', `/admin/reports/${a.rep.id}/resolve`, { action: 'dismiss' })).json()).toMatchObject({ status: 'resolved', resolution: 'dismiss' });
    expect((await call(env, a.t, 'GET', '/v1/me')).json().nickname).toBe('dismissme');
    expect((await admin('POST', `/admin/reports/${a.rep.id}/resolve`, { action: 'dismiss' })).statusCode).toBe(409);

    const b = await mk('rmphoto');
    await admin('POST', `/admin/reports/${b.rep.id}/resolve`, { action: 'remove_photo' });
    expect((await call(env, b.t, 'GET', '/v1/me')).json().photoUrl).toBeNull();

    const c = await mk('resetme');
    await admin('POST', `/admin/reports/${c.rep.id}/resolve`, { action: 'reset_nickname' });
    expect((await call(env, c.t, 'GET', '/v1/me')).json().nickname).toBe('');

    const d = await mk('banme');
    await admin('POST', `/admin/reports/${d.rep.id}/resolve`, { action: 'ban', note: 'abuse' });
    expect((await call(env, d.t, 'GET', '/v1/me')).json().banned).toBe(true);
    const found = (await admin('GET', '/admin/players?search=banme&banned=true')).json();
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ playerId: d.t.id, banned: true, banReason: 'abuse' });
    expect((await admin('POST', `/admin/players/${d.t.id}/unban`)).statusCode).toBe(200);
    expect((await call(env, d.t, 'GET', '/v1/me')).json().banned).toBe(false);
    expect((await admin('GET', `/admin/players?search=${d.t.id}`)).json()).toHaveLength(1);
    expect((await admin('GET', '/admin/players?search=%25')).json()).toHaveLength(0); // wildcards are escaped

    const audit = (await env.db.query('SELECT action FROM admin_audit ORDER BY id')).rows.map((r) => r.action);
    expect(audit).toEqual(expect.arrayContaining(['report.dismiss', 'report.remove_photo', 'report.reset_nickname', 'report.ban', 'player.unban']));
    expect((await admin('POST', `/admin/reports/${a.rep.id}/resolve`, { action: 'nuke' })).statusCode).toBe(400);
    expect((await admin('GET', '/admin/reports?status=open')).json().some((x: { id: number }) => x.id === a.rep.id)).toBe(false);
  });
});
