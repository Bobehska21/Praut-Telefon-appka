import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify, type KeyObject } from 'node:crypto';

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
export function newNonce(): string {
  return randomBytes(16).toString('base64');
}

/** Constant-time string comparison (compares fixed-length digests, so length is not leaked either). */
export function safeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}

/** Parses an SPKI DER (base64) key and requires it to be an EC P-256 public key. Returns null if not. */
export function parsePublicKey(b64: string): KeyObject | null {
  try {
    const key = createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return null;
    return key;
  } catch {
    return null;
  }
}

export function canonicalKillString(challengeId: string, nonce: string, victimId: string, killerId: string): string {
  return `focus-kill-v1|${challengeId}|${nonce}|${victimId}|${killerId}`;
}

export function verifyKillSignature(publicKeyB64: string, canonical: string, signatureB64: string): boolean {
  const key = parsePublicKey(publicKeyB64);
  if (!key) return false;
  try {
    return verify('sha256', Buffer.from(canonical, 'utf8'), { key, dsaEncoding: 'der' }, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}
