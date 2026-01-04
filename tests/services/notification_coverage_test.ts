/**
 * Additional Coverage Tests for NotificationService
 *
 * Tests for untested paths to improve coverage:
 * - getNotifications handles corrupted JSON file
 * - logActivity handles database errors gracefully
 * - getPendingCount filters correctly
 * - clearNotification handles non-existent proposal
 */

import { assertEquals } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { initTestDbService } from "../helpers/db.ts";
import { NotificationService } from "../../src/services/notification.ts";
import type { MemoryUpdateProposal } from "../../src/schemas/memory_bank.ts";

/**
 * Creates test environment for notification tests
 */
async function initNotificationTest() {
  const { db, config, cleanup: dbCleanup } = await initTestDbService();

  // Create required directories
  await Deno.mkdir(join(config.system.root, "System", "Notifications"), {
    recursive: true,
  });

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
function createTestProposal(overrides?: Partial<MemoryUpdateProposal>): MemoryUpdateProposal {
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
    ...overrides,
  };
}

// ===== getNotifications Edge Cases =====

Deno.test("NotificationService: getNotifications handles corrupted JSON file", async () => {
  const { config, notification, cleanup } = await initNotificationTest();
  try {
    // Write corrupted JSON to the notification file
    const notifPath = join(
      config.system.root,
      "System",
      "Notifications",
      "memory.json",
    );
    await Deno.writeTextFile(notifPath, "{ not valid json {{{{");

    // Should return empty array instead of throwing
    const notifications = await notification.getNotifications();
    assertEquals(notifications.length, 0);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: getNotifications handles empty file", async () => {
  const { config, notification, cleanup } = await initNotificationTest();
  try {
    // Write empty file
    const notifPath = join(
      config.system.root,
      "System",
      "Notifications",
      "memory.json",
    );
    await Deno.writeTextFile(notifPath, "");

    // Should return empty array
    const notifications = await notification.getNotifications();
    assertEquals(notifications.length, 0);
  } finally {
    await cleanup();
  }
});

// ===== clearNotification Edge Cases =====

Deno.test("NotificationService: clearNotification handles non-existent proposal", async () => {
  const { notification, cleanup } = await initNotificationTest();
  try {
    // Add a notification
    const proposal = createTestProposal();
    await notification.notifyMemoryUpdate(proposal);

    // Clear a non-existent proposal (should not throw)
    await notification.clearNotification("non-existent-id");

    // Original notification should still exist
    const remaining = await notification.getNotifications();
    assertEquals(remaining.length, 1);
    assertEquals(remaining[0].proposal_id, proposal.id);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: clearNotification on empty file", async () => {
  const { notification, cleanup } = await initNotificationTest();
  try {
    // Clear when no notifications exist (should not throw)
    await notification.clearNotification("any-id");

    const notifications = await notification.getNotifications();
    assertEquals(notifications.length, 0);
  } finally {
    await cleanup();
  }
});

// ===== getPendingCount Edge Cases =====

Deno.test("NotificationService: getPendingCount with mixed notification types", async () => {
  const { config, notification, cleanup } = await initNotificationTest();
  try {
    // Manually write notifications with different types
    const notifPath = join(
      config.system.root,
      "System",
      "Notifications",
      "memory.json",
    );
    const mixedNotifications = [
      {
        type: "memory_update_pending",
        message: "Pending 1",
        proposal_id: "p1",
        created_at: new Date().toISOString(),
      },
      {
        type: "memory_approved",
        message: "Approved",
        proposal_id: "p2",
        created_at: new Date().toISOString(),
      },
      {
        type: "memory_update_pending",
        message: "Pending 2",
        proposal_id: "p3",
        created_at: new Date().toISOString(),
      },
      {
        type: "memory_rejected",
        message: "Rejected",
        proposal_id: "p4",
        created_at: new Date().toISOString(),
      },
    ];
    await Deno.writeTextFile(
      notifPath,
      JSON.stringify(mixedNotifications, null, 2),
    );

    // Should only count pending notifications
    const count = await notification.getPendingCount();
    assertEquals(count, 2);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: getPendingCount returns 0 on corrupted file", async () => {
  const { config, notification, cleanup } = await initNotificationTest();
  try {
    // Write corrupted JSON
    const notifPath = join(
      config.system.root,
      "System",
      "Notifications",
      "memory.json",
    );
    await Deno.writeTextFile(notifPath, "corrupted");

    // Should return 0 (getNotifications returns empty array on error)
    const count = await notification.getPendingCount();
    assertEquals(count, 0);
  } finally {
    await cleanup();
  }
});

// ===== logActivity Edge Cases =====

Deno.test("NotificationService: notifyApproval handles db errors gracefully", async () => {
  const { config, cleanup: dbCleanup } = await initTestDbService();

  try {
    // Create a mock DB that throws on logActivity
    const mockDb = {
      logActivity: () => {
        throw new Error("Database error");
      },
    };

    await Deno.mkdir(join(config.system.root, "System", "Notifications"), {
      recursive: true,
    });

    const notification = new NotificationService(config, mockDb as any);

    // Should not throw even when DB fails
    notification.notifyApproval("proposal-123", "Test Learning");

    // Test passes if no exception is thrown
  } finally {
    await dbCleanup();
  }
});

Deno.test("NotificationService: notifyRejection handles db errors gracefully", async () => {
  const { config, cleanup: dbCleanup } = await initTestDbService();

  try {
    // Create a mock DB that throws on logActivity
    const mockDb = {
      logActivity: () => {
        throw new Error("Database connection lost");
      },
    };

    await Deno.mkdir(join(config.system.root, "System", "Notifications"), {
      recursive: true,
    });

    const notification = new NotificationService(config, mockDb as any);

    // Should not throw even when DB fails
    notification.notifyRejection("proposal-456", "Not relevant");

    // Test passes if no exception is thrown
  } finally {
    await dbCleanup();
  }
});

Deno.test("NotificationService: notifyMemoryUpdate handles db errors gracefully", async () => {
  const { config, cleanup: dbCleanup } = await initTestDbService();

  try {
    // Create a mock DB that throws on logActivity
    const mockDb = {
      logActivity: () => {
        throw new Error("Database timeout");
      },
    };

    await Deno.mkdir(join(config.system.root, "System", "Notifications"), {
      recursive: true,
    });

    const notification = new NotificationService(config, mockDb as any);
    const proposal = createTestProposal();

    // Should not throw even when DB fails - notification file should still be written
    await notification.notifyMemoryUpdate(proposal);

    // Verify notification was still written despite DB error
    const notifications = await notification.getNotifications();
    assertEquals(notifications.length, 1);
    assertEquals(notifications[0].proposal_id, proposal.id);
  } finally {
    await dbCleanup();
  }
});

// ===== Multiple Operations =====

Deno.test("NotificationService: multiple operations in sequence", async () => {
  const { notification, cleanup } = await initNotificationTest();
  try {
    // Add multiple notifications
    const proposal1 = createTestProposal({ id: "seq-1" });
    const proposal2 = createTestProposal({ id: "seq-2" });
    const proposal3 = createTestProposal({ id: "seq-3" });

    await notification.notifyMemoryUpdate(proposal1);
    await notification.notifyMemoryUpdate(proposal2);
    await notification.notifyMemoryUpdate(proposal3);

    assertEquals(await notification.getPendingCount(), 3);

    // Clear middle one
    await notification.clearNotification("seq-2");
    assertEquals(await notification.getPendingCount(), 2);

    // Clear first one
    await notification.clearNotification("seq-1");
    assertEquals(await notification.getPendingCount(), 1);

    // Clear all remaining
    await notification.clearAllNotifications();
    assertEquals(await notification.getPendingCount(), 0);
  } finally {
    await cleanup();
  }
});

Deno.test("NotificationService: notifyMemoryUpdate with global scope proposal", async () => {
  const { notification, cleanup } = await initNotificationTest();
  try {
    // Create a global scope proposal (no target_project)
    const globalProposal = createTestProposal({
      id: "global-1",
      target_scope: "global",
      target_project: undefined,
    });

    await notification.notifyMemoryUpdate(globalProposal);

    const notifications = await notification.getNotifications();
    assertEquals(notifications.length, 1);
    assertEquals(notifications[0].proposal_id, "global-1");
  } finally {
    await cleanup();
  }
});
