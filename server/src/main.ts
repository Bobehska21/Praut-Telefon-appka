import { loadConfig } from './config';
import { createPool } from './db/pool';
import { systemClock } from './clock';
import { LocalDiskStorage } from './storage';
import { S3Storage } from './s3-storage';
import { buildApp } from './app';

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig(); // fail fast when a required variable is missing or invalid
} catch (e) {
  console.error(JSON.stringify({ level: 'fatal', msg: (e as Error).message }));
  process.exit(1);
}
const db = createPool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  statementTimeoutMs: config.dbStatementTimeoutMs,
});
const storage = config.photoStorage === 's3' ? new S3Storage(config.s3!) : new LocalDiskStorage(config.photoDir);
const app = await buildApp({ config, db, clock: systemClock, storage });

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'shutting down');
  const timer = setTimeout(() => {
    app.log.error('shutdown timed out, forcing exit');
    process.exit(1);
  }, config.shutdownTimeoutMs);
  timer.unref();
  try {
    await app.close(); // stops accepting, waits for in-flight requests (long polls exit on shuttingDown)
    await db.end();
    process.exit(0);
  } catch (e) {
    app.log.error({ err: (e as Error).message }, 'error during shutdown');
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
