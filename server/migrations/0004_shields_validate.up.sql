SET lock_timeout = '5s';

-- Contract step of the shields change. VALIDATE only takes SHARE UPDATE EXCLUSIVE, so reads and writes continue
-- (this is why it lives in its own migration, separate from the locks of 0003).
ALTER TABLE players VALIDATE CONSTRAINT players_shields_range;
ALTER TABLE notifications VALIDATE CONSTRAINT notifications_kind_check2;

-- The replacement constraint is validated and enforced, so the old 'killed'-only one can go.
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
