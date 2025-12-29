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
      return this.logs.slice(-limit).reverse();
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
