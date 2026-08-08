CREATE TABLE IF NOT EXISTS login_rate_limits (
  rate_limit_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  last_failed_at TEXT NOT NULL,
  blocked_until TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_rate_limits_blocked_until
  ON login_rate_limits(blocked_until);
