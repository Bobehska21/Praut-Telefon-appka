SET lock_timeout = '5s';

-- Down migration of 0008: back to the state after 0007 (the previous constraint enforced next to the NOT VALID
-- points_ledger_kind_check3). DATA LOSS by design: 'admin_adjust' ledger rows are deleted first, because the restored
-- constraint does not allow them (this changes players' point totals).
-- The restored constraint is deliberately NOT validated here (ADD and VALIDATE in one transaction would hold an ACCESS
-- EXCLUSIVE lock for the whole scan); it is still enforced for every new row and the DELETE already removed offenders.
-- Rollback runbook: revert the code first, then 0008 down, then 0007 down.
DELETE FROM points_ledger WHERE kind = 'admin_adjust';
ALTER TABLE points_ledger ADD CONSTRAINT points_ledger_kind_check2
  CHECK (kind IN ('minute', 'kill', 'penalty', 'bet_bonus', 'bet_penalty')) NOT VALID;
