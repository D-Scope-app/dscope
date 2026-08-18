-- apps/backend/migrations/0008_contract_orchestration_tx_hashes.sql
-- Separates old generic tx-hash fields into explicit orchestration steps.

ALTER TABLE surveys ADD COLUMN deploy_gate_tx_hash TEXT;
ALTER TABLE surveys ADD COLUMN register_policy_tx_hash TEXT;
ALTER TABLE surveys ADD COLUMN deploy_core_tx_hash TEXT;
ALTER TABLE surveys ADD COLUMN factory_register_tx_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_surveys_deploy_gate_tx_hash
ON surveys(deploy_gate_tx_hash);

CREATE INDEX IF NOT EXISTS idx_surveys_register_policy_tx_hash
ON surveys(register_policy_tx_hash);

CREATE INDEX IF NOT EXISTS idx_surveys_deploy_core_tx_hash
ON surveys(deploy_core_tx_hash);

CREATE INDEX IF NOT EXISTS idx_surveys_factory_register_tx_hash
ON surveys(factory_register_tx_hash);
