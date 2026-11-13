import { randomUUID } from 'node:crypto';
import { createPool } from '../src/db/pool';
import { currentParams, hashPassword } from '../src/auth/password';

/**
 * Creates (or resets) the account `ADMIN_SEED_USERNAME` (default "admin") with admin rights, for DEVELOPMENT.
 * The password comes from ADMIN_SEED_PASSWORD and is never stored anywhere but as a scrypt hash. Refused when
 * NODE_ENV=production: a production admin must be created deliberately, with a strong password, by the operator.
 * The account has no device key until the first login from the app, which stores the phone's key.
 */
const url = process.env.DATABASE_URL;
const password = process.env.ADMIN_SEED_PASSWORD;
const username = (process.env.ADMIN_SEED_USERNAME ?? 'admin').trim();
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed an admin account in production');
  process.exit(1);
}
if (!url || !password) {
  console.error('DATABASE_URL and ADMIN_SEED_PASSWORD are required');
  process.exit(1);
}
if (username.length < 3 || username.length > 20) {
  console.error('ADMIN_SEED_USERNAME must be 3 to 20 characters');
  process.exit(1);
}
const db = createPool({ connectionString: url, max: 1, statementTimeoutMs: 30_000 });
try {
  const hash = await hashPassword(password, currentParams(Number(process.env.PASSWORD_SCRYPT_LOG2N ?? 15)));
  const existing = await db.query<{ player_id: string }>('SELECT player_id FROM accounts WHERE username_lower = $1', [username.toLowerCase()]);
  if (existing.rows[0]) {
    await db.query('UPDATE accounts SET password_hash = $2, password_changed_at = now(), is_admin = true WHERE player_id = $1', [existing.rows[0].player_id, hash]);
    await db.query('DELETE FROM auth_tokens WHERE player_id = $1', [existing.rows[0].player_id]);
    console.log(`Updated account "${username}": password reset, admin rights on`);
  } else {
    const id = randomUUID();
    // public_key is replaced by the phone's key at the first login.
    await db.query("INSERT INTO players (id, public_key) VALUES ($1, 'unset')", [id]);
    await db.query('INSERT INTO accounts (player_id, username, username_lower, password_hash, is_admin) VALUES ($1, $2, $3, $4, true)', [id, username, username.toLowerCase(), hash]);
    console.log(`Created admin account "${username}"`);
  }
} finally {
  await db.end();
}
