SET lock_timeout = '5s';

-- Initial schema of the multiplayer backend. All tables are new, so plain CREATE INDEX is safe here.

CREATE TABLE players (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash          bytea NOT NULL UNIQUE,
  public_key          text NOT NULL,
  nickname            text NOT NULL DEFAULT '' CHECK (char_length(nickname) <= 20),
  rank_key            text NOT NULL DEFAULT 'novice'
                      CHECK (rank_key IN ('novice','apprentice','adept','warden','master','grandmaster')),
  level               integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 999),
  multiplayer_enabled boolean NOT NULL DEFAULT false,
  timezone            text NOT NULL DEFAULT 'UTC',
  focus_state         text NOT NULL DEFAULT 'idle' CHECK (focus_state IN ('idle','focus','wasteman')),
  focus_started_at    timestamptz,
  last_heartbeat_at   timestamptz,
  immune_until        timestamptz,
  banned_at           timestamptz,
  ban_reason          text,
  photo_key           text,
  photo_updated_at    timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ble_tokens (
  player_id  uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day        date NOT NULL,
  token      text NOT NULL CHECK (token ~ '^[0-9a-f]{12}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, day),
  UNIQUE (day, token)
);

CREATE TABLE focus_sessions (
  id         bigserial PRIMARY KEY,
  player_id  uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at   timestamptz,
  end_reason text CHECK (end_reason IN ('manual','expired','lost','restart'))
);
CREATE INDEX focus_sessions_player_idx ON focus_sessions (player_id);

CREATE TABLE points_ledger (
  id         bigserial PRIMARY KEY,
  player_id  uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('minute','kill','penalty')),
  day        date NOT NULL,            -- the player's local day when the row was written
  focus_ms   integer NOT NULL DEFAULT 0 CHECK (focus_ms >= 0),
  points     integer NOT NULL,         -- signed: penalties are negative
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX points_ledger_player_day_idx ON points_ledger (player_id, day);

CREATE TABLE kill_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  killer_id   uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  victim_id   uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  nonce       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  error_code  text,
  error_extra jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (killer_id <> victim_id)
);
CREATE INDEX kill_challenges_killer_idx ON kill_challenges (killer_id);
CREATE INDEX kill_challenges_victim_idx ON kill_challenges (victim_id);

-- Kill rows outlive the players (GDPR erasure nulls the references, the history stays).
CREATE TABLE kills (
  id                 bigserial PRIMARY KEY,
  challenge_id       uuid UNIQUE REFERENCES kill_challenges(id) ON DELETE SET NULL,
  killer_id          uuid REFERENCES players(id) ON DELETE SET NULL,
  victim_id          uuid REFERENCES players(id) ON DELETE SET NULL,
  killer_points      integer NOT NULL,
  victim_points_lost integer NOT NULL CHECK (victim_points_lost >= 0),
  created_at         timestamptz NOT NULL
);
CREATE INDEX kills_killer_idx ON kills (killer_id, created_at);
CREATE INDEX kills_victim_idx ON kills (victim_id, created_at);
CREATE INDEX kills_created_idx ON kills (created_at);

CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id);

CREATE TABLE reports (
  id                  bigserial PRIMARY KEY,
  reporter_id         uuid REFERENCES players(id) ON DELETE SET NULL,
  target_id           uuid REFERENCES players(id) ON DELETE SET NULL,
  kind                text NOT NULL CHECK (kind IN ('nickname','photo','player')),
  note                text CHECK (note IS NULL OR char_length(note) <= 500),
  snapshot_nickname   text NOT NULL,
  snapshot_photo_key  text,
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution          text CHECK (resolution IN ('dismiss','remove_photo','reset_nickname','ban')),
  resolution_note     text,
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_status_idx ON reports (status, created_at);
CREATE INDEX reports_reporter_idx ON reports (reporter_id, created_at);
CREATE INDEX reports_target_idx ON reports (target_id);

CREATE TABLE notifications (
  id           bigserial PRIMARY KEY,
  player_id    uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('killed')),
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX notifications_player_idx ON notifications (player_id, id);

-- No foreign keys on purpose: the audit trail must survive deletion of players and reports.
CREATE TABLE admin_audit (
  id               bigserial PRIMARY KEY,
  action           text NOT NULL,
  target_player_id uuid,
  report_id        bigint,
  details          jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);
