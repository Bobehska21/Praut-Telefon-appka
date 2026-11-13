SET lock_timeout = '5s';

-- Down migration of 0006: back to the state after 0005 (old three-kind constraint enforced next to the NOT VALID
-- points_ledger_kind_check2). DATA LOSS by design: 'bet_bonus' / 'bet_penalty' ledger rows are deleted first, because
-- the restored old constraint only allows 'minute', 'kill' and 'penalty' (this changes players' point totals).
-- The old constraint is deliberately NOT validated here (ADD and VALIDATE in one transaction would hold an ACCESS
-- EXCLUSIVE lock for the whole scan); it is still enforced for every new row and the DELETE already removed offenders.
-- Rollback runbook: revert the code first, then 0006 down, then 0005 down.
DELETE FROM points_ledger WHERE kind IN ('bet_bonus', 'bet_penalty');
ALTER TABLE points_ledger ADD CONSTRAINT points_ledger_kind_check CHECK (kind IN ('minute', 'kill', 'penalty')) NOT VALID;
