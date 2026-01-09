export function sampleRequest(overrides: Record<string, any> = {}) {
  return {
    trace_id: overrides.trace_id ?? `req-${Math.floor(Math.random() * 1e6)}`,
    filename: overrides.filename ?? "request.md",
    title: overrides.title ?? "Request",
    status: overrides.status ?? "pending",
    priority: overrides.priority ?? "normal",
    agent: overrides.agent ?? "default",
    created: overrides.created ?? new Date().toISOString(),
    created_by: overrides.created_by ?? "test@example.com",
    source: overrides.source ?? "cli",
    ...overrides,
  };
}

export function sampleRequests(arr: Array<Record<string, any>>) {
  return arr.map((a) => sampleRequest(a));
}

export function createMockRequestService(initial: Array<Record<string, any>> = []) {
  class MockRequestService {
    requests: any[];
    constructor(requests: any[] = []) {
      this.requests = requests;
    }
    listRequests(status?: string) {
      if (status) {
        return Promise.resolve(this.requests.filter((r) => r.status === status));
      }
      return Promise.resolve(this.requests);
    }
    getRequestContent(id: string) {
      const request = this.requests.find((r) => r.trace_id === id);
      return Promise.resolve(request ? `Content for ${id}` : "");
    }
    createRequest(_description: string, options?: any) {
      const newRequest = {
        trace_id: `test-${Date.now()}`,
        filename: `request-test.md`,
        title: `Request test`,
        status: "pending",
        priority: options?.priority || "normal",
        agent: options?.agent || "default",
        portal: options?.portal,
        model: options?.model,
        created: new Date().toISOString(),
        created_by: "test@example.com",
        source: "cli",
      };
      this.requests.push(newRequest);
      return Promise.resolve(newRequest);
    }
    updateRequestStatus(id: string, status: string) {
      const request = this.requests.find((r) => r.trace_id === id);
      if (request) {
        request.status = status;
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    }
  }

  return new MockRequestService(initial);
}

// -------------------------
// Additional TUI helpers
// -------------------------
import { RequestManagerView } from "../../src/tui/request_manager_view.ts";
import { PortalManagerView } from "../../src/tui/portal_manager_view.ts";
import { MonitorView } from "../../src/tui/monitor_view.ts";
import { MinimalPlanServiceMock, PlanReviewerTuiSession } from "../../src/tui/plan_reviewer_view.ts";

export function createViewWithRequests(arr: Array<Record<string, any>> = []) {
  const service = createMockRequestService(sampleRequests(arr));
  const view = new RequestManagerView(service);
  return { service, view };
}

export function createTuiWithRequests(arr: Array<Record<string, any>> = []) {
  const { service, view } = createViewWithRequests(arr);
  const requests = sampleRequests(arr);
  const tui = view.createTuiSession(requests);
  return { service, view, tui };
}

// -------------------------
// Log entry helpers (for MonitorView tests)
// -------------------------
let logIdCounter = 1;

export function sampleLogEntry(overrides: Record<string, unknown> = {}) {
  const id = overrides.id ?? String(logIdCounter++);
  return {
    id,
    trace_id: overrides.trace_id ?? `trace-${id}`,
    actor: overrides.actor ?? "agent",
    agent_id: overrides.agent_id ?? "default",
    action_type: overrides.action_type ?? "request_created",
    target: overrides.target ?? "Workspace/Requests/test.md",
    payload: overrides.payload ?? {},
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    ...overrides,
  };
}

export function sampleLogEntries(arr: Array<Record<string, unknown>>) {
  return arr.map((a) => sampleLogEntry(a));
}

/** Convenience: create two logs with different agents for filter tests */
export function createTwoAgentLogs() {
  return sampleLogEntries([
    { agent_id: "researcher", action_type: "request_created" },
    { agent_id: "architect", action_type: "plan_approved", target: "Workspace/Plans/test.md" },
  ]);
}

/** Convenience: create two logs with different action types for filter tests */
export function createTwoActionLogs() {
  return sampleLogEntries([
    { action_type: "request_created" },
    { action_type: "plan_approved" },
  ]);
}

// -------------------------
// Portal helpers
// -------------------------
export function samplePortal(overrides: Record<string, any> = {}) {
  return {
    alias: overrides.alias ?? `Portal-${Math.floor(Math.random() * 1e6)}`,
    status: overrides.status ?? "active",
    targetPath: overrides.targetPath ?? "/Portals/Main",
    symlinkPath: overrides.symlinkPath ?? "",
    contextCardPath: overrides.contextCardPath ?? "",
    ...overrides,
  };
}

export function samplePortals(arr: Array<Record<string, any>>) {
  return arr.map((a) => samplePortal(a));
}

export function createMockPortalService(initial: Array<Record<string, any>> = []) {
  class MockPortalService {
    portals: any[];
    actions: any[];
    constructor(portals: any[] = []) {
      this.portals = portals;
      this.actions = [];
    }
    listPortals() {
      return Promise.resolve(this.portals);
    }
    openPortal(id: string) {
      if (!this.portals.find((p: any) => p.alias === id)) throw new Error("Portal not found");
      this.actions.push({ type: "open", id });
      return Promise.resolve(true);
    }
    closePortal(id: string) {
      if (!this.portals.find((p: any) => p.alias === id)) throw new Error("Portal not found");
      this.actions.push({ type: "close", id });
      return Promise.resolve(true);
    }
    refreshPortal(id: string) {
      if (!this.portals.find((p: any) => p.alias === id)) throw new Error("Portal not found");
      this.actions.push({ type: "refresh", id });
      return Promise.resolve(true);
    }
    removePortal(id: string) {
      if (!this.portals.find((p: any) => p.alias === id)) throw new Error("Portal not found");
      this.actions.push({ type: "remove", id });
      return Promise.resolve(true);
    }
    getPortalDetails(alias: string) {
      return Promise.resolve(this.portals.find((p: any) => p.alias === alias));
    }
    quickJumpToPortalDir(alias: string) {
      return Promise.resolve(this.portals.find((p: any) => p.alias === alias)?.targetPath ?? "");
    }
    getPortalFilesystemPath(alias: string) {
      return Promise.resolve(this.portals.find((p: any) => p.alias === alias)?.targetPath ?? "");
    }
    getPortalActivityLog(_id: string) {
      return [
        `2025-12-22T12:00:00Z: Portal ${_id} started`,
        `2025-12-22T12:05:00Z: No errors reported`,
      ];
    }
  }

  return new MockPortalService(initial);
}

export function createPortalViewWithPortals(arr: Array<Record<string, any>> = []) {
  const service = createMockPortalService(samplePortals(arr));
  const view = new PortalManagerView(service);
  return { service, view };
}

export function createPortalTuiWithPortals(arr: Array<Record<string, any>> = []) {
  const { service, view } = createPortalViewWithPortals(arr);
  // Pass the service's array reference so tests that mutate the service.portals array are reflected in the TUI session
  const tui = view.createTuiSession(service.portals);
  return { service, view, tui };
}

// -------------------------
// Monitor helpers
// -------------------------
export function createMockDatabaseService(initialLogs: Array<Record<string, any>> = []) {
  class MockDatabaseService {
    private logs: Array<any>;
    constructor(logs: Array<any> = []) {
      this.logs = logs;
    }
    getRecentActivity(limit: number = 100) {
      return Promise.resolve(this.logs.slice(-limit).reverse());
    }
    addLog(log: any) {
      this.logs.push(log);
    }
  }
  return new MockDatabaseService(initialLogs);
}

export function createMonitorViewWithLogs(arr: Array<Record<string, any>> = []) {
  const db = createMockDatabaseService(arr);
  const monitorView = new MonitorView(db as unknown as any);
  // For testing, synchronously set the logs since constructor doesn't await
  monitorView["logs"] = arr.map((log): any => ({
    ...log,
    payload: typeof log.payload === "string" ? JSON.parse(log.payload) : log.payload,
  }));
  return { db, monitorView };
}

// -------------------------
// Plan reviewer helpers
// -------------------------
export function createPlanReviewerSession(plans: Array<Record<string, any>> = []) {
  const mock = new MinimalPlanServiceMock();
  const session = new PlanReviewerTuiSession(plans as unknown as any, mock);
  return { mock, session };
}

// -------------------------
// Tree view helpers
// -------------------------
import type { TreeNode } from "../../src/tui/utils/tree_view.ts";

export function createTestTree(): TreeNode[] {
  return [
    {
      id: "root1",
      label: "Root 1",
      type: "root",
      expanded: true,
      children: [
        {
          id: "child1-1",
          label: "Child 1.1",
          type: "item",
          expanded: false,
          children: [],
        },
        {
          id: "child1-2",
          label: "Child 1.2",
          type: "item",
          expanded: true,
          children: [
            {
              id: "grandchild1-2-1",
              label: "Grandchild 1.2.1",
              type: "leaf",
              expanded: false,
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: "root2",
      label: "Root 2",
      type: "root",
      expanded: false,
      children: [
        {
          id: "child2-1",
          label: "Child 2.1",
          type: "item",
          expanded: false,
          children: [],
        },
      ],
    },
  ];
}

export function createLargeTestTree(depth: number = 3, breadth: number = 5): TreeNode[] {
  function createLevel(currentDepth: number, prefix: string): TreeNode[] {
    if (currentDepth >= depth) return [];

    const nodes: TreeNode[] = [];
    for (let i = 0; i < breadth; i++) {
      const id = `${prefix}${i}`;
      nodes.push({
        id,
        label: `Node ${id}`,
        type: currentDepth === 0 ? "root" : "item",
        expanded: currentDepth === 0,
        children: createLevel(currentDepth + 1, `${id}-`),
      });
    }
    return nodes;
  }

  return createLevel(0, "node-");
}

// -------------------------
// Key simulation helpers
// -------------------------
export async function simulateKeySequence(
  handler: (key: string) => void | Promise<void>,
  keys: string[],
  delayMs: number = 0,
): Promise<void> {
  for (const key of keys) {
    await handler(key);
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export function typeString(text: string): string[] {
  return text.split("");
}

// -------------------------
// Render assertion helpers
// -------------------------
export function getVisibleText(lines: string[]): string[] {
  // Strip ANSI codes for easier assertions
  // deno-lint-ignore no-control-regex
  const ansiRegex = /\x1b\[[0-9;]*m/g;
  return lines.map((line) => line.replace(ansiRegex, ""));
}

export function findLineContaining(lines: string[], text: string): number {
  const visibleLines = getVisibleText(lines);
  return visibleLines.findIndex((line) => line.includes(text));
}

export function hasLineContaining(lines: string[], text: string): boolean {
  return findLineContaining(lines, text) !== -1;
}

export function countLinesContaining(lines: string[], text: string): number {
  const visibleLines = getVisibleText(lines);
  return visibleLines.filter((line) => line.includes(text)).length;
}

// -------------------------
// Dialog test helpers
// -------------------------
export function createMockDialogRenderOptions(width: number = 60, height: number = 20) {
  return {
    useColors: false,
    width,
    height,
  };
}

// -------------------------
// Spinner/Loading test helpers
// -------------------------
export function createMockSpinnerState(active: boolean = false, frame: number = 0) {
  return {
    active,
    frame,
    message: active ? "Loading..." : "",
    startTime: active ? Date.now() : 0,
  };
}

export function createMockProgressState(current: number = 0, total: number = 100) {
  return {
    current,
    total,
    message: "Processing...",
    startTime: Date.now(),
  };
}
