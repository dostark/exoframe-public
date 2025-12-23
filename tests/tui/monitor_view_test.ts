import { assert, assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { MonitorView } from "../../src/tui/monitor_view.ts";
import type { LogEntry } from "../../src/tui/monitor_view.ts";
import { DatabaseService } from "../../src/services/db.ts";

// Additional coverage for MonitorView rendering and color helpers
Deno.test("MonitorView - getLogColor covers all cases", () => {
  const mockDb = new MockDatabaseService();
  const monitorView = new MonitorView(mockDb as unknown as DatabaseService);
  assertEquals(monitorView.getLogColor("request_created"), "green");
  assertEquals(monitorView.getLogColor("plan_approved"), "blue");
  assertEquals(monitorView.getLogColor("execution_started"), "yellow");
  assertEquals(monitorView.getLogColor("execution_completed"), "green");
  assertEquals(monitorView.getLogColor("error"), "red");
  assertEquals(monitorView.getLogColor("unknown_type"), "white");
});

Deno.test("MonitorView - getAnsiColorCode covers all cases", () => {
  const mockDb = new MockDatabaseService();
  const monitorView = new MonitorView(mockDb as unknown as DatabaseService);
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
  const mockDb = new MockDatabaseService(logs);
  const monitorView = new MonitorView(mockDb as unknown as DatabaseService);
  monitorView.setFilter({});
  const output = monitorView.renderLogs();
  assert(output.includes("\x1b[31m")); // red for error
  assert(output.includes("\x1b[37m")); // white for unknown
  // Empty logs
  const emptyDb = new MockDatabaseService([]);
  const emptyView = new MonitorView(emptyDb as unknown as DatabaseService);
  assertEquals(emptyView.renderLogs(), "");
});

// Mock DatabaseService for testing
class MockDatabaseService {
  private logs: Array<{
    id: string;
    trace_id: string;
    actor: string;
    agent_id: string | null;
    action_type: string;
    target: string | null;
    payload: Record<string, unknown>;
    timestamp: string;
  }> = [];

  constructor(initialLogs: Array<{
    id: string;
    trace_id: string;
    actor: string;
    agent_id: string | null;
    action_type: string;
    target: string | null;
    payload: Record<string, unknown>;
    timestamp: string;
  }> = []) {
    this.logs = initialLogs;
  }

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
    return this.logs.slice(-limit).reverse();
  }

  addLog(log: {
    id: string;
    trace_id: string;
    actor: string;
    agent_id: string | null;
    action_type: string;
    target: string | null;
    payload: Record<string, unknown>;
    timestamp: string;
  }) {
    this.logs.push(log);
  }
}

Deno.test("MonitorView - should display real-time log streaming", () => {
  const mockDb = new MockDatabaseService([
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

  const monitorView = new MonitorView(mockDb as unknown as DatabaseService);

  // Test that it can retrieve logs
  const logs = monitorView.getLogs();
  assertEquals(logs.length, 1);
  assertEquals(logs[0].actor, "agent");
  assertEquals(logs[0].action_type, "request_created");
});

Deno.test("MonitorView - should filter logs by agent", () => {
  const mockDb = new MockDatabaseService([
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

  const monitorView = new MonitorView(mockDb as unknown as DatabaseService);

  // Test filtering by agent
  monitorView.setFilter({ agent: "researcher" });
  const filteredLogs = monitorView.getFilteredLogs();
  assertEquals(filteredLogs.length, 1);
  assertEquals(filteredLogs[0].agent_id, "researcher");
});

Deno.test("MonitorView - should filter logs by action type", () => {
  const mockDb = new MockDatabaseService([
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

  const monitorView = new MonitorView(mockDb as unknown as DatabaseService);

  // Test filtering by action type
  monitorView.setFilter({ actionType: "plan_approved" });
  const filteredLogs = monitorView.getFilteredLogs();
  assertEquals(filteredLogs.length, 1);
  assertEquals(filteredLogs[0].action_type, "plan_approved");
});

Deno.test("MonitorView - should pause and resume log streaming", () => {
  const mockDb = new MockDatabaseService();

  const monitorView = new MonitorView(mockDb as unknown as DatabaseService);

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
  class CountingDb extends MockDatabaseService {
    override getRecentActivity(limit?: number) {
      calls.push(`get:${limit}`);
      return super.getRecentActivity(limit);
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
  const mockDb = new MockDatabaseService();
  const monitorView = new MonitorView(mockDb as unknown as DatabaseService);
  assertEquals(monitorView.getLogColor("plan.approved"), "blue");
  assertEquals(monitorView.getLogColor("plan.rejected"), "red");
  assertEquals(monitorView.getLogColor("execution.failed"), "red");
  assertEquals(monitorView.getLogColor("execution.started"), "yellow");
  assertEquals(monitorView.getLogColor("execution.completed"), "green");
});

Deno.test("MonitorView - should export logs to file", () => {
  const mockDb = new MockDatabaseService([
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

  const monitorView = new MonitorView(mockDb as unknown as DatabaseService);

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

  const mockDb = new MockDatabaseService(largeLogs);

  const monitorView = new MonitorView(mockDb as unknown as DatabaseService);

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
  const mockDb = new MockDatabaseService([]);

  const monitorView = new MonitorView(mockDb as unknown as DatabaseService);

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

  const mockDb = new MockDatabaseService([
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

  const monitorView = new MonitorView(mockDb as unknown as DatabaseService);

  // Filter to last hour
  monitorView.setFilter({ timeWindow: 60 * 60 * 1000 }); // 1 hour in ms
  const filteredLogs = monitorView.getFilteredLogs();
  assertEquals(filteredLogs.length, 1);
  assertEquals(filteredLogs[0].id, "1");
});
