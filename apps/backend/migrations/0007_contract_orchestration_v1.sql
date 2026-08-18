-- apps/backend/migrations/0007_contract_orchestration_v1.sql

ALTER TABLE surveys ADD COLUMN participation_gate_address TEXT;
ALTER TABLE surveys ADD COLUMN dscope_core_address TEXT;
ALTER TABLE surveys ADD COLUMN survey_key TEXT;
ALTER TABLE surveys ADD COLUMN predicate_policy_json TEXT;

ALTER TABLE surveys ADD COLUMN analytics_min_total_sample TEXT;
ALTER TABLE surveys ADD COLUMN analytics_min_segment_sample TEXT;
ALTER TABLE surveys ADD COLUMN analytics_visibility_mode TEXT;

CREATE INDEX IF NOT EXISTS idx_surveys_survey_key
ON surveys(survey_key);

CREATE INDEX IF NOT EXISTS idx_surveys_participation_gate_address
ON surveys(participation_gate_address);

CREATE INDEX IF NOT EXISTS idx_surveys_dscope_core_address
ON surveys(dscope_core_address);