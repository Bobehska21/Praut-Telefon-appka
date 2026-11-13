SET lock_timeout = '5s';

-- Down migration of the initial schema: drops every table (all data in them is lost, by design).
DROP TABLE IF EXISTS admin_audit;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS blocks;
DROP TABLE IF EXISTS kills;
DROP TABLE IF EXISTS kill_challenges;
DROP TABLE IF EXISTS points_ledger;
DROP TABLE IF EXISTS focus_sessions;
DROP TABLE IF EXISTS ble_tokens;
DROP TABLE IF EXISTS players;
