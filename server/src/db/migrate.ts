import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db } from './pool';

const LOCK_KEY = 727_001;

interface Migration {
  name: string;
  up: string;
  down: string;
}

async function load(dir: string): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.up.sql')).sort();
  const out: Migration[] = [];
  for (const f of files) {
    const name = f.replace(/\.up\.sql$/, '');
    out.push({
      name,
      up: await readFile(join(dir, f), 'utf8'),
      down: await readFile(join(dir, `${name}.down.sql`), 'utf8'),
    });
  }
  return out;
}

/** Applies pending migrations (`up`) or reverts the last `steps` ones (`down`). Returns the migration names touched. */
export async function migrate(db: Db, dir: string, direction: 'up' | 'down', steps = 1): Promise<string[]> {
  const client = await db.connect();
  const touched: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const applied = new Set<string>(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
    );
    const all = await load(dir);
    const queue =
      direction === 'up'
        ? all.filter((m) => !applied.has(m.name))
        : all.filter((m) => applied.has(m.name)).reverse().slice(0, steps);
    for (const m of queue) {
      try {
        await client.query('BEGIN');
        await client.query(direction === 'up' ? m.up : m.down);
        if (direction === 'up') await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [m.name]);
        else await client.query('DELETE FROM schema_migrations WHERE name = $1', [m.name]);
        await client.query('COMMIT');
        touched.push(m.name);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
  return touched;
}
