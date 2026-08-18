ALTER TABLE surveys ADD COLUMN treasury TEXT;
ALTER TABLE surveys ADD COLUMN factory_address TEXT;
ALTER TABLE surveys ADD COLUMN registry_id TEXT;
ALTER TABLE surveys ADD COLUMN deploy_tx_hash TEXT;
ALTER TABLE surveys ADD COLUMN register_tx_hash TEXT;
ALTER TABLE surveys ADD COLUMN create_flow_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE surveys ADD COLUMN create_error TEXT;

CREATE INDEX IF NOT EXISTS idx_surveys_create_flow_status
ON surveys(create_flow_status);