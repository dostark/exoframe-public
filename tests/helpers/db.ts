import { Database } from "@db/sqlite";
import { DatabaseService } from "../../src/services/db.ts";
import { createMockConfig } from "./config.ts";

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
 * Initialize a DatabaseService with an in-memory database for testing.
 * Uses a temporary directory for the config root.
 */
export async function initTestDbService(): Promise<
  { db: DatabaseService; tempDir: string; cleanup: () => Promise<void> }
> {
  const tempDir = await Deno.makeTempDir({ prefix: "exo-test-" });

  // Create System directory
  await Deno.mkdir(`${tempDir}/System`, { recursive: true });

  const config = createMockConfig(tempDir);
  const db = new DatabaseService(config);

  // Initialize activity table
  db.instance.exec(`
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
  `);

  return {
    db,
    tempDir,
    cleanup: async () => {
      await db.close();
      await Deno.remove(tempDir, { recursive: true });
    },
  };
}
