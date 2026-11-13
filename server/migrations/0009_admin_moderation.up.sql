SET lock_timeout = '5s';

-- Notifications for admin moderation ('admin_nickname': the name was changed, 'admin_photo': the photo was removed),
-- EXPAND step only; the contract step is 0010_admin_moderation_validate (VALIDATE must not share a transaction with the
-- locks taken here). Safe with the previous application version running: it only inserts the kinds it already knew.
--
-- NOTE: until 0010 has run, the previous notifications_kind_check2 is still enforced, so the new kinds can only be
-- inserted once 0010 is applied. Deploy 0009 and 0010 before the code that writes them. Clients that do not know a kind
-- ignore it (the Android events poller only acts on kinds it recognises).
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check3
  CHECK (kind IN ('killed', 'shield_earned', 'shield_blocked', 'admin_nickname', 'admin_photo')) NOT VALID;
