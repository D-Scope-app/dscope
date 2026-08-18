-- D-Scope public creator account/auth v1
-- Adds real creator accounts, email verification, password setup and secure sessions.

CREATE TABLE IF NOT EXISTS mvp_creator_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending_email_verification',
  email_verified_at TEXT,
  password_hash TEXT,
  password_set_at TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mvp_creator_accounts_email
ON mvp_creator_accounts(email);

CREATE INDEX IF NOT EXISTS idx_mvp_creator_accounts_status
ON mvp_creator_accounts(status);

CREATE TABLE IF NOT EXISTS mvp_creator_profiles (
  creator_account_id TEXT PRIMARY KEY,
  organization_name TEXT NOT NULL,
  contact_name TEXT,
  website TEXT,
  description TEXT,
  logo_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (creator_account_id) REFERENCES mvp_creator_accounts(id)
);

CREATE TABLE IF NOT EXISTS mvp_creator_email_verifications (
  id TEXT PRIMARY KEY,
  creator_account_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  setup_token_hash TEXT,
  purpose TEXT NOT NULL DEFAULT 'verify_email',
  sent_to_email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (creator_account_id) REFERENCES mvp_creator_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_mvp_creator_email_verifications_account
ON mvp_creator_email_verifications(creator_account_id);

CREATE INDEX IF NOT EXISTS idx_mvp_creator_email_verifications_token_hash
ON mvp_creator_email_verifications(token_hash);

CREATE INDEX IF NOT EXISTS idx_mvp_creator_email_verifications_setup_token_hash
ON mvp_creator_email_verifications(setup_token_hash);

CREATE TABLE IF NOT EXISTS mvp_creator_sessions (
  id TEXT PRIMARY KEY,
  creator_account_id TEXT NOT NULL,
  session_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_hint TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (creator_account_id) REFERENCES mvp_creator_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_mvp_creator_sessions_account
ON mvp_creator_sessions(creator_account_id);

CREATE INDEX IF NOT EXISTS idx_mvp_creator_sessions_hash
ON mvp_creator_sessions(session_hash);

CREATE INDEX IF NOT EXISTS idx_mvp_creator_sessions_expires
ON mvp_creator_sessions(expires_at);

-- One-way schema hardening for creator profile display.
ALTER TABLE mvp_creator_workspaces ADD COLUMN logo_url TEXT;
ALTER TABLE mvp_creator_workspaces ADD COLUMN creator_account_id TEXT;
ALTER TABLE mvp_creator_applications ADD COLUMN logo_url TEXT;
ALTER TABLE mvp_creator_applications ADD COLUMN email_verified_at TEXT;
