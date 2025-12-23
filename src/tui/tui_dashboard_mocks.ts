/**
 * MockPortalService
 * Mock implementation of the PortalService interface for TDD and dashboard wiring tests.
 * All methods return static or empty values and are safe for use in isolated tests.
 */
export class MockPortalService {
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
      status: "active" as "active",
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
  getAgentLogs(agentId: string, limit = 50) {
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
