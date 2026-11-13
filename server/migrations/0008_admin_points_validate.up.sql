SET lock_timeout = '5s';

-- Contract step of the admin points change. VALIDATE only takes SHARE UPDATE EXCLUSIVE, so reads and writes continue.
ALTER TABLE points_ledger VALIDATE CONSTRAINT points_ledger_kind_check3;

-- The replacement constraint is validated and enforced, so the previous one can go.
ALTER TABLE points_ledger DROP CONSTRAINT points_ledger_kind_check2;
