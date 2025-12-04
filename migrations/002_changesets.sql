-- Migration 002: Changesets Table
-- Creates table for tracking agent-created changesets with approval workflow

CREATE TABLE IF NOT EXISTS changesets (
  id TEXT PRIMARY KEY,              -- UUID
  trace_id TEXT NOT NULL,           -- Link to request/plan
  portal TEXT NOT NULL,             -- Portal name
  branch TEXT NOT NULL,             -- Git branch name (feat/<desc>-<trace>)
  status TEXT NOT NULL,             -- pending, approved, rejected
  description TEXT NOT NULL,        -- Description of changes
  commit_sha TEXT,                  -- Latest commit SHA from agent
  files_changed INTEGER DEFAULT 0,  -- Number of files in commit
  created TEXT NOT NULL,            -- ISO 8601 timestamp
  created_by TEXT NOT NULL,         -- Agent blueprint name
  approved_at TEXT,                 -- Approval timestamp
  approved_by TEXT,                 -- User who approved
  rejected_at TEXT,                 -- Rejection timestamp
  rejected_by TEXT,                 -- User who rejected
  rejection_reason TEXT             -- Reason for rejection
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_changesets_trace_id ON changesets(trace_id);
CREATE INDEX IF NOT EXISTS idx_changesets_status ON changesets(status);
CREATE INDEX IF NOT EXISTS idx_changesets_portal ON changesets(portal);
CREATE INDEX IF NOT EXISTS idx_changesets_created_by ON changesets(created_by);
CREATE INDEX IF NOT EXISTS idx_changesets_branch ON changesets(branch);
