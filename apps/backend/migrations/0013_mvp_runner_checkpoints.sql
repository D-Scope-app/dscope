CREATE TABLE IF NOT EXISTS mvp_runner_checkpoints (
  id TEXT PRIMARY KEY,

  job_id TEXT NOT NULL UNIQUE,
  survey_id TEXT,
  survey_key TEXT,
  job_type TEXT NOT NULL,

  flow_status TEXT NOT NULL DEFAULT 'pending',
  current_step TEXT NOT NULL DEFAULT 'pending',

  factory_status TEXT NOT NULL DEFAULT 'none',
  factory_tx_hash TEXT,
  factory_address TEXT,

  gate_status TEXT NOT NULL DEFAULT 'none',
  gate_tx_hash TEXT,
  gate_address TEXT,

  policy_status TEXT NOT NULL DEFAULT 'none',
  policy_tx_hash TEXT,
  policy_hash TEXT,
  policy_registered INTEGER NOT NULL DEFAULT 0,

  reward_status TEXT NOT NULL DEFAULT 'none',
  reward_tx_hash TEXT,
  reward_address TEXT,

  reward_config_status TEXT NOT NULL DEFAULT 'none',
  reward_config_tx_hash TEXT,

  core_status TEXT NOT NULL DEFAULT 'none',
  core_tx_hash TEXT,
  core_address TEXT,

  factory_register_status TEXT NOT NULL DEFAULT 'none',
  factory_register_tx_hash TEXT,

  finalize_reward_status TEXT NOT NULL DEFAULT 'none',
  finalize_reward_tx_hash TEXT,

  finalize_core_status TEXT NOT NULL DEFAULT 'none',
  finalize_core_tx_hash TEXT,

  result_hash TEXT,
  distribution_hash TEXT,
  final_participant_count TEXT,

  outputs_json TEXT,
  last_error TEXT,
  retryable INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (job_id) REFERENCES mvp_runner_jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_mvp_runner_checkpoints_job_id
ON mvp_runner_checkpoints(job_id);

CREATE INDEX IF NOT EXISTS idx_mvp_runner_checkpoints_survey_id
ON mvp_runner_checkpoints(survey_id);

CREATE INDEX IF NOT EXISTS idx_mvp_runner_checkpoints_flow_status
ON mvp_runner_checkpoints(flow_status);
