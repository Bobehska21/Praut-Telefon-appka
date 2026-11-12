import { resolve } from 'node:path';
import { createPool } from '../src/db/pool';
import { migrate } from '../src/db/migrate';

const direction = process.argv[2] === 'down' ? 'down' : 'up';
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const db = createPool({ connectionString: url, max: 1, statementTimeoutMs: 60_000 });
try {
  const dir = resolve(process.env.MIGRATIONS_DIR ?? 'migrations');
  const done = await migrate(db, dir, direction);
  console.log(done.length ? `${direction}: ${done.join(', ')}` : `${direction}: nothing to do`);
} finally {
  await db.end();
}
