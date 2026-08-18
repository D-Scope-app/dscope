CREATE TABLE IF NOT EXISTS mvp_survey_metadata (
  survey_id TEXT PRIMARY KEY,
  survey_key TEXT NOT NULL,

  title TEXT NOT NULL,
  description TEXT,
  questions_json TEXT NOT NULL DEFAULT '[]',

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (survey_id) REFERENCES mvp_surveys(id)
);

CREATE INDEX IF NOT EXISTS idx_mvp_survey_metadata_survey_key
ON mvp_survey_metadata(survey_key);
