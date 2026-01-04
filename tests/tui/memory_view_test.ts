/**
 * Memory View TUI Tests
 *
 * Part of Phase 12.12: TUI Memory View - Core
 *
 * Tests cover:
 * - Session initialization and state management
 * - Tree navigation (up/down/expand/collapse)
 * - Scope jumping (g/p/e/n)
 * - Search functionality
 * - Detail panel rendering
 * - Pending proposals handling
 */

import { assertEquals, assertExists, assertNotEquals } from "jsr:@std/assert@1";
import { MemoryView, MemoryViewTuiSession } from "../../src/tui/memory_view.ts";
import type { MemoryServiceInterface } from "../../src/tui/memory_view.ts";
import { MockMemoryService } from "../../src/tui/tui_dashboard_mocks.ts";

// ===== Test Setup =====

function createTestSession(): MemoryViewTuiSession {
  const mockService = new MockMemoryService();
  return new MemoryViewTuiSession(mockService as unknown as MemoryServiceInterface);
}

// ===== Session Initialization Tests =====

Deno.test("MemoryViewTuiSession: initializes with default state", () => {
  const session = createTestSession();
  const state = session.getState();

  assertEquals(state.activeScope, "projects");
  assertEquals(state.selectedNodeId, null);
  assertEquals(state.searchQuery, "");
  assertEquals(state.searchActive, false);
  assertEquals(state.tree.length, 0);
  assertEquals(state.detailContent, "");
});

Deno.test("MemoryViewTuiSession: initialize loads tree and selects first node", async () => {
  const session = createTestSession();
  await session.initialize();

  const state = session.getState();
  assertExists(state.tree);
  assertEquals(state.tree.length > 0, true);
  assertNotEquals(state.selectedNodeId, null);
});

Deno.test("MemoryViewTuiSession: initialize loads pending count", async () => {
  const session = createTestSession();
  await session.initialize();

  // MockMemoryService returns 1 pending proposal
  assertEquals(session.getPendingCount(), 1);
});

// ===== State Accessor Tests =====

Deno.test("MemoryViewTuiSession: getActiveScope returns current scope", async () => {
  const session = createTestSession();
  await session.initialize();

  assertEquals(session.getActiveScope(), "projects");
});

Deno.test("MemoryViewTuiSession: getTree returns tree structure", async () => {
  const session = createTestSession();
  await session.initialize();

  const tree = session.getTree();
  assertExists(tree);
  assertEquals(tree.length >= 3, true); // Global, Projects, Executions at minimum
});

Deno.test("MemoryViewTuiSession: isSearchActive tracks search mode", async () => {
  const session = createTestSession();
  await session.initialize();

  assertEquals(session.isSearchActive(), false);
  await session.handleKey("s");
  assertEquals(session.isSearchActive(), true);
});

// ===== Navigation Tests =====

Deno.test("MemoryViewTuiSession: up/down navigation changes selection", async () => {
  const session = createTestSession();
  await session.initialize();

  const initialSelection = session.getSelectedNodeId();
  await session.handleKey("down");
  const newSelection = session.getSelectedNodeId();

  assertNotEquals(initialSelection, newSelection);
});

Deno.test("MemoryViewTuiSession: expand/collapse with enter key", async () => {
  const session = createTestSession();
  await session.initialize();

  // Find a node with children
  const tree = session.getTree();
  const projectsNode = tree.find((n) => n.id === "projects");
  assertExists(projectsNode);
  if (!projectsNode) return; // Type guard

  // Initially expanded (from loadTree)
  assertEquals(projectsNode.expanded, true);

  // Jump to projects and toggle
  await session.handleKey("p");
  await session.handleKey("enter");
  assertEquals(projectsNode.expanded, false);

  // Toggle again
  await session.handleKey("enter");
  assertEquals(projectsNode.expanded, true);
});

Deno.test("MemoryViewTuiSession: left key collapses or moves to parent", async () => {
  const session = createTestSession();
  await session.initialize();

  // Jump to projects (expanded)
  await session.handleKey("p");
  const tree = session.getTree();
  const projectsNode = tree.find((n) => n.id === "projects");
  assertExists(projectsNode);
  if (!projectsNode) return; // Type guard

  // Collapse with left
  await session.handleKey("left");
  assertEquals(projectsNode.expanded, false);
});

Deno.test("MemoryViewTuiSession: home/end keys jump to first/last", async () => {
  const session = createTestSession();
  await session.initialize();

  await session.handleKey("end");
  // Should be at last node
  const state = session.getState();
  assertExists(state.selectedNodeId);

  await session.handleKey("home");
  // Should be at first node
  const tree = session.getTree();
  assertEquals(session.getSelectedNodeId(), tree[0].id);
});

// ===== Scope Jumping Tests =====

Deno.test("MemoryViewTuiSession: 'g' jumps to global scope", async () => {
  const session = createTestSession();
  await session.initialize();

  await session.handleKey("g");
  assertEquals(session.getActiveScope(), "global");
  assertEquals(session.getSelectedNodeId(), "global");
});

Deno.test("MemoryViewTuiSession: 'p' jumps to projects scope", async () => {
  const session = createTestSession();
  await session.initialize();

  await session.handleKey("g"); // Go elsewhere first
  await session.handleKey("p");
  assertEquals(session.getActiveScope(), "projects");
  assertEquals(session.getSelectedNodeId(), "projects");
});

Deno.test("MemoryViewTuiSession: 'e' jumps to executions scope", async () => {
  const session = createTestSession();
  await session.initialize();

  await session.handleKey("e");
  assertEquals(session.getActiveScope(), "executions");
  assertEquals(session.getSelectedNodeId(), "executions");
});

Deno.test("MemoryViewTuiSession: 'n' jumps to pending scope", async () => {
  const session = createTestSession();
  await session.initialize();

  await session.handleKey("n");
  assertEquals(session.getActiveScope(), "pending");
});

// ===== Search Tests =====

Deno.test("MemoryViewTuiSession: 's' activates search mode", async () => {
  const session = createTestSession();
  await session.initialize();

  await session.handleKey("s");
  assertEquals(session.isSearchActive(), true);
  assertEquals(session.getSearchQuery(), "");
});

Deno.test("MemoryViewTuiSession: '/' also activates search mode", async () => {
  const session = createTestSession();
  await session.initialize();

  await session.handleKey("/");
  assertEquals(session.isSearchActive(), true);
});

Deno.test("MemoryViewTuiSession: typing in search mode updates query", async () => {
  const session = createTestSession();
  await session.initialize();

  await session.handleKey("s");
  await session.handleKey("t");
  await session.handleKey("e");
  await session.handleKey("s");
  await session.handleKey("t");

  assertEquals(session.getSearchQuery(), "test");
});

Deno.test("MemoryViewTuiSession: backspace removes last character in search", async () => {
  const session = createTestSession();
  await session.initialize();

  await session.handleKey("s");
  await session.handleKey("t");
  await session.handleKey("e");
  await session.handleKey("s");
  await session.handleKey("t");
  await session.handleKey("backspace");

  assertEquals(session.getSearchQuery(), "tes");
});

Deno.test("MemoryViewTuiSession: escape exits search mode", async () => {
  const session = createTestSession();
  await session.initialize();

  await session.handleKey("s");
  await session.handleKey("t");
  await session.handleKey("e");
  await session.handleKey("s");
  await session.handleKey("t");
  await session.handleKey("escape");

  assertEquals(session.isSearchActive(), false);
  assertEquals(session.getSearchQuery(), "");
});

Deno.test("MemoryViewTuiSession: enter executes search", async () => {
  const session = createTestSession();
  await session.initialize();

  await session.handleKey("s");
  await session.handleKey("p");
  await session.handleKey("a");
  await session.handleKey("t");
  await session.handleKey("t");
  await session.handleKey("e");
  await session.handleKey("r");
  await session.handleKey("n");
  await session.handleKey("enter");

  assertEquals(session.isSearchActive(), false);

  // Should have search results in tree
  const tree = session.getTree();
  assertExists(tree);
  assertEquals(tree[0]?.label.includes("Search"), true);
});

// ===== Detail Content Tests =====

Deno.test("MemoryViewTuiSession: getDetailContent returns content", async () => {
  const session = createTestSession();
  await session.initialize();

  const content = session.getDetailContent();
  assertExists(content);
  assertEquals(content.length > 0, true);
});

Deno.test("MemoryViewTuiSession: '?' shows help content", async () => {
  const session = createTestSession();
  await session.initialize();

  await session.handleKey("?");
  const content = session.getDetailContent();
  assertEquals(content.includes("Help"), true);
  assertEquals(content.includes("Navigation"), true);
});

// ===== Rendering Tests =====

Deno.test("MemoryViewTuiSession: renderTreePanel returns formatted tree", async () => {
  const session = createTestSession();
  await session.initialize();

  const treePanel = session.renderTreePanel();
  assertExists(treePanel);
  assertEquals(treePanel.includes("Global"), true);
  assertEquals(treePanel.includes("Projects"), true);
});

Deno.test("MemoryViewTuiSession: renderStatusBar shows shortcuts", async () => {
  const session = createTestSession();
  await session.initialize();

  const statusBar = session.renderStatusBar();
  assertEquals(statusBar.includes("[g]lobal"), true);
  assertEquals(statusBar.includes("[p]rojects"), true);
  assertEquals(statusBar.includes("[s]earch"), true);
});

Deno.test("MemoryViewTuiSession: renderStatusBar shows search input when active", async () => {
  const session = createTestSession();
  await session.initialize();

  await session.handleKey("s");
  await session.handleKey("t");
  await session.handleKey("e");
  await session.handleKey("s");
  await session.handleKey("t");

  const statusBar = session.renderStatusBar();
  assertEquals(statusBar.includes("Search:"), true);
  assertEquals(statusBar.includes("test"), true);
});

Deno.test("MemoryViewTuiSession: renderActionButtons shows context-specific actions", async () => {
  const session = createTestSession();
  await session.initialize();

  // On projects node
  await session.handleKey("p");
  await session.handleKey("down"); // Navigate to first project child
  const buttons = session.renderActionButtons();
  assertEquals(buttons.includes("Enter") || buttons.includes("View"), true);
});

Deno.test("MemoryViewTuiSession: getFocusableElements returns panel list", () => {
  const session = createTestSession();
  const elements = session.getFocusableElements();

  assertEquals(elements.includes("tree-panel"), true);
  assertEquals(elements.includes("detail-panel"), true);
  assertEquals(elements.length >= 2, true);
});

// ===== MemoryView Controller Tests =====

Deno.test("MemoryView: creates TUI session", () => {
  const mockService = new MockMemoryService();
  const view = new MemoryView(mockService as unknown as MemoryServiceInterface);

  const session = view.createTuiSession();
  assertExists(session);
});

Deno.test("MemoryView: getService returns service instance", () => {
  const mockService = new MockMemoryService();
  const view = new MemoryView(mockService as unknown as MemoryServiceInterface);

  const service = view.getService();
  assertExists(service);
});

// ===== Node Finding Tests =====

Deno.test("MemoryViewTuiSession: findNodeById returns correct node", async () => {
  const session = createTestSession();
  await session.initialize();

  const node = session.findNodeById("global");
  assertExists(node);
  assertEquals(node.id, "global");
  assertEquals(node.type, "scope");
});

Deno.test("MemoryViewTuiSession: findNodeById returns null for invalid ID", async () => {
  const session = createTestSession();
  await session.initialize();

  const node = session.findNodeById("nonexistent");
  assertEquals(node, null);
});

Deno.test("MemoryViewTuiSession: findNodeById handles null ID", async () => {
  const session = createTestSession();
  await session.initialize();

  const node = session.findNodeById(null);
  assertEquals(node, null);
});
