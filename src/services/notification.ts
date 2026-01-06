/**
 * Notification Service
 *
 * Manages user notifications for memory updates.
 * Part of Phase 12.9: Agent Memory Updates
 * Updated in Phase 19.2b: Migrated from file-based to SQLite storage
 *
 * Key responsibilities:
 * - Store notifications in journal.db notifications table
 * - Activity Journal integration for audit trail
 * - Notification lifecycle management with soft-deletes
 */

import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";
import type { MemoryUpdateProposal } from "../schemas/memory_bank.ts";

/**
 * Notification structure for memory updates
 */
export interface MemoryNotification {
  id?: string;
  type: "memory_update_pending" | "memory_approved" | "memory_rejected";
  message: string;
  proposal_id?: string;
  trace_id?: string;
  created_at?: string;
  dismissed_at?: string | null;
  metadata?: string;
}

/**
 * Notification Service
 *
 * Handles user notifications for memory updates using SQLite storage.
 */
export class NotificationService {
  constructor(
    private config: Config,
    private db: DatabaseService,
  ) {
    // No file path needed - using database only!
  }

  /**
   * Notify user of a pending memory update
   *
   * @param proposal - The pending proposal
   */
  async notifyMemoryUpdate(proposal: MemoryUpdateProposal): Promise<void> {
    const metadata = JSON.stringify({
      learning_title: proposal.learning.title,
      reason: proposal.reason,
    });

    await this.notify(
      `Memory update pending: ${proposal.learning.title}`,
      "memory_update_pending",
      proposal.id,
      undefined,
      metadata,
    );

    // Log to Activity Journal
    this.logActivity({
      event_type: "memory.update.pending",
      target: proposal.target_project || "global",
      metadata: {
        proposal_id: proposal.id,
        learning_title: proposal.learning.title,
        reason: proposal.reason,
      },
    });
  }

  /**
   * Generic notify method
   */
  async notify(
    message: string,
    type = "info",
    proposalId?: string,
    traceId?: string,
    metadata?: string,
  ): Promise<void> {
    const id = crypto.randomUUID();
    await Promise.resolve(
      this.db.instance.prepare(`
      INSERT INTO notifications (id, type, message, proposal_id, trace_id, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
          id,
          type,
          message,
          proposalId || null,
          traceId || null,
          new Date().toISOString(),
          metadata || null,
        ),
    );
  }

  /**
   * Expose database for TUI needs
   */
  get database(): DatabaseService {
    return this.db;
  }

  /**
   * Notify of approval
   *
   * @param proposalId - Approved proposal ID
   * @param learningTitle - Title of the learning
   */
  notifyApproval(proposalId: string, learningTitle: string): void {
    this.logActivity({
      event_type: "memory.update.approved",
      target: proposalId,
      metadata: {
        proposal_id: proposalId,
        learning_title: learningTitle,
      },
    });
  }

  /**
   * Notify of rejection
   *
   * @param proposalId - Rejected proposal ID
   * @param reason - Rejection reason
   */
  notifyRejection(proposalId: string, reason: string): void {
    this.logActivity({
      event_type: "memory.update.rejected",
      target: proposalId,
      metadata: {
        proposal_id: proposalId,
        reason,
      },
    });
  }

  /**
   * Get all pending notifications (not dismissed)
   *
   * @returns Array of notifications
   */
  async getNotifications(): Promise<MemoryNotification[]> {
    const rows = this.db.instance.prepare(`
      SELECT id, type, message, proposal_id, trace_id, created_at, dismissed_at, metadata
      FROM notifications
      WHERE dismissed_at IS NULL
      ORDER BY created_at DESC
    `).all() as unknown as MemoryNotification[];

    return await Promise.resolve(rows);
  }

  /**
   * Get count of pending notifications
   *
   * @returns Number of pending notifications
   */
  async getPendingCount(): Promise<number> {
    const result = this.db.instance.prepare(`
      SELECT COUNT(*) as count
      FROM notifications
      WHERE type = 'memory_update_pending' AND dismissed_at IS NULL
    `).get() as { count: number };

    return await Promise.resolve(result?.count || 0);
  }

  /**
   * Clear a specific notification (soft-delete)
   *
   * @param proposalId - Proposal ID to clear
   */
  async clearNotification(proposalId: string): Promise<void> {
    await Promise.resolve(
      this.db.instance.prepare(`
      UPDATE notifications
      SET dismissed_at = ?
      WHERE proposal_id = ? AND dismissed_at IS NULL
    `).run(new Date().toISOString(), proposalId),
    );
  }

  /**
   * Clear all notifications (soft-delete)
   */
  async clearAllNotifications(): Promise<void> {
    await Promise.resolve(
      this.db.instance.prepare(`
      UPDATE notifications
      SET dismissed_at = ?
      WHERE dismissed_at IS NULL
    `).run(new Date().toISOString()),
    );
  }

  // ===== Private Helpers =====

  /**
   * Log activity to Activity Journal
   */
  private logActivity(event: {
    event_type: string;
    target: string;
    trace_id?: string;
    metadata?: Record<string, unknown>;
  }): void {
    try {
      this.db.logActivity(
        "notification-service",
        event.event_type,
        event.target,
        event.metadata || {},
        event.trace_id,
      );
    } catch {
      // Don't fail on logging errors
    }
  }
}
