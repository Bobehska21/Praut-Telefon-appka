SET lock_timeout = '5s';

-- Down migration of 0009 (run after 0010's down). Nothing is lost here: the rows of the new kinds were already removed
-- by 0010's down.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check3;
