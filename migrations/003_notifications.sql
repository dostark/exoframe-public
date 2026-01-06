-- Migration 003: Notifications Table
-- Consolidates System/Notifications/memory.json into SQLite for better performance and consistency

-- up
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  proposal_id TEXT,
  trace_id TEXT,
  created_at TEXT NOT NULL,
  dismissed_at TEXT,
  metadata TEXT  -- JSON for extensibility
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_dismissed ON notifications(dismissed_at);
CREATE INDEX IF NOT EXISTS idx_notifications_proposal ON notifications(proposal_id);

-- down
DROP INDEX IF EXISTS idx_notifications_proposal;
DROP INDEX IF EXISTS idx_notifications_dismissed;
DROP INDEX IF EXISTS idx_notifications_type;
DROP INDEX IF EXISTS idx_notifications_created;
DROP TABLE IF EXISTS notifications;
