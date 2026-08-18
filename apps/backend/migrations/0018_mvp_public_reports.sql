CREATE TABLE IF NOT EXISTS mvp_public_reports (
  survey_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'unpublished',
  snapshot_json TEXT,
  share_image_base64 TEXT,
  published_by_workspace_id TEXT NOT NULL,
  published_at TEXT,
  unpublished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (survey_id) REFERENCES mvp_surveys(id),
  FOREIGN KEY (published_by_workspace_id) REFERENCES mvp_creator_workspaces(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mvp_public_reports_slug
ON mvp_public_reports(slug);

CREATE INDEX IF NOT EXISTS idx_mvp_public_reports_status
ON mvp_public_reports(status);
