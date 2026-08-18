-- D-Scope Public MVP: creator access, workspaces and participant activity helpers.

CREATE TABLE IF NOT EXISTS mvp_creator_applications (
  id TEXT PRIMARY KEY,

  organization_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_name TEXT,
  website TEXT,
  description TEXT,
  requested_wallet_address TEXT,

  status TEXT NOT NULL DEFAULT 'pending', -- pending / approved / rejected
  review_note TEXT,
  workspace_id TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mvp_creator_applications_email
ON mvp_creator_applications(contact_email);

CREATE INDEX IF NOT EXISTS idx_mvp_creator_applications_status
ON mvp_creator_applications(status);

CREATE INDEX IF NOT EXISTS idx_mvp_creator_applications_created_at
ON mvp_creator_applications(created_at);

CREATE TABLE IF NOT EXISTS mvp_creator_workspaces (
  id TEXT PRIMARY KEY,

  application_id TEXT,
  organization_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_name TEXT,
  website TEXT,
  description TEXT,
  owner_wallet_address TEXT,

  status TEXT NOT NULL DEFAULT 'active', -- active / suspended

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT,

  FOREIGN KEY (application_id) REFERENCES mvp_creator_applications(id)
);

CREATE INDEX IF NOT EXISTS idx_mvp_creator_workspaces_email
ON mvp_creator_workspaces(contact_email);

CREATE INDEX IF NOT EXISTS idx_mvp_creator_workspaces_status
ON mvp_creator_workspaces(status);

ALTER TABLE mvp_surveys ADD COLUMN creator_workspace_id TEXT;
ALTER TABLE mvp_surveys ADD COLUMN creator_display_name TEXT;
ALTER TABLE mvp_surveys ADD COLUMN operator_address TEXT;
ALTER TABLE mvp_surveys ADD COLUMN created_by_operator INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_mvp_surveys_creator_workspace_id
ON mvp_surveys(creator_workspace_id);

CREATE TABLE IF NOT EXISTS mvp_points_ledger (
  id TEXT PRIMARY KEY,

  participant_ref TEXT NOT NULL,
  survey_id TEXT,
  survey_key TEXT,

  points_delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  source TEXT,

  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mvp_points_ledger_participant_ref
ON mvp_points_ledger(participant_ref);

CREATE INDEX IF NOT EXISTS idx_mvp_points_ledger_survey_id
ON mvp_points_ledger(survey_id);
