SET lock_timeout = '5s';

-- Additive: old application versions ignore this table. No locks or scans on existing tables.
CREATE TABLE rate_limit_buckets (
  key text PRIMARY KEY,
  hits bigint NOT NULL,
  expires_at timestamptz NOT NULL
);
-- The table is new and empty, so this index does not need CONCURRENTLY.
CREATE INDEX rate_limit_buckets_expiry_idx ON rate_limit_buckets (expires_at);
