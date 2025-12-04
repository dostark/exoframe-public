/**
 * Changeset Registry Service
 *
 * Manages changesets created by agents during plan execution.
 * Provides database-backed tracking with approval workflow.
 */

import type { DatabaseService } from "./db.ts";
import type { EventLogger } from "./event_logger.ts";
import {
  type Changeset,
  type ChangesetFilters,
  ChangesetSchema,
  type ChangesetStatus,
  type RegisterChangesetInput,
  RegisterChangesetSchema,
} from "../schemas/changeset.ts";

export class ChangesetRegistry {
  constructor(
    private db: DatabaseService,
    private logger: EventLogger,
  ) {}

  /**
   * Register a new changeset created by an agent
   */
  register(input: RegisterChangesetInput): string {
    // Validate input
    const validated = RegisterChangesetSchema.parse(input);

    // Generate UUID for changeset
    const id = crypto.randomUUID();
    const created = new Date().toISOString();
    const status = "pending";

    // Insert into database
    const sql = `
      INSERT INTO changesets (
        id, trace_id, portal, branch, status, description,
        commit_sha, files_changed, created, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.db.instance.prepare(sql).run(
      id,
      validated.trace_id,
      validated.portal,
      validated.branch,
      status,
      validated.description,
      validated.commit_sha || null,
      validated.files_changed,
      created,
      validated.created_by,
    );

    // Log to Activity Journal
    this.logger.info("changeset.created", validated.branch, {
      changeset_id: id,
      trace_id: validated.trace_id,
      portal: validated.portal,
      branch: validated.branch,
      created_by: validated.created_by,
      files_changed: validated.files_changed,
    }, validated.trace_id);

    return id;
  }

  /**
   * Get changeset by ID
   */
  get(id: string): Changeset | null {
    const sql = `SELECT * FROM changesets WHERE id = ?`;
    const row = this.db.instance.prepare(sql).get(id);

    if (!row) {
      return null;
    }

    return ChangesetSchema.parse(row);
  }

  /**
   * Get changeset by branch name
   */
  getByBranch(branch: string): Changeset | null {
    const sql = `SELECT * FROM changesets WHERE branch = ?`;
    const row = this.db.instance.prepare(sql).get(branch);

    if (!row) {
      return null;
    }

    return ChangesetSchema.parse(row);
  }

  /**
   * List changesets with optional filters
   */
  list(filters?: ChangesetFilters): Changeset[] {
    let sql = `SELECT * FROM changesets WHERE 1=1`;
    const params: Array<string | number> = [];

    if (filters?.trace_id) {
      sql += ` AND trace_id = ?`;
      params.push(filters.trace_id);
    }

    if (filters?.portal) {
      sql += ` AND portal = ?`;
      params.push(filters.portal);
    }

    if (filters?.status) {
      sql += ` AND status = ?`;
      params.push(filters.status);
    }

    if (filters?.created_by) {
      sql += ` AND created_by = ?`;
      params.push(filters.created_by);
    }

    sql += ` ORDER BY created DESC`;

    const rows = this.db.instance.prepare(sql).all(
      ...(params as Array<string | number | boolean | null | Uint8Array | bigint>),
    );
    return rows.map((row) => ChangesetSchema.parse(row));
  }

  /**
   * Update changeset status
   */
  updateStatus(
    id: string,
    status: ChangesetStatus,
    user?: string,
    reason?: string,
  ): void {
    // Get existing changeset
    const changeset = this.get(id);
    if (!changeset) {
      throw new Error(`Changeset not found: ${id}`);
    }

    const timestamp = new Date().toISOString();

    let sql = `UPDATE changesets SET status = ?`;
    const params: Array<string | number | null> = [status];

    if (status === "approved") {
      sql = `UPDATE changesets SET status = ?, approved_at = ?, approved_by = ? WHERE id = ?`;
      params.push(timestamp, user || null, id);

      // Log approval
      this.logger.info("changeset.approved", changeset.branch, {
        changeset_id: id,
        trace_id: changeset.trace_id,
        portal: changeset.portal,
        branch: changeset.branch,
        approved_by: user,
        approved_at: timestamp,
      }, changeset.trace_id);
    } else if (status === "rejected") {
      sql = `UPDATE changesets SET status = ?, rejected_at = ?, rejected_by = ?, rejection_reason = ? WHERE id = ?`;
      params.push(timestamp, user || null, reason || null, id);

      // Log rejection
      this.logger.info("changeset.rejected", changeset.branch, {
        changeset_id: id,
        trace_id: changeset.trace_id,
        portal: changeset.portal,
        branch: changeset.branch,
        rejected_by: user,
        rejected_at: timestamp,
        rejection_reason: reason,
      }, changeset.trace_id);
    } else {
      sql += ` WHERE id = ?`;
      params.push(id);
    }

    this.db.instance.prepare(sql).run(...(params as Array<string | number | boolean | null | Uint8Array | bigint>));
  }

  /**
   * Get all changesets for a specific trace
   */
  getByTrace(trace_id: string): Changeset[] {
    return this.list({ trace_id });
  }

  /**
   * Get pending changesets for a portal
   */
  getPendingForPortal(portal: string): Changeset[] {
    return this.list({ portal, status: "pending" });
  }

  /**
   * Count changesets by status
   */
  countByStatus(status: ChangesetStatus): number {
    const sql = `SELECT COUNT(*) as count FROM changesets WHERE status = ?`;
    const row = this.db.instance.prepare(sql).get(status);
    return (row as { count: number })?.count || 0;
  }

  /**
   * Delete a changeset (for testing/cleanup only)
   */
  delete(id: string): void {
    const sql = `DELETE FROM changesets WHERE id = ?`;
    this.db.instance.prepare(sql).run(id);
  }
}
