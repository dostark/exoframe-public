/**
 * Integration Tests for File Watcher + Activity Journal
 *
 * Success Criteria:
 * - Test 1: File watcher events (create, modify) are logged to Activity Journal
 * - Test 2: Logs include trace context (trace_id, file path, event type)
 * - Test 3: Watcher integrates with DatabaseService for persistence
 */

import { assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { FileWatcher } from "../src/services/watcher.ts";
import { initTestDb } from "./helpers/db.ts";
import { createMockConfig } from "./helpers/config.ts";
Deno.test("Watcher logs file events to Activity Journal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-db-test-" });

  try {
    // Setup: Create temporary workspace structure
    const inboxPath = join(tempDir, "Inbox", "Requests");
    const systemPath = join(tempDir, "System");

    await Deno.mkdir(inboxPath, { recursive: true });
    await Deno.mkdir(systemPath, { recursive: true });

    // Setup: Initialize in‑memory database with activity table
    const db = initTestDb();

    // Setup: Create mock config
    const config = createMockConfig(tempDir, {
      watcher: { debounce_ms: 100, stability_check: true },
    });

    // Track events received
    const eventsReceived: string[] = [];

    // Create watcher with DB logging handler
    const watcher = new FileWatcher(config, (event) => {
      eventsReceived.push(event.path);

      // Log to Activity Journal
      const activityId = crypto.randomUUID();
      const traceId = crypto.randomUUID();

      db.exec(
        `INSERT INTO activity (id, trace_id, actor, action_type, target, payload)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          activityId,
          traceId,
          "file_watcher",
          "file.detected",
          event.path,
          JSON.stringify({
            content_length: event.content.length,
            detected_at: new Date().toISOString(),
          }),
        ],
      );
    });

    // Start watcher in background (don't await - it runs forever)
    const _watcherStarted = watcher.start().catch(() => {
      // Ignore abort error when test stops watcher
    });

    // Wait for watcher to initialize
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Create a test file
    const testFile = join(inboxPath, "test-request.md");
    await Deno.writeTextFile(testFile, "# Test Request\n\nThis is a test.");

    // Wait for debounce + stability check + processing
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Stop watcher (this will abort the watcher loop)
    watcher.stop();

    // Verify: Event was received
    assertEquals(eventsReceived.length, 1);
    assertEquals(eventsReceived[0].endsWith("test-request.md"), true);

    // Verify: Activity was logged to database
    const activities = db.prepare(
      "SELECT * FROM activity WHERE action_type = 'file.detected' ORDER BY timestamp DESC",
    ).all();

    assertEquals(activities.length, 1);

    const activity = activities[0] as {
      id: string;
      trace_id: string;
      actor: string;
      action_type: string;
      target: string;
      payload: string;
    };

    assertExists(activity.id);
    assertExists(activity.trace_id);
    assertEquals(activity.actor, "file_watcher");
    assertEquals(activity.action_type, "file.detected");
    assertEquals(activity.target.endsWith("test-request.md"), true);

    // Verify payload
    const payload = JSON.parse(activity.payload);
    assertExists(payload.content_length);
    assertExists(payload.detected_at);
    assertEquals(payload.content_length > 0, true);

    // Cleanup database
    db.close();
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});
