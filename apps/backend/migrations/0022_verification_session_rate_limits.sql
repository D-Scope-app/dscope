CREATE TABLE IF NOT EXISTS verification_session_rate_limits (
  dimension TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  survey_id TEXT NOT NULL,
  window_start TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (dimension, key_hash, survey_id, window_start)
);

CREATE INDEX IF NOT EXISTS idx_verification_session_rate_limits_updated_at
ON verification_session_rate_limits(updated_at);
