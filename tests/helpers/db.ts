import { Database } from "@db/sqlite";

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
      action_type TEXT NOT NULL,
      target TEXT,
      payload TEXT NOT NULL,
      timestamp DATETIME DEFAULT (datetime('now'))
    );
  `);
  return db;
}
