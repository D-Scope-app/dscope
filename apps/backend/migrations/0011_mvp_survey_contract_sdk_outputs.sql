ALTER TABLE mvp_survey_contracts ADD COLUMN chain_mode TEXT;
ALTER TABLE mvp_survey_contracts ADD COLUMN deploy_survey_factory_tx_hash TEXT;
ALTER TABLE mvp_survey_contracts ADD COLUMN deploy_participation_gate_tx_hash TEXT;
ALTER TABLE mvp_survey_contracts ADD COLUMN register_policy_tx_hash TEXT;
ALTER TABLE mvp_survey_contracts ADD COLUMN register_age_mode_tx_hash TEXT;
ALTER TABLE mvp_survey_contracts ADD COLUMN register_age_mask_tx_hash TEXT;
ALTER TABLE mvp_survey_contracts ADD COLUMN register_country_mode_tx_hash TEXT;
ALTER TABLE mvp_survey_contracts ADD COLUMN register_country_bitmap_tx_hash TEXT;
ALTER TABLE mvp_survey_contracts ADD COLUMN deploy_reward_vault_tx_hash TEXT;
ALTER TABLE mvp_survey_contracts ADD COLUMN register_reward_config_tx_hash TEXT;
ALTER TABLE mvp_survey_contracts ADD COLUMN deploy_dscope_core_tx_hash TEXT;
ALTER TABLE mvp_survey_contracts ADD COLUMN factory_register_survey_tx_hash TEXT;
ALTER TABLE mvp_survey_contracts ADD COLUMN policy_json TEXT;
ALTER TABLE mvp_survey_contracts ADD COLUMN read_checks_json TEXT;
ALTER TABLE mvp_survey_contracts ADD COLUMN runner_output_json TEXT;

CREATE INDEX IF NOT EXISTS idx_mvp_survey_contracts_chain_mode
ON mvp_survey_contracts(chain_mode);

CREATE INDEX IF NOT EXISTS idx_mvp_survey_contracts_dscope_core
ON mvp_survey_contracts(dscope_core_address);
