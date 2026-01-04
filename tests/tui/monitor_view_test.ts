import { assert, assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { LOG_COLORS, LOG_ICONS, MONITOR_KEY_BINDINGS, MonitorView } from "../../src/tui/monitor_view.ts";
import type { LogEntry } from "../../src/tui/monitor_view.ts";
import { DatabaseService } from "../../src/services/db.ts";
import { createMockDatabaseService, createMonitorViewWithLogs } from "./helpers.ts";

// Additional coverage for MonitorView rendering and color helpers
Deno.test("MonitorView - getLogColor covers all cases", () => {
  const db = createMockDatabaseService();
  const monitorView = new MonitorView(db as unknown as DatabaseService);
  assertEquals(monitorView.getLogColor("request_created"), "green");
  assertEquals(monitorView.getLogColor("plan_approved"), "blue");
  assertEquals(monitorView.getLogColor("execution_started"), "yellow");
  assertEquals(monitorView.getLogColor("execution_completed"), "green");
  assertEquals(monitorView.getLogColor("error"), "red");
  assertEquals(monitorView.getLogColor("unknown_type"), "white");
});

Deno.test("MonitorView - getAnsiColorCode covers all cases", () => {
  const db = createMockDatabaseService();
  const monitorView = new MonitorView(db as unknown as DatabaseService);
  assertEquals(monitorView["getAnsiColorCode"]("red"), 31);
  assertEquals(monitorView["getAnsiColorCode"]("green"), 32);
  assertEquals(monitorView["getAnsiColorCode"]("yellow"), 33);
  assertEquals(monitorView["getAnsiColorCode"]("blue"), 34);
  assertEquals(monitorView["getAnsiColorCode"]("white"), 37);
  assertEquals(monitorView["getAnsiColorCode"]("unknown"), 37);
});

Deno.test("MonitorView - renderLogs outputs ANSI and handles empty", () => {
  const logs = [
    {
      id: "1",
      trace_id: "t1",
      actor: "user",
      agent_id: "a1",
      action_type: "error",
      target: "target.md",
      payload: {},
      timestamp: "2025-12-22T10:00:00Z",
    },
    {
      id: "2",
      trace_id: "t2",
      actor: "user",
      agent_id: "a2",
      action_type: "unknown_type",
      target: "target2.md",
      payload: {},
      timestamp: "2025-12-22T10:01:00Z",
    },
  ];
  const { db: _db, monitorView } = createMonitorViewWithLogs(logs);
  monitorView.setFilter({});
  const output = monitorView.renderLogs();
  assert(output.includes("\x1b[31m")); // red for error
  assert(output.includes("\x1b[37m")); // white for unknown
  // Empty logs
  const { db: _emptyDb, monitorView: emptyView } = createMonitorViewWithLogs([]);
  assertEquals(emptyView.renderLogs(), "");
});

// Mock DatabaseService for testing - use `createMockDatabaseService` in `tests/tui/helpers.ts` instead

Deno.test("MonitorView - should display real-time log streaming", () => {
  const { db: _db, monitorView } = createMonitorViewWithLogs([
    {
      id: "1",
      trace_id: "trace-1",
      actor: "agent",
      agent_id: "researcher",
      action_type: "request_created",
      target: "Inbox/Requests/test.md",
      payload: { description: "Test request" },
      timestamp: "2025-12-21T10:00:00Z",
    },
  ]);

  // Test that it can retrieve logs
  const logs = monitorView.getLogs();
  assertEquals(logs.length, 1);
  assertEquals(logs[0].actor, "agent");
  assertEquals(logs[0].action_type, "request_created");
});

Deno.test("MonitorView - should filter logs by agent", () => {
  const { db: _db, monitorView } = createMonitorViewWithLogs([
    {
      id: "1",
      trace_id: "trace-1",
      actor: "agent",
      agent_id: "researcher",
      action_type: "request_created",
      target: "Inbox/Requests/test.md",
      payload: { description: "Test request" },
      timestamp: "2025-12-21T10:00:00Z",
    },
    {
      id: "2",
      trace_id: "trace-2",
      actor: "agent",
      agent_id: "architect",
      action_type: "plan_approved",
      target: "Inbox/Plans/test.md",
      payload: { plan: "Test plan" },
      timestamp: "2025-12-21T10:01:00Z",
    },
  ]);

  // Test filtering by agent
  monitorView.setFilter({ agent: "researcher" });
  const filteredLogs = monitorView.getFilteredLogs();
  assertEquals(filteredLogs.length, 1);
  assertEquals(filteredLogs[0].agent_id, "researcher");
});

Deno.test("MonitorView - should filter logs by action type", () => {
  const { db: _db, monitorView } = createMonitorViewWithLogs([
    {
      id: "1",
      trace_id: "trace-1",
      actor: "agent",
      agent_id: "researcher",
      action_type: "request_created",
      target: "Inbox/Requests/test.md",
      payload: { description: "Test request" },
      timestamp: "2025-12-21T10:00:00Z",
    },
    {
      id: "2",
      trace_id: "trace-2",
      actor: "agent",
      agent_id: "architect",
      action_type: "plan_approved",
      target: "Inbox/Plans/test.md",
      payload: { plan: "Test plan" },
      timestamp: "2025-12-21T10:01:00Z",
    },
  ]);

  // Test filtering by action type
  monitorView.setFilter({ actionType: "plan_approved" });
  const filteredLogs = monitorView.getFilteredLogs();
  assertEquals(filteredLogs.length, 1);
  assertEquals(filteredLogs[0].action_type, "plan_approved");
});

Deno.test("MonitorView - should pause and resume log streaming", () => {
  const { db: _db, monitorView } = createMonitorViewWithLogs();

  // Initially streaming
  assertEquals(monitorView.isStreaming(), true);

  // Pause streaming
  monitorView.pause();
  assertEquals(monitorView.isStreaming(), false);

  // Resume streaming
  monitorView.resume();
  assertEquals(monitorView.isStreaming(), true);
});

Deno.test("MonitorView - does not fetch when paused", () => {
  const calls: string[] = [];
  class CountingDb {
    private inner: any;
    constructor(logs: any[] = []) {
      this.inner = createMockDatabaseService(logs);
    }
    getRecentActivity(limit?: number) {
      calls.push(`get:${limit}`);
      return this.inner.getRecentActivity(limit);
    }
    addLog(log: any) {
      return this.inner.addLog(log);
    }
  }
  const db = new CountingDb([
    {
      id: "1",
      trace_id: "trace-1",
      actor: "agent",
      agent_id: "dev",
      action_type: "plan.approved",
      target: "Inbox/Plans/test.md",
      payload: {},
      timestamp: "2025-12-21T10:00:00Z",
    },
  ]);
  const monitorView = new MonitorView(db as unknown as DatabaseService);
  calls.length = 0;
  monitorView.pause();
  monitorView.getLogs(); // should not trigger fetch while paused
  assertEquals(calls.length, 0);
  monitorView.resume();
  monitorView.getLogs();
  assertEquals(calls.length, 2);
});

Deno.test("MonitorView - maps Activity Journal action names to colors", () => {
  const db = createMockDatabaseService();
  const monitorView = new MonitorView(db as unknown as DatabaseService);
  assertEquals(monitorView.getLogColor("plan.approved"), "blue");
  assertEquals(monitorView.getLogColor("plan.rejected"), "red");
  assertEquals(monitorView.getLogColor("execution.failed"), "red");
  assertEquals(monitorView.getLogColor("execution.started"), "yellow");
  assertEquals(monitorView.getLogColor("execution.completed"), "green");
});

Deno.test("MonitorView - should export logs to file", () => {
  const { db: _db, monitorView } = createMonitorViewWithLogs([
    {
      id: "1",
      trace_id: "trace-1",
      actor: "agent",
      agent_id: "researcher",
      action_type: "request_created",
      target: "Inbox/Requests/test.md",
      payload: { description: "Test request" },
      timestamp: "2025-12-21T10:00:00Z",
    },
  ]);

  // Test export (this would normally write to a file)
  const exportData = monitorView.exportLogs();
  assertExists(exportData);
  assertEquals(typeof exportData, "string");
  assert(exportData.includes("request_created"));
});

Deno.test("MonitorView - should handle large log volumes without crashing", () => {
  const largeLogs = Array.from({ length: 1000 }, (_, i) => ({
    id: `${i + 1}`,
    trace_id: `trace-${i + 1}`,
    actor: "agent",
    agent_id: i % 2 === 0 ? "researcher" : "architect",
    action_type: i % 3 === 0 ? "request_created" : "plan_approved",
    target: `Inbox/Requests/test${i}.md`,
    payload: { description: `Test request ${i}` },
    timestamp: new Date(Date.now() - i * 1000).toISOString(),
  }));

  const { db: _db, monitorView } = createMonitorViewWithLogs(largeLogs);

  // Should handle large volumes
  const logs = monitorView.getLogs();
  assertEquals(logs.length, 1000);

  // Filtering should still work
  monitorView.setFilter({ agent: "researcher" });
  const filteredLogs = monitorView.getFilteredLogs();
  assert(filteredLogs.length > 0);
  assert(filteredLogs.every((log: LogEntry) => log.agent_id === "researcher"));
});

Deno.test("MonitorView - should handle empty logs gracefully", () => {
  const { db: _db, monitorView } = createMonitorViewWithLogs([]);

  const logs = monitorView.getLogs();
  assertEquals(logs.length, 0);

  const filteredLogs = monitorView.getFilteredLogs();
  assertEquals(filteredLogs.length, 0);

  const exportData = monitorView.exportLogs();
  assertExists(exportData);
  assertEquals(exportData, ""); // Empty export
});

Deno.test("MonitorView - should filter logs by time window", () => {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const { db: _db, monitorView } = createMonitorViewWithLogs([
    {
      id: "1",
      trace_id: "trace-1",
      actor: "agent",
      agent_id: "researcher",
      action_type: "request_created",
      target: "Inbox/Requests/test.md",
      payload: { description: "Recent request" },
      timestamp: now.toISOString(),
    },
    {
      id: "2",
      trace_id: "trace-2",
      actor: "agent",
      agent_id: "architect",
      action_type: "plan_approved",
      target: "Inbox/Plans/test.md",
      payload: { plan: "Old plan" },
      timestamp: twoHoursAgo.toISOString(),
    },
  ]);

  // Filter to last hour
  monitorView.setFilter({ timeWindow: 60 * 60 * 1000 }); // 1 hour in ms
  const filteredLogs = monitorView.getFilteredLogs();
  assertEquals(filteredLogs.length, 1);
  assertEquals(filteredLogs[0].id, "1");
});

// ============================================================
// Phase 13.5 Enhanced Monitor View Tests
// ============================================================

Deno.test("Phase 13.5: MonitorTuiSession - creates session", () => {
  const { monitorView } = createMonitorViewWithLogs([
    {
      id: "1",
      trace_id: "t1",
      actor: "user",
      agent_id: "a1",
      action_type: "request_created",
      target: "target.md",
      payload: {},
      timestamp: "2025-12-22T10:00:00Z",
    },
  ]);
  const session = monitorView.createTuiSession();
  assertExists(session);
  assertEquals(session.getViewName(), "Monitor");
});

Deno.test("Phase 13.5: MonitorTuiSession - builds flat tree", () => {
  const { monitorView } = createMonitorViewWithLogs([
    {
      id: "1",
      trace_id: "t1",
      actor: "user",
      agent_id: "a1",
      action_type: "request_created",
      target: "target.md",
      payload: {},
      timestamp: "2025-12-22T10:00:00Z",
    },
    {
      id: "2",
      trace_id: "t2",
      actor: "user",
      agent_id: "a2",
      action_type: "plan.approved",
      target: "target2.md",
      payload: {},
      timestamp: "2025-12-22T10:01:00Z",
    },
  ]);
  const session = monitorView.createTuiSession();
  const tree = session.getLogTree();
  assertEquals(tree.length, 2, "Flat tree should have 2 entries");
});

Deno.test("Phase 13.5: MonitorTuiSession - toggle grouping", async () => {
  const { monitorView } = createMonitorViewWithLogs([
    {
      id: "1",
      trace_id: "t1",
      actor: "user",
      agent_id: "a1",
      action_type: "request_created",
      target: "target.md",
      payload: {},
      timestamp: "2025-12-22T10:00:00Z",
    },
    {
      id: "2",
      trace_id: "t2",
      actor: "user",
      agent_id: "a2",
      action_type: "request_created",
      target: "target2.md",
      payload: {},
      timestamp: "2025-12-22T10:01:00Z",
    },
  ]);
  const session = monitorView.createTuiSession();

  assertEquals(session.getGroupBy(), "none");

  await session.handleKey("g");
  assertEquals(session.getGroupBy(), "agent");

  await session.handleKey("g");
  assertEquals(session.getGroupBy(), "action");

  await session.handleKey("g");
  assertEquals(session.getGroupBy(), "none");
});

Deno.test("Phase 13.5: MonitorTuiSession - help toggle", async () => {
  const { monitorView } = createMonitorViewWithLogs([]);
  const session = monitorView.createTuiSession();

  assertEquals(session.isHelpVisible(), false);
  await session.handleKey("?");
  assertEquals(session.isHelpVisible(), true);
  await session.handleKey("?");
  assertEquals(session.isHelpVisible(), false);
});

Deno.test("Phase 13.5: MonitorTuiSession - pause toggle", async () => {
  const { monitorView } = createMonitorViewWithLogs([]);
  const session = monitorView.createTuiSession();

  assertEquals(session.isPaused(), false);
  await session.handleKey("space");
  assertEquals(session.isPaused(), true);
  await session.handleKey("space");
  assertEquals(session.isPaused(), false);
});

Deno.test("Phase 13.5: MonitorTuiSession - bookmarking", async () => {
  const { monitorView } = createMonitorViewWithLogs([
    {
      id: "1",
      trace_id: "t1",
      actor: "user",
      agent_id: "a1",
      action_type: "request_created",
      target: "target.md",
      payload: {},
      timestamp: "2025-12-22T10:00:00Z",
    },
  ]);
  const session = monitorView.createTuiSession();

  assertEquals(session.getBookmarkedIds().size, 0);
  await session.handleKey("b");
  assertEquals(session.getBookmarkedIds().size, 1);
  assert(session.isBookmarked("1"));

  // Toggle off
  await session.handleKey("b");
  assertEquals(session.getBookmarkedIds().size, 0);
});

Deno.test("Phase 13.5: MonitorTuiSession - navigation", async () => {
  const { monitorView } = createMonitorViewWithLogs([
    {
      id: "1",
      trace_id: "t1",
      actor: "user",
      agent_id: "a1",
      action_type: "request_created",
      target: "target.md",
      payload: {},
      timestamp: "2025-12-22T10:00:00Z",
    },
    {
      id: "2",
      trace_id: "t2",
      actor: "user",
      agent_id: "a2",
      action_type: "plan.approved",
      target: "target2.md",
      payload: {},
      timestamp: "2025-12-22T10:01:00Z",
    },
  ]);
  const session = monitorView.createTuiSession();

  // Navigate down
  await session.handleKey("down");
  // Navigate up
  await session.handleKey("up");
  // Go to end
  await session.handleKey("end");
  // Go to home
  await session.handleKey("home");
});

Deno.test("Phase 13.5: MonitorTuiSession - expand/collapse all", async () => {
  const { monitorView } = createMonitorViewWithLogs([
    {
      id: "1",
      trace_id: "t1",
      actor: "user",
      agent_id: "a1",
      action_type: "request_created",
      target: "target.md",
      payload: {},
      timestamp: "2025-12-22T10:00:00Z",
    },
    {
      id: "2",
      trace_id: "t2",
      actor: "user",
      agent_id: "a2",
      action_type: "plan.approved",
      target: "target2.md",
      payload: {},
      timestamp: "2025-12-22T10:01:00Z",
    },
  ]);
  const session = monitorView.createTuiSession();

  // Switch to grouped mode
  await session.handleKey("g");

  // Collapse all
  await session.handleKey("c");
  const collapsed = session.getLogTree();
  assert(collapsed.every((n) => !n.expanded), "All should be collapsed");

  // Expand all
  await session.handleKey("E");
  const expanded = session.getLogTree();
  assert(expanded.every((n) => n.expanded), "All should be expanded");
});

Deno.test("Phase 13.5: MonitorTuiSession - detail view", async () => {
  const { monitorView } = createMonitorViewWithLogs([
    {
      id: "1",
      trace_id: "t1",
      actor: "user",
      agent_id: "a1",
      action_type: "request_created",
      target: "target.md",
      payload: { foo: "bar" },
      timestamp: "2025-12-22T10:00:00Z",
    },
  ]);
  const session = monitorView.createTuiSession();

  assertEquals(session.isDetailVisible(), false);

  // Open detail
  await session.handleKey("enter");
  assertEquals(session.isDetailVisible(), true);
  assert(session.getDetailContent().includes("ID: 1"));

  // Close detail
  await session.handleKey("escape");
  assertEquals(session.isDetailVisible(), false);
});

Deno.test("Phase 13.5: MonitorTuiSession - render methods", () => {
  const { monitorView } = createMonitorViewWithLogs([
    {
      id: "1",
      trace_id: "t1",
      actor: "user",
      agent_id: "a1",
      action_type: "request_created",
      target: "target.md",
      payload: {},
      timestamp: "2025-12-22T10:00:00Z",
    },
  ]);
  const session = monitorView.createTuiSession();

  const treeLines = session.renderLogTree();
  assert(treeLines.length > 0);

  const helpLines = session.renderHelp();
  assert(helpLines.length > 0);
  assert(helpLines.some((l) => l.includes("Navigation")));

  const buttons = session.renderActionButtons();
  assert(buttons.includes("Pause"));
  assert(buttons.includes("Help"));

  const status = session.renderStatusLine();
  assert(status.includes("log"));
});

Deno.test("Phase 13.5: MonitorTuiSession - key bindings", () => {
  const { monitorView } = createMonitorViewWithLogs([]);
  const session = monitorView.createTuiSession();

  const bindings = session.getKeyBindings();
  assert(bindings.length > 0);

  const keys = bindings.map((b) => b.key);
  assert(keys.includes("up"));
  assert(keys.includes("down"));
  assert(keys.includes("space"));
  assert(keys.includes("b"));
  assert(keys.includes("?"));
});

Deno.test("Phase 13.5: MonitorTuiSession - export logs", () => {
  const { monitorView } = createMonitorViewWithLogs([
    {
      id: "1",
      trace_id: "t1",
      actor: "user",
      agent_id: "a1",
      action_type: "request_created",
      target: "target.md",
      payload: { data: "test" },
      timestamp: "2025-12-22T10:00:00Z",
    },
  ]);
  const session = monitorView.createTuiSession();

  const exported = session.exportLogs();
  assert(exported.includes("request_created"));
  assert(exported.includes("2025-12-22T10:00:00Z"));
});

Deno.test("Phase 13.5: MonitorTuiSession - auto refresh toggle", async () => {
  const { monitorView } = createMonitorViewWithLogs([]);
  const session = monitorView.createTuiSession();

  assertEquals(session.isAutoRefreshEnabled(), false);
  await session.handleKey("a");
  assertEquals(session.isAutoRefreshEnabled(), true);
  await session.handleKey("a");
  assertEquals(session.isAutoRefreshEnabled(), false);

  // Clean up timer
  session.cleanup();
});

Deno.test("Phase 13.5: MonitorTuiSession - focusable elements", () => {
  const { monitorView } = createMonitorViewWithLogs([]);
  const session = monitorView.createTuiSession();

  const elements = session.getFocusableElements();
  assert(elements.includes("log-list"));
  assert(elements.includes("action-buttons"));
});

Deno.test("Phase 13.5: MonitorTuiSession - search dialog", async () => {
  const { monitorView } = createMonitorViewWithLogs([]);
  const session = monitorView.createTuiSession();

  assertEquals(session.hasActiveDialog(), false);
  await session.handleKey("s");
  assertEquals(session.hasActiveDialog(), true);

  // Cancel dialog
  await session.handleKey("escape");
  assertEquals(session.hasActiveDialog(), false);
});

Deno.test("Phase 13.5: MonitorTuiSession - refresh", async () => {
  const { monitorView } = createMonitorViewWithLogs([]);
  const session = monitorView.createTuiSession();

  // This should not throw
  await session.handleKey("R");
});

Deno.test("Phase 13.5: MonitorTuiSession - empty logs tree", () => {
  const { monitorView } = createMonitorViewWithLogs([]);
  const session = monitorView.createTuiSession();

  const tree = session.getLogTree();
  assertEquals(tree.length, 0);

  const lines = session.renderLogTree();
  assert(lines.some((l) => l.includes("No logs")));
});

Deno.test("Phase 13.5: LOG_ICONS and LOG_COLORS are defined", () => {
  // Import from module
  // Check they have expected keys
  assertExists(LOG_ICONS);
  assertExists(LOG_COLORS);
  assertExists(LOG_ICONS["request_created"]);
  assertExists(LOG_COLORS["error"]);
});

Deno.test("Phase 13.5: MONITOR_KEY_BINDINGS are defined", () => {
  assertExists(MONITOR_KEY_BINDINGS);
  assert(MONITOR_KEY_BINDINGS.length > 0);
});
