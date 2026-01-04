/**
 * Memory Pending Panel TUI Tests
 *
 * Part of Phase 12.13: TUI Memory View - Pending & Actions
 *
 * Tests cover:
 * - Pending proposals list rendering
 * - Badge with count
 * - Navigation through pending items
 * - Action triggers (approve/reject)
 * - Integration with MemoryViewTuiSession
 */

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { MemoryViewTuiSession } from "../../src/tui/memory_view.ts";
import type { MemoryServiceInterface } from "../../src/tui/memory_view.ts";
import { renderPendingPanel, renderStatsPanel } from "../../src/tui/memory_panels/index.ts";
import type { MemoryUpdateProposal } from "../../src/schemas/memory_bank.ts";

// ===== Test Fixtures =====

function createMockProposals(): MemoryUpdateProposal[] {
  return [
    {
      id: "proposal-1",
      agent: "test-agent",
      operation: "add",
      learning: {
        id: "learning-1",
        title: "Error Handling Pattern",
        category: "pattern",
        description: "Use try-catch for all async functions",
        confidence: "high",
        tags: ["error-handling"],
        source: "agent",
        scope: "project",
        created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      },
      target_scope: "project",
      target_project: "my-app",
      reason: "Extracted from execution",
      created_at: new Date(Date.now() - 3600000).toISOString(),
      status: "pending",
    },
    {
      id: "proposal-2",
      agent: "test-agent",
      operation: "add",
      learning: {
        id: "learning-2",
        title: "API Rate Limiting",
        category: "decision",
        description: "Implement rate limiting for all API endpoints",
        confidence: "medium",
        tags: ["api", "security"],
        source: "agent",
        scope: "global",
        created_at: new Date(Date.now() - 18000000).toISOString(), // 5 hours ago
      },
      target_scope: "global",
      reason: "Common pattern across projects",
      created_at: new Date(Date.now() - 18000000).toISOString(),
      status: "pending",
    },
    {
      id: "proposal-3",
      agent: "test-agent",
      operation: "add",
      learning: {
        id: "learning-3",
        title: "Database Connection Issue",
        category: "troubleshooting",
        description: "Connection timeout solutions",
        confidence: "high",
        tags: ["database"],
        source: "execution",
        scope: "project",
        created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      },
      target_scope: "project",
      target_project: "api-service",
      reason: "Documented troubleshooting steps",
      created_at: new Date(Date.now() - 86400000).toISOString(),
      status: "pending",
    },
  ];
}

class MockMemoryServiceWithPending implements MemoryServiceInterface {
  private proposals: MemoryUpdateProposal[] = createMockProposals();

  getProjects(): Promise<string[]> {
    return Promise.resolve(["my-app", "api-service"]);
  }

  getProjectMemory() {
    return Promise.resolve(null);
  }

  getGlobalMemory() {
    return Promise.resolve(null);
  }

  getExecutionByTraceId() {
    return Promise.resolve(null);
  }

  getExecutionHistory() {
    return Promise.resolve([]);
  }

  search() {
    return Promise.resolve([]);
  }

  listPending(): Promise<MemoryUpdateProposal[]> {
    return Promise.resolve(this.proposals);
  }

  getPending(proposalId: string): Promise<MemoryUpdateProposal | null> {
    return Promise.resolve(
      this.proposals.find((p) => p.id === proposalId) ?? null,
    );
  }

  approvePending(proposalId: string): Promise<void> {
    this.proposals = this.proposals.filter((p) => p.id !== proposalId);
    return Promise.resolve();
  }

  rejectPending(proposalId: string, _reason: string): Promise<void> {
    this.proposals = this.proposals.filter((p) => p.id !== proposalId);
    return Promise.resolve();
  }
}

// ===== renderPendingPanel Tests =====

Deno.test("renderPendingPanel: renders proposals list", () => {
  const proposals = createMockProposals();
  const options = { width: 80, height: 20, useColors: false };

  const rendered = renderPendingPanel(proposals, 0, options);

  assertExists(rendered);
  assertEquals(rendered.includes("Pending Proposals"), true);
  assertEquals(rendered.includes("3 proposal(s)"), true);
});

Deno.test("renderPendingPanel: shows proposal titles", () => {
  const proposals = createMockProposals();
  const options = { width: 80, height: 20, useColors: false };

  const rendered = renderPendingPanel(proposals, 0, options);

  assertEquals(rendered.includes("Error Handling Pattern"), true);
  assertEquals(rendered.includes("API Rate Limiting"), true);
  assertEquals(rendered.includes("Database Connection Issue"), true);
});

Deno.test("renderPendingPanel: shows categories", () => {
  const proposals = createMockProposals();
  const options = { width: 80, height: 20, useColors: false };

  const rendered = renderPendingPanel(proposals, 0, options);

  assertEquals(rendered.includes("[pattern]"), true);
  assertEquals(rendered.includes("[decision]"), true);
  assertEquals(rendered.includes("[troubleshooting]"), true);
});

Deno.test("renderPendingPanel: shows scope", () => {
  const proposals = createMockProposals();
  const options = { width: 80, height: 20, useColors: false };

  const rendered = renderPendingPanel(proposals, 0, options);

  assertEquals(rendered.includes("Scope: project"), true);
  assertEquals(rendered.includes("Scope: global"), true);
});

Deno.test("renderPendingPanel: marks selected item", () => {
  const proposals = createMockProposals();
  const options = { width: 80, height: 20, useColors: false };

  const rendered = renderPendingPanel(proposals, 1, options);
  const lines = rendered.split("\n");

  // Find line with API Rate Limiting
  const selectedLine = lines.find((l) => l.includes("API Rate Limiting"));
  assertExists(selectedLine);
  assertEquals(selectedLine.startsWith(">"), true);
});

Deno.test("renderPendingPanel: handles empty list", () => {
  const options = { width: 80, height: 20, useColors: false };

  const rendered = renderPendingPanel([], 0, options);

  assertEquals(rendered.includes("No pending proposals"), true);
  assertEquals(rendered.includes("created when agents identify"), true);
});

Deno.test("renderPendingPanel: formats age correctly", () => {
  const proposals = createMockProposals();
  const options = { width: 80, height: 20, useColors: false };

  const rendered = renderPendingPanel(proposals, 0, options);

  // Should show relative time
  assertEquals(rendered.includes("hours ago") || rendered.includes("days ago") || rendered.includes("min ago"), true);
});

Deno.test("renderPendingPanel: limits display to 10 items", () => {
  const proposals: MemoryUpdateProposal[] = [];
  for (let i = 0; i < 15; i++) {
    proposals.push({
      id: `proposal-${i}`,
      agent: "test-agent",
      operation: "add",
      learning: {
        id: `learning-${i}`,
        title: `Learning ${i}`,
        category: "pattern",
        description: "Test",
        confidence: "high",
        tags: [],
        source: "agent",
        scope: "global",
        created_at: new Date().toISOString(),
      },
      target_scope: "global",
      reason: "Test",
      created_at: new Date().toISOString(),
      status: "pending",
    });
  }

  const options = { width: 80, height: 20, useColors: false };
  const rendered = renderPendingPanel(proposals, 0, options);

  assertEquals(rendered.includes("... and 5 more"), true);
});

// ===== renderStatsPanel Tests =====

Deno.test("renderStatsPanel: renders statistics", () => {
  const stats = {
    projectCount: 5,
    executionCount: 127,
    pendingCount: 3,
    globalLearnings: 12,
  };
  const options = { width: 80, height: 20, useColors: false };

  const rendered = renderStatsPanel(stats, options);

  assertExists(rendered);
  assertEquals(rendered.includes("Memory Statistics"), true);
  assertEquals(rendered.includes("5"), true);
  assertEquals(rendered.includes("127"), true);
  assertEquals(rendered.includes("3"), true);
  assertEquals(rendered.includes("12"), true);
});

Deno.test("renderStatsPanel: shows all categories", () => {
  const stats = {
    projectCount: 3,
    executionCount: 50,
    pendingCount: 2,
    globalLearnings: 10,
  };
  const options = { width: 80, height: 20, useColors: false };

  const rendered = renderStatsPanel(stats, options);

  assertEquals(rendered.includes("Projects:"), true);
  assertEquals(rendered.includes("Executions:"), true);
  assertEquals(rendered.includes("Pending:"), true);
  assertEquals(rendered.includes("Learnings:"), true);
});

// ===== MemoryViewTuiSession Pending Actions Tests =====

Deno.test("MemoryViewTuiSession: 'n' jumps to pending scope", async () => {
  const service = new MockMemoryServiceWithPending();
  const session = new MemoryViewTuiSession(service);
  await session.initialize();

  await session.handleKey("n");

  assertEquals(session.getActiveScope(), "pending");
});

Deno.test("MemoryViewTuiSession: pending badge shows count", async () => {
  const service = new MockMemoryServiceWithPending();
  const session = new MemoryViewTuiSession(service);
  await session.initialize();

  const count = session.getPendingCount();
  assertEquals(count, 3);
});

Deno.test("MemoryViewTuiSession: 'a' opens approve dialog when on pending item", async () => {
  const service = new MockMemoryServiceWithPending();
  const session = new MemoryViewTuiSession(service);
  await session.initialize();

  // Navigate to pending and select a proposal
  await session.handleKey("n");
  await session.handleKey("enter"); // Expand pending
  await session.handleKey("down"); // Select first proposal

  await session.handleKey("a");

  assertEquals(session.hasActiveDialog(), true);
});

Deno.test("MemoryViewTuiSession: 'r' opens reject dialog when on pending item", async () => {
  const service = new MockMemoryServiceWithPending();
  const session = new MemoryViewTuiSession(service);
  await session.initialize();

  // Navigate to pending and select a proposal
  await session.handleKey("n");
  await session.handleKey("enter");
  await session.handleKey("down");

  await session.handleKey("r");

  assertEquals(session.hasActiveDialog(), true);
});

Deno.test("MemoryViewTuiSession: 'A' opens bulk approve dialog", async () => {
  const service = new MockMemoryServiceWithPending();
  const session = new MemoryViewTuiSession(service);
  await session.initialize();

  await session.handleKey("A");

  assertEquals(session.hasActiveDialog(), true);
});

Deno.test("MemoryViewTuiSession: 'L' opens add learning dialog", async () => {
  const service = new MockMemoryServiceWithPending();
  const session = new MemoryViewTuiSession(service);
  await session.initialize();

  await session.handleKey("L");

  assertEquals(session.hasActiveDialog(), true);
});

Deno.test("MemoryViewTuiSession: action buttons show pending actions", async () => {
  const service = new MockMemoryServiceWithPending();
  const session = new MemoryViewTuiSession(service);
  await session.initialize();

  // Navigate to pending and select a proposal
  await session.handleKey("n");
  await session.handleKey("enter");
  await session.handleKey("down");

  const buttons = session.renderActionButtons();
  assertEquals(buttons.includes("[a] Approve"), true);
  assertEquals(buttons.includes("[r] Reject"), true);
  assertEquals(buttons.includes("[A] Approve All"), true);
});

Deno.test("MemoryViewTuiSession: dialog receives key events", async () => {
  const service = new MockMemoryServiceWithPending();
  const session = new MemoryViewTuiSession(service);
  await session.initialize();

  await session.handleKey("A"); // Open bulk approve dialog
  assertEquals(session.hasActiveDialog(), true);

  await session.handleKey("escape"); // Cancel dialog
  assertEquals(session.hasActiveDialog(), false);
});

Deno.test("MemoryViewTuiSession: renderDialog returns dialog content", async () => {
  const service = new MockMemoryServiceWithPending();
  const session = new MemoryViewTuiSession(service);
  await session.initialize();

  await session.handleKey("A");

  const dialogContent = session.renderDialog(80, 20);
  assertExists(dialogContent);
  assertEquals(dialogContent.includes("Approve All"), true);
});

Deno.test("MemoryViewTuiSession: approve action updates count", async () => {
  const service = new MockMemoryServiceWithPending();
  const session = new MemoryViewTuiSession(service);
  await session.initialize();

  const initialCount = session.getPendingCount();
  assertEquals(initialCount, 3);

  // Navigate to pending item
  await session.handleKey("n");
  await session.handleKey("enter");
  await session.handleKey("down");

  // Open approve dialog and confirm
  await session.handleKey("a");
  await session.handleKey("y");

  // Count should decrease
  const newCount = session.getPendingCount();
  assertEquals(newCount, 2);
});

Deno.test("MemoryViewTuiSession: reject action with reason", async () => {
  const service = new MockMemoryServiceWithPending();
  const session = new MemoryViewTuiSession(service);
  await session.initialize();

  // Navigate to pending item
  await session.handleKey("n");
  await session.handleKey("enter");
  await session.handleKey("down");

  // Open reject dialog
  await session.handleKey("r");
  assertEquals(session.hasActiveDialog(), true);

  // Navigate to reject button and confirm
  await session.handleKey("tab"); // to reject button
  await session.handleKey("enter");

  assertEquals(session.hasActiveDialog(), false);
  assertEquals(session.getPendingCount(), 2);
});

Deno.test("MemoryViewTuiSession: help shows new action keys", async () => {
  const service = new MockMemoryServiceWithPending();
  const session = new MemoryViewTuiSession(service);
  await session.initialize();

  await session.handleKey("?");

  const help = session.getDetailContent();
  assertEquals(help.includes("a: Approve"), true);
  assertEquals(help.includes("r: Reject"), true);
  assertEquals(help.includes("A: Approve all"), true);
  assertEquals(help.includes("L: Add new learning"), true);
});
