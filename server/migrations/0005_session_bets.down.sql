SET lock_timeout = '5s';

-- Down migration of 0005 (run after 0006's down). DATA LOSS by design: the chosen multipliers, stakes and
-- required times are deleted. Ledger rows of kind 'bet_bonus' / 'bet_penalty' were already removed by 0006's down.
ALTER TABLE points_ledger DROP CONSTRAINT IF EXISTS points_ledger_kind_check2;
ALTER TABLE focus_sessions DROP CONSTRAINT IF EXISTS focus_sessions_bet_multiplier_check;
ALTER TABLE focus_sessions DROP CONSTRAINT IF EXISTS focus_sessions_bet_stake_check;
ALTER TABLE focus_sessions DROP COLUMN bet_required_ms;
ALTER TABLE focus_sessions DROP COLUMN bet_stake;
ALTER TABLE focus_sessions DROP COLUMN bet_multiplier;
