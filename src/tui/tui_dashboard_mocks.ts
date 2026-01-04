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

/**
 * MockMemoryService
 * Mock implementation of the MemoryServiceInterface for TDD and dashboard wiring tests.
 * Returns static memory data for testing TUI Memory View.
 */
export class MockMemoryService {
  /** Returns list of project names. */
  getProjects() {
    return Promise.resolve(["test-project", "demo-app"]);
  }

  /** Returns mock project memory. */
  getProjectMemory(portal: string) {
    return Promise.resolve({
      portal,
      overview: `Overview for ${portal} project. This is a comprehensive project memory.`,
      patterns: [
        {
          name: "Error Handling Pattern",
          description: "Use try-catch with specific error types",
          examples: ["src/error-handler.ts"],
          tags: ["error-handling", "best-practice"],
        },
        {
          name: "Service Layer Pattern",
          description: "Separate business logic into service classes",
          examples: ["src/services/user-service.ts"],
          tags: ["architecture"],
        },
      ],
      decisions: [
        {
          date: new Date().toISOString().split("T")[0],
          decision: "Use TypeScript",
          rationale: "Strong typing improves maintainability",
          alternatives: ["JavaScript", "Flow"],
        },
      ],
      references: [
        {
          type: "file" as const,
          path: "src/index.ts",
          description: "Main entry point",
        },
      ],
    });
  }

  /** Returns mock global memory. */
  getGlobalMemory() {
    return Promise.resolve({
      version: "1.0",
      updated_at: new Date().toISOString(),
      learnings: [
        {
          id: "global-1",
          created_at: new Date().toISOString(),
          source: "user" as const,
          scope: "global" as const,
          title: "Cross-project coding standards",
          description: "Apply consistent formatting across all projects",
          category: "pattern" as const,
          confidence: "high" as const,
          tags: ["standards"],
          status: "approved" as const,
        },
        {
          id: "global-2",
          created_at: new Date().toISOString(),
          source: "execution" as const,
          scope: "global" as const,
          title: "Testing best practices",
          description: "Write tests for critical paths first",
          category: "insight" as const,
          confidence: "medium" as const,
          tags: ["testing"],
          status: "approved" as const,
        },
      ],
      patterns: [
        {
          name: "Dependency Injection",
          description: "Use DI for better testability",
          applies_to: ["all"],
          examples: ["src/services/*.ts"],
          tags: ["architecture"],
        },
      ],
      anti_patterns: [
        {
          name: "God Object",
          description: "Avoid classes that do too much",
          reason: "Makes code hard to maintain and test",
          alternative: "Split into smaller, focused classes",
          tags: ["anti-pattern"],
        },
      ],
      statistics: {
        total_learnings: 2,
        by_category: {
          pattern: 1,
          insight: 1,
          decision: 0,
          troubleshooting: 0,
        },
        by_project: {},
        last_activity: new Date().toISOString(),
      },
    });
  }

  /** Returns mock execution memory. */
  getExecutionByTraceId(traceId: string) {
    return Promise.resolve({
      trace_id: traceId,
      request_id: "req-001",
      status: "completed" as const,
      agent: "CodeAgent",
      portal: "test-project",
      started_at: new Date(Date.now() - 3600000).toISOString(),
      completed_at: new Date().toISOString(),
      summary: "Implemented feature X with comprehensive tests",
      context_files: ["src/feature.ts"],
      context_portals: ["test-project"],
      changes: {
        files_created: ["src/feature.ts"],
        files_modified: ["src/index.ts"],
        files_deleted: [],
      },
      lessons_learned: ["Consider edge cases early"],
    });
  }

  /** Returns mock execution list. */
  getExecutionHistory(_options?: { portal?: string; limit?: number }) {
    return Promise.resolve([
      {
        trace_id: "exec-001-abcd-1234-5678-abcd1234",
        request_id: "req-001",
        status: "completed" as const,
        agent: "CodeAgent",
        portal: "test-project",
        started_at: new Date(Date.now() - 3600000).toISOString(),
        completed_at: new Date().toISOString(),
        summary: "Implement feature X",
        context_files: [],
        context_portals: [],
        changes: { files_created: [], files_modified: [], files_deleted: [] },
      },
      {
        trace_id: "exec-002-efgh-5678-1234-efgh5678",
        request_id: "req-002",
        status: "running" as const,
        agent: "TestAgent",
        portal: "demo-app",
        started_at: new Date().toISOString(),
        summary: "Run test suite",
        context_files: [],
        context_portals: [],
        changes: { files_created: [], files_modified: [], files_deleted: [] },
      },
    ]);
  }

  /** Returns mock search results. */
  search(query: string, _options?: { portal?: string; limit?: number }) {
    return Promise.resolve([
      {
        type: "pattern" as const,
        portal: "test-project",
        title: `Result matching "${query}"`,
        summary: "Found in project memory",
        relevance_score: 0.95,
        tags: ["matching"],
      },
      {
        type: "learning" as const,
        title: `Another result for "${query}"`,
        summary: "Found in global memory",
        relevance_score: 0.75,
        tags: ["related"],
      },
    ]);
  }

  /** Returns mock pending proposals. */
  listPending() {
    return Promise.resolve([
      {
        id: "proposal-1",
        created_at: new Date().toISOString(),
        operation: "add" as const,
        target_scope: "global" as const,
        learning: {
          id: "learning-prop-1",
          created_at: new Date().toISOString(),
          source: "execution" as const,
          scope: "global" as const,
          title: "New error handling pattern",
          description: "Use Result type for error handling",
          category: "pattern" as const,
          confidence: "medium" as const,
          tags: ["error-handling"],
        },
        reason: "Extracted from recent execution",
        agent: "CodeAgent",
        execution_id: "exec-001",
        status: "pending" as const,
      },
    ]);
  }

  /** Returns mock pending proposal by ID. */
  getPending(proposalId: string) {
    if (proposalId === "proposal-1") {
      return this.listPending().then((list) => list[0] || null);
    }
    return Promise.resolve(null);
  }

  /** Simulates approving a proposal. */
  approvePending(_proposalId: string) {
    return Promise.resolve();
  }

  /** Simulates rejecting a proposal. */
  rejectPending(_proposalId: string, _reason: string) {
    return Promise.resolve();
  }
}
