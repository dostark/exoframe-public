import { Database } from "@db/sqlite";
import { join } from "@std/path";
import type { Config } from "../config/schema.ts";

export class DatabaseService {
  private db: Database;

  constructor(config: Config) {
    const dbPath = join(config.system.root, "System", "journal.db");
    this.db = new Database(dbPath);
    // Enable WAL mode for concurrency
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  /**
   * Get the raw Database instance
   */
  get instance(): Database {
    return this.db;
  }

  /**
   * Log an activity to the journal
   */
  logActivity(
    actor: string,
    actionType: string,
    target: string | null,
    payload: Record<string, unknown>,
    traceId?: string,
  ) {
    try {
      const activityId = crypto.randomUUID();
      const finalTraceId = traceId || crypto.randomUUID();

      const timestamp = new Date().toISOString();

      this.db.exec(
        `INSERT INTO activity (id, trace_id, actor, action_type, target, payload, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          activityId,
          finalTraceId,
          actor,
          actionType,
          target,
          JSON.stringify(payload),
          timestamp,
        ],
      );
    } catch (error) {
      console.error("Failed to log activity:", error);
    }
  }

  close() {
    this.db.close();
  }
}
