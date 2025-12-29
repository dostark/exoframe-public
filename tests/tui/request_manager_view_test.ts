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

  // Initial selection
  assertEquals(tui.getSelectedIndex(), 0);

  // Navigate down
  await tui.handleKey("down");
  assertEquals(tui.getSelectedIndex(), 1);

  // Navigate up
  await tui.handleKey("up");
  assertEquals(tui.getSelectedIndex(), 0);

  // Navigate to end
  await tui.handleKey("end");
  assertEquals(tui.getSelectedIndex(), 1);

  // Navigate to home
  await tui.handleKey("home");
  assertEquals(tui.getSelectedIndex(), 0);
});

Deno.test("RequestManagerTuiSession - keyboard actions", async () => {
  let createdRequest = false;
  let viewedRequest = false;
  let deletedRequest = false;

  const mockService = new MinimalRequestServiceMock();
  mockService.createRequest = () => {
    createdRequest = true;
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
  mockService.getRequestContent = () => {
    viewedRequest = true;
    return Promise.resolve("Request content");
  };
  mockService.updateRequestStatus = () => {
    deletedRequest = true;
    return Promise.resolve(true);
  };

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

  // Test create action
  await tui.handleKey("c");
  assert(createdRequest);

  // Test view action
  await tui.handleKey("v");
  assert(viewedRequest);

  // Test delete action
  await tui.handleKey("d");
  assert(deletedRequest);
});

Deno.test("RequestManagerTuiSession - handles empty request list", async () => {
  const _service = new MinimalRequestServiceMock();
  const view = new RequestManagerView(_service);
  const tui = view.createTuiSession([]);

  // Keyboard actions should be ignored when no requests
  await tui.handleKey("down");
  await tui.handleKey("up");
  await tui.handleKey("c");
  await tui.handleKey("v");
  await tui.handleKey("d");

  // Should remain at index 0
  assertEquals(tui.getSelectedIndex(), 0);
});

Deno.test("RequestManagerTuiSession - error handling", async () => {
  const mockService = new MinimalRequestServiceMock();
  mockService.createRequest = () => Promise.reject(new Error("Failed to create request"));

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

  // Try to create request - should handle error gracefully
  await tui.handleKey("c");
  assertEquals(tui.getStatusMessage(), "Error: Failed to create request");
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
  tui.setSelectedIndex(1);
  const selected2 = tui.getSelectedRequest();
  assert(selected2);
  assertEquals(selected2.trace_id, "req-2");
});
