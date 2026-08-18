CREATE TABLE IF NOT EXISTS mvp_credential_issue_jobs (
  id TEXT PRIMARY KEY,

  survey_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  subject_hash TEXT,

  predicate_outcome_id TEXT,

  status TEXT NOT NULL DEFAULT 'pending',

  participation_gate_address TEXT,
  payload_json TEXT NOT NULL,

  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,

  tx_hash TEXT,
  issuer TEXT,

  credential_json TEXT,
  normalized_json TEXT,
  issuer_response_json TEXT,

  last_error TEXT,

  locked_at TEXT,
  locked_by TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  issued_at TEXT,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mvp_credential_issue_jobs_status
ON mvp_credential_issue_jobs(status);

CREATE INDEX IF NOT EXISTS idx_mvp_credential_issue_jobs_survey_wallet
ON mvp_credential_issue_jobs(survey_id, wallet_address);

CREATE INDEX IF NOT EXISTS idx_mvp_credential_issue_jobs_subject
ON mvp_credential_issue_jobs(subject_hash);

CREATE INDEX IF NOT EXISTS idx_mvp_credential_issue_jobs_created_at
ON mvp_credential_issue_jobs(created_at);
