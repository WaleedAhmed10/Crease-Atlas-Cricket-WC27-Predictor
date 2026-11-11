-- Matchday Atlas Crease schema (PostgreSQL). Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS teams (
  code          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  short         TEXT NOT NULL,
  group_code    TEXT NOT NULL DEFAULT '',
  seed          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'qualified',   -- qualified | placeholder | contender
  color1        TEXT NOT NULL DEFAULT '#7b8a80',
  color2        TEXT NOT NULL DEFAULT '#ffffff',
  wc_titles     INT  NOT NULL DEFAULT 0,
  rating        INT  NOT NULL DEFAULT 50,            -- editable "Atlas rating" used by the simulator
  assigned_code TEXT                                 -- set when a placeholder slot is filled
);

CREATE TABLE IF NOT EXISTS venues (
  venue_id TEXT PRIMARY KEY,
  stadium  TEXT NOT NULL,
  city     TEXT NOT NULL,
  country  TEXT NOT NULL,
  capacity INT
);

CREATE TABLE IF NOT EXISTS matches (
  match_no     INT PRIMARY KEY,
  stage        TEXT NOT NULL CHECK (stage IN ('SUPER_SERIES','GROUP','SUPER_7','SEMI_FINAL','FINAL')),
  group_code   TEXT NOT NULL DEFAULT '',
  match_date   DATE NOT NULL,
  team1        TEXT NOT NULL,                        -- team code, or a slot ref (A1, AB4, S7-1, W55)
  team2        TEXT NOT NULL,
  venue_id     TEXT NOT NULL REFERENCES venues(venue_id),
  reserve_date DATE,
  label        TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS results (
  match_no     INT PRIMARY KEY REFERENCES matches(match_no) ON DELETE CASCADE,
  winner       TEXT,                                  -- NULL for tie / no result
  result_type  TEXT NOT NULL DEFAULT 'normal',        -- normal | tie | no_result
  margin_type  TEXT,                                  -- runs | wickets
  margin_value INT,
  margin_band  TEXT,                                  -- close | comfortable | dominant (derived at seed time)
  team1_runs   INT, team1_overs NUMERIC(4,1),
  team2_runs   INT, team2_overs NUMERIC(4,1)
);

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  username        TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,                        -- SHA-256 of the token; the token itself is never stored
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS predictions (
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_no    INT NOT NULL REFERENCES matches(match_no) ON DELETE CASCADE,
  winner      TEXT NOT NULL,
  margin_band TEXT CHECK (margin_band IN ('close','comfortable','dominant')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, match_no)
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                                  -- e.g. data_hash: fingerprint of the CSV files last loaded
);
