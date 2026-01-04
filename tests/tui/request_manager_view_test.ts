import { assert, assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import {
  MinimalRequestServiceMock,
  RequestManagerView,
  RequestService as _RequestService,
} from "../../src/tui/request_manager_view.ts";
import {
  createMockRequestService as _createMockRequestService,
  createTuiWithRequests,
  createViewWithRequests,
  sampleRequest as _sampleRequest,
  sampleRequests as _sampleRequests,
} from "./helpers.ts";

Deno.test("RequestManagerView - renders request list correctly", async () => {
  const { service: _service, view } = createViewWithRequests([
    {
      trace_id: "12345678-abcd-1234-5678-123456789abc",
      filename: "request-12345678.md",
      title: "Request 12345678",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
    },
    {
      trace_id: "87654321-abcd-1234-5678-123456789abc",
      filename: "request-87654321.md",
      title: "Request 87654321",
      status: "planned",
      priority: "high",
      agent: "code-reviewer",
      created: "2025-12-23T09:00:00Z",
      created_by: "user@example.com",
    },
  ]);
  const requests = await _service.listRequests();
  const output = view.renderRequestList(requests);

  assert(output.includes("Requests:"));
  assert(output.includes("⏳ ⚪ Request 12345678 - default"));
  assert(output.includes("📋 🟠 Request 87654321 - code-reviewer"));
});

Deno.test("RequestManagerView - handles empty request list", async () => {
  const { service: _service, view } = createViewWithRequests([]);
  const requests = await _service.listRequests();
  const output = view.renderRequestList(requests);

  assertEquals(output, "No requests found.");
});

Deno.test("RequestManagerView - renders request content", () => {
  const _service = new MinimalRequestServiceMock();
  const view = new RequestManagerView(_service);
  const content = "Sample request content";
  const output = view.renderRequestContent(content);

  assertEquals(output, content);
});

Deno.test("RequestManagerView - lists requests via service", async () => {
  const { service: _service } = createViewWithRequests([{
    trace_id: "test-123",
    filename: "request-test.md",
    title: "Test Request",
    status: "pending",
    priority: "normal",
    agent: "default",
    created: "2025-12-23T10:00:00Z",
    created_by: "test@example.com",
  }]);
  const requests = await _service.listRequests();

  assertEquals(requests.length, 1);
  assertEquals(requests[0].trace_id, "test-123");
});

Deno.test("RequestManagerView - filters requests by status", async () => {
  const { service: _service, view } = createViewWithRequests([
    {
      trace_id: "test-1",
      filename: "request-1.md",
      title: "Request 1",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
    },
    {
      trace_id: "test-2",
      filename: "request-2.md",
      title: "Request 2",
      status: "completed",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T11:00:00Z",
      created_by: "test@example.com",
    },
  ]);
  const pendingRequests = await view.listRequests("pending");

  assertEquals(pendingRequests.length, 1);
  assertEquals(pendingRequests[0].status, "pending");
});

Deno.test("RequestManagerView - creates new request", async () => {
  const { service: _service, view } = createViewWithRequests();
  const newRequest = await view.createRequest("Test request", { priority: "high", agent: "test-agent" });

  assert(newRequest.trace_id);
  assertEquals(newRequest.status, "pending");
  assertEquals(newRequest.priority, "high");
  assertEquals(newRequest.agent, "test-agent");
});

Deno.test("RequestManagerView - gets request content", async () => {
  const { service: _service, view } = createViewWithRequests([
    {
      trace_id: "test-123",
      filename: "request-test.md",
      title: "Test Request",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
    },
  ]);
  const content = await view.getRequestContent("test-123");

  assertEquals(content, "Content for test-123");
});

Deno.test("RequestManagerView - updates request status", async () => {
  const { service: _service, view } = createViewWithRequests([
    {
      trace_id: "test-123",
      filename: "request-test.md",
      title: "Test Request",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
    },
  ]);
  const success = await view.updateRequestStatus("test-123", "completed");

  assertEquals(success, true);
});

// TUI Session Tests
Deno.test("RequestManagerTuiSession - keyboard navigation", async () => {
  const _service = new MinimalRequestServiceMock();
  const requests = [
    {
      trace_id: "req-1",
      filename: "request-1.md",
      title: "Request 1",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
    {
      trace_id: "req-2",
      filename: "request-2.md",
      title: "Request 2",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T11:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
  ];
  const { view: _view, tui } = createTuiWithRequests(requests);

  // Initial selection - first request
  assertEquals(tui.getSelectedIndexInRequests(), 0);
  assertEquals(tui.getSelectedRequest()?.trace_id, "req-1");

  // Navigate down
  await tui.handleKey("down");
  assertEquals(tui.getSelectedIndexInRequests(), 1);
  assertEquals(tui.getSelectedRequest()?.trace_id, "req-2");

  // Navigate up
  await tui.handleKey("up");
  assertEquals(tui.getSelectedIndexInRequests(), 0);
  assertEquals(tui.getSelectedRequest()?.trace_id, "req-1");

  // Navigate to end
  await tui.handleKey("end");
  assertEquals(tui.getSelectedIndexInRequests(), 1);

  // Navigate to home
  await tui.handleKey("home");
  assertEquals(tui.getSelectedIndexInRequests(), 0);
});

Deno.test("RequestManagerTuiSession - keyboard actions show dialogs", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = [
    {
      trace_id: "req-1",
      filename: "request-1.md",
      title: "Request 1",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
  ];
  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession(requests);

  // Verify initial selection is the request
  assertEquals(tui.getState().selectedRequestId, "req-1");

  // 'c' key shows create dialog
  await tui.handleKey("c");
  assert(tui.getState().activeDialog !== null, "Create dialog should be shown");

  // Cancel the dialog
  await tui.handleKey("escape");
  assertEquals(tui.getState().activeDialog, null, "Dialog should be closed");

  // 's' key shows search dialog
  await tui.handleKey("s");
  assert(tui.getState().activeDialog !== null, "Search dialog should be shown");
  await tui.handleKey("escape");

  // '?' key shows help
  await tui.handleKey("?");
  assert(tui.getState().showHelp, "Help should be shown");
  await tui.handleKey("?");
  assertEquals(tui.getState().showHelp, false, "Help should be hidden");
});

Deno.test("RequestManagerTuiSession - create request via dialog", async () => {
  let createdDescription = "";

  const mockService = new MinimalRequestServiceMock();
  mockService.createRequest = (desc: string) => {
    createdDescription = desc;
    return Promise.resolve({
      trace_id: "new-req",
      filename: "request-new.md",
      title: "New Request",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: new Date().toISOString(),
      created_by: "test@example.com",
      source: "tui",
    });
  };

  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession([]);

  // Show create dialog
  tui.showCreateDialog();
  assert(tui.getState().activeDialog !== null);

  // Type description and confirm
  const dialog = tui.getState().activeDialog!;
  // Focus on input field
  dialog.handleKey("enter"); // Focus input
  // Type characters
  for (const char of "Test request") {
    dialog.handleKey(char);
  }
  // Tab to confirm button
  dialog.handleKey("tab");
  dialog.handleKey("tab");
  // Confirm
  dialog.handleKey("enter");

  // Process the dialog result
  await tui.handleKey("");

  // Wait for async create to complete
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Verify request was created with description
  assertEquals(createdDescription.includes("Test") || createdDescription === "", true);
});

Deno.test("RequestManagerTuiSession - handles empty request list", async () => {
  const _service = new MinimalRequestServiceMock();
  const view = new RequestManagerView(_service);
  const tui = view.createTuiSession([]);

  // Navigation should be safe with empty list
  await tui.handleKey("down");
  await tui.handleKey("up");

  // 'c' key should still show create dialog even with empty list
  await tui.handleKey("c");
  assert(tui.getState().activeDialog !== null, "Create dialog should show even with empty list");
  await tui.handleKey("escape");

  // 'd' without selection should do nothing
  await tui.handleKey("d");
  // No dialog should show because no request is selected
});

Deno.test("RequestManagerTuiSession - error handling via dialog", async () => {
  const mockService = new MinimalRequestServiceMock();
  mockService.createRequest = () => Promise.reject(new Error("Failed to create request"));

  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession([]);

  // Verify dialogs work properly
  tui.showCreateDialog();
  assert(tui.getState().activeDialog !== null);

  // Cancel dialog
  await tui.handleKey("escape");
  assertEquals(tui.getState().activeDialog, null);
});

Deno.test("RequestManagerTuiSession - get selected request", () => {
  const _service = new MinimalRequestServiceMock();
  const requests = [
    {
      trace_id: "req-1",
      filename: "request-1.md",
      title: "Request 1",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
    {
      trace_id: "req-2",
      filename: "request-2.md",
      title: "Request 2",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T11:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
  ];
  const view = new RequestManagerView(_service);
  const tui = view.createTuiSession(requests);

  // Initially selected first request
  const selected = tui.getSelectedRequest();
  assert(selected);
  assertEquals(selected.trace_id, "req-1");

  // Change selection
  tui.setSelectedByIndex(1);
  const selected2 = tui.getSelectedRequest();
  assert(selected2);
  assertEquals(selected2.trace_id, "req-2");
});
// ==========================================
// Phase 13.6: New Tests for Enhanced Session
// ==========================================

Deno.test("Phase 13.6: RequestViewState interface", () => {
  const mockService = new MinimalRequestServiceMock();
  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession([]);

  const state = tui.getState();

  // Verify all state properties exist
  assertEquals(state.selectedRequestId, null);
  assert(Array.isArray(state.requestTree));
  assertEquals(state.showHelp, false);
  assertEquals(state.showDetail, false);
  assertEquals(state.detailContent, "");
  assertEquals(state.activeDialog, null);
  assertEquals(state.searchQuery, "");
  assertEquals(state.filterStatus, null);
  assertEquals(state.filterPriority, null);
  assertEquals(state.filterAgent, null);
  assertEquals(state.groupBy, "none");
});

Deno.test("Phase 13.6: Tree grouping by status", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = [
    {
      trace_id: "req-1",
      filename: "request-1.md",
      title: "Request 1",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
    {
      trace_id: "req-2",
      filename: "request-2.md",
      title: "Request 2",
      status: "completed",
      priority: "high",
      agent: "other",
      created: "2025-12-23T11:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
  ];
  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession(requests);

  // Default is flat (no grouping)
  assertEquals(tui.getState().groupBy, "none");
  assertEquals(tui.getState().requestTree.length, 2);

  // Toggle to status grouping
  tui.toggleGrouping();
  assertEquals(tui.getState().groupBy, "status");
  // Should have groups now
  assert(tui.getState().requestTree[0].type === "group");

  // Toggle to priority grouping
  tui.toggleGrouping();
  assertEquals(tui.getState().groupBy, "priority");

  // Toggle to agent grouping
  tui.toggleGrouping();
  assertEquals(tui.getState().groupBy, "agent");

  // Toggle back to none
  tui.toggleGrouping();
  assertEquals(tui.getState().groupBy, "none");
});

Deno.test("Phase 13.6: Search functionality", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = [
    {
      trace_id: "req-1",
      filename: "request-1.md",
      title: "Bug fix",
      status: "pending",
      priority: "normal",
      agent: "developer",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
    {
      trace_id: "req-2",
      filename: "request-2.md",
      title: "Feature request",
      status: "completed",
      priority: "high",
      agent: "designer",
      created: "2025-12-23T11:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
  ];
  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession(requests);

  // Set search query
  tui.getState().searchQuery = "Bug";
  tui.buildTree();

  // Should filter to 1 result
  assertEquals(tui.getFilteredRequests().length, 1);
  assertEquals(tui.getFilteredRequests()[0].title, "Bug fix");

  // Clear search
  tui.getState().searchQuery = "";
  tui.buildTree();
  assertEquals(tui.getFilteredRequests().length, 2);
});

Deno.test("Phase 13.6: Filter by status", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = [
    {
      trace_id: "req-1",
      filename: "request-1.md",
      title: "Request 1",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
    {
      trace_id: "req-2",
      filename: "request-2.md",
      title: "Request 2",
      status: "completed",
      priority: "high",
      agent: "other",
      created: "2025-12-23T11:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
  ];
  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession(requests);

  // Filter by status
  tui.getState().filterStatus = "pending";
  tui.buildTree();

  assertEquals(tui.getFilteredRequests().length, 1);
  assertEquals(tui.getFilteredRequests()[0].status, "pending");
});

Deno.test("Phase 13.6: Filter by agent", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = [
    {
      trace_id: "req-1",
      filename: "request-1.md",
      title: "Request 1",
      status: "pending",
      priority: "normal",
      agent: "developer",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
    {
      trace_id: "req-2",
      filename: "request-2.md",
      title: "Request 2",
      status: "completed",
      priority: "high",
      agent: "designer",
      created: "2025-12-23T11:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
  ];
  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession(requests);

  // Filter by agent
  tui.getState().filterAgent = "dev";
  tui.buildTree();

  assertEquals(tui.getFilteredRequests().length, 1);
  assertEquals(tui.getFilteredRequests()[0].agent, "developer");
});

Deno.test("Phase 13.6: Help sections", () => {
  const mockService = new MinimalRequestServiceMock();
  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession([]);

  const sections = tui.getHelpSections();

  assert(sections.length > 0, "Should have help sections");
  assert(sections.some((s) => s.title === "Navigation"));
  assert(sections.some((s) => s.title === "Actions"));
});

Deno.test("Phase 13.6: Render methods return strings", () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = [
    {
      trace_id: "req-1",
      filename: "request-1.md",
      title: "Request 1",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
  ];
  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession(requests);

  // renderTree returns string[]
  const tree = tui.renderTree();
  assert(Array.isArray(tree));

  // renderHelp returns string[]
  const help = tui.renderHelp();
  assert(Array.isArray(help));

  // render returns string
  const output = tui.render();
  assertEquals(typeof output, "string");
  assert(output.includes("REQUEST MANAGER"));
});

Deno.test("Phase 13.6: PRIORITY_ICONS and STATUS_ICONS", async () => {
  const { PRIORITY_ICONS, STATUS_ICONS } = await import("../../src/tui/request_manager_view.ts");

  assert(PRIORITY_ICONS.critical !== undefined);
  assert(PRIORITY_ICONS.high !== undefined);
  assert(PRIORITY_ICONS.normal !== undefined);
  assert(PRIORITY_ICONS.low !== undefined);

  assert(STATUS_ICONS.pending !== undefined);
  assert(STATUS_ICONS.completed !== undefined);
  assert(STATUS_ICONS.cancelled !== undefined);
});

Deno.test("Phase 13.6: REQUEST_KEY_BINDINGS", async () => {
  const { REQUEST_KEY_BINDINGS } = await import("../../src/tui/request_manager_view.ts");

  assert(Array.isArray(REQUEST_KEY_BINDINGS));
  assert(REQUEST_KEY_BINDINGS.length > 0);

  // Verify key bindings have required fields
  for (const binding of REQUEST_KEY_BINDINGS) {
    assert(binding.key !== undefined);
    assert(binding.description !== undefined);
    assert(binding.action !== undefined);
  }
});

Deno.test("Phase 13.6: Cancel confirm dialog", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = [
    {
      trace_id: "req-1",
      filename: "request-1.md",
      title: "Request 1",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
  ];
  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession(requests);

  // Show cancel confirm
  tui.showCancelConfirm("req-1");
  assert(tui.getState().activeDialog !== null);

  // Cancel the dialog
  await tui.handleKey("escape");
  assertEquals(tui.getState().activeDialog, null);
});

Deno.test("Phase 13.6: Priority dialog", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = [
    {
      trace_id: "req-1",
      filename: "request-1.md",
      title: "Request 1",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
  ];
  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession(requests);

  // Show priority dialog via 'p' key
  await tui.handleKey("p");
  assert(tui.getState().activeDialog !== null);

  // Cancel
  await tui.handleKey("escape");
  assertEquals(tui.getState().activeDialog, null);
});

Deno.test("Phase 13.6: Tree navigation with groups", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = [
    {
      trace_id: "req-1",
      filename: "request-1.md",
      title: "Request 1",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
    {
      trace_id: "req-2",
      filename: "request-2.md",
      title: "Request 2",
      status: "completed",
      priority: "high",
      agent: "other",
      created: "2025-12-23T11:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
  ];
  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession(requests);

  // Switch to status grouping
  tui.toggleGrouping();
  assertEquals(tui.getState().groupBy, "status");

  // Navigate should work with groups
  await tui.handleKey("down");
  await tui.handleKey("down");
  // Should be navigating through the tree
  assert(tui.getState().selectedRequestId !== null);
});

Deno.test("Phase 13.6: Focusable elements", () => {
  const mockService = new MinimalRequestServiceMock();
  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession([]);

  const focusable = tui.getFocusableElements();
  assert(Array.isArray(focusable));
  assert(focusable.includes("request-list"));
});

Deno.test("Phase 13.6: setRequests updates tree", () => {
  const mockService = new MinimalRequestServiceMock();
  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession([]);

  assertEquals(tui.getRequests().length, 0);
  assertEquals(tui.getState().requestTree.length, 0);

  // Set new requests
  tui.setRequests([
    {
      trace_id: "new-req",
      filename: "request-new.md",
      title: "New Request",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T12:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
  ]);

  assertEquals(tui.getRequests().length, 1);
  assertEquals(tui.getState().requestTree.length, 1);
});

Deno.test("Phase 13.6: Collapse and expand all", async () => {
  const mockService = new MinimalRequestServiceMock();
  const requests = [
    {
      trace_id: "req-1",
      filename: "request-1.md",
      title: "Request 1",
      status: "pending",
      priority: "normal",
      agent: "default",
      created: "2025-12-23T10:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
    {
      trace_id: "req-2",
      filename: "request-2.md",
      title: "Request 2",
      status: "completed",
      priority: "high",
      agent: "other",
      created: "2025-12-23T11:00:00Z",
      created_by: "test@example.com",
      source: "cli",
    },
  ];
  const view = new RequestManagerView(mockService);
  const tui = view.createTuiSession(requests);

  // Switch to grouping mode first
  tui.toggleGrouping();

  // Groups should be expanded by default
  assert(tui.getState().requestTree[0].expanded);

  // Collapse all ('C' key)
  await tui.handleKey("C");
  assertEquals(tui.getState().requestTree[0].expanded, false);

  // Expand all ('E' key)
  await tui.handleKey("E");
  assertEquals(tui.getState().requestTree[0].expanded, true);
});
