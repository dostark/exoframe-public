/**
 * Notification Service SQLite Tests (Step 19.2b)
 *
 * TDD tests for migrating notifications from file-based to SQLite storage
 *
 * Tests:
 * - Migration adds notifications table
 * - NotificationService inserts into database
 * - Queries active notifications (dismissed_at IS NULL)
 * - Soft-deletes with dismissed_at timestamp
 * - Counts pending notifications
 * - Handles concurrent inserts
 */

import { assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { initTestDbService } from "../helpers/db.ts";
import { NotificationService } from "../../src/services/notification.ts";
import type { MemoryUpdateProposal } from "../../src/schemas/memory_bank.ts";

/**
 * Creates test environment for SQLite notification tests
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
function createTestProposal(id?: string): MemoryUpdateProposal {
  return {
    id: id || crypto.randomUUID(),
    created_at: new Date().toISOString(),
    operation: "add",
    target_scope: "project",
    target_project: "my-app",
    learning: {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
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

// ===== Migration Tests =====

Deno.test("Migration 003: adds notifications table to journal.db", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    // Check table exists
    const tables = db.instance.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'",
    ).all() as Array<{ name: string }>;

    assertEquals(tables.length, 1);
    assertEquals(tables[0].name, "notifications");

    // Check indexes exist
    const indexes = db.instance.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='notifications'",
    ).all() as Array<{ name: string }>;

    assertEquals(indexes.length >= 4, true, "Should have at least 4 indexes");
  } finally {
    await cleanup();
  }
});

Deno.test("Migration 003: notifications table has correct schema", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    const columns = db.instance.prepare(
      "PRAGMA table_info(notifications)",
    ).all() as Array<{ name: string; type: string; notnull: number }>;

    const columnNames = columns.map((c) => c.name);
    assertEquals(columnNames.includes("id"), true);
    assertEquals(columnNames.includes("type"), true);
    assertEquals(columnNames.includes("message"), true);
    assertEquals(columnNames.includes("proposal_id"), true);
    assertEquals(columnNames.includes("trace_id"), true);
    assertEquals(columnNames.includes("created_at"), true);
    assertEquals(columnNames.includes("dismissed_at"), true);
    assertEquals(columnNames.includes("metadata"), true);
  } finally {
    await cleanup();
  }
});

// ===== NotificationService SQLite Tests =====

Deno.test("NotificationService: inserts notification into database", async () => {
  const { db, notification, cleanup } = await initNotificationTest();
  try {
    const proposal = createTestProposal();
    await notification.notifyMemoryUpdate(proposal);

    // Query directly from database
    const rows = db.instance.prepare(
      "SELECT * FROM notifications WHERE proposal_id = ?",
    ).all(proposal.id) as Array<{
      id: string;
      type: string;
      message: string;
      proposal_id: string;
      created_at: string;
    }>;

    assertEquals(rows.length, 1);
    assertEquals(rows[0].type, "memory_update_pending");
    assertEquals(rows[0].proposal_id, proposal.id);
    assertExists(rows[0].id);
    assertExists(rows[0].created_at);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: getNotifications queries active notifications", async () => {
  const { notification, cleanup } = await initNotificationTest();
  try {
    const proposal = createTestProposal();
    await notification.notifyMemoryUpdate(proposal);

    const notifications = await notification.getNotifications();

    assertEquals(notifications.length, 1);
    assertEquals(notifications[0].proposal_id, proposal.id);
    assertEquals(notifications[0].type, "memory_update_pending");
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: getNotifications excludes dismissed notifications", async () => {
  const { db, notification, cleanup } = await initNotificationTest();
  try {
    const proposal1 = createTestProposal();
    const proposal2 = createTestProposal();

    await notification.notifyMemoryUpdate(proposal1);
    await notification.notifyMemoryUpdate(proposal2);

    // Manually dismiss one notification
    db.instance.prepare(
      "UPDATE notifications SET dismissed_at = ? WHERE proposal_id = ?",
    ).run(new Date().toISOString(), proposal1.id);

    const active = await notification.getNotifications();

    assertEquals(active.length, 1);
    assertEquals(active[0].proposal_id, proposal2.id);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: clearNotification soft-deletes with dismissed_at", async () => {
  const { db, notification, cleanup } = await initNotificationTest();
  try {
    const proposal = createTestProposal();
    await notification.notifyMemoryUpdate(proposal);

    await notification.clearNotification(proposal.id);

    // Check dismissed_at is set
    const rows = db.instance.prepare(
      "SELECT dismissed_at FROM notifications WHERE proposal_id = ?",
    ).all(proposal.id) as Array<{ dismissed_at: string | null }>;

    assertEquals(rows.length, 1);
    assertExists(rows[0].dismissed_at);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: clearNotification only affects undismissed notifications", async () => {
  const { db, notification, cleanup } = await initNotificationTest();
  try {
    const proposal = createTestProposal();
    await notification.notifyMemoryUpdate(proposal);

    // Clear once
    await notification.clearNotification(proposal.id);

    const firstDismissed = db.instance.prepare(
      "SELECT dismissed_at FROM notifications WHERE proposal_id = ?",
    ).get(proposal.id) as { dismissed_at: string };

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Try to clear again - should not update timestamp
    await notification.clearNotification(proposal.id);

    const secondDismissed = db.instance.prepare(
      "SELECT dismissed_at FROM notifications WHERE proposal_id = ?",
    ).get(proposal.id) as { dismissed_at: string };

    assertEquals(firstDismissed.dismissed_at, secondDismissed.dismissed_at);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: clearAllNotifications soft-deletes all active", async () => {
  const { db, notification, cleanup } = await initNotificationTest();
  try {
    await notification.notifyMemoryUpdate(createTestProposal());
    await notification.notifyMemoryUpdate(createTestProposal());
    await notification.notifyMemoryUpdate(createTestProposal());

    await notification.clearAllNotifications();

    // Check all have dismissed_at
    const rows = db.instance.prepare(
      "SELECT COUNT(*) as count FROM notifications WHERE dismissed_at IS NULL",
    ).get() as { count: number };

    assertEquals(rows.count, 0);
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

    await notification.notifyMemoryUpdate(createTestProposal());
    assertEquals(await notification.getPendingCount(), 2);

    // Clear one
    const notifications = await notification.getNotifications();
    await notification.clearNotification(notifications[0].proposal_id!);

    assertEquals(await notification.getPendingCount(), 1);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: handles concurrent inserts", async () => {
  const { notification, cleanup } = await initNotificationTest();
  try {
    // Insert 10 notifications concurrently
    const proposals = Array.from({ length: 10 }, () => createTestProposal());

    await Promise.all(
      proposals.map((p) => notification.notifyMemoryUpdate(p)),
    );

    const notifications = await notification.getNotifications();
    assertEquals(notifications.length, 10);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: stores metadata as JSON", async () => {
  const { db, notification, cleanup } = await initNotificationTest();
  try {
    const proposal = createTestProposal();
    await notification.notifyMemoryUpdate(proposal);

    const rows = db.instance.prepare(
      "SELECT metadata FROM notifications WHERE proposal_id = ?",
    ).all(proposal.id) as Array<{ metadata: string }>;

    assertEquals(rows.length, 1);
    const metadata = JSON.parse(rows[0].metadata);
    assertEquals(metadata.learning_title, proposal.learning.title);
    assertEquals(metadata.reason, proposal.reason);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: getNotifications returns empty array when none exist", async () => {
  const { notification, cleanup } = await initNotificationTest();
  try {
    const notifications = await notification.getNotifications();
    assertEquals(notifications.length, 0);
  } finally {
    await cleanup();
  }
});
