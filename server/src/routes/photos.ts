import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import sharp from 'sharp';
import { z } from 'zod';
import type { Deps } from '../app';
import { AppError } from '../errors';
import { getPlayer, isBlockedEitherWay, photoUrl } from '../players';
import { uuid } from '../schemas';

export const MAX_PHOTO_BYTES = 1_048_576;

export function sniffImage(b: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Re-encodes to a 256x256 JPEG. Metadata (EXIF, GPS, ICC) is not copied by sharp unless asked, so it is stripped. */
export async function normalizePhoto(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input, { limitInputPixels: 25_000_000, failOn: 'error' })
      .rotate() // apply EXIF orientation before the metadata is dropped
      .resize(256, 256, { fit: 'cover' })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    throw new AppError('validation', 'Invalid or unsupported image');
  }
}

export const photoRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock, storage } = deps;

  app.addContentTypeParser(['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'], { parseAs: 'buffer', bodyLimit: MAX_PHOTO_BYTES }, (_req, body, done) => done(null, body));

  app.put('/me/photo', { bodyLimit: MAX_PHOTO_BYTES }, async (req) => {
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new AppError('validation', 'Expected a raw image body');
    if (!sniffImage(body)) throw new AppError('validation', 'Only JPEG, PNG or WebP images are accepted');
    const jpeg = await normalizePhoto(body);
    const key = randomUUID();
    await storage.put(key, jpeg);
    const old = (await db.query<{ photo_key: string | null }>('SELECT photo_key FROM players WHERE id = $1', [req.player.id])).rows[0]?.photo_key;
    const r = await db.query<{ id: string; photo_key: string; photo_updated_at: Date }>(
      'UPDATE players SET photo_key = $2, photo_updated_at = $3 WHERE id = $1 RETURNING id, photo_key, photo_updated_at',
      [req.player.id, key, clock.now()],
    );
    if (old) await storage.delete(old);
    return { photoUrl: photoUrl(r.rows[0]!) };
  });

  app.delete('/me/photo', async (req, reply) => {
    const old = (await db.query<{ photo_key: string | null }>(
      'UPDATE players p SET photo_key = NULL, photo_updated_at = NULL FROM players o WHERE p.id = o.id AND p.id = $1 RETURNING o.photo_key',
      [req.player.id],
    )).rows[0]?.photo_key;
    if (old) await storage.delete(old);
    return reply.status(204).send();
  });

  app.get('/photos/:playerId', async (req, reply) => {
    const { playerId } = z.object({ playerId: uuid }).parse(req.params);
    const target = await getPlayer(db, playerId);
    const own = playerId === req.player.id;
    let visible =
      target && target.photo_key && (own || (target.multiplayer_enabled && !target.banned_at && !(await isBlockedEitherWay(db, req.player.id, playerId))));
    // An admin reviewing players must see every photo, also of players who switched multiplayer off or are banned.
    if (!visible && target?.photo_key) {
      visible = (await db.query<{ is_admin: boolean }>('SELECT is_admin FROM accounts WHERE player_id = $1', [req.player.id])).rows[0]?.is_admin === true;
    }
    if (!target || !visible) throw new AppError('not_found', 'Photo not found');
    const data = await storage.get(target.photo_key!);
    if (!data) throw new AppError('not_found', 'Photo not found');
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=3600').send(data);
  });
};
