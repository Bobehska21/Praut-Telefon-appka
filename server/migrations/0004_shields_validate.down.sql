SET lock_timeout = '5s';

-- Down migration of 0004: back to the state after 0003 (old 'killed'-only constraint enforced next to the NOT VALID
-- notifications_kind_check2). DATA LOSS by design: 'shield_earned' / 'shield_blocked' notifications are deleted first,
-- because the restored old constraint only allows 'killed' and such rows would violate it.
-- Order: delete the rows, then re-add the old constraint as NOT VALID, and only then is it safe for 0003's down to
-- drop notifications_kind_check2. It is deliberately NOT validated here: ADD CONSTRAINT and VALIDATE would run in one
-- transaction and keep an ACCESS EXCLUSIVE lock for the whole scan. NOT VALID is still enforced for every new row and
-- the DELETE above already removed the offending rows. notifications_kind_check2 and players_shields_range stay (they
-- are dropped by 0003's down). Rollback runbook: revert the code first, then 0004 down, then 0003 down.
DELETE FROM notifications WHERE kind IN ('shield_earned', 'shield_blocked');
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN ('killed')) NOT VALID;
