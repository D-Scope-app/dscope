CREATE TABLE IF NOT EXISTS survey_participation_records (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  eligibility_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_participation_records_survey
  ON survey_participation_records (survey_id);

CREATE INDEX IF NOT EXISTS idx_participation_records_wallet
  ON survey_participation_records (wallet_address);

CREATE UNIQUE INDEX IF NOT EXISTS idx_participation_records_unique_wallet_per_survey
  ON survey_participation_records (survey_id, wallet_address);