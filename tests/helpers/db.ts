import { Database } from "@db/sqlite";
import { DatabaseService } from "../../src/services/db.ts";
import { createMockConfig } from "./config.ts";
import type { Config } from "../../src/config/schema.ts";

/**
 * SQL statement to create the activity table with all indexes.
 * Centralized here to avoid duplication across tests.
 */
export const ACTIVITY_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    agent_id TEXT,
    action_type TEXT NOT NULL,
    target TEXT,
    payload TEXT NOT NULL,
    timestamp DATETIME DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_activity_trace ON activity(trace_id);
  CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity(agent_id);
`;

/**
 * Initialize an in‑memory SQLite database with the `activity` table.
 * This helper is used by multiple tests to avoid duplicated CREATE TABLE statements.
 */
export function initTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      agent_id TEXT,
      action_type TEXT NOT NULL,
      target TEXT,
      payload TEXT NOT NULL,
      timestamp DATETIME DEFAULT (datetime('now'))
    );
  `);
  return db;
}

/**
 * Initialize activity table schema on an existing DatabaseService.
 * Useful for reconnection tests where a new DatabaseService connects to existing data.
 */
export function initActivityTableSchema(db: DatabaseService): void {
  db.instance.exec(ACTIVITY_TABLE_SQL);
}

/**
 * SQL for changesets table (from migration 002)
 */
export const CHANGESETS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS changesets (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    portal TEXT NOT NULL,
    branch TEXT NOT NULL,
    status TEXT NOT NULL,
    description TEXT NOT NULL,
    commit_sha TEXT,
    files_changed INTEGER DEFAULT 0,
    created TEXT NOT NULL,
    created_by TEXT NOT NULL,
    approved_at TEXT,
    approved_by TEXT,
    rejected_at TEXT,
    rejected_by TEXT,
    rejection_reason TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_changesets_trace_id ON changesets(trace_id);
  CREATE INDEX IF NOT EXISTS idx_changesets_status ON changesets(status);
  CREATE INDEX IF NOT EXISTS idx_changesets_portal ON changesets(portal);
  CREATE INDEX IF NOT EXISTS idx_changesets_created_by ON changesets(created_by);
  CREATE INDEX IF NOT EXISTS idx_changesets_branch ON changesets(branch);
`;

/**
 * SQL for activity_journal table (from migration 001)
 */
export const ACTIVITY_JOURNAL_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS activity_journal (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    target TEXT,
    metadata TEXT,
    timestamp TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activity_journal_trace_id ON activity_journal(trace_id);
  CREATE INDEX IF NOT EXISTS idx_activity_journal_event_type ON activity_journal(event_type);
`;

/**
 * SQL for notifications table (from migration 003)
 */
export const NOTIFICATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    proposal_id TEXT,
    trace_id TEXT,
    created_at TEXT NOT NULL,
    dismissed_at TEXT,
    metadata TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
  CREATE INDEX IF NOT EXISTS idx_notifications_dismissed ON notifications(dismissed_at);
  CREATE INDEX IF NOT EXISTS idx_notifications_proposal ON notifications(proposal_id);
`;

/**
 * Initialize full database schema for integration tests
 */
export function initFullSchema(db: DatabaseService): void {
  db.instance.exec(ACTIVITY_TABLE_SQL);
  db.instance.exec(ACTIVITY_JOURNAL_TABLE_SQL);
  db.instance.exec(CHANGESETS_TABLE_SQL);
  db.instance.exec(NOTIFICATIONS_TABLE_SQL);
}

/**
 * Initialize a DatabaseService with an in-memory database for testing.
 * Uses a temporary directory for the config root.
 */
export async function initTestDbService(): Promise<
  { db: DatabaseService; config: Config; tempDir: string; cleanup: () => Promise<void> }
> {
  const tempDir = await Deno.makeTempDir({ prefix: "exo-test-" });

  const config = createMockConfig(tempDir);

  // Create runtime directory (.exo) for journal.db
  await Deno.mkdir(`${tempDir}/${config.paths.runtime}`, { recursive: true });

  const db = new DatabaseService(config);

  // Initialize all tables (activity, activity_journal, changesets, notifications)
  initFullSchema(db);

  return {
    db,
    config,
    tempDir,
    cleanup: async () => {
      await db.close();
      await Deno.remove(tempDir, { recursive: true });
    },
  };
}
