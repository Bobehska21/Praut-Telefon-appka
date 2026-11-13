import { createHash, createHmac } from 'node:crypto';
import type { Config } from './config';
import type { PhotoStorage } from './storage';

const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();
const MAX_BYTES = 1_048_576;

/** Narrow S3 SigV4 adapter: private general-purpose buckets, path-style requests, explicit credentials.
 * No public URLs, ACLs, redirects, credential discovery or third-party runtime dependencies.
 * Signing specification: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
 */
export class S3Storage implements PhotoStorage {
  constructor(private readonly config: NonNullable<Config['s3']>) {}

  private async send(method: 'GET' | 'PUT' | 'DELETE', key: string, data?: Buffer): Promise<Response> {
    if (!/^[a-z0-9-]{8,80}$/.test(key)) throw new Error('invalid storage key');
    const c = this.config;
    const url = new URL(c.endpoint);
    url.pathname = `/${c.bucket}/${c.prefix}${key}.jpg`;
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = timestamp.slice(0, 8);
    const payloadHash = hash(data ?? '');
    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': timestamp,
      ...(c.sessionToken ? { 'x-amz-security-token': c.sessionToken } : {}),
    };
    const names = Object.keys(headers).sort();
    const signedHeaders = names.join(';');
    const canonical = [method, url.pathname, '', names.map((n) => `${n}:${headers[n]!.trim()}\n`).join(''), signedHeaders, payloadHash].join('\n');
    const scope = `${day}/${c.region}/s3/aws4_request`;
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${c.secretAccessKey}`, day), c.region), 's3'), 'aws4_request');
    const signature = hmac(signingKey, `AWS4-HMAC-SHA256\n${timestamp}\n${scope}\n${hash(canonical)}`).toString('hex');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    if (data) headers['content-type'] = 'image/jpeg';
    // host is set by fetch from the URL; it must be included in the signature.
    delete headers.host;
    let response: Response;
    try {
      response = await fetch(url, {
        method, headers, ...(data ? { body: new Uint8Array(data) } : {}),
        signal: AbortSignal.timeout(c.timeoutMs), redirect: 'error',
      });
    } catch {
      // Do not surface provider responses, signed headers or credentials in application logs.
      throw new Error(`S3 ${method} request failed`);
    }
    if (!response.ok && !(method === 'GET' && response.status === 404)) {
      await response.body?.cancel();
      throw new Error(`S3 ${method} failed (HTTP ${response.status})`);
    }
    return response;
  }

  async put(key: string, data: Buffer): Promise<void> {
    if (data.length > MAX_BYTES) throw new Error('Photo exceeds storage size limit');
    const r = await this.send('PUT', key, data);
    await r.body?.cancel();
  }

  async get(key: string): Promise<Buffer | null> {
    const r = await this.send('GET', key);
    if (r.status === 404) {
      await r.body?.cancel();
      return null;
    }
    // Bound memory even if the provider returns an unexpectedly large or chunked object.
    const reader = r.body?.getReader();
    if (!reader) return Buffer.alloc(0);
    const chunks: Buffer[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BYTES) throw new Error('Photo exceeds storage size limit');
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks, length);
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  }

  async delete(key: string): Promise<void> {
    const r = await this.send('DELETE', key);
    await r.body?.cancel();
  }
}
