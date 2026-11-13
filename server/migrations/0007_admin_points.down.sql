SET lock_timeout = '5s';

-- Down migration of 0007 (run after 0008's down). DATA LOSS by design: which accounts are admins, and the actor and
-- note recorded on audit rows, are deleted. Ledger rows of kind 'admin_adjust' were already removed by 0008's down.
ALTER TABLE points_ledger DROP CONSTRAINT IF EXISTS points_ledger_kind_check3;
ALTER TABLE admin_audit DROP COLUMN note;
ALTER TABLE admin_audit DROP COLUMN actor_player_id;
ALTER TABLE accounts DROP COLUMN is_admin;
