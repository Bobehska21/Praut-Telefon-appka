SET lock_timeout = '5s';

-- Down migration. Irreversible data loss by design: accounts (usernames, password hashes) and issued tokens
-- are dropped. Players keep a token hash so the NOT NULL constraint can be restored: the one from
-- auth_tokens if there is one, otherwise a random unusable hash (that player has to be re-registered).
UPDATE players p SET token_hash = (SELECT t.token_hash FROM auth_tokens t WHERE t.player_id = p.id ORDER BY t.created_at LIMIT 1)
WHERE p.token_hash IS NULL;
UPDATE players SET token_hash = sha256(convert_to(gen_random_uuid()::text, 'UTF8')) WHERE token_hash IS NULL;
ALTER TABLE players ALTER COLUMN token_hash SET NOT NULL;

DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS auth_tokens;
DROP TABLE IF EXISTS accounts;
