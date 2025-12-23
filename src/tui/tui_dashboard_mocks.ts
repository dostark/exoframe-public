/**
 * MockPortalService
 * Mock implementation of the PortalService interface for TDD and dashboard wiring tests.
 * All methods return static or empty values and are safe for use in isolated tests.
 */
import { PortalService } from "./portal_manager_view.ts";

export class MockPortalService implements PortalService {
  /** Returns an empty list of portals. */
  listPortals() {
    return Promise.resolve([]);
  }
  /** Returns mock portal details. */
  getPortalDetails() {
    return Promise.resolve({
      alias: "mock",
      targetPath: "/mock/path",
      symlinkPath: "/mock/symlink",
      contextCardPath: "/mock/card",
      status: "active" as const,
      permissions: "rw",
    });
  }
  /** Simulates opening a portal. */
  openPortal() {
    return Promise.resolve(true);
  }
  /** Simulates closing a portal. */
  closePortal() {
    return Promise.resolve(true);
  }
  /** Simulates refreshing a portal. */
  refreshPortal() {
    return Promise.resolve(true);
  }
  /** Simulates removing a portal. */
  removePortal() {
    return Promise.resolve(true);
  }
  /** Simulates quick jump to portal directory. */
  quickJumpToPortalDir() {
    return Promise.resolve("");
  }
  /** Returns a mock filesystem path for the portal. */
  getPortalFilesystemPath() {
    return Promise.resolve("");
  }
  /** Returns an empty activity log for the portal. */
  getPortalActivityLog() {
    return [];
  }
}

/**
 * MockPlanService
 * Mock implementation of the PlanService interface for TDD and dashboard wiring tests.
 * All methods return static or empty values and are safe for use in isolated tests.
 */
export class MockPlanService {
  /** Returns an empty list of pending plans. */
  listPending() {
    return Promise.resolve([]);
  }
  /** Returns an empty diff string. */
  getDiff() {
    return Promise.resolve("");
  }
  /** Simulates plan approval. */
  approve() {
    return Promise.resolve(true);
  }
  /** Simulates plan rejection. */
  reject() {
    return Promise.resolve(true);
  }
}

/**
 * MockLogService
 * Mock implementation of the LogService interface for TDD and dashboard wiring tests.
 * Returns an empty activity list.
 */
export class MockLogService {
  /** Returns an empty list of recent activity logs. */
  getRecentActivity() {
    return [];
  }
}

/**
 * MockDaemonService
 * Mock implementation of the DaemonService interface for TDD and dashboard wiring tests.
 * All methods return static or empty values and are safe for use in isolated tests.
 */
export class MockDaemonService {
  /** Simulates starting the daemon. */
  start() {
    return Promise.resolve();
  }
  /** Simulates stopping the daemon. */
  stop() {
    return Promise.resolve();
  }
  /** Simulates restarting the daemon. */
  restart() {
    return Promise.resolve();
  }
  /** Returns a mock status string. */
  getStatus() {
    return Promise.resolve("OK");
  }
  /** Returns an empty list of daemon logs. */
  getLogs() {
    return Promise.resolve([]);
  }
  /** Returns an empty list of daemon errors. */
  getErrors() {
    return Promise.resolve([]);
  }
}

/**
 * MockRequestService
 * Mock implementation of the RequestService interface for TDD and dashboard wiring tests.
 * Returns static request data for testing.
 */
export class MockRequestService {
  /** Returns a list of mock requests. */
  listRequests(status?: string) {
    const allRequests = [
      {
        trace_id: "12345678-abcd-1234-5678-123456789abc",
        filename: "request-12345678.md",
        title: "Request 12345678",
        status: "pending",
        priority: "normal",
        agent: "default",
        portal: "main",
        model: "gpt-4",
        created: new Date().toISOString(),
        created_by: "test@example.com",
        source: "cli",
      },
      {
        trace_id: "87654321-abcd-1234-5678-123456789abc",
        filename: "request-87654321.md",
        title: "Request 87654321",
        status: "planned",
        priority: "high",
        agent: "code-reviewer",
        portal: undefined,
        model: "claude-3",
        created: new Date(Date.now() - 3600000).toISOString(),
        created_by: "user@example.com",
        source: "cli",
      },
    ];

    if (status) {
      return Promise.resolve(allRequests.filter((r) => r.status === status));
    }
    return Promise.resolve(allRequests);
  }

  /** Returns mock request content. */
  getRequestContent(requestId: string) {
    return Promise.resolve(`# Request Content for ${requestId}

This is a sample request description created for testing purposes.

## Requirements
- Feature implementation
- Testing
- Documentation

## Priority
High priority feature request.`);
  }

  /** Simulates creating a new request. */
  createRequest(_description: string, options?: any) {
    const newRequest = {
      trace_id: crypto.randomUUID(),
      filename: `request-${crypto.randomUUID().slice(0, 8)}.md`,
      title: `Request ${crypto.randomUUID().slice(0, 8)}`,
      status: "pending",
      priority: options?.priority || "normal",
      agent: options?.agent || "default",
      portal: options?.portal,
      model: options?.model,
      created: new Date().toISOString(),
      created_by: "tui@example.com",
      source: "tui",
    };
    return Promise.resolve(newRequest);
  }

  /** Simulates updating request status. */
  updateRequestStatus(_requestId: string, _status: string) {
    return Promise.resolve(true);
  }
}

/**
 * MockAgentService
 * Mock implementation of the AgentService interface for TDD and dashboard wiring tests.
 * Returns static agent data for testing.
 */
export class MockAgentService {
  /** Returns a list of mock agents. */
  listAgents() {
    return Promise.resolve([
      {
        id: "agent-1",
        name: "CodeReviewer",
        model: "gpt-4",
        status: "active" as const,
        lastActivity: new Date().toISOString(),
        capabilities: ["code-review", "testing"],
      },
      {
        id: "agent-2",
        name: "DocWriter",
        model: "claude-3",
        status: "inactive" as const,
        lastActivity: new Date(Date.now() - 3600000).toISOString(),
        capabilities: ["documentation"],
      },
    ]);
  }

  /** Returns mock health for an agent. */
  getAgentHealth(agentId: string) {
    return Promise.resolve({
      status: agentId === "agent-1" ? "healthy" as const : "warning" as const,
      issues: agentId === "agent-1" ? [] : ["High memory usage"],
      uptime: 86400, // 1 day
    });
  }

  /** Returns mock logs for an agent. */
  getAgentLogs(agentId: string, _limit = 50) {
    return Promise.resolve([
      {
        timestamp: new Date().toISOString(),
        level: "info" as const,
        message: `Agent ${agentId} processed request`,
      },
      {
        timestamp: new Date(Date.now() - 60000).toISOString(),
        level: "warn" as const,
        message: `Agent ${agentId} encountered minor issue`,
      },
    ]);
  }
}
