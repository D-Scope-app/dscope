-- First public release: rewards are intentionally disabled.
-- Preserve the tables for protocol compatibility, but normalize existing data
-- and reject future attempts to enable pools or claims.

UPDATE mvp_survey_rewards
SET
  reward_enabled = 0,
  reward_pool_amount = '0',
  claim_deadline = '0',
  reward_status = 'DISABLED',
  reward_per_participant = '0',
  total_allocated = '0',
  dust_return_to_sponsor = '0',
  distribution_hash = NULL,
  finalized_at = NULL,
  updated_at = CURRENT_TIMESTAMP;

UPDATE surveys
SET
  reward_enabled = '0',
  reward_pool_amount = '0',
  claim_deadline = '0',
  updated_at = CURRENT_TIMESTAMP;

UPDATE mvp_participation_records
SET eligible_for_reward = 0;

-- Eligibility produced by the former client-completed verification path is not
-- trusted for a public release. Preserve consumed history, but invalidate every
-- unconsumed grant so it cannot be used after deployment.
UPDATE survey_participation_eligibility
SET
  eligibility_status = 'rejected',
  reason_code = 'server_verification_required',
  decision_source = 'public_v1_containment',
  updated_at = CURRENT_TIMESTAMP
WHERE eligibility_status = 'eligible'
  AND consumed_at IS NULL;

-- Do not let credential jobs created from the untrusted completion path issue
-- after the migration is applied.
UPDATE mvp_credential_issue_jobs
SET
  status = 'failed',
  last_error = 'invalidated by public v1 server-verification containment',
  locked_at = NULL,
  locked_by = NULL,
  finished_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP
WHERE status IN ('pending', 'running');

CREATE TRIGGER IF NOT EXISTS mvp_rewards_public_v1_insert_guard
BEFORE INSERT ON mvp_survey_rewards
WHEN
  NEW.reward_enabled <> 0 OR
  COALESCE(CAST(NEW.reward_pool_amount AS TEXT), '0') <> '0' OR
  COALESCE(CAST(NEW.claim_deadline AS TEXT), '0') <> '0'
BEGIN
  SELECT RAISE(ABORT, 'rewards are disabled for the first public release');
END;

CREATE TRIGGER IF NOT EXISTS mvp_rewards_public_v1_update_guard
BEFORE UPDATE ON mvp_survey_rewards
WHEN
  NEW.reward_enabled <> 0 OR
  COALESCE(CAST(NEW.reward_pool_amount AS TEXT), '0') <> '0' OR
  COALESCE(CAST(NEW.claim_deadline AS TEXT), '0') <> '0'
BEGIN
  SELECT RAISE(ABORT, 'rewards are disabled for the first public release');
END;

CREATE TRIGGER IF NOT EXISTS legacy_rewards_public_v1_insert_guard
BEFORE INSERT ON surveys
WHEN
  COALESCE(CAST(NEW.reward_enabled AS TEXT), '0') <> '0' OR
  COALESCE(CAST(NEW.reward_pool_amount AS TEXT), '0') <> '0' OR
  COALESCE(CAST(NEW.claim_deadline AS TEXT), '0') <> '0'
BEGIN
  SELECT RAISE(ABORT, 'rewards are disabled for the first public release');
END;

CREATE TRIGGER IF NOT EXISTS legacy_rewards_public_v1_update_guard
BEFORE UPDATE ON surveys
WHEN
  COALESCE(CAST(NEW.reward_enabled AS TEXT), '0') <> '0' OR
  COALESCE(CAST(NEW.reward_pool_amount AS TEXT), '0') <> '0' OR
  COALESCE(CAST(NEW.claim_deadline AS TEXT), '0') <> '0'
BEGIN
  SELECT RAISE(ABORT, 'rewards are disabled for the first public release');
END;

CREATE TRIGGER IF NOT EXISTS reward_claims_public_v1_insert_guard
BEFORE INSERT ON mvp_reward_claims
BEGIN
  SELECT RAISE(ABORT, 'reward claims are unavailable in the first public release');
END;

CREATE TRIGGER IF NOT EXISTS reward_claims_public_v1_update_guard
BEFORE UPDATE ON mvp_reward_claims
BEGIN
  SELECT RAISE(ABORT, 'reward claims are unavailable in the first public release');
END;
