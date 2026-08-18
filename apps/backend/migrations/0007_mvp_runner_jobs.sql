CREATE TABLE IF NOT EXISTS mvp_surveys (
  id TEXT PRIMARY KEY,
  survey_key TEXT NOT NULL UNIQUE,

  sponsor TEXT,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'draft',

  metadata_hash TEXT,
  predicate_policy_hash TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mvp_survey_contracts (
  survey_id TEXT PRIMARY KEY,
  survey_key TEXT NOT NULL,

  survey_factory_address TEXT,
  dscope_core_address TEXT,
  participation_gate_address TEXT,
  reward_vault_address TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (survey_id) REFERENCES mvp_surveys(id)
);

CREATE TABLE IF NOT EXISTS mvp_survey_rewards (
  survey_id TEXT PRIMARY KEY,
  survey_key TEXT NOT NULL,

  reward_enabled INTEGER NOT NULL DEFAULT 0,
  reward_pool_amount TEXT NOT NULL DEFAULT '0',
  claim_deadline TEXT,

  reward_status TEXT,
  reward_per_participant TEXT,
  total_allocated TEXT,
  dust_return_to_sponsor TEXT,
  distribution_hash TEXT,
  finalized_at TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (survey_id) REFERENCES mvp_surveys(id)
);

CREATE TABLE IF NOT EXISTS mvp_survey_results (
  survey_id TEXT PRIMARY KEY,
  survey_key TEXT NOT NULL,

  result_hash TEXT,
  distribution_hash TEXT,
  final_participant_count TEXT,

  analytics_payload_json TEXT,
  reward_payload_json TEXT,
  finalization_payload_json TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (survey_id) REFERENCES mvp_surveys(id)
);

CREATE TABLE IF NOT EXISTS mvp_runner_jobs (
  id TEXT PRIMARY KEY,

  type TEXT NOT NULL,
  status TEXT NOT NULL,

  survey_id TEXT,
  survey_key TEXT,

  payload_json TEXT NOT NULL,

  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,

  last_error TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  locked_at TEXT,
  locked_by TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS mvp_runner_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,

  type TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json TEXT,

  created_at TEXT NOT NULL,

  FOREIGN KEY (job_id) REFERENCES mvp_runner_jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_mvp_runner_jobs_status
ON mvp_runner_jobs(status);

CREATE INDEX IF NOT EXISTS idx_mvp_runner_jobs_type_status
ON mvp_runner_jobs(type, status);

CREATE INDEX IF NOT EXISTS idx_mvp_runner_jobs_survey_id
ON mvp_runner_jobs(survey_id);

CREATE INDEX IF NOT EXISTS idx_mvp_runner_events_job_id
ON mvp_runner_events(job_id);

CREATE INDEX IF NOT EXISTS idx_mvp_surveys_survey_key
ON mvp_surveys(survey_key);
