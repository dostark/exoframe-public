import { assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { initTestDbService } from "./helpers/db.ts";
import { DatabaseService } from "../src/services/db.ts";
import { createMockConfig } from "./helpers/config.ts";

/**
 * Tests for DatabaseService covering:
 * - Batched write operations
 * - Error handling
 * - Edge cases (write during close, concurrent operations)
 * - Query methods
 */

Deno.test("DatabaseService: initializes with configuration", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    assertExists(db.instance);
    assertEquals(db.instance.constructor.name, "Database");

    db.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: logs single activity", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    const traceId = crypto.randomUUID();
    db.logActivity("user", "test.action", "target", { foo: "bar" }, traceId);

    await db.waitForFlush();

    const activities = db.getActivitiesByTrace(traceId);
    assertEquals(activities.length, 1);
    assertEquals(activities[0].actor, "user");
    assertEquals(activities[0].action_type, "test.action");
    assertEquals(activities[0].target, "target");
    assertEquals(JSON.parse(activities[0].payload).foo, "bar");

    db.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: batches multiple activities", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    const traceId = crypto.randomUUID();

    // Log multiple activities
    for (let i = 0; i < 5; i++) {
      db.logActivity("user", "test.action", `target-${i}`, { index: i }, traceId);
    }

    await db.waitForFlush();

    const activities = db.getActivitiesByTrace(traceId);
    assertEquals(activities.length, 5);
    assertEquals(activities[0].target, "target-0");
    assertEquals(activities[4].target, "target-4");

    db.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: flushes when max batch size reached", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    // Default max batch is 100

    const traceId = crypto.randomUUID();

    // Log exactly MAX_BATCH_SIZE activities
    for (let i = 0; i < 100; i++) {
      db.logActivity("user", "test.action", `target-${i}`, { index: i }, traceId);
    }

    // Should auto-flush at 100, no need to wait long
    await new Promise((resolve) => setTimeout(resolve, 50));

    const activities = db.getActivitiesByTrace(traceId);
    assertEquals(activities.length, 100);

    db.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: handles waitForFlush with empty queue", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    // Should return immediately
    await db.waitForFlush();

    db.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: prevents logging when closing", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    const traceId = crypto.randomUUID();
    db.logActivity("user", "test.before", "target", { test: 1 }, traceId);

    await db.waitForFlush();

    // Start closing
    const originalWarn = console.warn;
    let warnCalled = false;
    console.warn = () => {
      warnCalled = true;
    };

    // Close and try to log
    db.close();
    db.logActivity("user", "test.after", "target", { test: 2 }, traceId);

    console.warn = originalWarn;

    // Should have warned about logging during close
    assertEquals(warnCalled, true);

    // Only the first activity should be logged
    // Note: Can't query after close, so this test verifies the warning
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: flushes pending logs on close", async () => {
  const { db, tempDir, cleanup } = await initTestDbService();
  try {
    const traceId = crypto.randomUUID();

    // Log activities
    db.logActivity("user", "test.action1", "target", { test: 1 }, traceId);
    db.logActivity("user", "test.action2", "target", { test: 2 }, traceId);

    // Don't wait for flush, close immediately
    db.close();

    // Create new connection to verify data was flushed
    const config2 = createMockConfig(tempDir);
    const db2 = new DatabaseService(config2);
    // Initialize schema
    db2.instance.exec(`
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

    const activities = db2.getActivitiesByTrace(traceId);
    assertEquals(activities.length, 2);

    db2.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: getActivitiesByActionType returns filtered results", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    const traceId = crypto.randomUUID();

    // Log different action types
    db.logActivity("user", "type.one", "target1", {}, traceId);
    db.logActivity("user", "type.two", "target2", {}, traceId);
    db.logActivity("user", "type.one", "target3", {}, traceId);

    await db.waitForFlush();

    const typeOne = db.getActivitiesByActionType("type.one");
    const typeTwo = db.getActivitiesByActionType("type.two");

    assertEquals(typeOne.length, 2);
    assertEquals(typeTwo.length, 1);
    assertEquals(typeOne[0].action_type, "type.one");
    assertEquals(typeTwo[0].action_type, "type.two");

    db.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: getRecentActivity returns limited results", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    const traceId = crypto.randomUUID();

    // Log 10 activities
    for (let i = 0; i < 10; i++) {
      db.logActivity("user", "test.action", `target-${i}`, { index: i }, traceId);
    }

    await db.waitForFlush();

    // Get recent with limit
    const recent = db.getRecentActivity(5);
    assertEquals(recent.length, 5);

    // All should have the same trace_id
    for (const activity of recent) {
      assertEquals(activity.trace_id, traceId);
    }

    db.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: getRecentActivity flushes pending logs", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    const traceId = crypto.randomUUID();

    // Log activities without waiting for flush
    db.logActivity("user", "test.action", "target", { test: 1 }, traceId);
    db.logActivity("user", "test.action", "target", { test: 2 }, traceId);

    // getRecentActivity should flush pending logs
    const recent = db.getRecentActivity(10);
    assertEquals(recent.length, 2);

    db.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: handles null agent_id", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    const traceId = crypto.randomUUID();

    // Log with explicit null agent
    db.logActivity("user", "test.action", "target", { test: 1 }, traceId, null);

    await db.waitForFlush();

    const activities = db.getActivitiesByTrace(traceId);
    assertEquals(activities.length, 1);
    assertEquals(activities[0].agent_id, null);

    db.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: handles null target", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    const traceId = crypto.randomUUID();

    // Log with null target
    db.logActivity("user", "test.action", null, { test: 1 }, traceId);

    await db.waitForFlush();

    const activities = db.getActivitiesByTrace(traceId);
    assertEquals(activities.length, 1);
    assertEquals(activities[0].target, null);

    db.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: handles complex payload objects", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    const traceId = crypto.randomUUID();

    const complexPayload = {
      nested: {
        object: {
          with: "values",
        },
      },
      array: [1, 2, 3],
      boolean: true,
      number: 42,
      nullValue: null,
    };

    db.logActivity("user", "test.action", "target", complexPayload, traceId);

    await db.waitForFlush();

    const activities = db.getActivitiesByTrace(traceId);
    assertEquals(activities.length, 1);

    const payload = JSON.parse(activities[0].payload);
    assertEquals(payload.nested.object.with, "values");
    assertEquals(payload.array, [1, 2, 3]);
    assertEquals(payload.boolean, true);
    assertEquals(payload.number, 42);
    assertEquals(payload.nullValue, null);

    db.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: generates unique activity IDs", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    const traceId = crypto.randomUUID();

    // Log multiple activities
    for (let i = 0; i < 5; i++) {
      db.logActivity("user", "test.action", "target", {}, traceId);
    }

    await db.waitForFlush();

    const activities = db.getActivitiesByTrace(traceId);
    const ids = activities.map((a) => a.id);

    // All IDs should be unique
    const uniqueIds = new Set(ids);
    assertEquals(uniqueIds.size, 5);

    db.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: auto-generates trace_id if not provided", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    // Log without trace_id
    db.logActivity("user", "test.action", "target", {});

    await db.waitForFlush();

    const recent = db.getRecentActivity(1);
    assertEquals(recent.length, 1);
    assertExists(recent[0].trace_id);
    assertEquals(recent[0].trace_id.length, 36); // UUID format

    db.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: persists data across connections", async () => {
  const { db: db1, tempDir, cleanup } = await initTestDbService();
  try {
    const traceId = crypto.randomUUID();

    // First connection - write data
    db1.logActivity("user", "test.action", "target", { test: 1 }, traceId);
    await db1.waitForFlush();
    db1.close();

    // Second connection - read data
    const config = createMockConfig(tempDir);
    const db2 = new DatabaseService(config);
    // Initialize schema for second connection
    db2.instance.exec(`
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

    const activities = db2.getActivitiesByTrace(traceId);
    assertEquals(activities.length, 1);
    assertEquals(activities[0].action_type, "test.action");
    db2.close();
  } finally {
    await cleanup();
  }
});

Deno.test("DatabaseService: handles rapid concurrent logging", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    const traceId = crypto.randomUUID();

    // Log many activities rapidly
    const promises = [];
    for (let i = 0; i < 50; i++) {
      db.logActivity("user", "test.action", `target-${i}`, { index: i }, traceId);
      // Add small async operation to simulate concurrency
      promises.push(
        new Promise((resolve) => queueMicrotask(() => resolve(undefined))),
      );
    }

    await Promise.all(promises);
    await db.waitForFlush();

    const activities = db.getActivitiesByTrace(traceId);
    assertEquals(activities.length, 50);

    db.close();
  } finally {
    await cleanup();
  }
});
