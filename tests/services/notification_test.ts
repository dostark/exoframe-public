/**
 * Notification Service Tests
 *
 * TDD tests for Phase 12.9: User Notification
 *
 * Tests:
 * - notifyMemoryUpdate logs to Activity Journal
 * - notifyMemoryUpdate writes notification file
 * - getNotifications returns pending notifications
 * - clearNotification removes notification
 */

import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { initTestDbService } from "../helpers/db.ts";
import { NotificationService } from "../../src/services/notification.ts";
import type { MemoryUpdateProposal } from "../../src/schemas/memory_bank.ts";

/**
 * Creates test environment for notification tests
 */
async function initNotificationTest() {
  const { db, config, cleanup: dbCleanup } = await initTestDbService();
  const notification = new NotificationService(config, db);

  const cleanup = async () => {
    await dbCleanup();
  };

  return {
    config,
    db,
    notification,
    cleanup,
  };
}

/**
 * Creates a test proposal
 */
function createTestProposal(): MemoryUpdateProposal {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    created_at: "2026-01-04T12:00:00Z",
    operation: "add",
    target_scope: "project",
    target_project: "my-app",
    learning: {
      id: "550e8400-e29b-41d4-a716-446655440001",
      created_at: "2026-01-04T12:00:00Z",
      source: "execution",
      scope: "project",
      project: "my-app",
      title: "Test Pattern",
      description: "A test pattern for notifications",
      category: "pattern",
      tags: ["test"],
      confidence: "medium",
    },
    reason: "Extracted from execution",
    agent: "senior-coder",
    execution_id: "trace-123",
    status: "pending",
  };
}

// ===== NotificationService Tests =====

Deno.test("NotificationService: notifyMemoryUpdate logs to Activity Journal", async () => {
  const { db, notification, cleanup } = await initNotificationTest();
  try {
    const proposal = createTestProposal();

    await notification.notifyMemoryUpdate(proposal);

    // Wait for batch flush
    await db.waitForFlush();

    // Check Activity Journal
    const activities = db.instance.prepare(
      "SELECT action_type, target, payload FROM activity WHERE action_type = 'memory.update.pending'",
    ).all() as Array<{ action_type: string; target: string; payload: string }>;
    assertEquals(activities.length, 1);
    assertStringIncludes(activities[0].payload, proposal.id);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: notifyMemoryUpdate writes notification to database", async () => {
  const { db, notification, cleanup } = await initNotificationTest();
  try {
    const proposal = createTestProposal();

    await notification.notifyMemoryUpdate(proposal);

    // Check notification was written to database
    const rows = db.instance.prepare(
      "SELECT * FROM notifications WHERE proposal_id = ?",
    ).all(proposal.id) as Array<{
      id: string;
      type: string;
      message: string;
      proposal_id: string;
    }>;

    assertEquals(rows.length, 1);
    assertEquals(rows[0].proposal_id, proposal.id);
    assertEquals(rows[0].type, "memory_update_pending");
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: notifyMemoryUpdate appends to existing notifications", async () => {
  const { notification, cleanup } = await initNotificationTest();
  try {
    const proposal1 = createTestProposal();
    const proposal2 = {
      ...createTestProposal(),
      id: "550e8400-e29b-41d4-a716-446655440002",
    };

    await notification.notifyMemoryUpdate(proposal1);
    await notification.notifyMemoryUpdate(proposal2);

    const notifications = await notification.getNotifications();
    assertEquals(notifications.length, 2);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: getNotifications returns all pending", async () => {
  const { notification, cleanup } = await initNotificationTest();
  try {
    const proposal = createTestProposal();
    await notification.notifyMemoryUpdate(proposal);

    const notifications = await notification.getNotifications();

    assertEquals(notifications.length, 1);
    assertEquals(notifications[0].proposal_id, proposal.id);
    assertExists(notifications[0].created_at);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: getNotifications returns empty array if none", async () => {
  const { notification, cleanup } = await initNotificationTest();
  try {
    const notifications = await notification.getNotifications();
    assertEquals(notifications.length, 0);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: clearNotification removes specific notification", async () => {
  const { notification, cleanup } = await initNotificationTest();
  try {
    const proposal1 = createTestProposal();
    const proposal2 = {
      ...createTestProposal(),
      id: "550e8400-e29b-41d4-a716-446655440003",
    };

    await notification.notifyMemoryUpdate(proposal1);
    await notification.notifyMemoryUpdate(proposal2);

    await notification.clearNotification(proposal1.id);

    const remaining = await notification.getNotifications();
    assertEquals(remaining.length, 1);
    assertEquals(remaining[0].proposal_id, proposal2.id);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: clearAllNotifications removes all", async () => {
  const { notification, cleanup } = await initNotificationTest();
  try {
    const proposal1 = createTestProposal();
    const proposal2 = {
      ...createTestProposal(),
      id: "550e8400-e29b-41d4-a716-446655440004",
    };

    await notification.notifyMemoryUpdate(proposal1);
    await notification.notifyMemoryUpdate(proposal2);

    await notification.clearAllNotifications();

    const remaining = await notification.getNotifications();
    assertEquals(remaining.length, 0);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: notifyApproval logs approval event", async () => {
  const { db, notification, cleanup } = await initNotificationTest();
  try {
    await notification.notifyApproval("proposal-id-123", "Test Learning");

    await db.waitForFlush();

    const activities = db.instance.prepare(
      "SELECT action_type FROM activity WHERE action_type = 'memory.update.approved'",
    ).all() as Array<{ action_type: string }>;
    assertEquals(activities.length, 1);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: notifyRejection logs rejection event", async () => {
  const { db, notification, cleanup } = await initNotificationTest();
  try {
    await notification.notifyRejection("proposal-id-456", "Not relevant");

    await db.waitForFlush();

    const activities = db.instance.prepare(
      "SELECT action_type, payload FROM activity WHERE action_type = 'memory.update.rejected'",
    ).all() as Array<{ action_type: string; payload: string }>;
    assertEquals(activities.length, 1);
    assertStringIncludes(activities[0].payload, "Not relevant");
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: getPendingCount returns correct count", async () => {
  const { notification, cleanup } = await initNotificationTest();
  try {
    assertEquals(await notification.getPendingCount(), 0);

    await notification.notifyMemoryUpdate(createTestProposal());
    assertEquals(await notification.getPendingCount(), 1);

    await notification.notifyMemoryUpdate({
      ...createTestProposal(),
      id: "550e8400-e29b-41d4-a716-446655440005",
    });
    assertEquals(await notification.getPendingCount(), 2);
  } finally {
    await cleanup();
  }
});
