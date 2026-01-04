/**
 * Notification Service
 *
 * Manages user notifications for memory updates.
 * Part of Phase 12.9: Agent Memory Updates
 *
 * Key responsibilities:
 * - Write notifications to System/Notifications/
 * - Activity Journal integration for audit trail
 * - Notification lifecycle management
 */

import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";
import type { MemoryUpdateProposal } from "../schemas/memory_bank.ts";

/**
 * Notification structure for memory updates
 */
export interface MemoryNotification {
  type: "memory_update_pending" | "memory_approved" | "memory_rejected";
  message: string;
  proposal_id: string;
  created_at: string;
}

/**
 * Notification Service
 *
 * Handles user notifications for memory updates.
 */
export class NotificationService {
  private notificationPath: string;

  constructor(
    private config: Config,
    private db: DatabaseService,
  ) {
    this.notificationPath = join(config.system.root, "System", "Notifications", "memory.json");
  }

  /**
   * Notify user of a pending memory update
   *
   * @param proposal - The pending proposal
   */
  async notifyMemoryUpdate(proposal: MemoryUpdateProposal): Promise<void> {
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

    // Create notification
    const notification: MemoryNotification = {
      type: "memory_update_pending",
      message: `Memory update pending: ${proposal.learning.title}`,
      proposal_id: proposal.id,
      created_at: new Date().toISOString(),
    };

    // Append to notifications file
    await this.appendNotification(notification);
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
   * Get all pending notifications
   *
   * @returns Array of notifications
   */
  async getNotifications(): Promise<MemoryNotification[]> {
    if (!await exists(this.notificationPath)) {
      return [];
    }

    try {
      const content = await Deno.readTextFile(this.notificationPath);
      return JSON.parse(content) as MemoryNotification[];
    } catch {
      return [];
    }
  }

  /**
   * Get count of pending notifications
   *
   * @returns Number of pending notifications
   */
  async getPendingCount(): Promise<number> {
    const notifications = await this.getNotifications();
    return notifications.filter((n) => n.type === "memory_update_pending").length;
  }

  /**
   * Clear a specific notification
   *
   * @param proposalId - Proposal ID to clear
   */
  async clearNotification(proposalId: string): Promise<void> {
    const notifications = await this.getNotifications();
    const filtered = notifications.filter((n) => n.proposal_id !== proposalId);
    await this.writeNotifications(filtered);
  }

  /**
   * Clear all notifications
   */
  async clearAllNotifications(): Promise<void> {
    await this.writeNotifications([]);
  }

  // ===== Private Helpers =====

  /**
   * Append a notification to the file
   */
  private async appendNotification(notification: MemoryNotification): Promise<void> {
    const notifications = await this.getNotifications();
    notifications.push(notification);
    await this.writeNotifications(notifications);
  }

  /**
   * Write notifications to file
   */
  private async writeNotifications(notifications: MemoryNotification[]): Promise<void> {
    await ensureDir(join(this.config.system.root, "System", "Notifications"));
    await Deno.writeTextFile(
      this.notificationPath,
      JSON.stringify(notifications, null, 2),
    );
  }

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
