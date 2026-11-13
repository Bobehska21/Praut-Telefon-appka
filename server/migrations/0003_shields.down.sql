SET lock_timeout = '5s';

-- Down migration of 0003 (run after 0004's down). DATA LOSS by design: shield counts, per-session credited time,
-- the shield-earned flag and any 'shield_earned' / 'shield_blocked' notifications are deleted. Challenges that a
-- shield absorbed (which have no row in `kills`) are marked failed/expired so a replay does not look for a missing
-- kill row.
UPDATE kill_challenges
SET status = 'failed', error_code = 'expired', error_extra = '{"message": "Challenge expired", "extra": {}}'::jsonb
WHERE shield_blocked;

DELETE FROM notifications WHERE kind IN ('shield_earned', 'shield_blocked');
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check2;

ALTER TABLE kill_challenges DROP COLUMN resolved_at;
ALTER TABLE kill_challenges DROP COLUMN shield_blocked;
ALTER TABLE focus_sessions DROP COLUMN shield_awarded;
ALTER TABLE focus_sessions DROP COLUMN credited_ms;
ALTER TABLE players DROP CONSTRAINT players_shields_range;
ALTER TABLE players DROP COLUMN shields;
