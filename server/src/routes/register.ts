import type { FastifyPluginAsync } from 'fastify';
import type { Deps } from '../app';
import { hashToken, newToken, parsePublicKey } from '../crypto';
import { AppError } from '../errors';
import { registerBody } from '../schemas';

export const registerRoutes: FastifyPluginAsync<{ deps: Deps }> = async (app, { deps }) => {
  app.post(
    '/v1/register',
    { config: { rateLimit: { max: deps.config.rateLimit.registerPerHour, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const body = registerBody.parse(req.body);
      if (!parsePublicKey(body.publicKey)) {
        throw new AppError('validation', 'publicKey must be a base64 SPKI DER ECDSA P-256 key', { issues: [{ path: 'publicKey' }] });
      }
      const token = newToken();
      const r = await deps.db.query<{ id: string }>(
        'INSERT INTO players (token_hash, public_key) VALUES ($1, $2) RETURNING id',
        [hashToken(token), body.publicKey],
      );
      return reply.status(201).send({ playerId: r.rows[0]!.id, token });
    },
  );
};
