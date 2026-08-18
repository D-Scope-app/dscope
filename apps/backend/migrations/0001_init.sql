CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  sponsor TEXT NOT NULL,
  system_finalizer TEXT NOT NULL,
  metadata_hash TEXT NOT NULL,
  predicate_policy_hash TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  reward_pool_amount TEXT NOT NULL,
  claim_deadline TEXT NOT NULL,
  reward_enabled TEXT NOT NULL,
  minimum_sample_target TEXT NOT NULL,
  status TEXT NOT NULL,
  result_hash TEXT,
  distribution_hash TEXT,
  final_participant_count TEXT,
  finalized_at INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS survey_jobs (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  run_at TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS survey_events (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_surveys_contract_address
ON surveys(contract_address);

CREATE INDEX IF NOT EXISTS idx_survey_jobs_status_run_at
ON survey_jobs(status, run_at);

CREATE INDEX IF NOT EXISTS idx_survey_events_survey_id
ON survey_events(survey_id);