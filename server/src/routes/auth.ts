import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../app';
import { currentParams, hashPassword, needsRehash, verifyPassword } from '../auth/password';
import { clearFailures, lockedForSeconds, pairKey, recordFailure, userKey } from '../auth/throttle';
import { hashToken, newToken, parsePublicKey } from '../crypto';
import { withTx } from '../db/pool';
import { AppError } from '../errors';
import { checkNickname } from '../nickname';
import type { PlayerRow } from '../players';
import { isValidTimezone } from '../time';
import { profileView } from './me';

/** Private login name. Never shown to other players, but it must still pass the nickname blocklist in case it is shown by mistake. */
const username = z
  .string()
  .regex(/^[A-Za-z0-9._-]{3,20}$/, 'username must be 3-20 characters: letters, digits, . _ -')
  .superRefine((v, ctx) => {
    if (checkNickname(v) !== 'ok') ctx.addIssue({ code: 'custom', message: 'username is not allowed' });
  });
const password = z.string().min(8).max(128);
const publicKey = z.string().min(80).max(200);

const registerBody = z.object({
  username,
  password,
  publicKey,
  timezone: z.string().max(64).refine(isValidTimezone, 'invalid IANA timezone').optional(),
});
// Login is deliberately loose about the username format: a malformed one is just "invalid credentials".
const loginBody = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(128), publicKey });
const changeBody = z.object({ oldPassword: z.string().min(1).max(128), newPassword: password });

const INVALID = () => new AppError('invalid_credentials', 'Invalid username or password');

export const authRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock, config } = deps;
  const params = currentParams(config.passwordScryptLog2N);
  // Hashed once so an unknown username costs the same as a wrong password.
  let dummy: Promise<string> | undefined;
  const dummyHash = () => (dummy ??= hashPassword('dummy-password-for-timing', params));

  /** Lock check, password check and failure bookkeeping shared by login and password change. */
  async function checkCredentials(name: string, ip: string, pw: string, storedHash: string | null): Promise<void> {
    const keys = [userKey(name), pairKey(name, ip)];
    const retry = await lockedForSeconds(db, keys, clock.now());
    if (retry !== null) {
      throw new AppError('rate_limited', 'Too many failed attempts, try again later', { retryAfterSeconds: retry });
    }
    const ok = await verifyPassword(pw, storedHash ?? (await dummyHash()));
    if (!storedHash || !ok) {
      const now = clock.now();
      await Promise.all(keys.map((k) => recordFailure(db, k, now)));
      throw INVALID();
    }
    await clearFailures(db, keys);
  }

  // ---- public ----
  app.post(
    '/v1/auth/register',
    { config: { rateLimit: { max: config.rateLimit.registerPerHour, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const b = registerBody.parse(req.body);
      if (!parsePublicKey(b.publicKey)) {
        throw new AppError('validation', 'publicKey must be a base64 SPKI DER ECDSA P-256 key', { issues: [{ path: 'publicKey' }] });
      }
      const hash = await hashPassword(b.password, params);
      const token = newToken();
      try {
        const id = await withTx(db, async (c) => {
          const p = await c.query<{ id: string }>('INSERT INTO players (public_key, timezone) VALUES ($1, $2) RETURNING id', [b.publicKey, b.timezone ?? 'UTC']);
          const playerId = p.rows[0]!.id;
          await c.query('INSERT INTO accounts (player_id, username, username_lower, password_hash) VALUES ($1, $2, $3, $4)', [
            playerId, b.username, b.username.toLowerCase(), hash,
          ]);
          await c.query('INSERT INTO auth_tokens (token_hash, player_id) VALUES ($1, $2)', [hashToken(token), playerId]);
          return playerId;
        });
        return reply.status(201).send({ playerId: id, token });
      } catch (e) {
        const pe = e as { code?: string; constraint?: string };
        if (pe.code === '23505' && pe.constraint === 'accounts_username_lower_key') {
          throw new AppError('username_taken', 'Username is already taken');
        }
        throw e;
      }
    },
  );

  app.post(
    '/v1/auth/login',
    { config: { rateLimit: { max: config.rateLimit.loginPerMin, timeWindow: '1 minute' } } },
    async (req) => {
      const b = loginBody.parse(req.body);
      if (!parsePublicKey(b.publicKey)) {
        throw new AppError('validation', 'publicKey must be a base64 SPKI DER ECDSA P-256 key', { issues: [{ path: 'publicKey' }] });
      }
      const name = b.username.toLowerCase();
      const acc = (
        await db.query<{ player_id: string; password_hash: string; banned_at: Date | null }>(
          'SELECT a.player_id, a.password_hash, p.banned_at FROM accounts a JOIN players p ON p.id = a.player_id WHERE a.username_lower = $1',
          [name],
        )
      ).rows[0];
      await checkCredentials(name, req.ip, b.password, acc?.password_hash ?? null);
      if (acc!.banned_at) throw new AppError('forbidden', 'This account is not allowed to sign in');

      const rehash = needsRehash(acc!.password_hash, params) ? await hashPassword(b.password, params) : null;
      const token = newToken();
      const player = await withTx(db, async (c) => {
        // Serialises concurrent logins of the same account so exactly one token survives.
        await c.query('SELECT 1 FROM players WHERE id = $1 FOR UPDATE', [acc!.player_id]);
        // One active device: the new key replaces the old one and every earlier token is revoked.
        const p = await c.query<PlayerRow>('UPDATE players SET public_key = $2 WHERE id = $1 RETURNING *', [acc!.player_id, b.publicKey]);
        await c.query('DELETE FROM auth_tokens WHERE player_id = $1', [acc!.player_id]);
        await c.query('INSERT INTO auth_tokens (token_hash, player_id) VALUES ($1, $2)', [hashToken(token), acc!.player_id]);
        if (rehash) await c.query('UPDATE accounts SET password_hash = $2 WHERE player_id = $1', [acc!.player_id, rehash]);
        return p.rows[0]!;
      });
      return { playerId: player.id, token, profile: profileView(player, clock.now()) };
    },
  );
};

export const authedAuthRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  const { db, clock, config } = deps;
  const params = currentParams(config.passwordScryptLog2N);

  app.post('/auth/logout', async (req, reply) => {
    await db.query('DELETE FROM auth_tokens WHERE token_hash = $1', [req.tokenHash]);
    return reply.status(204).send();
  });

  app.post(
    '/auth/password',
    { config: { rateLimit: { max: config.rateLimit.loginPerMin, timeWindow: '1 minute', keyGenerator: (r) => r.headers.authorization ?? r.ip } } },
    async (req, reply) => {
      const b = changeBody.parse(req.body);
      const acc = (await db.query<{ username_lower: string; password_hash: string }>('SELECT username_lower, password_hash FROM accounts WHERE player_id = $1', [req.player.id])).rows[0];
      if (!acc) throw new AppError('conflict', 'This account has no password');
      // Same lock and backoff as login: a stolen token must not allow guessing the old password.
      const keys = [userKey(acc.username_lower), pairKey(acc.username_lower, req.ip)];
      const retry = await lockedForSeconds(db, keys, clock.now());
      if (retry !== null) throw new AppError('rate_limited', 'Too many failed attempts, try again later', { retryAfterSeconds: retry });
      if (!(await verifyPassword(b.oldPassword, acc.password_hash))) {
        const now = clock.now();
        await Promise.all(keys.map((k) => recordFailure(db, k, now)));
        throw new AppError('invalid_credentials', 'Invalid username or password');
      }
      await clearFailures(db, keys);
      const hash = await hashPassword(b.newPassword, params);
      await withTx(db, async (c) => {
        await c.query('UPDATE accounts SET password_hash = $2, password_changed_at = $3 WHERE player_id = $1', [req.player.id, hash, clock.now()]);
        await c.query('DELETE FROM auth_tokens WHERE player_id = $1 AND token_hash <> $2', [req.player.id, req.tokenHash]);
      });
      return reply.status(204).send();
    },
  );
};
