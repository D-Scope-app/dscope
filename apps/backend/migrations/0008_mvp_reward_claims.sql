-- D-Scope Public MVP reward claim visibility/read-model

CREATE TABLE IF NOT EXISTS mvp_reward_claims (
  id TEXT PRIMARY KEY,

  survey_id TEXT NOT NULL,
  survey_key TEXT NOT NULL,

  participant_ref TEXT NOT NULL,

  claim_status TEXT NOT NULL DEFAULT 'not_claimed',
  claim_amount TEXT NOT NULL DEFAULT '0',
  claim_deadline TEXT,

  claim_tx_hash TEXT,
  claimed_at TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE(survey_id, participant_ref),

  FOREIGN KEY (survey_id) REFERENCES mvp_surveys(id)
);

CREATE INDEX IF NOT EXISTS idx_mvp_reward_claims_survey_id
ON mvp_reward_claims(survey_id);

CREATE INDEX IF NOT EXISTS idx_mvp_reward_claims_participant_ref
ON mvp_reward_claims(participant_ref);

CREATE INDEX IF NOT EXISTS idx_mvp_reward_claims_status
ON mvp_reward_claims(claim_status);
