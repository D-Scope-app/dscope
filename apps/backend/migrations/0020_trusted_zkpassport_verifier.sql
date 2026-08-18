-- Trusted zkPassport verification is performed by a dedicated VPS service.
-- Browser-provided booleans, demographic buckets and identifiers are not trust
-- inputs. Raw proofs are never stored in D1.

ALTER TABLE verification_sessions ADD COLUMN client_token_hash TEXT;
ALTER TABLE verification_sessions ADD COLUMN expected_scope TEXT;
ALTER TABLE verification_sessions ADD COLUMN expected_binding TEXT;
ALTER TABLE verification_sessions ADD COLUMN expected_query_hash TEXT;
ALTER TABLE verification_sessions ADD COLUMN verification_expires_at TEXT;
ALTER TABLE verification_sessions ADD COLUMN verifier_job_id TEXT;
ALTER TABLE verification_sessions ADD COLUMN verifier_proof_digest TEXT;
ALTER TABLE verification_sessions ADD COLUMN verifier_started_at TEXT;
ALTER TABLE verification_sessions ADD COLUMN verification_method TEXT;

CREATE INDEX IF NOT EXISTS idx_verification_sessions_expires_at
ON verification_sessions(verification_expires_at);

CREATE INDEX IF NOT EXISTS idx_verification_sessions_verifier_job
ON verification_sessions(verifier_job_id);

CREATE TABLE IF NOT EXISTS trusted_zkpassport_nullifiers (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  survey_id TEXT NOT NULL,
  verification_session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope, subject_hash),
  UNIQUE (verification_session_id)
);

CREATE INDEX IF NOT EXISTS idx_trusted_zkpassport_nullifiers_survey
ON trusted_zkpassport_nullifiers(survey_id);

CREATE TRIGGER IF NOT EXISTS trusted_verification_no_client_outcome_reuse
BEFORE UPDATE OF reused_outcome_id ON verification_sessions
WHEN NEW.reused_outcome_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'client-supplied verification outcome reuse is disabled');
END;
