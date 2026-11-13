import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S3Storage } from '../src/s3-storage';
const config = { endpoint: 'https://storage.example.test:9443', region: 'us-east-1', bucket: 'test-photos', accessKeyId: 'test-access', secretAccessKey: 'test-secret', prefix: 'photos/', timeoutMs: 5000 };
const fetchMock = vi.fn<typeof fetch>();
const objectName = '12345678-abcd';
let storage: S3Storage;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  storage = new S3Storage(config);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('private S3 storage', () => {
  it('uploads JPEG with signed path-style requests, a timeout and no redirects or public ACL', async () => {
    await storage.put(objectName, Buffer.from('jpeg'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`https://storage.example.test:9443/test-photos/photos/${objectName}.jpg`);
    expect(init).toMatchObject({ method: 'PUT', redirect: 'error', body: new Uint8Array(Buffer.from('jpeg')) });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).toMatchObject({ 'content-type': 'image/jpeg', 'x-amz-date': '20261113T120000Z', authorization: expect.stringMatching(/^AWS4-HMAC-SHA256 Credential=test-access\/20261113\/us-east-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[a-f0-9]{64}$/) });
    // Fixed request vector, independently calculated with Python hashlib/hmac.
    expect((init?.headers as Record<string, string>).authorization).toBe('AWS4-HMAC-SHA256 Credential=test-access/20261113/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=cb681d558296e52c5c93ea86476066ac4b7562ba02ef298d4e173cd2d4e01851');
    expect(JSON.stringify(init)).not.toContain('test-secret');
    expect(init?.headers).not.toHaveProperty('x-amz-acl');
  });
  it('signs temporary session credentials', async () => {
    await new S3Storage({ ...config, sessionToken: 'temporary-session' }).delete(objectName);
    expect(fetchMock.mock.calls[0]![1]!.headers).toMatchObject({ 'x-amz-security-token': 'temporary-session', authorization: expect.stringContaining(';x-amz-security-token, Signature=') });
  });
  it('reads bytes and treats only 404 as a missing photo', async () => {
    fetchMock.mockResolvedValueOnce(new Response('jpeg')).mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await storage.get(objectName)).toEqual(Buffer.from('jpeg'));
    expect(await storage.get(objectName)).toBeNull();
    for (const status of [403, 500, 301]) {
      fetchMock.mockResolvedValueOnce(new Response('private provider details', { status }));
      await expect(storage.get(objectName)).rejects.toThrow(`S3 GET failed (HTTP ${status})`);
    }
  });
  it('does not reveal signed requests on network failures', async () => {
    fetchMock.mockRejectedValue(new Error('test-secret'));
    await expect(storage.get(objectName)).rejects.toThrow(/^S3 GET request failed$/);
  });
  it('rejects invalid keys before making requests', async () => {
    for (const bad of ['../private', 'a/bcdefgh', 'short', 'A'.repeat(80), 'a'.repeat(81)]) await expect(storage.get(bad)).rejects.toThrow('invalid storage key');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('bounds uploads and chunked downloads', async () => {
    await expect(storage.put(objectName, Buffer.alloc(1_048_577))).rejects.toThrow(/size limit/);
    expect(fetchMock).not.toHaveBeenCalled();
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1_048_577)); }, cancel })));
    await expect(storage.get(objectName)).rejects.toThrow(/size limit/);
    expect(cancel).toHaveBeenCalled();
  });
});
