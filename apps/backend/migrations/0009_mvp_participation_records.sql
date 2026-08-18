-- D-Scope Public MVP participation read-model

CREATE TABLE IF NOT EXISTS mvp_participation_records (
  id TEXT PRIMARY KEY,

  survey_id TEXT NOT NULL,
  survey_key TEXT NOT NULL,

  participant_ref TEXT NOT NULL,

  participation_status TEXT NOT NULL DEFAULT 'participated',
  eligible_for_reward INTEGER NOT NULL DEFAULT 1,

  participated_at TEXT,
  participation_tx_hash TEXT,

  predicate_snapshot_json TEXT,
  answer_snapshot_json TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE(survey_id, participant_ref),

  FOREIGN KEY (survey_id) REFERENCES mvp_surveys(id)
);

CREATE INDEX IF NOT EXISTS idx_mvp_participation_records_survey_id
ON mvp_participation_records(survey_id);

CREATE INDEX IF NOT EXISTS idx_mvp_participation_records_participant_ref
ON mvp_participation_records(participant_ref);

CREATE INDEX IF NOT EXISTS idx_mvp_participation_records_status
ON mvp_participation_records(participation_status);
