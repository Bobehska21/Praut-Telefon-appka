import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
const base = { DATABASE_URL: 'postgresql://localhost/test', ADMIN_TOKEN: 'x'.repeat(32) };
const s3 = { PHOTO_STORAGE: 's3', S3_BUCKET: 'test-photos', S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test' };

describe('deployment configuration', () => {
  it('uses local services in development and requires shared services in production', () => {
    expect(loadConfig(base)).toMatchObject({ photoStorage: 'local', rateLimitStore: 'memory' });
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/production requires/);
    expect(() => loadConfig({ ...base, ...s3, NODE_ENV: 'production' })).toThrow(/production requires/);
    expect(loadConfig({ ...base, ...s3, NODE_ENV: 'production', RATE_LIMIT_STORE: 'postgres' })).toMatchObject({
      photoStorage: 's3', rateLimitStore: 'postgres', s3: { endpoint: 'https://s3.us-east-1.amazonaws.com' },
    });
  });
  it('requires S3 credentials', () => {
    expect(() => loadConfig({ ...base, PHOTO_STORAGE: 's3' })).toThrow(/S3_BUCKET/);
  });
  it.each(['http://storage.test', 'ftp://storage.test', 'https://user:password@storage.test', 'https://storage.test/path', 'https://storage.test?query=1', 'https://storage.test/#fragment'])(
    'rejects unsafe production endpoint %s', (S3_ENDPOINT) => {
      expect(() => loadConfig({ ...base, ...s3, NODE_ENV: 'production', RATE_LIMIT_STORE: 'postgres', S3_ENDPOINT })).toThrow(/S3_ENDPOINT/);
    },
  );
  it('allows local HTTP but rejects traversal prefixes', () => {
    expect(loadConfig({ ...base, ...s3, S3_ENDPOINT: 'http://localhost:9000' }).s3?.endpoint).toBe('http://localhost:9000');
    expect(() => loadConfig({ ...base, ...s3, S3_PREFIX: '../photos/' })).toThrow(/S3_PREFIX/);
  });
});
