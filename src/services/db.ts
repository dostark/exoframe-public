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
   * Wait for all pending log entries to be flushed
   * Returns a promise that resolves when the queue is empty
   */
  async waitForFlush(): Promise<void> {
    // If there's nothing queued, return immediately
    if (this.logQueue.length === 0) return;

    // Trigger flush if scheduled
    this.flush();

    // Wait for queue to be empty using exponential backoff
    let attempts = 0;
    const maxAttempts = 20; // Max 2 seconds (100ms * 20)
    while (this.logQueue.length > 0 && attempts < maxAttempts) {
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      attempts++;
      if (this.logQueue.length > 0) {
        // Small delay if queue is still not empty
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // One more microtask to ensure writes completed
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
  }

  /**
   * Execute batch insert with transaction handling
   * @private
   */
  private executeBatchInsert(batch: LogEntry[], context: string): void {
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
      console.error(`Failed to flush ${batch.length} activity logs (${context}):`, error);
      // Attempt rollback on error
      try {
        this.db.exec("ROLLBACK");
      } catch (rollbackError) {
        console.error("Failed to rollback transaction:", rollbackError);
      }
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
      this.executeBatchInsert(batch, "flush");
    });
  }

  /**
   * Close the database connection and flush pending logs
   */
  close() {
    this.isClosing = true;

    // Flush any remaining logs synchronously before closing
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.logQueue.length > 0) {
      const batch = this.logQueue.splice(0);
      this.executeBatchInsert(batch, "close");
    }

    this.db.close();
  }

  /**
   * Query activities by trace_id (for testing/debugging)
   */
  getActivitiesByTrace(traceId: string): Array<{
    id: string;
    trace_id: string;
    actor: string;
    agent_id: string | null;
    action_type: string;
    target: string | null;
    payload: string;
    timestamp: string;
  }> {
    const stmt = this.db.prepare(
      `SELECT id, trace_id, actor, agent_id, action_type, target, payload, timestamp
       FROM activity
       WHERE trace_id = ?
       ORDER BY timestamp`,
    );

    return stmt.all(traceId) as Array<{
      id: string;
      trace_id: string;
      actor: string;
      agent_id: string | null;
      action_type: string;
      target: string | null;
      payload: string;
      timestamp: string;
    }>;
  }

  /**
   * Query activities by action_type (for testing/debugging)
   */
  getActivitiesByActionType(actionType: string): Array<{
    id: string;
    trace_id: string;
    actor: string;
    agent_id: string | null;
    action_type: string;
    target: string | null;
    payload: string;
    timestamp: string;
  }> {
    const stmt = this.db.prepare(
      `SELECT id, trace_id, actor, agent_id, action_type, target, payload, timestamp
       FROM activity
       WHERE action_type = ?
       ORDER BY timestamp`,
    );

    return stmt.all(actionType) as Array<{
      id: string;
      trace_id: string;
      actor: string;
      agent_id: string | null;
      action_type: string;
      target: string | null;
      payload: string;
      timestamp: string;
    }>;
  }

  /**
   * Query recent activities (for testing/debugging)
   */
  getRecentActivity(limit: number = 100): Array<{
    id: string;
    trace_id: string;
    actor: string;
    agent_id: string | null;
    action_type: string;
    target: string | null;
    payload: Record<string, unknown>;
    timestamp: string;
  }> {
    // Flush pending logs synchronously for testing
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.logQueue.length > 0) {
      const batch = this.logQueue.splice(0);
      this.executeBatchInsert(batch, "getRecentActivity");
    }

    const stmt = this.db.prepare(
      `SELECT id, trace_id, actor, agent_id, action_type, target, payload, timestamp
       FROM activity
       ORDER BY timestamp DESC
       LIMIT ?`,
    );

    const rows = stmt.all(limit) as Array<{
      id: string;
      trace_id: string;
      actor: string;
      agent_id: string | null;
      action_type: string;
      target: string | null;
      payload: string;
      timestamp: string;
    }>;

    // Parse payload JSON
    return rows.map((row) => ({
      ...row,
      payload: JSON.parse(row.payload),
    }));
  }
}
