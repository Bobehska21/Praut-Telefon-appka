SET lock_timeout = '5s';

-- Shields (phase 1), EXPAND step only: new columns with constant defaults and new NOT VALID constraints.
-- Nothing is validated, dropped or rewritten here; that is 0004_shields_validate (the runner uses one
-- transaction per file, so VALIDATE must not share a transaction with the ACCESS EXCLUSIVE locks taken below).
-- Safe with the previous application version still running: it never reads or writes the new columns and only
-- inserts notification kind 'killed'.
--
-- NOTE: until 0004 has run, the old notifications_kind_check ('killed' only) is still enforced, so the new
-- notification kinds can only be inserted once 0004 is applied. Deploy 0003 and 0004 before the code that writes them.

-- players.shields: 0..3, visible only to the owner.
ALTER TABLE players ADD COLUMN shields smallint NOT NULL DEFAULT 0;
ALTER TABLE players ADD CONSTRAINT players_shields_range CHECK (shields BETWEEN 0 AND 3) NOT VALID;

-- Credited focus time of one session (only heartbeat credit counts) and whether it already earned its shield.
ALTER TABLE focus_sessions ADD COLUMN credited_ms bigint NOT NULL DEFAULT 0;
ALTER TABLE focus_sessions ADD COLUMN shield_awarded boolean NOT NULL DEFAULT false;

-- A kill absorbed by a shield is NOT a kill: it creates no row in `kills` (so stats and the leaderboard never see
-- it) and is recorded only on the challenge, which makes a replay of the same challenge return the same result.
ALTER TABLE kill_challenges ADD COLUMN shield_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE kill_challenges ADD COLUMN resolved_at timestamptz;

-- New notification kinds 'shield_earned' and 'shield_blocked'. Added under a NEW name and NOT VALID; the old
-- constraint stays in place (and enforced) until 0004 validates this one and drops the old one.
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check2
  CHECK (kind IN ('killed', 'shield_earned', 'shield_blocked')) NOT VALID;
