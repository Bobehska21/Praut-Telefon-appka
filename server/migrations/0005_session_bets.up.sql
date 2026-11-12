SET lock_timeout = '5s';

-- Session bets (phase 1), EXPAND step only: new columns with constant defaults and new NOT VALID constraints.
-- Nothing is validated, dropped or rewritten here; that is 0006_session_bets_validate (one transaction per file, so
-- VALIDATE must not share a transaction with the ACCESS EXCLUSIVE locks taken below).
-- Safe with the previous application version still running: it never reads or writes the new columns and only
-- inserts the ledger kinds 'minute', 'kill' and 'penalty'.
--
-- NOTE: until 0006 has run, the old points_ledger_kind_check is still enforced, so the new ledger kinds can only be
-- inserted once 0006 is applied. Deploy 0005 and 0006 before the code that writes them.

-- Bet multiplier chosen when the session starts (1 = no bet, the previous behaviour) and the points the session
-- earned from heartbeats (the base of the bonus / penalty).
ALTER TABLE focus_sessions ADD COLUMN bet_multiplier smallint NOT NULL DEFAULT 1;
ALTER TABLE focus_sessions ADD COLUMN points_earned integer NOT NULL DEFAULT 0;
ALTER TABLE focus_sessions ADD CONSTRAINT focus_sessions_bet_multiplier_check CHECK (bet_multiplier IN (1, 2, 5, 10)) NOT VALID;

-- New ledger kinds 'bet_bonus' and 'bet_penalty'. Added under a NEW name and NOT VALID; the old constraint stays in
-- place (and enforced) until 0006 validates this one and drops the old one.
ALTER TABLE points_ledger ADD CONSTRAINT points_ledger_kind_check2
  CHECK (kind IN ('minute', 'kill', 'penalty', 'bet_bonus', 'bet_penalty')) NOT VALID;
