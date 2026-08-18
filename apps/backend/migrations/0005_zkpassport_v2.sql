ALTER TABLE verification_sessions ADD COLUMN provider TEXT NOT NULL DEFAULT 'zkpassport';
ALTER TABLE verification_sessions ADD COLUMN reused_outcome_id TEXT;
ALTER TABLE verification_sessions ADD COLUMN error_code TEXT;
ALTER TABLE verification_sessions ADD COLUMN completed_at TEXT;

ALTER TABLE predicate_outcomes ADD COLUMN world_region TEXT NOT NULL DEFAULT 'OTHER_UNKNOWN';
ALTER TABLE predicate_outcomes ADD COLUMN policy_scope TEXT;
ALTER TABLE predicate_outcomes ADD COLUMN provider_payload_version TEXT;

ALTER TABLE survey_participation_eligibility ADD COLUMN decision_source TEXT;
ALTER TABLE survey_participation_eligibility ADD COLUMN consumed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_verification_sessions_provider
ON verification_sessions(provider);

CREATE INDEX IF NOT EXISTS idx_verification_sessions_reused_outcome_id
ON verification_sessions(reused_outcome_id);

CREATE INDEX IF NOT EXISTS idx_predicate_outcomes_world_region
ON predicate_outcomes(world_region);

CREATE INDEX IF NOT EXISTS idx_survey_participation_eligibility_decision_source
ON survey_participation_eligibility(decision_source);