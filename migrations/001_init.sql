-- up
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target TEXT,
  payload TEXT NOT NULL,
  timestamp DATETIME DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_trace ON activity(trace_id);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity(actor);

CREATE TABLE IF NOT EXISTS leases (
  file_path TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  acquired_at DATETIME DEFAULT (datetime('now')),
  heartbeat_at DATETIME DEFAULT (datetime('now')),
  expires_at DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leases_expires ON leases(expires_at);

-- down
DROP TABLE IF EXISTS leases;
DROP TABLE IF EXISTS activity;
