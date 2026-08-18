-- Defense in depth for the browser-untrusted zkPassport flow.
-- Migration 0020 blocked updates that attach a reused outcome, but an INSERT
-- could still set reused_outcome_id directly. Public verification sessions must
-- always be backed by a fresh server-verified proof.

CREATE TRIGGER IF NOT EXISTS trusted_verification_no_client_outcome_reuse_insert
BEFORE INSERT ON verification_sessions
WHEN NEW.reused_outcome_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'client-supplied verification outcome reuse is disabled');
END;
