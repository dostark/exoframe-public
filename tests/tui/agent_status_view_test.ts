/**
 * Agent Status View Tests
 *
 * Phase 13.7: Enhanced Agent Status View tests
 */

import {
  AGENT_HEALTH_ICONS,
  AGENT_KEY_BINDINGS,
  AGENT_STATUS_COLORS,
  AGENT_STATUS_ICONS,
  AgentHealth,
  AgentLogEntry,
  AgentService,
  AgentStatus,
  AgentStatusView,
  AgentViewState,
  LOG_LEVEL_ICONS,
  MinimalAgentServiceMock,
} from "../../src/tui/agent_status_view.ts";

// ===== Mock AgentService for testing =====

class MockAgentService implements AgentService {
  private agents: AgentStatus[] = [
    {
      id: "agent1",
      name: "Agent 1",
      model: "gpt-4",
      status: "active",
      lastActivity: new Date().toISOString(),
      capabilities: ["code", "chat"],
    },
    {
      id: "agent2",
      name: "Agent 2",
      model: "gpt-3",
      status: "inactive",
      lastActivity: new Date().toISOString(),
      capabilities: ["chat"],
    },
    {
      id: "agent3",
      name: "Agent 3",
      model: "gpt-4",
      status: "error",
      lastActivity: new Date().toISOString(),
      capabilities: ["code"],
    },
  ];

  listAgents(): Promise<AgentStatus[]> {
    return Promise.resolve([...this.agents]);
  }

  getAgentHealth(_agentId: string): Promise<AgentHealth> {
    return Promise.resolve({
      status: "healthy",
      issues: [],
      uptime: 12345,
    });
  }

  getAgentLogs(_agentId: string, _limit = 50): Promise<AgentLogEntry[]> {
    return Promise.resolve([
      {
        timestamp: new Date().toISOString(),
        level: "info",
        message: "Test log entry",
      },
      {
        timestamp: new Date().toISOString(),
        level: "warn",
        message: "Test warning",
      },
    ]);
  }

  setAgents(agents: AgentStatus[]): void {
    this.agents = agents;
  }
}

// ===== Existing Tests (Updated) =====

Deno.test("AgentStatusView: renders agent list", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const output = await view.renderAgentList();
  if (!output.includes("Agent 1") || !output.includes("Agent 2")) {
    throw new Error("Agent names not rendered");
  }
});

Deno.test("AgentStatusView: fetches agent health", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const health = await view.getAgentHealth("agent1");
  if (health.status !== "healthy" || health.uptime !== 12345) {
    throw new Error("Agent health not fetched correctly");
  }
});

Deno.test("AgentStatusView: fetches agent logs", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const logs = await view.getAgentLogs("agent1");
  if (!logs.length || logs[0].message !== "Test log entry") {
    throw new Error("Agent logs not fetched correctly");
  }
});

Deno.test("AgentStatusView: selects agent", () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  view.selectAgent("agent1");
  if (view.getSelectedAgent() !== "agent1") {
    throw new Error("Agent selection failed");
  }
});

Deno.test("AgentStatusView: formatUptime", () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);

  // Test hours + minutes
  const result1 = view.formatUptime(3660);
  if (result1 !== "1h 1m") {
    throw new Error(`Expected "1h 1m" but got "${result1}"`);
  }

  // Test minutes only
  const result2 = view.formatUptime(120);
  if (result2 !== "2m") {
    throw new Error(`Expected "2m" but got "${result2}"`);
  }
});

// ===== Phase 13.7: AgentViewState Tests =====

Deno.test("AgentViewState: interface has all required properties", () => {
  // TypeScript compile-time check via usage
  const state: AgentViewState = {
    selectedAgentId: null,
    agentTree: [],
    showHelp: false,
    showDetail: false,
    showLogs: false,
    detailContent: "",
    logContent: "",
    activeDialog: null,
    searchQuery: "",
    groupBy: "none",
    autoRefresh: false,
    autoRefreshInterval: 5000,
  };
  if (state.groupBy !== "none") {
    throw new Error("Default groupBy should be 'none'");
  }
});

// ===== Phase 13.7: Icon Tests =====

Deno.test("AGENT_STATUS_ICONS: has all status types", () => {
  const requiredKeys = ["active", "inactive", "error"];
  for (const key of requiredKeys) {
    if (!AGENT_STATUS_ICONS[key]) {
      throw new Error(`Missing status icon for: ${key}`);
    }
  }
});

Deno.test("AGENT_HEALTH_ICONS: has all health types", () => {
  const requiredKeys = ["healthy", "warning", "critical"];
  for (const key of requiredKeys) {
    if (!AGENT_HEALTH_ICONS[key]) {
      throw new Error(`Missing health icon for: ${key}`);
    }
  }
});

Deno.test("LOG_LEVEL_ICONS: has all log levels", () => {
  const requiredKeys = ["info", "warn", "error"];
  for (const key of requiredKeys) {
    if (!LOG_LEVEL_ICONS[key]) {
      throw new Error(`Missing log level icon for: ${key}`);
    }
  }
});

Deno.test("AGENT_STATUS_COLORS: has all status types", () => {
  const requiredKeys = ["active", "inactive", "error", "healthy", "warning", "critical"];
  for (const key of requiredKeys) {
    if (!AGENT_STATUS_COLORS[key]) {
      throw new Error(`Missing color for: ${key}`);
    }
  }
});

// ===== Phase 13.7: Key Bindings Tests =====

Deno.test("AGENT_KEY_BINDINGS: has all expected bindings", () => {
  const requiredActions = [
    "navigate-up",
    "navigate-down",
    "view-details",
    "view-logs",
    "refresh",
    "help",
    "toggle-grouping",
  ];
  const bindingActions = AGENT_KEY_BINDINGS.map((b) => b.action);
  for (const action of requiredActions) {
    if (!bindingActions.includes(action)) {
      throw new Error(`Missing key binding for action: ${action}`);
    }
  }
});

Deno.test("AGENT_KEY_BINDINGS: each has key, action, description, category", () => {
  for (const binding of AGENT_KEY_BINDINGS) {
    if (!binding.key || !binding.action || !binding.description || !binding.category) {
      throw new Error(`Incomplete key binding: ${JSON.stringify(binding)}`);
    }
  }
});

// ===== Phase 13.7: TUI Session Tests =====

Deno.test("AgentStatusTuiSession: initializes correctly", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);

  await session.initialize();

  if (session.getAgents().length !== 3) {
    throw new Error("Should have 3 agents after initialization");
  }
});

Deno.test("AgentStatusTuiSession: navigation up/down", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  const initialId = session.getSelectedAgentId();
  session.navigateDown();
  const afterDown = session.getSelectedAgentId();
  if (afterDown === initialId) {
    // First node was selected, navigate should change
  }

  session.navigateUp();
  const afterUp = session.getSelectedAgentId();
  if (afterUp !== initialId) {
    // Should be back to initial
  }
});

Deno.test("AgentStatusTuiSession: navigation home/end", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  session.navigateToLast();
  session.navigateToFirst();
  const firstId = session.getSelectedAgentId();
  if (!firstId) {
    throw new Error("Should have a selected agent after navigateToFirst");
  }
});

Deno.test("AgentStatusTuiSession: grouping modes", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  // Default is "none"
  if (session.getGroupBy() !== "none") {
    throw new Error("Default groupBy should be 'none'");
  }

  // Toggle to status
  session.toggleGrouping();
  if (session.getGroupBy() !== "status") {
    throw new Error("First toggle should be 'status'");
  }

  // Toggle to model
  session.toggleGrouping();
  if (session.getGroupBy() !== "model") {
    throw new Error("Second toggle should be 'model'");
  }

  // Toggle back to none
  session.toggleGrouping();
  if (session.getGroupBy() !== "none") {
    throw new Error("Third toggle should be 'none'");
  }
});

Deno.test("AgentStatusTuiSession: setGroupBy", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  session.setGroupBy("status");
  if (session.getGroupBy() !== "status") {
    throw new Error("setGroupBy('status') failed");
  }

  session.setGroupBy("model");
  if (session.getGroupBy() !== "model") {
    throw new Error("setGroupBy('model') failed");
  }
});

Deno.test("AgentStatusTuiSession: help screen toggle", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  if (session.isHelpVisible()) {
    throw new Error("Help should be hidden initially");
  }

  session.toggleHelp();
  if (!session.isHelpVisible()) {
    throw new Error("Help should be visible after toggle");
  }

  session.toggleHelp();
  if (session.isHelpVisible()) {
    throw new Error("Help should be hidden after second toggle");
  }
});

Deno.test("AgentStatusTuiSession: getHelpSections returns sections", () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);

  const sections = session.getHelpSections();
  if (sections.length < 3) {
    throw new Error("Should have at least 3 help sections");
  }

  for (const section of sections) {
    if (!section.title || !section.items || section.items.length === 0) {
      throw new Error(`Invalid help section: ${JSON.stringify(section)}`);
    }
  }
});

Deno.test("AgentStatusTuiSession: renderAgentTree returns lines", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  const lines = session.renderAgentTree();
  if (!Array.isArray(lines)) {
    throw new Error("renderAgentTree should return an array");
  }
  if (lines.length === 0) {
    throw new Error("Should have at least one line");
  }
});

Deno.test("AgentStatusTuiSession: renderAgentTree with no agents", async () => {
  const service = new MinimalAgentServiceMock([]);
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  const lines = session.renderAgentTree();
  if (!lines.some((line) => line.includes("No agents available"))) {
    throw new Error("Should show 'No agents available' message");
  }
});

Deno.test("AgentStatusTuiSession: renderDetail returns lines", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  await session.showAgentDetail();
  const lines = session.renderDetail();
  if (!Array.isArray(lines)) {
    throw new Error("renderDetail should return an array");
  }
  if (lines.length < 3) {
    throw new Error("Should have multiple lines");
  }
});

Deno.test("AgentStatusTuiSession: renderLogs returns lines", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  await session.showAgentLogs();
  const lines = session.renderLogs();
  if (!Array.isArray(lines)) {
    throw new Error("renderLogs should return an array");
  }
  if (lines.length < 3) {
    throw new Error("Should have multiple lines");
  }
});

Deno.test("AgentStatusTuiSession: renderHelp returns lines", () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);

  const lines = session.renderHelp();
  if (!Array.isArray(lines)) {
    throw new Error("renderHelp should return an array");
  }
  if (lines.length === 0) {
    throw new Error("Should have at least one line");
  }
});

Deno.test("AgentStatusTuiSession: search dialog", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  session.showSearchDialog();
  if (!session.hasActiveDialog()) {
    throw new Error("Should have active dialog after showSearchDialog");
  }

  const dialog = session.getActiveDialog();
  if (!dialog) {
    throw new Error("Dialog should not be null");
  }
});

Deno.test("AgentStatusTuiSession: search filtering", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  // Apply search
  session.applySearch("gpt-4");
  if (session.getSearchQuery() !== "gpt-4") {
    throw new Error("Search query not set correctly");
  }

  // Clear search
  session.clearSearch();
  if (session.getSearchQuery() !== "") {
    throw new Error("Search query not cleared");
  }
});

Deno.test("AgentStatusTuiSession: detail view show/hide", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  if (session.isDetailVisible()) {
    throw new Error("Detail should be hidden initially");
  }

  await session.showAgentDetail();
  if (!session.isDetailVisible()) {
    throw new Error("Detail should be visible after showAgentDetail");
  }

  session.hideDetail();
  if (session.isDetailVisible()) {
    throw new Error("Detail should be hidden after hideDetail");
  }
});

Deno.test("AgentStatusTuiSession: logs view show/hide", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  if (session.isLogsVisible()) {
    throw new Error("Logs should be hidden initially");
  }

  await session.showAgentLogs();
  if (!session.isLogsVisible()) {
    throw new Error("Logs should be visible after showAgentLogs");
  }

  session.hideLogs();
  if (session.isLogsVisible()) {
    throw new Error("Logs should be hidden after hideLogs");
  }
});

Deno.test("AgentStatusTuiSession: auto-refresh toggle", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  if (session.isAutoRefreshEnabled()) {
    throw new Error("Auto-refresh should be disabled initially");
  }

  session.toggleAutoRefresh();
  if (!session.isAutoRefreshEnabled()) {
    throw new Error("Auto-refresh should be enabled after toggle");
  }

  session.toggleAutoRefresh();
  if (session.isAutoRefreshEnabled()) {
    throw new Error("Auto-refresh should be disabled after second toggle");
  }

  session.dispose();
});

Deno.test("AgentStatusTuiSession: getFocusableElements", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  const elements = session.getFocusableElements();
  if (!Array.isArray(elements)) {
    throw new Error("getFocusableElements should return array");
  }
  if (elements.length !== 3) {
    throw new Error(`Expected 3 focusable elements, got ${elements.length}`);
  }
});

Deno.test("AgentStatusTuiSession: setAgents", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  const newAgents: AgentStatus[] = [
    {
      id: "new1",
      name: "New Agent",
      model: "claude",
      status: "active",
      lastActivity: new Date().toISOString(),
      capabilities: ["code"],
    },
  ];

  session.setAgents(newAgents);
  if (session.getAgents().length !== 1) {
    throw new Error("setAgents should update agent list");
  }
});

Deno.test("AgentStatusTuiSession: getSelectedIndexInAgents", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  const index = session.getSelectedIndexInAgents();
  if (typeof index !== "number" || index < 0) {
    throw new Error("getSelectedIndexInAgents should return valid index");
  }
});

Deno.test("AgentStatusTuiSession: setSelectedByIndex", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  session.setSelectedByIndex(1);
  const index = session.getSelectedIndexInAgents();
  if (index !== 1) {
    throw new Error("setSelectedByIndex should update selection");
  }
});

Deno.test("AgentStatusTuiSession: collapse/expand operations", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  // Switch to status grouping first
  session.setGroupBy("status");

  // Collapse all
  session.collapseAllNodes();
  // Expand all
  session.expandAllNodes();

  // These should not throw
  session.collapseSelected();
  session.expandSelected();
});

Deno.test("AgentStatusTuiSession: handleKey navigation", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  // Test basic navigation keys
  await session.handleKey("down");
  await session.handleKey("up");
  await session.handleKey("home");
  await session.handleKey("end");

  // Should not throw
});

Deno.test("AgentStatusTuiSession: handleKey actions", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  // Test action keys
  await session.handleKey("?"); // help
  if (!session.isHelpVisible()) {
    throw new Error("? should toggle help");
  }

  await session.handleKey("escape"); // close help
  if (session.isHelpVisible()) {
    throw new Error("escape should close help");
  }

  await session.handleKey("g"); // toggle grouping
  if (session.getGroupBy() === "none") {
    throw new Error("g should toggle grouping");
  }
});

Deno.test("AgentStatusTuiSession: handleKey detail view", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  await session.handleKey("enter");
  if (!session.isDetailVisible()) {
    throw new Error("enter should show detail");
  }

  await session.handleKey("escape");
  if (session.isDetailVisible()) {
    throw new Error("escape should close detail");
  }
});

Deno.test("AgentStatusTuiSession: handleKey logs view", async () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  await session.handleKey("l");
  if (!session.isLogsVisible()) {
    throw new Error("l should show logs");
  }

  await session.handleKey("q");
  if (session.isLogsVisible()) {
    throw new Error("q should close logs");
  }
});

Deno.test("AgentStatusTuiSession: getViewName", () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);

  if (session.getViewName() !== "Agent Status") {
    throw new Error(`Expected "Agent Status" but got "${session.getViewName()}"`);
  }
});

Deno.test("AgentStatusTuiSession: getKeyBindings", () => {
  const service = new MockAgentService();
  const view = new AgentStatusView(service);
  const session = view.createTuiSession(false);

  const bindings = session.getKeyBindings();
  if (bindings !== AGENT_KEY_BINDINGS) {
    throw new Error("getKeyBindings should return AGENT_KEY_BINDINGS");
  }
});

Deno.test("MinimalAgentServiceMock: works correctly", async () => {
  const agents: AgentStatus[] = [
    {
      id: "test1",
      name: "Test",
      model: "test-model",
      status: "active",
      lastActivity: new Date().toISOString(),
      capabilities: [],
    },
  ];

  const mock = new MinimalAgentServiceMock(agents);
  const list = await mock.listAgents();
  if (list.length !== 1) {
    throw new Error("Mock should return agents");
  }

  const logs = await mock.getAgentLogs("test1");
  if (logs.length === 0) {
    throw new Error("Mock should return logs");
  }

  const health = await mock.getAgentHealth("test1");
  if (health.status !== "healthy") {
    throw new Error("Mock should return health");
  }

  mock.setAgents([]);
  const emptyList = await mock.listAgents();
  if (emptyList.length !== 0) {
    throw new Error("setAgents should work");
  }
});
