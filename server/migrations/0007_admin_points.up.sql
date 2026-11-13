SET lock_timeout = '5s';

-- Admin accounts and manual point adjustments, EXPAND step only (the contract step is 0008_admin_points_validate,
-- kept separate so VALIDATE does not share a transaction with the locks taken here).
-- Safe with the previous application version still running: it never reads the new columns and only inserts the
-- ledger kinds it already knew.
--
-- NOTE: until 0008 has run, the old points_ledger_kind_check2 is still enforced, so 'admin_adjust' rows can only be
-- inserted once 0008 is applied. Deploy 0007 and 0008 before the code that writes them.

-- Admin rights live on the account and are checked on the server for every admin request. Nothing in the API can set
-- this flag; it is set by the operator (scripts/seed-admin.ts or SQL).
ALTER TABLE accounts ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- Who did it and why. Nullable: rows written by the older token-based admin API have neither. No foreign key, like the
-- rest of the audit trail, so it survives deletion of players.
ALTER TABLE admin_audit ADD COLUMN actor_player_id uuid;
ALTER TABLE admin_audit ADD COLUMN note text;

-- New ledger kind 'admin_adjust' (a manual correction by an admin, positive or negative). Added under a NEW name and
-- NOT VALID; the old constraint stays enforced until 0008 validates this one and drops the old one.
ALTER TABLE points_ledger ADD CONSTRAINT points_ledger_kind_check3
  CHECK (kind IN ('minute', 'kill', 'penalty', 'bet_bonus', 'bet_penalty', 'admin_adjust')) NOT VALID;
