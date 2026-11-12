SET lock_timeout = '5s';

-- Contract step of the session bets change. VALIDATE only takes SHARE UPDATE EXCLUSIVE, so reads and writes continue
-- (this is why it lives in its own migration, separate from the locks of 0005).
ALTER TABLE focus_sessions VALIDATE CONSTRAINT focus_sessions_bet_multiplier_check;
ALTER TABLE points_ledger VALIDATE CONSTRAINT points_ledger_kind_check2;

-- The replacement constraint is validated and enforced, so the old three-kind one can go.
ALTER TABLE points_ledger DROP CONSTRAINT points_ledger_kind_check;
