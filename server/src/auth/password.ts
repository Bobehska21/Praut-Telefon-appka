import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Passwords are hashed with scrypt (node:crypto, no native dependency, available on every Node >= 22; the
 * built-in argon2 only exists from Node 24). Per-user random 16-byte salt, 32-byte key. The stored string
 * carries its own parameters, so the cost can be raised later and old hashes are upgraded on the next login.
 *
 * Default cost N=2^15, r=8, p=3 (about 32 MiB, ~100 ms): an OWASP-listed scrypt configuration.
 */
export const SCRYPT_R = 8;
export const SCRYPT_P = 3;
const KEY_LEN = 32;

export interface ScryptParams {
  log2n: number;
  r: number;
  p: number;
}

export function currentParams(log2n: number): ScryptParams {
  return { log2n, r: SCRYPT_R, p: SCRYPT_P };
}

function derive(password: string, salt: Buffer, p: ScryptParams): Promise<Buffer> {
  const N = 2 ** p.log2n;
  const opts: ScryptOptions = { N, r: p.r, p: p.p, maxmem: 256 * N * p.r + 1024 * 1024 };
  return new Promise((resolve, reject) =>
    // NFKC so the same password typed on different keyboards/IMEs hashes the same.
    scrypt(password.normalize('NFKC'), salt, KEY_LEN, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string, params: ScryptParams): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, params);
  return `scrypt$${params.log2n}$${params.r}$${params.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

interface Parsed extends ScryptParams {
  salt: Buffer;
  key: Buffer;
}

function parse(stored: string): Parsed | null {
  const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/.exec(stored);
  if (!m) return null;
  const [log2n, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Bounds guard against a tampered row turning verification into a memory/CPU bomb.
  if (log2n < 10 || log2n > 20 || r < 1 || r > 32 || p < 1 || p > 16) return null;
  return { log2n, r, p, salt: Buffer.from(m[4]!, 'base64'), key: Buffer.from(m[5]!, 'base64') };
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  const key = await derive(password, parsed.salt, parsed);
  return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
}

/** True when the stored hash was made with a weaker cost than the current one. */
export function needsRehash(stored: string, params: ScryptParams): boolean {
  const p = parse(stored);
  return !p || p.log2n < params.log2n || p.r < params.r || p.p < params.p;
}
