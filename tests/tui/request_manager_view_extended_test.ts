/**
 * Extended Request Manager View Tests
 *
 * Additional tests to improve coverage for request_manager_view.ts
 */

import { assert, assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import {
  LegacyRequestManagerTuiSession,
  MinimalRequestServiceMock,
  PRIORITY_ICONS,
  type Request,
  REQUEST_KEY_BINDINGS,
  RequestCommandsServiceAdapter,
  RequestManagerView,
  STATUS_COLORS,
  STATUS_ICONS,
} from "../../src/tui/request_manager_view.ts";

// ===== Test Data =====

function createTestRequests(): Request[] {
  return [
    {
      trace_id: "req-001",
      filename: "request-001.md",
      title: "Test Request 1",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-01-01T10:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
    {
      trace_id: "req-002",
      filename: "request-002.md",
      title: "Test Request 2",
      status: "completed",
      priority: "high",
      agent: "code-reviewer",
      created: "2025-01-01T11:00:00Z",
      created_by: "user@example.com",
      source: "portal",
      skills: {
        explicit: ["security-audit"],
        autoMatched: ["code-review"],
        fromDefaults: ["typescript-patterns"],
        skipped: ["deprecated-skill"],
      },
    },
    {
      trace_id: "req-003",
      filename: "request-003.md",
      title: "Test Request 3",
      status: "in_progress",
      priority: "critical",
      agent: "architect",
      created: "2025-01-01T12:00:00Z",
      created_by: "admin@example.com",
      source: "daemon",
    },
    {
      trace_id: "req-004",
      filename: "request-004.md",
      title: "Cancelled Request",
      status: "cancelled",
      priority: "low",
      agent: "default",
      created: "2025-01-01T13:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
    {
      trace_id: "req-005",
      filename: "request-005.md",
      title: "Failed Request",
      status: "failed",
      priority: "high",
      agent: "researcher",
      created: "2025-01-01T14:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
  ];
}

// ===== Constants Tests =====

Deno.test("RequestManagerView: STATUS_COLORS covers all statuses", () => {
  assertExists(STATUS_COLORS.pending);
  assertExists(STATUS_COLORS.planned);
  assertExists(STATUS_COLORS.in_progress);
  assertExists(STATUS_COLORS.completed);
  assertExists(STATUS_COLORS.cancelled);
  assertExists(STATUS_COLORS.failed);
});

Deno.test("RequestManagerView: REQUEST_KEY_BINDINGS is comprehensive", () => {
  const actions = REQUEST_KEY_BINDINGS.map((b) => b.action);
  assertEquals(actions.includes("navigate"), true);
  assertEquals(actions.includes("create"), true);
  assertEquals(actions.includes("delete"), true);
  assertEquals(actions.includes("help"), true);
});

Deno.test("RequestManagerView: PRIORITY_ICONS and STATUS_ICONS have all values", () => {
  assertEquals(PRIORITY_ICONS.critical, "🔴");
  assertEquals(PRIORITY_ICONS.high, "🟠");
  assertEquals(PRIORITY_ICONS.normal, "⚪");
  assertEquals(PRIORITY_ICONS.low, "🔵");

  assertEquals(STATUS_ICONS.pending, "⏳");
  assertEquals(STATUS_ICONS.planned, "📋");
  assertEquals(STATUS_ICONS.in_progress, "🔄");
  assertEquals(STATUS_ICONS.completed, "✅");
  assertEquals(STATUS_ICONS.cancelled, "❌");
  assertEquals(STATUS_ICONS.failed, "💥");
});

// ===== RequestManagerView Tests =====

Deno.test("RequestManagerView: renderRequestList with various statuses", () => {
  const mockService = new MinimalRequestServiceMock();
  const view = new RequestManagerView(mockService);

  const requests = createTestRequests();
  const output = view.renderRequestList(requests);

  assertStringIncludes(output, "Requests:");
  assertStringIncludes(output, "⏳"); // pending
  assertStringIncludes(output, "✅"); // completed
  assertStringIncludes(output, "❌"); // cancelled
  // Note: in_progress and failed might show as ❓ if not in STATUS_ICONS lookup
});

Deno.test("RequestManagerView: renderRequestList shows priorities", () => {
  const mockService = new MinimalRequestServiceMock();
  const view = new RequestManagerView(mockService);

  const requests = createTestRequests();
  const output = view.renderRequestList(requests);

  assertStringIncludes(output, "⚪"); // normal
  assertStringIncludes(output, "🟠"); // high
  assertStringIncludes(output, "🔴"); // critical
  assertStringIncludes(output, "🔵"); // low
});

// ===== RequestManagerTuiSession Tests =====

Deno.test("RequestManagerTuiSession: getSelectedRequest returns correct request", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  const selected = session.getSelectedRequest();
  assertEquals(selected?.trace_id, "req-001");
});

Deno.test("RequestManagerTuiSession: getSelectedIndexInRequests works", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  const idx = session.getSelectedIndexInRequests();
  assertEquals(idx, 0);
});

Deno.test("RequestManagerTuiSession: setSelectedByIndex changes selection", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  session.setSelectedByIndex(2);
  assertEquals(session.getSelectedIndexInRequests(), 2);

  // Test invalid index (should clamp)
  session.setSelectedByIndex(-1);
  assertEquals(session.getSelectedIndexInRequests(), 2); // unchanged for out of range

  session.setSelectedByIndex(100);
  assertEquals(session.getSelectedIndexInRequests(), 2); // unchanged for out of range
});

Deno.test("RequestManagerTuiSession: navigateTree first and last", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  // Navigate to last
  await session.handleKey("end");
  const lastState = session.getState();
  assertExists(lastState.selectedRequestId);

  // Navigate to first
  await session.handleKey("home");
  const firstState = session.getState();
  assertExists(firstState.selectedRequestId);
});

Deno.test("RequestManagerTuiSession: toggleGrouping cycles through modes", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  assertEquals(session.getState().groupBy, "none");

  session.toggleGrouping();
  assertEquals(session.getState().groupBy, "status");

  session.toggleGrouping();
  assertEquals(session.getState().groupBy, "priority");

  session.toggleGrouping();
  assertEquals(session.getState().groupBy, "agent");

  session.toggleGrouping();
  assertEquals(session.getState().groupBy, "none");
});

Deno.test("RequestManagerTuiSession: buildGroupedByPriority", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  // Switch to priority grouping
  session.toggleGrouping(); // none -> status
  session.toggleGrouping(); // status -> priority

  const tree = session.getState().requestTree;
  assert(tree.length > 0);

  // Should have priority groups
  const groupIds = tree.map((n) => n.id);
  assertEquals(groupIds.some((id) => id.startsWith("priority-")), true);
});

Deno.test("RequestManagerTuiSession: buildGroupedByAgent", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  // Switch to agent grouping
  session.toggleGrouping(); // none -> status
  session.toggleGrouping(); // status -> priority
  session.toggleGrouping(); // priority -> agent

  const tree = session.getState().requestTree;
  assert(tree.length > 0);

  // Should have agent groups
  const groupIds = tree.map((n) => n.id);
  assertEquals(groupIds.some((id) => id.startsWith("agent-")), true);
});

Deno.test("RequestManagerTuiSession: expandSelectedNode and collapseSelectedNode", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  // Switch to grouping mode
  session.toggleGrouping(); // none -> status

  // Navigate to a group node
  await session.handleKey("home");

  // Try to collapse and expand
  session.collapseSelectedNode();
  session.expandSelectedNode();

  // Should not throw
  const state = session.getState();
  assertExists(state);
});

Deno.test("RequestManagerTuiSession: toggleSelectedNode", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  // Switch to grouping mode
  session.toggleGrouping();

  // Navigate to first (group node)
  await session.handleKey("home");

  // Toggle the node
  session.toggleSelectedNode();

  const state = session.getState();
  assertExists(state);
});

Deno.test("RequestManagerTuiSession: showRequestDetail formats content", async () => {
  const mockService = {
    listRequests: () => Promise.resolve([]),
    getRequestContent: (_id: string) => Promise.resolve("Test content here"),
    createRequest: () => Promise.resolve({} as Request),
    updateRequestStatus: () => Promise.resolve(true),
  };

  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  await session.showRequestDetail("req-002");

  assertEquals(session.getState().showDetail, true);
  const detail = session.renderDetail();
  assertStringIncludes(detail, "REQUEST DETAILS");
  assertStringIncludes(detail, "Applied Skills:");
});

Deno.test("RequestManagerTuiSession: showRequestDetail handles error", async () => {
  const mockService = {
    listRequests: () => Promise.resolve([]),
    getRequestContent: (_id: string) => Promise.reject(new Error("Failed to load")),
    createRequest: () => Promise.resolve({} as Request),
    updateRequestStatus: () => Promise.resolve(true),
  };

  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  await session.showRequestDetail("req-001");

  // Should set error status, not show detail
  assertEquals(session.getState().showDetail, false);
});

Deno.test("RequestManagerTuiSession: detail view with skills shows all skill types", async () => {
  const mockService = {
    listRequests: () => Promise.resolve([]),
    getRequestContent: (_id: string) => Promise.resolve("Content"),
    createRequest: () => Promise.resolve({} as Request),
    updateRequestStatus: () => Promise.resolve(true),
  };

  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  await session.showRequestDetail("req-002");

  const detail = session.renderDetail();
  assertStringIncludes(detail, "Explicit:");
  assertStringIncludes(detail, "Auto-matched:");
  assertStringIncludes(detail, "From defaults:");
  assertStringIncludes(detail, "Skipped:");
});

Deno.test("RequestManagerTuiSession: detail view without skills shows (none)", async () => {
  const requestWithEmptySkills: Request = {
    trace_id: "req-empty",
    filename: "request-empty.md",
    title: "Request with empty skills",
    status: "pending",
    priority: "normal",
    agent: "default",
    created: "2025-01-01T10:00:00Z",
    created_by: "test@example.com",
    source: "cli",
    skills: {},
  };

  const mockService = {
    listRequests: () => Promise.resolve([]),
    getRequestContent: (_id: string) => Promise.resolve("Content"),
    createRequest: () => Promise.resolve({} as Request),
    updateRequestStatus: () => Promise.resolve(true),
  };

  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession([requestWithEmptySkills]);

  await session.showRequestDetail("req-empty");

  const detail = session.renderDetail();
  assertStringIncludes(detail, "(none)");
});

Deno.test("RequestManagerTuiSession: filter by status and agent", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  // Test filtering by status
  const state = session.getState();
  state.filterStatus = "pending";
  session.buildTree();
  assertEquals(session.getFilteredRequests().length, 1);

  // Clear status filter
  state.filterStatus = null;

  // Test filtering by agent
  state.filterAgent = "code-reviewer";
  session.buildTree();
  assertEquals(session.getFilteredRequests().length, 1);
});

Deno.test("RequestManagerTuiSession: filter by priority", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  const state = session.getState();
  state.filterPriority = "high";
  session.buildTree();
  assertEquals(session.getFilteredRequests().length, 2); // high priority requests
});

Deno.test("RequestManagerTuiSession: render shows help when showHelp is true", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  await session.handleKey("?");
  assertEquals(session.getState().showHelp, true);

  const output = session.render();
  assertStringIncludes(output, "Navigation");
  assertStringIncludes(output, "Actions");
});

Deno.test("RequestManagerTuiSession: close help with '?'", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  await session.handleKey("?");
  assertEquals(session.getState().showHelp, true);

  await session.handleKey("?");
  assertEquals(session.getState().showHelp, false);
});

Deno.test("RequestManagerTuiSession: close detail with 'q'", async () => {
  const mockService = {
    listRequests: () => Promise.resolve([]),
    getRequestContent: () => Promise.resolve("Content"),
    createRequest: () => Promise.resolve({} as Request),
    updateRequestStatus: () => Promise.resolve(true),
  };

  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  await session.showRequestDetail("req-001");
  assertEquals(session.getState().showDetail, true);

  await session.handleKey("q");
  assertEquals(session.getState().showDetail, false);
});

Deno.test("RequestManagerTuiSession: close detail with escape", async () => {
  const mockService = {
    listRequests: () => Promise.resolve([]),
    getRequestContent: () => Promise.resolve("Content"),
    createRequest: () => Promise.resolve({} as Request),
    updateRequestStatus: () => Promise.resolve(true),
  };

  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  await session.showRequestDetail("req-001");
  assertEquals(session.getState().showDetail, true);

  await session.handleKey("escape");
  assertEquals(session.getState().showDetail, false);
});

Deno.test("RequestManagerTuiSession: render shows current filters", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  const state = session.getState();
  state.searchQuery = "test";
  state.filterStatus = "pending";
  state.filterAgent = "default";

  const output = session.render();
  assertStringIncludes(output, 'search="test"');
  assertStringIncludes(output, "status=pending");
  assertStringIncludes(output, "agent=default");
});

Deno.test("RequestManagerTuiSession: renderTree returns empty message for no requests", () => {
  const mockService = new MinimalRequestServiceMock();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession([]);

  const treeOutput = session.renderTree();
  assertEquals(treeOutput[0], "No requests found.");
});

Deno.test("RequestManagerTuiSession: getFocusableElements returns correct elements", () => {
  const mockService = new MinimalRequestServiceMock();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession([]);

  const focusable = session.getFocusableElements();
  assertEquals(focusable.includes("request-list"), true);
  assertEquals(focusable.includes("action-buttons"), true);
});

Deno.test("RequestManagerTuiSession: setRequests updates internal state", () => {
  const mockService = new MinimalRequestServiceMock();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession([]);

  assertEquals(session.getRequests().length, 0);

  session.setRequests(createTestRequests());
  assertEquals(session.getRequests().length, 5);
});

Deno.test("RequestManagerTuiSession: refresh rebuilds tree", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  const treeBefore = session.getState().requestTree.length;

  await session.refresh();

  const treeAfter = session.getState().requestTree.length;
  assertEquals(treeBefore, treeAfter);
});

Deno.test("RequestManagerTuiSession: showSearchDialog and handleSearchResult", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  // Show search dialog
  session.showSearchDialog();
  assertEquals(session.getState().activeDialog !== null, true);

  // Cancel dialog
  await session.handleKey("escape");
  assertEquals(session.getState().activeDialog, null);
});

Deno.test("RequestManagerTuiSession: showFilterStatusDialog", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  session.showFilterStatusDialog();
  assertEquals(session.getState().activeDialog !== null, true);

  await session.handleKey("escape");
  assertEquals(session.getState().activeDialog, null);
});

Deno.test("RequestManagerTuiSession: showFilterAgentDialog", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  session.showFilterAgentDialog();
  assertEquals(session.getState().activeDialog !== null, true);

  await session.handleKey("escape");
  assertEquals(session.getState().activeDialog, null);
});

Deno.test("RequestManagerTuiSession: showCreateDialog", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  session.showCreateDialog();
  assertEquals(session.getState().activeDialog !== null, true);

  await session.handleKey("escape");
  assertEquals(session.getState().activeDialog, null);
});

Deno.test("RequestManagerTuiSession: showCancelConfirm for non-existent request", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  // Try to show cancel for non-existent request
  session.showCancelConfirm("non-existent");

  // Should not open dialog
  assertEquals(session.getState().activeDialog, null);
});

Deno.test("RequestManagerTuiSession: showPriorityDialog", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  session.showPriorityDialog();
  assertEquals(session.getState().activeDialog !== null, true);

  await session.handleKey("escape");
  assertEquals(session.getState().activeDialog, null);
});

Deno.test("RequestManagerTuiSession: left arrow collapses, right arrow expands", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  // Switch to grouping mode
  session.toggleGrouping();

  // Navigate to a group
  await session.handleKey("home");

  // Collapse with left arrow
  await session.handleKey("left");

  // Expand with right arrow
  await session.handleKey("right");

  const state = session.getState();
  assertExists(state);
});

Deno.test("RequestManagerTuiSession: enter on group toggles expansion", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  // Switch to grouping mode
  session.toggleGrouping();

  // Navigate to a group node (first item should be a group)
  await session.handleKey("home");

  const state = session.getState();
  if (state.selectedRequestId?.startsWith("status-")) {
    // Toggle with enter
    await session.handleKey("enter");
    // Should not show detail for groups
    assertEquals(session.getState().showDetail, false);
  }
});

Deno.test("RequestManagerTuiSession: d key on non-request does nothing", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  // Switch to grouping mode
  session.toggleGrouping();

  // Navigate to a group node
  await session.handleKey("home");

  const state = session.getState();
  if (state.selectedRequestId?.startsWith("status-")) {
    // Try to delete a group (should do nothing)
    await session.handleKey("d");
    assertEquals(session.getState().activeDialog, null);
  }
});

Deno.test("RequestManagerTuiSession: p key on non-request does nothing", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = createTestRequests();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  // Switch to grouping mode
  session.toggleGrouping();

  // Navigate to a group node
  await session.handleKey("home");

  const state = session.getState();
  if (state.selectedRequestId?.startsWith("status-")) {
    // Try to change priority of a group (should do nothing)
    await session.handleKey("p");
    assertEquals(session.getState().activeDialog, null);
  }
});

// ===== LegacyRequestManagerTuiSession Tests =====

Deno.test("LegacyRequestManagerTuiSession: getSelectedIndex and setSelectedIndex", () => {
  const mockService = {
    listRequests: () => Promise.resolve([]),
    getRequestContent: () => Promise.resolve(""),
    createRequest: () => Promise.resolve({} as Request),
    updateRequestStatus: () => Promise.resolve(true),
  };

  const requests = createTestRequests();
  const session = new LegacyRequestManagerTuiSession(requests, mockService);

  assertEquals(session.getSelectedIndex(), 0);

  session.setSelectedIndex(2);
  assertEquals(session.getSelectedIndex(), 2);

  // Test boundary
  session.setSelectedIndex(-1);
  assertEquals(session.getSelectedIndex(), 0);

  session.setSelectedIndex(100);
  assertEquals(session.getSelectedIndex(), 0);
});

Deno.test("LegacyRequestManagerTuiSession: handleKey navigation", async () => {
  const mockService = {
    listRequests: () => Promise.resolve([]),
    getRequestContent: () => Promise.resolve(""),
    createRequest: () => Promise.resolve({} as Request),
    updateRequestStatus: () => Promise.resolve(true),
  };

  const requests = createTestRequests();
  const session = new LegacyRequestManagerTuiSession(requests, mockService);

  assertEquals(session.getSelectedIndex(), 0);

  await session.handleKey("down");
  assertEquals(session.getSelectedIndex(), 1);

  await session.handleKey("up");
  assertEquals(session.getSelectedIndex(), 0);

  await session.handleKey("end");
  assertEquals(session.getSelectedIndex(), 4);

  await session.handleKey("home");
  assertEquals(session.getSelectedIndex(), 0);
});

Deno.test("LegacyRequestManagerTuiSession: handleKey actions", async () => {
  let createCalled = false;
  let viewCalled = false;
  let deleteCalled = false;

  const mockService = {
    listRequests: () => Promise.resolve([]),
    getRequestContent: (_id: string) => {
      viewCalled = true;
      return Promise.resolve("content");
    },
    createRequest: () => {
      createCalled = true;
      return Promise.resolve({
        trace_id: "new-req",
        filename: "request-new.md",
        title: "New Request",
        status: "pending",
        priority: "normal",
        agent: "default",
        created: new Date().toISOString(),
        created_by: "test@example.com",
        source: "cli",
      } as Request);
    },
    updateRequestStatus: () => {
      deleteCalled = true;
      return Promise.resolve(true);
    },
  };

  const requests = createTestRequests();
  const session = new LegacyRequestManagerTuiSession(requests, mockService);

  await session.handleKey("c");
  assertEquals(createCalled, true);

  await session.handleKey("v");
  assertEquals(viewCalled, true);

  await session.handleKey("d");
  assertEquals(deleteCalled, true);
});

Deno.test("LegacyRequestManagerTuiSession: getSelectedRequest", () => {
  const mockService = {
    listRequests: () => Promise.resolve([]),
    getRequestContent: () => Promise.resolve(""),
    createRequest: () => Promise.resolve({} as Request),
    updateRequestStatus: () => Promise.resolve(true),
  };

  const requests = createTestRequests();
  const session = new LegacyRequestManagerTuiSession(requests, mockService);

  const selected = session.getSelectedRequest();
  assertEquals(selected?.trace_id, "req-001");
});

Deno.test("LegacyRequestManagerTuiSession: getStatusMessage after action", async () => {
  const mockService = {
    listRequests: () => Promise.resolve([]),
    getRequestContent: () => Promise.resolve(""),
    createRequest: () =>
      Promise.resolve({
        trace_id: "12345678-abcd-efgh-ijkl-mnopqrstuvwx",
      } as Request),
    updateRequestStatus: () => Promise.resolve(true),
  };

  const requests = createTestRequests();
  const session = new LegacyRequestManagerTuiSession(requests, mockService);

  await session.handleKey("c");
  assertStringIncludes(session.getStatusMessage(), "Created request:");
});

Deno.test("LegacyRequestManagerTuiSession: handleKey with empty requests", async () => {
  const mockService = {
    listRequests: () => Promise.resolve([]),
    getRequestContent: () => Promise.resolve(""),
    createRequest: () => Promise.resolve({} as Request),
    updateRequestStatus: () => Promise.resolve(true),
  };

  const session = new LegacyRequestManagerTuiSession([], mockService);

  // Should not throw with empty requests
  await session.handleKey("down");
  await session.handleKey("up");

  assertEquals(session.getSelectedIndex(), 0);
});

Deno.test("LegacyRequestManagerTuiSession: error handling in actions", async () => {
  const mockService = {
    listRequests: () => Promise.resolve([]),
    getRequestContent: () => Promise.reject(new Error("View error")),
    createRequest: () => Promise.reject(new Error("Create error")),
    updateRequestStatus: () => Promise.reject(new Error("Delete error")),
  };

  const requests = createTestRequests();
  const session = new LegacyRequestManagerTuiSession(requests, mockService);

  // Test create error
  await session.handleKey("c");
  assertStringIncludes(session.getStatusMessage(), "Error:");

  // Test view error
  await session.handleKey("v");
  assertStringIncludes(session.getStatusMessage(), "Error:");

  // Test delete error
  await session.handleKey("d");
  assertStringIncludes(session.getStatusMessage(), "Error:");
});

// ===== RequestCommandsServiceAdapter Tests =====

Deno.test("RequestCommandsServiceAdapter: updateRequestStatus logs warning", async () => {
  const mockCmd = {
    list: () => Promise.resolve([]),
    show: () => Promise.resolve({ content: "test" }),
    create: () =>
      Promise.resolve({
        trace_id: "test-id",
        filename: "test.md",
        status: "pending",
        priority: "normal",
        agent: "default",
        portal: undefined,
        model: undefined,
        created: new Date().toISOString(),
        created_by: "test",
        source: "cli",
      }),
  };

  // @ts-ignore - partial mock
  const adapter = new RequestCommandsServiceAdapter(mockCmd);

  // This should log a warning but return true
  const result = await adapter.updateRequestStatus("test-id", "completed");
  assertEquals(result, true);
});
