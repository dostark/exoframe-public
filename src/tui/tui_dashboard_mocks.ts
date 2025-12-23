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
