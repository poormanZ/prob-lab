-- Kakao access/refresh tokens are intentionally not persisted.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kakao_user_id TEXT NOT NULL UNIQUE,
  username TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Usernames are set after the first login, so NULL must be allowed more than once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

-- id stores the SHA-256 of the cookie value, never the raw session id.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- One row per user: the highest stage reached and the reward shown at that moment.
CREATE TABLE IF NOT EXISTS records (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  best_stage INTEGER NOT NULL,
  best_amount INTEGER NOT NULL,
  achieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_records_rank ON records(best_stage DESC, best_amount DESC, achieved_at ASC);
