SET lock_timeout = '5s';

-- Accounts (username + password) and revocable tokens. Expand step only: nothing is dropped.
-- players.token_hash is kept (now nullable) so the previous application version keeps working; a later
-- release drops it once no running version reads it.

-- Credentials live in their own table so a password hash is never loaded by a `SELECT * FROM players`.
CREATE TABLE accounts (
  player_id           uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  username            text NOT NULL CHECK (char_length(username) BETWEEN 3 AND 20),
  username_lower      text NOT NULL UNIQUE CHECK (username_lower = lower(username)),
  -- 'scrypt$<log2 N>$<r>$<p>$<salt b64>$<hash b64>': the parameters are stored so the cost can be raised later
  password_hash       text NOT NULL,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Several tokens per player so a token can be revoked (logout, password change, new login).
CREATE TABLE auth_tokens (
  token_hash bytea PRIMARY KEY,
  player_id  uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_player_idx ON auth_tokens (player_id);

-- Existing (anonymous) tokens keep working. The players table is small at this stage (pre-launch); a large
-- table would need a batched backfill.
INSERT INTO auth_tokens (token_hash, player_id)
SELECT token_hash, id FROM players WHERE token_hash IS NOT NULL
ON CONFLICT DO NOTHING;

-- Dropping NOT NULL is a catalog-only change.
ALTER TABLE players ALTER COLUMN token_hash DROP NOT NULL;

-- Failed-login counters, keyed by 'u:<username>' (all sources) and 'p:<username>|<ip>' (one source). Keyed by
-- the typed username whether or not the account exists, so the response never reveals which usernames exist.
CREATE TABLE login_attempts (
  key            text PRIMARY KEY,
  failures       integer NOT NULL,
  last_failed_at timestamptz NOT NULL,
  locked_until   timestamptz
);
CREATE INDEX login_attempts_last_failed_idx ON login_attempts (last_failed_at);
