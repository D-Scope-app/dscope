CREATE TABLE IF NOT EXISTS mvp_ops_heartbeats (
  id TEXT PRIMARY KEY,

  service_name TEXT NOT NULL,
  service_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'alive',

  last_seen_at TEXT NOT NULL,
  payload_json TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE(service_name, service_id)
);

CREATE INDEX IF NOT EXISTS idx_mvp_ops_heartbeats_service
ON mvp_ops_heartbeats(service_name, service_id);

CREATE INDEX IF NOT EXISTS idx_mvp_ops_heartbeats_last_seen
ON mvp_ops_heartbeats(last_seen_at);
