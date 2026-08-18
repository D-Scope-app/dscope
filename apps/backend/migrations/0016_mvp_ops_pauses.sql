CREATE TABLE IF NOT EXISTS mvp_ops_pauses (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  survey_id TEXT,
  is_paused INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  message TEXT,
  created_by TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mvp_ops_pauses_scope
ON mvp_ops_pauses(scope);

CREATE INDEX IF NOT EXISTS idx_mvp_ops_pauses_survey_id
ON mvp_ops_pauses(survey_id);

CREATE INDEX IF NOT EXISTS idx_mvp_ops_pauses_active
ON mvp_ops_pauses(is_paused, scope, survey_id);
