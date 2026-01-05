/**
 * Agent Status View - TUI for monitoring agent health and status
 *
 * Phase 13.7: Enhanced with modern patterns including:
 * - Tree view for agent hierarchy
 * - Detail panel with health metrics
 * - Live updating (auto-refresh)
 * - Log viewer integration
 * - Health indicators
 * - Help screen
 */

import { TuiSessionBase } from "./tui_common.ts";
import { createSpinnerState, type SpinnerState, startSpinner, stopSpinner } from "./utils/spinner.ts";
import type { TreeNode } from "./utils/tree_view.ts";
import {
  collapseAll,
  createGroupNode,
  createNode,
  expandAll,
  findNode,
  flattenTree,
  getFirstNodeId,
  getLastNodeId,
  getNextNodeId,
  getPrevNodeId,
  renderTree,
  toggleNode,
} from "./utils/tree_view.ts";
import { type HelpSection, renderHelpScreen } from "./utils/help_renderer.ts";
import { ConfirmDialog, InputDialog } from "./utils/dialog_base.ts";
import type { KeyBinding } from "./utils/keyboard.ts";

// ===== Service Interfaces =====

/**
 * Service interface for agent status access.
 */
export interface AgentService {
  listAgents(): Promise<AgentStatus[]>;
  getAgentLogs(agentId: string, limit?: number): Promise<AgentLogEntry[]>;
  getAgentHealth(agentId: string): Promise<AgentHealth>;
}

export interface AgentStatus {
  id: string;
  name: string;
  model: string;
  status: "active" | "inactive" | "error";
  lastActivity: string; // ISO timestamp
  capabilities: string[];
  defaultSkills: string[]; // Phase 17: Skills from blueprint default_skills
}

export interface AgentHealth {
  status: "healthy" | "warning" | "critical";
  issues: string[];
  uptime: number; // seconds
}

export interface AgentLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  traceId?: string;
}

// ===== View State =====

/**
 * State interface for Agent Status View
 */
export interface AgentViewState {
  /** Currently selected agent ID */
  selectedAgentId: string | null;
  /** Agent tree structure */
  agentTree: TreeNode[];
  /** Whether help is visible */
  showHelp: boolean;
  /** Whether detail view is shown */
  showDetail: boolean;
  /** Whether log view is shown */
  showLogs: boolean;
  /** Detail content for selected agent */
  detailContent: string;
  /** Log content for selected agent */
  logContent: string;
  /** Active dialog */
  activeDialog: ConfirmDialog | InputDialog | null;
  /** Current search query */
  searchQuery: string;
  /** Current grouping mode */
  groupBy: "status" | "model" | "none";
  /** Whether auto-refresh is enabled */
  autoRefresh: boolean;
  /** Auto-refresh interval in ms */
  autoRefreshInterval: number;
}

// ===== Icons and Visual Constants =====

export const AGENT_STATUS_ICONS: Record<string, string> = {
  active: "🟢",
  inactive: "🟡",
  error: "🔴",
};

export const AGENT_HEALTH_ICONS: Record<string, string> = {
  healthy: "✅",
  warning: "⚠️",
  critical: "❌",
};

export const LOG_LEVEL_ICONS: Record<string, string> = {
  info: "ℹ️",
  warn: "⚠️",
  error: "❌",
};

export const AGENT_STATUS_COLORS: Record<string, string> = {
  active: "green",
  inactive: "yellow",
  error: "red",
  healthy: "green",
  warning: "yellow",
  critical: "red",
};

// ===== Key Bindings =====

export const AGENT_KEY_BINDINGS: KeyBinding[] = [
  { key: "up", action: "navigate-up", description: "Move up", category: "Navigation" },
  { key: "down", action: "navigate-down", description: "Move down", category: "Navigation" },
  { key: "home", action: "navigate-home", description: "Go to first", category: "Navigation" },
  { key: "end", action: "navigate-end", description: "Go to last", category: "Navigation" },
  { key: "left", action: "collapse", description: "Collapse group", category: "Navigation" },
  { key: "right", action: "expand", description: "Expand group", category: "Navigation" },
  { key: "enter", action: "view-details", description: "View agent details", category: "Actions" },
  { key: "l", action: "view-logs", description: "View agent logs", category: "Actions" },
  { key: "s", action: "search", description: "Search agents", category: "Actions" },
  { key: "g", action: "toggle-grouping", description: "Toggle grouping", category: "View" },
  { key: "R", action: "refresh", description: "Force refresh", category: "View" },
  { key: "a", action: "auto-refresh", description: "Toggle auto-refresh", category: "View" },
  { key: "c", action: "collapse-all", description: "Collapse all", category: "View" },
  { key: "E", action: "expand-all", description: "Expand all", category: "View" },
  { key: "?", action: "help", description: "Toggle help", category: "Help" },
  { key: "q", action: "quit", description: "Close/Back", category: "Help" },
  { key: "escape", action: "cancel", description: "Close dialog/view", category: "Help" },
];

// ===== Agent Status View Class =====

/**
 * View/controller for agent status. Delegates to injected AgentService.
 */
export class AgentStatusView {
  private selectedAgentId: string | null = null;
  private agents: AgentStatus[] = [];

  constructor(private readonly agentService: AgentService) {}

  /** Get all agents with their status. */
  async getAgentList(): Promise<AgentStatus[]> {
    this.agents = await this.agentService.listAgents();
    return this.agents;
  }

  /** Get cached agents (without fetch) */
  getCachedAgents(): AgentStatus[] {
    return [...this.agents];
  }

  /** Get detailed health for an agent. */
  async getAgentHealth(agentId: string): Promise<AgentHealth> {
    return await this.agentService.getAgentHealth(agentId);
  }

  /** Get logs for an agent. */
  async getAgentLogs(agentId: string, limit = 50): Promise<AgentLogEntry[]> {
    return await this.agentService.getAgentLogs(agentId, limit);
  }

  /** Select an agent for detailed view. */
  selectAgent(agentId: string): void {
    this.selectedAgentId = agentId;
  }

  /** Get currently selected agent. */
  getSelectedAgent(): string | null {
    return this.selectedAgentId;
  }

  /** Render agent list for TUI display. */
  async renderAgentList(): Promise<string> {
    const agents = await this.getAgentList();
    if (agents.length === 0) {
      return "No agents registered.";
    }
    const lines = ["Agent Status:", ""];
    for (const agent of agents) {
      const statusIcon = AGENT_STATUS_ICONS[agent.status] || "⚪";
      lines.push(
        `${statusIcon} ${agent.name} (${agent.model}) - Last: ${new Date(agent.lastActivity).toLocaleString()}`,
      );
    }
    return lines.join("\n");
  }

  /** Render detailed view for selected agent. */
  async renderAgentDetails(): Promise<string> {
    if (!this.selectedAgentId) {
      return "No agent selected.";
    }
    const [health, logs] = await Promise.all([
      this.getAgentHealth(this.selectedAgentId),
      this.getAgentLogs(this.selectedAgentId, 10),
    ]);
    const lines = [`Agent: ${this.selectedAgentId}`, ""];
    const healthIcon = AGENT_HEALTH_ICONS[health.status] || "❓";
    lines.push(`${healthIcon} Health: ${health.status.toUpperCase()} (Uptime: ${this.formatUptime(health.uptime)})`);
    if (health.issues.length > 0) {
      lines.push("Issues:");
      for (const issue of health.issues) {
        lines.push(`  - ${issue}`);
      }
    }
    lines.push("");
    lines.push("Recent Logs:");
    for (const log of logs) {
      const levelIcon = LOG_LEVEL_ICONS[log.level] || "📝";
      lines.push(`${levelIcon} ${log.timestamp} ${log.message}`);
    }
    return lines.join("\n");
  }

  /** Format uptime in human-readable format */
  formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /** Get focusable elements for accessibility. */
  getFocusableElements(): string[] {
    return ["agent-list", "agent-details", "refresh-button"];
  }

  /**
   * Create TUI session for interactive mode
   */
  createTuiSession(useColors = true): AgentStatusTuiSession {
    return new AgentStatusTuiSession(this, useColors);
  }
}

// ===== Minimal Mock for Tests =====

/**
 * Minimal AgentService mock for TUI session tests
 */
export class MinimalAgentServiceMock implements AgentService {
  private agents: AgentStatus[] = [];

  constructor(agents: AgentStatus[] = []) {
    this.agents = agents;
  }

  listAgents(): Promise<AgentStatus[]> {
    return Promise.resolve([...this.agents]);
  }

  getAgentLogs(_agentId: string, _limit = 50): Promise<AgentLogEntry[]> {
    return Promise.resolve([
      {
        timestamp: new Date().toISOString(),
        level: "info",
        message: "Test log entry",
      },
    ]);
  }

  getAgentHealth(_agentId: string): Promise<AgentHealth> {
    return Promise.resolve({
      status: "healthy",
      issues: [],
      uptime: 3600,
    });
  }

  setAgents(agents: AgentStatus[]): void {
    this.agents = agents;
  }
}

// ===== TUI Session Class =====

/**
 * Interactive TUI session for Agent Status View
 */
export class AgentStatusTuiSession extends TuiSessionBase {
  private readonly agentView: AgentStatusView;
  private state: AgentViewState;
  private localSpinnerState: SpinnerState;
  private autoRefreshTimer: number | null = null;
  private agents: AgentStatus[] = [];

  constructor(agentView: AgentStatusView, useColors = true) {
    super(useColors);
    this.agentView = agentView;
    this.localSpinnerState = createSpinnerState();
    this.state = {
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
  }

  // ===== Initialization =====

  /**
   * Initialize the session by loading agents
   */
  async initialize(): Promise<void> {
    this.localSpinnerState = startSpinner(this.localSpinnerState, "Loading agents...");
    try {
      this.agents = await this.agentView.getAgentList();
      this.buildTree();
      this.selectFirstAgent();
    } finally {
      this.localSpinnerState = stopSpinner(this.localSpinnerState);
    }
  }

  // ===== State Accessors =====

  override getViewName(): string {
    return "Agent Status";
  }

  getAgentTree(): TreeNode[] {
    return this.state.agentTree;
  }

  getAgents(): AgentStatus[] {
    return this.agents;
  }

  setAgents(agents: AgentStatus[]): void {
    this.agents = agents;
    this.buildTree();
    this.selectFirstAgent();
  }

  getSelectedAgentId(): string | null {
    return this.state.selectedAgentId;
  }

  override isHelpVisible(): boolean {
    return this.state.showHelp;
  }

  isDetailVisible(): boolean {
    return this.state.showDetail;
  }

  isLogsVisible(): boolean {
    return this.state.showLogs;
  }

  getDetailContent(): string {
    return this.state.detailContent;
  }

  getLogContent(): string {
    return this.state.logContent;
  }

  hasActiveDialog(): boolean {
    return this.state.activeDialog !== null;
  }

  getActiveDialog(): ConfirmDialog | InputDialog | null {
    return this.state.activeDialog;
  }

  getSearchQuery(): string {
    return this.state.searchQuery;
  }

  getGroupBy(): "status" | "model" | "none" {
    return this.state.groupBy;
  }

  isAutoRefreshEnabled(): boolean {
    return this.state.autoRefresh;
  }

  isLoading(): boolean {
    return this.localSpinnerState.active;
  }

  getLoadingMessage(): string {
    return this.localSpinnerState.message;
  }

  override getKeyBindings(): KeyBinding[] {
    return AGENT_KEY_BINDINGS;
  }

  // ===== Tree Building =====

  private isGroupNode(id: string): boolean {
    return id.startsWith("status-") || id.startsWith("model-");
  }

  private buildTree(): void {
    const agents = this.getFilteredAgents();

    if (this.state.groupBy === "none") {
      // Flat list
      this.state.agentTree = agents.map((agent) => {
        const icon = AGENT_STATUS_ICONS[agent.status] || "⚪";
        const label = `${icon} ${agent.name} (${agent.model})`;
        return createNode(agent.id, label, "agent", { expanded: true });
      });
    } else if (this.state.groupBy === "status") {
      // Group by status
      const byStatus = new Map<string, AgentStatus[]>();
      for (const agent of agents) {
        if (!byStatus.has(agent.status)) {
          byStatus.set(agent.status, []);
        }
        byStatus.get(agent.status)!.push(agent);
      }

      // Order: active, inactive, error
      const statusOrder = ["active", "inactive", "error"];
      this.state.agentTree = statusOrder
        .filter((status) => byStatus.has(status))
        .map((status) => {
          const statusAgents = byStatus.get(status)!;
          const icon = AGENT_STATUS_ICONS[status] || "⚪";
          const children = statusAgents.map((agent) => {
            const label = `🤖 ${agent.name} (${agent.model})`;
            return createNode(agent.id, label, "agent", { expanded: true });
          });
          return createGroupNode(
            `status-${status}`,
            `${icon} ${status.charAt(0).toUpperCase() + status.slice(1)} (${statusAgents.length})`,
            "status-group",
            children,
          );
        });
    } else if (this.state.groupBy === "model") {
      // Group by model
      const byModel = new Map<string, AgentStatus[]>();
      for (const agent of agents) {
        if (!byModel.has(agent.model)) {
          byModel.set(agent.model, []);
        }
        byModel.get(agent.model)!.push(agent);
      }

      this.state.agentTree = Array.from(byModel.entries()).map(([model, modelAgents]) => {
        const children = modelAgents.map((agent) => {
          const icon = AGENT_STATUS_ICONS[agent.status] || "⚪";
          const label = `${icon} ${agent.name}`;
          return createNode(agent.id, label, "agent", { expanded: true });
        });
        return createGroupNode(`model-${model}`, `🧠 ${model} (${modelAgents.length})`, "model-group", children);
      });
    }
  }

  private getFilteredAgents(): AgentStatus[] {
    let result = [...this.agents];

    // Apply search filter
    if (this.state.searchQuery) {
      const query = this.state.searchQuery.toLowerCase();
      result = result.filter(
        (agent) =>
          agent.name.toLowerCase().includes(query) ||
          agent.model.toLowerCase().includes(query) ||
          agent.id.toLowerCase().includes(query),
      );
    }

    return result;
  }

  private selectFirstAgent(): void {
    const firstId = getFirstNodeId(this.state.agentTree);
    if (firstId) {
      this.state.selectedAgentId = firstId;
    }
  }

  // ===== Navigation =====

  navigateUp(): void {
    if (this.state.selectedAgentId) {
      const prevId = getPrevNodeId(this.state.agentTree, this.state.selectedAgentId);
      if (prevId) {
        this.state.selectedAgentId = prevId;
      }
    }
  }

  navigateDown(): void {
    if (this.state.selectedAgentId) {
      const nextId = getNextNodeId(this.state.agentTree, this.state.selectedAgentId);
      if (nextId) {
        this.state.selectedAgentId = nextId;
      }
    } else {
      this.selectFirstAgent();
    }
  }

  navigateToFirst(): void {
    const firstId = getFirstNodeId(this.state.agentTree);
    if (firstId) {
      this.state.selectedAgentId = firstId;
    }
  }

  navigateToLast(): void {
    const lastId = getLastNodeId(this.state.agentTree);
    if (lastId) {
      this.state.selectedAgentId = lastId;
    }
  }

  // ===== Tree Operations =====

  toggleSelectedNode(): void {
    if (this.state.selectedAgentId && this.isGroupNode(this.state.selectedAgentId)) {
      this.state.agentTree = toggleNode(this.state.agentTree, this.state.selectedAgentId);
    }
  }

  collapseSelected(): void {
    if (this.state.selectedAgentId) {
      const node = findNode(this.state.agentTree, this.state.selectedAgentId);
      if (node && node.expanded) {
        this.state.agentTree = toggleNode(this.state.agentTree, this.state.selectedAgentId);
      }
    }
  }

  expandSelected(): void {
    if (this.state.selectedAgentId) {
      const node = findNode(this.state.agentTree, this.state.selectedAgentId);
      if (node && !node.expanded && node.children.length > 0) {
        this.state.agentTree = toggleNode(this.state.agentTree, this.state.selectedAgentId);
      }
    }
  }

  collapseAllNodes(): void {
    this.state.agentTree = collapseAll(this.state.agentTree);
  }

  expandAllNodes(): void {
    this.state.agentTree = expandAll(this.state.agentTree);
  }

  // ===== Grouping =====

  toggleGrouping(): void {
    const modes: Array<"none" | "status" | "model"> = ["none", "status", "model"];
    const currentIndex = modes.indexOf(this.state.groupBy);
    this.state.groupBy = modes[(currentIndex + 1) % modes.length];
    this.buildTree();
    this.selectFirstAgent();
  }

  setGroupBy(mode: "status" | "model" | "none"): void {
    this.state.groupBy = mode;
    this.buildTree();
    this.selectFirstAgent();
  }

  // ===== Detail Panel =====

  async showAgentDetail(): Promise<void> {
    if (!this.state.selectedAgentId || this.isGroupNode(this.state.selectedAgentId)) {
      return;
    }

    this.localSpinnerState = startSpinner(this.localSpinnerState, "Loading agent details...");
    try {
      const health = await this.agentView.getAgentHealth(this.state.selectedAgentId);
      const agent = this.agents.find((a) => a.id === this.state.selectedAgentId);
      this.state.detailContent = this.formatDetailContent(agent, health);
      this.state.showDetail = true;
    } finally {
      this.localSpinnerState = stopSpinner(this.localSpinnerState);
    }
  }

  private formatDetailContent(agent: AgentStatus | undefined, health: AgentHealth): string {
    if (!agent) return "Agent not found.";

    const lines: string[] = [];
    lines.push(`Agent: ${agent.name}`);
    lines.push(`ID: ${agent.id}`);
    lines.push(`Model: ${agent.model}`);
    lines.push(`Status: ${AGENT_STATUS_ICONS[agent.status]} ${agent.status.toUpperCase()}`);
    lines.push(`Last Activity: ${new Date(agent.lastActivity).toLocaleString()}`);
    lines.push("");
    lines.push(`Health: ${AGENT_HEALTH_ICONS[health.status]} ${health.status.toUpperCase()}`);
    lines.push(`Uptime: ${this.agentView.formatUptime(health.uptime)}`);

    if (health.issues.length > 0) {
      lines.push("");
      lines.push("Issues:");
      for (const issue of health.issues) {
        lines.push(`  ⚠️ ${issue}`);
      }
    }

    if (agent.capabilities.length > 0) {
      lines.push("");
      lines.push("Capabilities:");
      for (const cap of agent.capabilities) {
        lines.push(`  • ${cap}`);
      }
    }

    if (agent.defaultSkills && agent.defaultSkills.length > 0) {
      lines.push("");
      lines.push("Default Skills:");
      for (const skill of agent.defaultSkills) {
        lines.push(`  🎯 ${skill}`);
      }
    }

    return lines.join("\n");
  }

  hideDetail(): void {
    this.state.showDetail = false;
    this.state.detailContent = "";
  }

  // ===== Log Viewer =====

  async showAgentLogs(): Promise<void> {
    if (!this.state.selectedAgentId || this.isGroupNode(this.state.selectedAgentId)) {
      return;
    }

    this.localSpinnerState = startSpinner(this.localSpinnerState, "Loading agent logs...");
    try {
      const logs = await this.agentView.getAgentLogs(this.state.selectedAgentId, 20);
      this.state.logContent = this.formatLogContent(logs);
      this.state.showLogs = true;
    } finally {
      this.localSpinnerState = stopSpinner(this.localSpinnerState);
    }
  }

  private formatLogContent(logs: AgentLogEntry[]): string {
    if (logs.length === 0) {
      return "No logs available.";
    }

    return logs
      .map((log) => {
        const icon = LOG_LEVEL_ICONS[log.level] || "📝";
        const time = new Date(log.timestamp).toLocaleTimeString();
        const traceInfo = log.traceId ? ` [${log.traceId}]` : "";
        return `${icon} ${time}${traceInfo} ${log.message}`;
      })
      .join("\n");
  }

  hideLogs(): void {
    this.state.showLogs = false;
    this.state.logContent = "";
  }

  // ===== Search =====

  showSearchDialog(): void {
    this.state.activeDialog = new InputDialog({
      title: "Search Agents",
      label: "Search query",
      placeholder: "Enter name, model, or ID...",
      defaultValue: this.state.searchQuery,
    });
  }

  applySearch(query: string): void {
    this.state.searchQuery = query;
    this.state.activeDialog = null;
    this.buildTree();
    this.selectFirstAgent();
  }

  clearSearch(): void {
    this.state.searchQuery = "";
    this.buildTree();
    this.selectFirstAgent();
  }

  // ===== Auto-Refresh =====

  toggleAutoRefresh(): void {
    this.state.autoRefresh = !this.state.autoRefresh;
    if (this.state.autoRefresh) {
      this.startAgentAutoRefresh();
    } else {
      this.stopAgentAutoRefresh();
    }
  }

  private startAgentAutoRefresh(): void {
    if (this.autoRefreshTimer === null) {
      this.autoRefreshTimer = setInterval(() => {
        this.refreshAgents();
      }, this.state.autoRefreshInterval);
    }
  }

  private stopAgentAutoRefresh(): void {
    if (this.autoRefreshTimer !== null) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  async refreshAgents(): Promise<void> {
    this.localSpinnerState = startSpinner(this.localSpinnerState, "Refreshing...");
    try {
      const previousSelectedId = this.state.selectedAgentId;
      this.agents = await this.agentView.getAgentList();
      this.buildTree();

      // Try to restore selection
      if (previousSelectedId) {
        const node = findNode(this.state.agentTree, previousSelectedId);
        if (node) {
          this.state.selectedAgentId = previousSelectedId;
        } else {
          this.selectFirstAgent();
        }
      }

      this.setStatus("Refreshed", "success");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.setStatus(`Refresh failed: ${msg}`, "error");
    } finally {
      this.localSpinnerState = stopSpinner(this.localSpinnerState);
    }
  }

  // ===== Help Screen =====

  override toggleHelp(): void {
    this.state.showHelp = !this.state.showHelp;
  }

  getHelpSections(): HelpSection[] {
    return [
      {
        title: "Navigation",
        items: [
          { key: "↑/↓", description: "Move selection" },
          { key: "Home/End", description: "Jump to first/last" },
          { key: "←/→", description: "Collapse/Expand" },
        ],
      },
      {
        title: "Actions",
        items: [
          { key: "Enter", description: "View agent details" },
          { key: "l", description: "View agent logs" },
          { key: "s", description: "Search agents" },
        ],
      },
      {
        title: "View",
        items: [
          { key: "g", description: "Toggle grouping" },
          { key: "R", description: "Force refresh" },
          { key: "a", description: "Toggle auto-refresh" },
          { key: "c/E", description: "Collapse/Expand all" },
        ],
      },
      {
        title: "General",
        items: [
          { key: "?", description: "Toggle this help" },
          { key: "q/Esc", description: "Close/Back" },
        ],
      },
    ];
  }

  // ===== Dialog Handling =====

  closeDialog(): void {
    if (this.state.activeDialog) {
      const result = this.state.activeDialog.getResult();
      if (this.state.activeDialog instanceof InputDialog && result.type === "confirmed") {
        this.applySearch(result.value as string);
      } else {
        this.state.activeDialog = null;
      }
    }
  }

  // ===== Key Handling =====

  handleKey(key: string): Promise<void> {
    // Handle active dialog first
    if (this.state.activeDialog) {
      this.state.activeDialog.handleKey(key);
      if (!this.state.activeDialog.isActive()) {
        this.closeDialog();
      }
      return Promise.resolve();
    }

    // Handle detail view
    if (this.state.showDetail) {
      if (key === "escape" || key === "q") {
        this.hideDetail();
      }
      return Promise.resolve();
    }

    // Handle logs view
    if (this.state.showLogs) {
      if (key === "escape" || key === "q") {
        this.hideLogs();
      }
      return Promise.resolve();
    }

    // Handle help view
    if (this.state.showHelp) {
      if (key === "escape" || key === "q" || key === "?") {
        this.state.showHelp = false;
      }
      return Promise.resolve();
    }

    // Main view key handling
    switch (key) {
      case "up":
        this.navigateUp();
        break;
      case "down":
        this.navigateDown();
        break;
      case "home":
        this.navigateToFirst();
        break;
      case "end":
        this.navigateToLast();
        break;
      case "left":
        this.collapseSelected();
        break;
      case "right":
        this.expandSelected();
        break;
      case "enter":
        return this.showAgentDetail();
      case "l":
        return this.showAgentLogs();
      case "s":
        this.showSearchDialog();
        break;
      case "g":
        this.toggleGrouping();
        break;
      case "R":
        return this.refreshAgents();
      case "a":
        this.toggleAutoRefresh();
        break;
      case "c":
        this.collapseAllNodes();
        break;
      case "E":
        this.expandAllNodes();
        break;
      case "?":
        this.state.showHelp = true;
        break;
    }
    return Promise.resolve();
  }

  // ===== Rendering =====

  renderAgentTree(): string[] {
    if (this.state.agentTree.length === 0) {
      if (this.state.searchQuery) {
        return ["  (No agents match search query)"];
      }
      return ["  (No agents available)"];
    }

    return renderTree(this.state.agentTree, {
      useColors: this.useColors,
      selectedId: this.state.selectedAgentId || undefined,
      indentSize: 2,
    });
  }

  renderDetail(): string[] {
    const lines: string[] = [];
    lines.push("╔═══════════════════════════════════════════════════════════════╗");
    lines.push("║                     AGENT DETAILS                             ║");
    lines.push("╠═══════════════════════════════════════════════════════════════╣");

    if (this.state.detailContent) {
      const contentLines = this.state.detailContent.split("\n");
      for (const line of contentLines) {
        lines.push(`║ ${line.padEnd(63)} ║`);
      }
    } else {
      lines.push("║  (No details available)                                        ║");
    }

    lines.push("╚═══════════════════════════════════════════════════════════════╝");
    lines.push("");
    lines.push("[ESC] Close details");
    return lines;
  }

  renderLogs(): string[] {
    const lines: string[] = [];
    lines.push("╔═══════════════════════════════════════════════════════════════╗");
    lines.push("║                      AGENT LOGS                               ║");
    lines.push("╠═══════════════════════════════════════════════════════════════╣");

    if (this.state.logContent) {
      const contentLines = this.state.logContent.split("\n");
      for (const line of contentLines) {
        lines.push(`║ ${line.padEnd(63)} ║`);
      }
    } else {
      lines.push("║  (No logs available)                                           ║");
    }

    lines.push("╚═══════════════════════════════════════════════════════════════╝");
    lines.push("");
    lines.push("[ESC] Close logs");
    return lines;
  }

  renderHelp(): string[] {
    return renderHelpScreen({
      title: "Agent Status Help",
      sections: this.getHelpSections(),
      useColors: this.useColors,
    });
  }

  // ===== Focusable Elements =====

  getFocusableElements(): string[] {
    if (this.state.activeDialog) {
      return this.state.activeDialog.getFocusableElements();
    }
    if (this.state.showDetail || this.state.showLogs || this.state.showHelp) {
      return ["close-button"];
    }

    const elements: string[] = [];
    const flat = flattenTree(this.state.agentTree);
    for (const node of flat) {
      elements.push(node.node.id);
    }
    return elements;
  }

  // ===== Backwards Compatibility =====

  /**
   * Get selected index in agent list (for compatibility)
   */
  getSelectedIndexInAgents(): number {
    if (!this.state.selectedAgentId) return 0;
    const flat = flattenTree(this.state.agentTree);
    const idx = flat.findIndex((n) => n.node.id === this.state.selectedAgentId);
    return idx >= 0 ? idx : 0;
  }

  /**
   * Set selected by index (for compatibility)
   */
  setSelectedByIndex(index: number): void {
    const flat = flattenTree(this.state.agentTree);
    if (index >= 0 && index < flat.length) {
      this.state.selectedAgentId = flat[index].node.id;
    }
  }

  // ===== Lifecycle =====

  override dispose(): void {
    this.stopAgentAutoRefresh();
    super.dispose();
  }
}

// ===== Legacy Support =====

/**
 * Legacy TUI session for backwards compatibility
 * @deprecated Use AgentStatusTuiSession instead
 */
export class LegacyAgentStatusTuiSession extends TuiSessionBase {
  private readonly agentView: AgentStatusView;
  private agents: AgentStatus[] = [];

  constructor(agentView: AgentStatusView, useColors = true) {
    super(useColors);
    this.agentView = agentView;
  }

  async initialize(): Promise<void> {
    this.agents = await this.agentView.getAgentList();
  }

  getAgentCount(): number {
    return this.agents.length;
  }

  getSelectedAgentId(): string | null {
    const agent = this.agents[this.selectedIndex];
    return agent?.id ?? null;
  }

  getFocusableElements(): string[] {
    return this.agents.map((a) => a.id);
  }
}
