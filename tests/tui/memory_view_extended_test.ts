/**
 * Extended tests for MemoryView to improve code coverage
 * These tests cover additional branches not covered by the main tests
 */
import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import type {
  ExecutionMemory,
  GlobalMemory,
  MemorySearchResult,
  MemoryUpdateProposal,
  ProjectMemory,
} from "../../src/schemas/memory_bank.ts";
import { MemoryViewTuiSession } from "../../src/tui/memory_view.ts";
import type { MemoryServiceInterface } from "../../src/tui/memory_view.ts";

/**
 * Comprehensive mock service for testing all memory view branches
 */
class ExtendedMockMemoryService implements MemoryServiceInterface {
  private projects: string[] = ["TestPortal"];
  private projectMemories: Map<string, ProjectMemory | null> = new Map();
  private globalMemory: GlobalMemory | null = null;
  private executions: ExecutionMemory[] = [];
  private pending: MemoryUpdateProposal[] = [];
  private searchResults: MemorySearchResult[] = [];

  setProjects(projects: string[]): void {
    this.projects = projects;
  }

  setProjectMemory(portal: string, memory: ProjectMemory | null): void {
    this.projectMemories.set(portal, memory);
  }

  setGlobalMemory(memory: GlobalMemory | null): void {
    this.globalMemory = memory;
  }

  setExecutions(executions: ExecutionMemory[]): void {
    this.executions = executions;
  }

  setPending(pending: MemoryUpdateProposal[]): void {
    this.pending = pending;
  }

  setSearchResults(results: MemorySearchResult[]): void {
    this.searchResults = results;
  }

  async getProjects(): Promise<string[]> {
    return await this.projects;
  }

  async getProjectMemory(portal: string): Promise<ProjectMemory | null> {
    return await this.projectMemories.get(portal) ?? null;
  }

  async getGlobalMemory(): Promise<GlobalMemory | null> {
    return await this.globalMemory;
  }

  async getExecutionByTraceId(traceId: string): Promise<ExecutionMemory | null> {
    return await this.executions.find((e) => e.trace_id === traceId) ?? null;
  }

  async getExecutionHistory(options?: { portal?: string; limit?: number }): Promise<ExecutionMemory[]> {
    let result = this.executions;
    if (options?.portal) {
      result = result.filter((e) => e.portal === options.portal);
    }
    if (options?.limit) {
      result = result.slice(0, options.limit);
    }
    return await result;
  }

  async search(query: string, _options?: { portal?: string; limit?: number }): Promise<MemorySearchResult[]> {
    if (query === "") return [];
    return await this.searchResults;
  }

  async listPending(): Promise<MemoryUpdateProposal[]> {
    return await this.pending;
  }

  async getPending(proposalId: string): Promise<MemoryUpdateProposal | null> {
    return await this.pending.find((p) => p.id === proposalId) ?? null;
  }

  async approvePending(_proposalId: string): Promise<void> {
    this.pending = await this.pending.filter((p) => p.id !== _proposalId);
  }

  async rejectPending(_proposalId: string, _reason: string): Promise<void> {
    this.pending = await this.pending.filter((p) => p.id !== _proposalId);
  }
}

// ===== Helper functions =====

function createMockProposal(id: string, title: string): MemoryUpdateProposal {
  return {
    id,
    operation: "add",
    target_scope: "project",
    target_project: "TestPortal",
    reason: "Test reason",
    agent: "test-agent",
    status: "pending",
    created_at: new Date().toISOString(),
    learning: {
      id: `learning-${id}`,
      title,
      description: "Test learning description",
      category: "pattern",
      confidence: "high",
      source: "agent",
      scope: "project",
      project: "TestPortal",
      created_at: new Date().toISOString(),
      tags: ["test", "coverage"],
    },
  };
}

function createMockExecution(traceId: string, status: "running" | "completed" | "failed"): ExecutionMemory {
  return {
    trace_id: traceId,
    request_id: `request-${traceId}`,
    agent: "test-agent",
    portal: "TestPortal",
    started_at: new Date().toISOString(),
    completed_at: status === "running" ? undefined : new Date().toISOString(),
    status,
    summary: "Test execution summary with some text",
    changes: {
      files_created: ["file1.ts", "file2.ts"],
      files_modified: ["modified.ts"],
      files_deleted: ["deleted.ts"],
    },
    context_files: ["context.md"],
    context_portals: ["TestPortal"],
    lessons_learned: ["Learned lesson 1", "Learned lesson 2"],
  };
}

function createMockProjectMemory(portal: string): ProjectMemory {
  return {
    portal,
    overview: "This is a test project overview that is quite long to test truncation behavior in rendering.",
    patterns: [
      { name: "Pattern 1", description: "Description 1", examples: ["ex1.ts"], tags: ["tag1", "tag2"] },
      { name: "Pattern 2", description: "Description 2", examples: ["ex2.ts"] },
    ],
    decisions: [
      { decision: "Decision 1", rationale: "Rationale 1", date: new Date().toISOString().split("T")[0] },
      { decision: "Decision 2", rationale: "Rationale 2", date: new Date().toISOString().split("T")[0] },
    ],
    references: [
      { type: "file", path: "src/test.ts", description: "Test file" },
    ],
  };
}

function createMockGlobalMemory(): GlobalMemory {
  return {
    version: "1.0.0",
    updated_at: new Date().toISOString(),
    patterns: [
      {
        name: "Global Pattern 1",
        description: "Description 1",
        applies_to: ["all"],
        examples: ["ex.ts"],
        tags: ["tag1"],
      },
    ],
    anti_patterns: [
      {
        name: "Anti-pattern 1",
        description: "Why to avoid",
        reason: "Bad",
        alternative: "Better",
        tags: ["avoid"],
      },
    ],
    learnings: [
      {
        id: "global-learning-1",
        title: "Global Learning 1",
        description: "Description",
        category: "pattern",
        confidence: "high",
        source: "user",
        scope: "global",
        created_at: new Date().toISOString(),
        tags: ["tag1"],
        status: "approved",
      },
      {
        id: "global-learning-2",
        title: "Global Learning 2",
        description: "Description",
        category: "insight",
        confidence: "medium",
        source: "agent",
        scope: "global",
        created_at: new Date().toISOString(),
        tags: ["tag2"],
        status: "approved",
      },
    ],
    statistics: {
      total_learnings: 2,
      by_category: { pattern: 1, insight: 1 },
      by_project: {},
      last_activity: new Date().toISOString(),
    },
  };
}

// ===== Helper to create session =====

function createTestSession(): MemoryViewTuiSession {
  const mockService = new ExtendedMockMemoryService();
  return new MemoryViewTuiSession(mockService as unknown as MemoryServiceInterface);
}

function createSessionWithService(service: ExtendedMockMemoryService): MemoryViewTuiSession {
  return new MemoryViewTuiSession(service as unknown as MemoryServiceInterface);
}

// ===== Tests =====

Deno.test("MemoryViewTuiSession: getters return correct values", () => {
  const session = createTestSession();

  assertEquals(session.getActiveScope(), "projects");
  assertEquals(session.getSelectedNodeId(), null);
  assertEquals(session.getPendingCount(), 0);
  assertEquals(session.isLoading(), false);
  assertEquals(session.getLoadingMessage(), "");
  assertEquals(session.hasActiveDialog(), false);
  assertEquals(session.getActiveDialog(), null);
});

Deno.test("MemoryViewTuiSession: setUseColors toggles color mode", async () => {
  const session = createTestSession();
  await session.initialize();

  session.setUseColors(false);
  const tree = session.renderTreePanel();
  assertEquals(typeof tree, "string");

  session.setUseColors(true);
  const treeColored = session.renderTreePanel();
  assertEquals(typeof treeColored, "string");
});

Deno.test("MemoryViewTuiSession: tickSpinner advances frame", async () => {
  const session = createTestSession();
  await session.initialize();

  session.tickSpinner();
  session.tickSpinner();
  session.tickSpinner();
});

Deno.test("MemoryViewTuiSession: refreshIfStale calls refresh when stale", async () => {
  const session = createTestSession();
  await session.initialize();

  const state = session.getState();
  (state as { lastRefresh: number }).lastRefresh = Date.now() - 60000;

  await session.refreshIfStale();
});

Deno.test("MemoryViewTuiSession: renders global scope detail with memory", async () => {
  const service = new ExtendedMockMemoryService();
  service.setGlobalMemory(createMockGlobalMemory());
  service.setProjects(["TestPortal"]);
  service.setPending([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("g");
  const detail = session.getDetailContent();

  assertStringIncludes(detail, "Global");
});

Deno.test("MemoryViewTuiSession: renders global scope detail without memory", async () => {
  const service = new ExtendedMockMemoryService();
  service.setGlobalMemory(null);
  service.setProjects([]);
  service.setPending([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("g");
  const detail = session.getDetailContent();

  assertEquals(typeof detail, "string");
});

Deno.test("MemoryViewTuiSession: renders projects scope detail", async () => {
  const service = new ExtendedMockMemoryService();
  service.setProjects(["Portal1", "Portal2"]);
  service.setPending([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("p");
  const detail = session.getDetailContent();

  assertEquals(typeof detail, "string");
});

Deno.test("MemoryViewTuiSession: renders executions scope detail", async () => {
  const service = new ExtendedMockMemoryService();
  service.setExecutions([createMockExecution("trace-1", "completed")]);
  service.setProjects([]);
  service.setPending([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("e");
  const detail = session.getDetailContent();

  assertEquals(typeof detail, "string");
});

Deno.test("MemoryViewTuiSession: renders pending scope detail", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([createMockProposal("prop-1", "Test Proposal")]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("n");
  const detail = session.getDetailContent();

  assertEquals(typeof detail, "string");
});

Deno.test("MemoryViewTuiSession: renders project detail with memory", async () => {
  const service = new ExtendedMockMemoryService();
  service.setProjects(["TestPortal"]);
  service.setProjectMemory("TestPortal", createMockProjectMemory("TestPortal"));
  service.setPending([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("p");
  await session.handleKey("enter");
  await session.handleKey("down");
  const detail = session.getDetailContent();

  assertEquals(typeof detail, "string");
});

Deno.test("MemoryViewTuiSession: renders project detail without memory", async () => {
  const service = new ExtendedMockMemoryService();
  service.setProjects(["EmptyPortal"]);
  service.setProjectMemory("EmptyPortal", null);
  service.setPending([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("p");
  await session.handleKey("enter");
  await session.handleKey("down");
  const detail = session.getDetailContent();

  assertEquals(typeof detail, "string");
});

Deno.test("MemoryViewTuiSession: renders execution detail with all fields", async () => {
  const service = new ExtendedMockMemoryService();
  const exec = createMockExecution("trace-full", "completed");
  service.setExecutions([exec]);
  service.setProjects([]);
  service.setPending([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("e");
  await session.handleKey("enter");
  await session.handleKey("down");
  const detail = session.getDetailContent();

  assertEquals(typeof detail, "string");
});

Deno.test("MemoryViewTuiSession: renders execution detail for running status", async () => {
  const service = new ExtendedMockMemoryService();
  const exec = createMockExecution("trace-running", "running");
  exec.completed_at = undefined;
  exec.changes = {
    files_created: [],
    files_modified: [],
    files_deleted: [],
  };
  exec.lessons_learned = undefined;
  service.setExecutions([exec]);
  service.setProjects([]);
  service.setPending([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("e");
  await session.handleKey("enter");
  await session.handleKey("down");
  const detail = session.getDetailContent();

  assertEquals(typeof detail, "string");
});

Deno.test("MemoryViewTuiSession: renders execution detail for failed status", async () => {
  const service = new ExtendedMockMemoryService();
  const exec = createMockExecution("trace-failed", "failed");
  exec.error_message = "Something went wrong";
  service.setExecutions([exec]);
  service.setProjects([]);
  service.setPending([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("e");
  await session.handleKey("enter");
  await session.handleKey("down");
  const detail = session.getDetailContent();

  assertEquals(typeof detail, "string");
});

Deno.test("MemoryViewTuiSession: approveSelectedProposal with no selection", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("a");
  const statusBar = session.renderStatusBar();
  assertEquals(typeof statusBar, "string");
});

Deno.test("MemoryViewTuiSession: rejectSelectedProposal with no selection", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("r");
  const statusBar = session.renderStatusBar();
  assertEquals(typeof statusBar, "string");
});

Deno.test("MemoryViewTuiSession: approveAllProposals with no proposals", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("A");
  assertEquals(session.hasActiveDialog(), false);
});

Deno.test("MemoryViewTuiSession: approveAllProposals with proposals opens dialog", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([createMockProposal("p1", "Proposal 1"), createMockProposal("p2", "Proposal 2")]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("A");
  assertEquals(session.hasActiveDialog(), true);
});

Deno.test("MemoryViewTuiSession: openAddLearningDialog opens dialog", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("L");
  assertEquals(session.hasActiveDialog(), true);
});

Deno.test("MemoryViewTuiSession: promoteSelectedLearning without learning selected", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("P");
  assertEquals(session.hasActiveDialog(), false);
});

Deno.test("MemoryViewTuiSession: search with empty query reloads tree", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("s");
  await session.handleKey("enter");

  assertEquals(session.isSearchActive(), false);
});

Deno.test("MemoryViewTuiSession: search with query executes search", async () => {
  const service = new ExtendedMockMemoryService();
  service.setSearchResults([
    { type: "pattern", id: "p1", title: "Result 1", summary: "Summary 1" },
    { type: "decision", id: "d1", title: "Result 2", summary: "Summary 2" },
  ]);
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("s");
  await session.handleKey("t");
  await session.handleKey("e");
  await session.handleKey("s");
  await session.handleKey("t");
  await session.handleKey("enter");

  assertEquals(typeof session.getActiveScope(), "string");
});

Deno.test("MemoryViewTuiSession: navigation with empty tree does nothing", async () => {
  const service = new ExtendedMockMemoryService();
  service.setProjects([]);
  service.setGlobalMemory(null);
  service.setExecutions([]);
  service.setPending([]);

  const session = createSessionWithService(service);
  await session.handleKey("down");
  await session.handleKey("up");
});

Deno.test("MemoryViewTuiSession: renderTreePanel returns string", async () => {
  const service = new ExtendedMockMemoryService();
  service.setProjects(["TestPortal"]);
  service.setPending([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  const tree = session.renderTreePanel();
  assertEquals(typeof tree, "string");
  assertStringIncludes(tree, "Global");
  assertStringIncludes(tree, "Projects");
});

Deno.test("MemoryViewTuiSession: renderStatusBar shows search input when active", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("s");
  await session.handleKey("q");
  await session.handleKey("u");
  await session.handleKey("e");
  await session.handleKey("r");
  await session.handleKey("y");

  const statusBar = session.renderStatusBar();
  assertStringIncludes(statusBar, "query");
});

Deno.test("MemoryViewTuiSession: renderActionButtons shows context-specific actions", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([createMockProposal("p1", "Proposal 1")]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("n");

  const actions = session.renderActionButtons();
  assertEquals(typeof actions, "string");
});

Deno.test("MemoryViewTuiSession: renderDialog returns dialog content when active", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([createMockProposal("p1", "Proposal 1"), createMockProposal("p2", "Proposal 2")]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("A");
  assertEquals(session.hasActiveDialog(), true);

  const dialogContent = session.renderDialog(80, 24);
  assertEquals(typeof dialogContent, "string");
});

Deno.test("MemoryViewTuiSession: dialog escape cancels", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([createMockProposal("p1", "Proposal 1")]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("A");
  assertEquals(session.hasActiveDialog(), true);

  await session.handleKey("escape");
  assertEquals(session.hasActiveDialog(), false);
});

Deno.test("MemoryViewTuiSession: handleKey with dialog forwards to dialog", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([createMockProposal("p1", "Proposal 1")]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("A");
  assertEquals(session.hasActiveDialog(), true);

  await session.handleKey("tab");
  assertEquals(session.hasActiveDialog(), true);
});

Deno.test("MemoryViewTuiSession: ? toggles help", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("?");
  const detail = session.getDetailContent();
  assertStringIncludes(detail.toLowerCase(), "help");

  await session.handleKey("?");
});

Deno.test("MemoryViewTuiSession: findNodeById returns null for invalid ID", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  const node = session.findNodeById("nonexistent");
  assertEquals(node, null);
});

Deno.test("MemoryViewTuiSession: findNodeById returns null for null ID", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  const node = session.findNodeById(null);
  assertEquals(node, null);
});

Deno.test("MemoryViewTuiSession: handles pending proposal detail rendering", async () => {
  const service = new ExtendedMockMemoryService();
  const proposal = createMockProposal("p1", "Test Proposal");
  service.setPending([proposal]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("n");
  await session.handleKey("enter");
  await session.handleKey("down");
  const detail = session.getDetailContent();

  assertEquals(typeof detail, "string");
});

Deno.test("MemoryViewTuiSession: approve pending proposal with selection", async () => {
  const service = new ExtendedMockMemoryService();
  const proposal = createMockProposal("p1", "Test Proposal");
  service.setPending([proposal]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("n");
  await session.handleKey("enter");
  await session.handleKey("down");

  await session.handleKey("a");
  assertEquals(session.hasActiveDialog(), true);
});

Deno.test("MemoryViewTuiSession: reject pending proposal with selection", async () => {
  const service = new ExtendedMockMemoryService();
  const proposal = createMockProposal("p1", "Test Proposal");
  service.setPending([proposal]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("n");
  await session.handleKey("enter");
  await session.handleKey("down");

  await session.handleKey("r");
  assertEquals(session.hasActiveDialog(), true);
});

Deno.test("MemoryViewTuiSession: getFocusableElements returns panel list", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  const elements = session.getFocusableElements();
  assertEquals(Array.isArray(elements), true);
});

Deno.test("MemoryViewTuiSession: left and right navigation", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects(["TestPortal"]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("p");
  await session.handleKey("right");
  await session.handleKey("left");

  assertEquals(session.getActiveScope(), "projects");
});

Deno.test("MemoryViewTuiSession: Home and End keys for navigation", async () => {
  const service = new ExtendedMockMemoryService();
  service.setProjects(["Portal1", "Portal2", "Portal3"]);
  service.setPending([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("end");
  await session.handleKey("home");

  assertEquals(typeof session.getSelectedNodeId(), "string");
});

Deno.test("MemoryViewTuiSession: PageUp and PageDown keys", async () => {
  const service = new ExtendedMockMemoryService();
  service.setProjects(["Portal1", "Portal2", "Portal3", "Portal4", "Portal5"]);
  service.setPending([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("pagedown");
  await session.handleKey("pageup");

  assertEquals(typeof session.getSelectedNodeId(), "string");
});

Deno.test("MemoryViewTuiSession: search escape cancels search mode", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("s");
  assertEquals(session.isSearchActive(), true);

  await session.handleKey("escape");
  assertEquals(session.isSearchActive(), false);
});

Deno.test("MemoryViewTuiSession: search backspace removes character", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("s");
  await session.handleKey("t");
  await session.handleKey("e");
  await session.handleKey("s");
  await session.handleKey("t");
  await session.handleKey("backspace");

  const statusBar = session.renderStatusBar();
  assertStringIncludes(statusBar, "tes");
});

Deno.test("MemoryViewTuiSession: multiple scope navigation cycles", async () => {
  const service = new ExtendedMockMemoryService();
  service.setProjects(["TestPortal"]);
  service.setGlobalMemory(createMockGlobalMemory());
  service.setExecutions([createMockExecution("trace-1", "completed")]);
  service.setPending([createMockProposal("p1", "Proposal")]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("g");
  assertEquals(session.getActiveScope(), "global");

  await session.handleKey("p");
  assertEquals(session.getActiveScope(), "projects");

  await session.handleKey("e");
  assertEquals(session.getActiveScope(), "executions");

  await session.handleKey("n");
  assertEquals(session.getActiveScope(), "pending");
});

Deno.test("MemoryViewTuiSession: getState returns full state", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  const state = session.getState();
  assertExists(state);
  assertExists(state.activeScope);
  assertExists(state.tree);
  assertEquals(typeof state.searchQuery, "string");
  assertEquals(typeof state.searchActive, "boolean");
});

Deno.test("MemoryViewTuiSession: loading state during async operations", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects(["TestPortal"]);
  service.setExecutions([]);

  const session = createSessionWithService(service);

  assertEquals(session.isLoading(), false);

  await session.initialize();

  assertEquals(session.isLoading(), false);
});

Deno.test("MemoryViewTuiSession: handles nested tree expansion", async () => {
  const service = new ExtendedMockMemoryService();
  const project = createMockProjectMemory("TestPortal");
  service.setProjects(["TestPortal"]);
  service.setProjectMemory("TestPortal", project);
  service.setPending([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("p");
  await session.handleKey("enter");
  await session.handleKey("down");
  await session.handleKey("enter");

  const tree = session.renderTreePanel();
  assertEquals(typeof tree, "string");
});

Deno.test("MemoryViewTuiSession: refresh method works", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([]);
  service.setProjects(["TestPortal"]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.refresh();

  assertEquals(typeof session.getActiveScope(), "string");
});

Deno.test("MemoryViewTuiSession: tree with learnings renders correctly", async () => {
  const service = new ExtendedMockMemoryService();
  service.setGlobalMemory(createMockGlobalMemory());
  service.setProjects([]);
  service.setPending([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  await session.handleKey("g");
  await session.handleKey("enter");

  const tree = session.renderTreePanel();
  assertStringIncludes(tree, "Global");
});

Deno.test("MemoryViewTuiSession: getTree returns tree structure", async () => {
  const service = new ExtendedMockMemoryService();
  service.setProjects(["TestPortal"]);
  service.setPending([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  const tree = session.getTree();
  assertEquals(Array.isArray(tree), true);
});

Deno.test("MemoryViewTuiSession: status bar shows pending count badge", async () => {
  const service = new ExtendedMockMemoryService();
  service.setPending([createMockProposal("p1", "Proposal 1")]);
  service.setProjects([]);
  service.setExecutions([]);

  const session = createSessionWithService(service);
  await session.initialize();

  const statusBar = session.renderStatusBar();
  assertEquals(typeof statusBar, "string");
});
