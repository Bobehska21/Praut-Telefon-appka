SET lock_timeout = '5s';

-- Down migration of 0010: back to the state after 0009. DATA LOSS by design: 'admin_nickname' / 'admin_photo'
-- notifications are deleted first, because the restored constraint does not allow them (players lose those messages).
-- The restored constraint is deliberately NOT validated here (ADD and VALIDATE in one transaction would hold an ACCESS
-- EXCLUSIVE lock for the whole scan); it is still enforced for every new row and the DELETE already removed offenders.
-- Rollback runbook: revert the code first, then 0010 down, then 0009 down.
DELETE FROM notifications WHERE kind IN ('admin_nickname', 'admin_photo');
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check2
  CHECK (kind IN ('killed', 'shield_earned', 'shield_blocked')) NOT VALID;
