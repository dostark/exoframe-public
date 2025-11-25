import { Database } from "@db/sqlite";
import { join } from "@std/path";
import type { Config } from "../config/schema.ts";

interface LogEntry {
  activityId: string;
  traceId: string;
  actor: string;
  agentId: string | null;
  actionType: string;
  target: string | null;
  payload: string;
  timestamp: string;
}

export class DatabaseService {
  private db: Database;
  private logQueue: LogEntry[] = [];
  private flushTimer: number | null = null;
  private readonly FLUSH_INTERVAL_MS: number;
  private readonly MAX_BATCH_SIZE: number;
  private isClosing = false;

  constructor(config: Config) {
    const dbPath = join(config.system.root, "System", "journal.db");
    this.db = new Database(dbPath);
    // Enable WAL mode for concurrency
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");

    // Load batch configuration
    this.FLUSH_INTERVAL_MS = config.database.batch_flush_ms;
    this.MAX_BATCH_SIZE = config.database.batch_max_size;
  }

  /**
   * Get the raw Database instance
   */
  get instance(): Database {
    return this.db;
  }

  /**
   * Log an activity to the journal (non-blocking, batched writes)
   */
  logActivity(
    actor: string,
    actionType: string,
    target: string | null,
    payload: Record<string, unknown>,
    traceId?: string,
    agentId?: string | null,
  ) {
    if (this.isClosing) {
      console.warn("Cannot log activity: DatabaseService is closing");
      return;
    }

    const entry: LogEntry = {
      activityId: crypto.randomUUID(),
      traceId: traceId || crypto.randomUUID(),
      actor,
      agentId: agentId || null,
      actionType,
      target,
      payload: JSON.stringify(payload),
      timestamp: new Date().toISOString(),
    };

    this.logQueue.push(entry);

    // Flush immediately if batch size exceeded
    if (this.logQueue.length >= this.MAX_BATCH_SIZE) {
      this.flush();
    } else if (!this.flushTimer) {
      // Schedule flush after interval
      this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL_MS);
    }
  }

  /**
   * Flush pending log entries to database
   */
  private flush() {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.logQueue.length === 0) return;

    const batch = this.logQueue.splice(0);

    // Write asynchronously without blocking
    queueMicrotask(() => {
      try {
        this.db.exec("BEGIN TRANSACTION");

        for (const entry of batch) {
          this.db.exec(
            `INSERT INTO activity (id, trace_id, actor, agent_id, action_type, target, payload, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entry.activityId,
              entry.traceId,
              entry.actor,
              entry.agentId,
              entry.actionType,
              entry.target,
              entry.payload,
              entry.timestamp,
            ],
          );
        }

        this.db.exec("COMMIT");
      } catch (error) {
        console.error(`Failed to flush ${batch.length} activity logs:`, error);
        // Attempt rollback on error
        try {
          this.db.exec("ROLLBACK");
        } catch (rollbackError) {
          console.error("Failed to rollback transaction:", rollbackError);
        }
      }
    });
  }

  /**
   * Close the database connection and flush pending logs
   */
  async close() {
    this.isClosing = true;

    // Flush any remaining logs synchronously before closing
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.logQueue.length > 0) {
      const batch = this.logQueue.splice(0);

      try {
        this.db.exec("BEGIN TRANSACTION");

        for (const entry of batch) {
          this.db.exec(
            `INSERT INTO activity (id, trace_id, actor, agent_id, action_type, target, payload, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entry.activityId,
              entry.traceId,
              entry.actor,
              entry.agentId,
              entry.actionType,
              entry.target,
              entry.payload,
              entry.timestamp,
            ],
          );
        }

        this.db.exec("COMMIT");
      } catch (error) {
        console.error(`Failed to flush final ${batch.length} activity logs:`, error);
        try {
          this.db.exec("ROLLBACK");
        } catch (rollbackError) {
          console.error("Failed to rollback final transaction:", rollbackError);
        }
      }
    }

    this.db.close();
  }
}
