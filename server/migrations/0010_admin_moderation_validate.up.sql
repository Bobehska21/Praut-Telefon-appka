SET lock_timeout = '5s';

-- Contract step of the admin moderation change. VALIDATE only takes SHARE UPDATE EXCLUSIVE, so reads and writes continue.
ALTER TABLE notifications VALIDATE CONSTRAINT notifications_kind_check3;

-- The replacement constraint is validated and enforced, so the previous one can go.
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check2;
