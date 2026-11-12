import pg from 'pg';

// int8 (ids, counts) fit in a JS number here; `date` stays a plain 'YYYY-MM-DD' string.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1082, (v) => v);

export type Db = pg.Pool;
export type Queryable = pg.Pool | pg.PoolClient;

export interface PoolOptions {
  connectionString: string;
  max: number;
  statementTimeoutMs: number;
  /** Test isolation: every connection of this pool lives in one schema. */
  schema?: string;
}

export function createPool(o: PoolOptions): Db {
  return new pg.Pool({
    connectionString: o.connectionString,
    max: o.max,
    statement_timeout: o.statementTimeoutMs,
    idle_in_transaction_session_timeout: 30_000,
    connectionTimeoutMillis: 5_000,
    ...(o.schema ? { options: `-c search_path=${o.schema}` } : {}),
  });
}

export async function withTx<T>(db: Db, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
