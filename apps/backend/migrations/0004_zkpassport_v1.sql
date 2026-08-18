CREATE TABLE IF NOT EXISTS verification_sessions (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  status TEXT NOT NULL, -- pending / verified / failed / expired
  zk_request_id TEXT,
  subject_hash TEXT,
  valid_until TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_sessions_survey_id
ON verification_sessions(survey_id);

CREATE INDEX IF NOT EXISTS idx_verification_sessions_wallet_address
ON verification_sessions(wallet_address);

CREATE INDEX IF NOT EXISTS idx_verification_sessions_subject_hash
ON verification_sessions(subject_hash);

CREATE INDEX IF NOT EXISTS idx_verification_sessions_status
ON verification_sessions(status);


CREATE TABLE IF NOT EXISTS predicate_outcomes (
  id TEXT PRIMARY KEY,
  verification_session_id TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  source TEXT NOT NULL, -- zkpassport
  verified INTEGER NOT NULL, -- 1 / 0
  age_bucket TEXT NOT NULL,
  country_bucket TEXT NOT NULL,
  valid_until TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_predicate_outcomes_verification_session_id
ON predicate_outcomes(verification_session_id);

CREATE INDEX IF NOT EXISTS idx_predicate_outcomes_subject_hash
ON predicate_outcomes(subject_hash);

CREATE INDEX IF NOT EXISTS idx_predicate_outcomes_age_bucket
ON predicate_outcomes(age_bucket);

CREATE INDEX IF NOT EXISTS idx_predicate_outcomes_country_bucket
ON predicate_outcomes(country_bucket);

CREATE INDEX IF NOT EXISTS idx_predicate_outcomes_valid_until
ON predicate_outcomes(valid_until);


CREATE TABLE IF NOT EXISTS survey_participation_eligibility (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  predicate_outcome_id TEXT NOT NULL,
  eligibility_status TEXT NOT NULL, -- eligible / rejected / consumed
  reason_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_survey_participation_eligibility_survey_id
ON survey_participation_eligibility(survey_id);

CREATE INDEX IF NOT EXISTS idx_survey_participation_eligibility_wallet_address
ON survey_participation_eligibility(wallet_address);

CREATE INDEX IF NOT EXISTS idx_survey_participation_eligibility_subject_hash
ON survey_participation_eligibility(subject_hash);

CREATE INDEX IF NOT EXISTS idx_survey_participation_eligibility_status
ON survey_participation_eligibility(eligibility_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_participation_eligibility_unique_active
ON survey_participation_eligibility(survey_id, wallet_address);


CREATE TABLE IF NOT EXISTS survey_predicate_aggregates (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL,
  dimension_type TEXT NOT NULL, -- age_bucket / country_bucket
  dimension_value TEXT NOT NULL,
  respondent_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_survey_predicate_aggregates_survey_id
ON survey_predicate_aggregates(survey_id);

CREATE INDEX IF NOT EXISTS idx_survey_predicate_aggregates_dimension_type
ON survey_predicate_aggregates(dimension_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_predicate_aggregates_unique_dimension
ON survey_predicate_aggregates(survey_id, dimension_type, dimension_value);