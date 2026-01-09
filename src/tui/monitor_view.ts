/**
 * Monitor View - TUI for real-time log monitoring
 *
 * Phase 13.5: Enhanced with modern patterns including:
 * - Tree view grouping (by agent, by action type)
 * - Detail panel for log expansion
 * - Search with highlighting
 * - Bookmarking (mark important entries)
 * - Export to file
 * - Time range filtering
 * - Help screen
 * - Auto-refresh toggle
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
import type { ActivityRecord } from "../services/db.ts";

// ===== Service Interfaces =====

/**
 * Service interface for log access.
 */
export interface LogService {
  getRecentActivity(limit: number): Promise<ActivityRecord[]>;
}

export interface LogFilter {
  agent?: string;
  actionType?: string;
  traceId?: string;
  timeWindow?: number; // milliseconds
}

export interface LogEntry {
  id: string;
  trace_id: string;
  actor: string | null;
  agent_id: string | null;
  action_type: string;
  target: string | null;
  payload: Record<string, unknown>;
  timestamp: string;
}

// ===== View State =====

/**
 * State interface for Monitor View
 */
export interface MonitorViewState {
  /** Currently selected log ID */
  selectedLogId: string | null;
  /** Log tree structure */
  logTree: TreeNode[];
  /** Whether help is visible */
  showHelp: boolean;
  /** Whether detail view is shown */
  showDetail: boolean;
  /** Detail content for expanded log */
  detailContent: string;
  /** Active dialog */
  activeDialog: ConfirmDialog | InputDialog | null;
  /** Current search query */
  searchQuery: string;
  /** Bookmarked log IDs */
  bookmarkedIds: Set<string>;
  /** Current grouping mode */
  groupBy: "agent" | "action" | "none";
  /** Whether auto-refresh is enabled */
  autoRefresh: boolean;
}

// ===== Icons and Visual Constants =====

export const LOG_ICONS: Record<string, string> = {
  "request_created": "📝",
  "request.created": "📝",
  "plan_approved": "✅",
  "plan.approved": "✅",
  "plan.rejected": "❌",
  "execution_started": "🚀",
  "execution.started": "🚀",
  "execution_completed": "✓",
  "execution.completed": "✓",
  "execution_failed": "💥",
  "execution.failed": "💥",
  "error": "⚠️",
  "default": "📋",
};

export const LOG_COLORS: Record<string, string> = {
  "request_created": "green",
  "request.created": "green",
  "plan_approved": "blue",
  "plan.approved": "blue",
  "plan.rejected": "red",
  "execution_started": "yellow",
  "execution.started": "yellow",
  "execution_completed": "green",
  "execution.completed": "green",
  "execution_failed": "red",
  "execution.failed": "red",
  "error": "red",
  "default": "white",
};

// ===== Key Bindings =====

export const MONITOR_KEY_BINDINGS: KeyBinding[] = [
  { key: "up", action: "navigate-up", description: "Move up", category: "Navigation" },
  { key: "down", action: "navigate-down", description: "Move down", category: "Navigation" },
  { key: "home", action: "navigate-home", description: "Go to first", category: "Navigation" },
  { key: "end", action: "navigate-end", description: "Go to last", category: "Navigation" },
  { key: "left", action: "collapse", description: "Collapse group", category: "Navigation" },
  { key: "right", action: "expand", description: "Expand group", category: "Navigation" },
  { key: "enter", action: "view-details", description: "View log details", category: "Actions" },
  { key: "space", action: "toggle-pause", description: "Toggle pause", category: "Actions" },
  { key: "b", action: "bookmark", description: "Bookmark entry", category: "Actions" },
  { key: "e", action: "export", description: "Export logs", category: "Actions" },
  { key: "s", action: "search", description: "Search logs", category: "Actions" },
  { key: "f", action: "filter-agent", description: "Filter by agent", category: "Actions" },
  { key: "t", action: "filter-time", description: "Filter by time", category: "Actions" },
  { key: "g", action: "toggle-grouping", description: "Toggle grouping", category: "View" },
  { key: "R", action: "refresh", description: "Force refresh", category: "View" },
  { key: "a", action: "auto-refresh", description: "Toggle auto-refresh", category: "View" },
  { key: "c", action: "collapse-all", description: "Collapse all", category: "View" },
  { key: "E", action: "expand-all", description: "Expand all", category: "View" },
  { key: "?", action: "help", description: "Toggle help", category: "Help" },
  { key: "q", action: "quit", description: "Close/Back", category: "Help" },
  { key: "escape", action: "cancel", description: "Close dialog/view", category: "Help" },
];

// ===== Monitor View Class =====

/**
 * View/controller for monitoring logs. Delegates to injected LogService.
 */
export class MonitorView {
  private filter: LogFilter = {};
  private isPaused = false;
  private logs: LogEntry[] = [];

  constructor(private readonly logService: LogService) {
    this.refreshLogs();
  }

  /** Refresh logs from the service. */
  async refreshLogs(): Promise<void> {
    if (!this.isPaused) {
      const activities = await this.logService.getRecentActivity(1000);
      this.logs = activities.map((log): LogEntry => ({
        ...log,
        payload: typeof log.payload === "string" ? JSON.parse(log.payload) : log.payload,
      }));
    }
  }

  /** Get all current logs. */
  async getLogs(): Promise<LogEntry[]> {
    await this.refreshLogs();
    return [...this.logs];
  }

  /** Set the filter for logs. */
  setFilter(filter: LogFilter): void {
    this.filter = { ...filter };
  }

  /** Get filtered logs based on current filter. */
  getFilteredLogs(): LogEntry[] {
    let filtered = this.logs;
    if (this.filter.agent) {
      filtered = filtered.filter((log) => log.agent_id === this.filter.agent);
    }
    if (this.filter.actionType) {
      filtered = filtered.filter((log) => log.action_type === this.filter.actionType);
    }
    if (this.filter.traceId) {
      filtered = filtered.filter((log) => log.trace_id === this.filter.traceId);
    }
    if (this.filter.timeWindow) {
      const now = new Date();
      const cutoff = new Date(now.getTime() - this.filter.timeWindow);
      filtered = filtered.filter((log) => new Date(log.timestamp) >= cutoff);
    }
    return filtered;
  }

  /** Pause log streaming. */
  pause(): void {
    this.isPaused = true;
  }

  /** Resume log streaming. */
  resume(): void {
    this.isPaused = false;
    this.refreshLogs();
  }

  /** Check if streaming is active. */
  isStreaming(): boolean {
    return !this.isPaused;
  }

  /**
   * Export logs to string format
   */
  exportLogs(): string {
    const logs = this.getFilteredLogs();
    return logs.map((log) => {
      return `${log.timestamp} [${log.actor || "unknown"}] ${log.action_type}: ${log.target || ""} ${
        JSON.stringify(log.payload)
      }`;
    }).join("\n");
  }

  /**
   * Get color for log level based on action type
   */
  getLogColor(actionType: string): string {
    return LOG_COLORS[actionType] || LOG_COLORS["default"];
  }

  /**
   * Render logs for TUI display
   */
  renderLogs(): string {
    const logs = this.getFilteredLogs();
    return logs.map((log) => {
      const color = this.getLogColor(log.action_type);
      return `\x1b[${this.getAnsiColorCode(color)}m${log.timestamp} [${log.actor || "unknown"}] ${log.action_type}: ${
        log.target || ""
      }\x1b[0m`;
    }).join("\n");
  }

  /**
   * Get ANSI color code
   */
  private getAnsiColorCode(color: string): number {
    switch (color) {
      case "red":
        return 31;
      case "green":
        return 32;
      case "yellow":
        return 33;
      case "blue":
        return 34;
      case "white":
      default:
        return 37;
    }
  }

  /**
   * Create TUI session for interactive mode
   */
  createTuiSession(useColors = true): MonitorTuiSession {
    return new MonitorTuiSession(this, useColors);
  }
}

// ===== Minimal Mock for Tests =====

/**
 * Minimal LogService mock for TUI session tests
 */
export class MinimalLogServiceMock implements LogService {
  private logs: LogEntry[] = [];

  constructor(logs: LogEntry[] = []) {
    this.logs = logs;
  }

  getRecentActivity(_limit: number): Promise<ActivityRecord[]> {
    return Promise.resolve([...this.logs.map((log) => ({
      ...log,
      payload: JSON.stringify(log.payload),
    }))]);
  }

  setLogs(logs: LogEntry[]): void {
    this.logs = logs;
  }
}

// ===== TUI Session Class =====

/**
 * Interactive TUI session for Monitor View
 */
export class MonitorTuiSession extends TuiSessionBase {
  private readonly monitorView: MonitorView;
  private state: MonitorViewState;
  private localSpinnerState: SpinnerState;
  private autoRefreshTimer: number | null = null;

  constructor(monitorView: MonitorView, useColors = true) {
    super(useColors);
    this.monitorView = monitorView;
    this.localSpinnerState = createSpinnerState();
    this.state = {
      selectedLogId: null,
      logTree: [],
      showHelp: false,
      showDetail: false,
      detailContent: "",
      activeDialog: null,
      searchQuery: "",
      bookmarkedIds: new Set(),
      groupBy: "none",
      autoRefresh: false,
    };
    // Build tree synchronously for immediate access (e.g., in tests)
    this.buildTree();
    this.selectFirstLog();
    // Do not trigger an immediate asynchronous refresh here to avoid
    // racing with synchronous test interactions. Real-time refreshes are
    // handled via `startAutoRefresh` / manual `refresh` calls.
  }

  // ===== State Accessors =====

  override getViewName(): string {
    return "Monitor";
  }

  getLogTree(): TreeNode[] {
    return this.state.logTree;
  }

  override isHelpVisible(): boolean {
    return this.state.showHelp;
  }

  isDetailVisible(): boolean {
    return this.state.showDetail;
  }

  getDetailContent(): string {
    return this.state.detailContent;
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

  getBookmarkedIds(): Set<string> {
    return this.state.bookmarkedIds;
  }

  getGroupBy(): "agent" | "action" | "none" {
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
    return MONITOR_KEY_BINDINGS;
  }

  isPaused(): boolean {
    return !this.monitorView.isStreaming();
  }

  // ===== Tree Building =====

  private buildTree(): void {
    const logs = this.monitorView.getFilteredLogs();

    if (this.state.groupBy === "none") {
      // Flat list
      this.state.logTree = logs.map((log) => {
        const icon = LOG_ICONS[log.action_type] || LOG_ICONS["default"];
        const label = `${icon} ${this.formatTimestamp(log.timestamp)} ${log.action_type}`;
        return createNode(log.id, label, "log", { expanded: true });
      });
    } else if (this.state.groupBy === "agent") {
      // Group by agent
      const byAgent = new Map<string, LogEntry[]>();
      for (const log of logs) {
        const agent = log.agent_id || "unknown";
        if (!byAgent.has(agent)) {
          byAgent.set(agent, []);
        }
        byAgent.get(agent)!.push(log);
      }

      this.state.logTree = Array.from(byAgent.entries()).map(([agent, agentLogs]) => {
        const children = agentLogs.map((log) => {
          const icon = LOG_ICONS[log.action_type] || LOG_ICONS["default"];
          const label = `${icon} ${this.formatTimestamp(log.timestamp)} ${log.action_type}`;
          return createNode(log.id, label, "log", { expanded: true });
        });
        return createGroupNode(`agent-${agent}`, `🤖 ${agent} (${agentLogs.length})`, "agent-group", children);
      });
    } else if (this.state.groupBy === "action") {
      // Group by action type
      const byAction = new Map<string, LogEntry[]>();
      for (const log of logs) {
        if (!byAction.has(log.action_type)) {
          byAction.set(log.action_type, []);
        }
        byAction.get(log.action_type)!.push(log);
      }

      this.state.logTree = Array.from(byAction.entries()).map(([action, actionLogs]) => {
        const icon = LOG_ICONS[action] || LOG_ICONS["default"];
        const children = actionLogs.map((log) => {
          const label = `${this.formatTimestamp(log.timestamp)} [${log.agent_id || "unknown"}]`;
          return createNode(log.id, label, "log", { expanded: true });
        });
        return createGroupNode(
          `action-${action}`,
          `${icon} ${action} (${actionLogs.length})`,
          "action-group",
          children,
        );
      });
    }
  }

  private formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  private selectFirstLog(): void {
    const firstId = getFirstNodeId(this.state.logTree);
    if (firstId) {
      this.state.selectedLogId = firstId;
    }
  }

  // ===== Rendering =====

  renderLogTree(): string[] {
    if (this.state.logTree.length === 0) {
      return ["  (No logs available)"];
    }

    return renderTree(this.state.logTree, {
      useColors: this.useColors,
      selectedId: this.state.selectedLogId || undefined,
      indentSize: 2,
    });
  }

  renderDetail(): string[] {
    const lines: string[] = [];
    lines.push("╔═══════════════════════════════════════════════════════════════╗");
    lines.push("║                      LOG DETAILS                              ║");
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

  renderHelp(): string[] {
    const sections: HelpSection[] = [
      {
        title: "Navigation",
        items: [
          { key: "↑/↓", description: "Move selection" },
          { key: "Home/End", description: "Jump to first/last" },
          { key: "←/→", description: "Collapse/Expand" },
          { key: "c/E", description: "Collapse/Expand all" },
        ],
      },
      {
        title: "Actions",
        items: [
          { key: "Enter", description: "View log details" },
          { key: "Space", description: "Toggle pause" },
          { key: "b", description: "Bookmark entry" },
          { key: "e", description: "Export logs" },
          { key: "s", description: "Search logs" },
          { key: "f", description: "Filter by agent" },
          { key: "t", description: "Filter by time" },
        ],
      },
      {
        title: "View",
        items: [
          { key: "g", description: "Toggle grouping" },
          { key: "R", description: "Force refresh" },
          { key: "a", description: "Toggle auto-refresh" },
          { key: "?", description: "Toggle help" },
          { key: "Esc", description: "Close/Cancel" },
        ],
      },
    ];

    return renderHelpScreen({
      title: "Monitor View Help",
      sections,
      useColors: this.useColors,
      width: 50,
    });
  }

  renderActionButtons(): string {
    const parts: string[] = [];
    parts.push("[Space] Pause");
    parts.push("[b] Bookmark");
    parts.push("[s] Search");
    parts.push("[g] Group");
    parts.push("[R] Refresh");
    parts.push("[?] Help");
    return parts.join(" | ");
  }

  renderStatusLine(): string {
    const logs = this.monitorView.getFilteredLogs();
    const paused = this.isPaused() ? " [PAUSED]" : "";
    const autoRefresh = this.state.autoRefresh ? " [AUTO]" : "";
    const bookmarks = this.state.bookmarkedIds.size > 0 ? ` [${this.state.bookmarkedIds.size} bookmarked]` : "";
    const grouping = this.state.groupBy !== "none" ? ` [Group: ${this.state.groupBy}]` : "";
    return `${logs.length} logs${paused}${autoRefresh}${bookmarks}${grouping}`;
  }

  // ===== Actions =====

  showLogDetail(logId: string): void {
    this.localSpinnerState = startSpinner(this.localSpinnerState, "Loading details...");
    try {
      const logs = this.monitorView.getFilteredLogs();
      const log = logs.find((l) => l.id === logId);
      if (log) {
        this.state.detailContent = this.formatLogDetail(log);
        this.state.showDetail = true;
      }
    } finally {
      this.localSpinnerState = stopSpinner(this.localSpinnerState);
    }
  }

  private formatLogDetail(log: LogEntry): string {
    const lines: string[] = [];
    lines.push(`ID: ${log.id}`);
    lines.push(`Trace ID: ${log.trace_id}`);
    lines.push(`Timestamp: ${log.timestamp}`);
    lines.push(`Actor: ${log.actor || "unknown"}`);
    lines.push(`Agent: ${log.agent_id || "(none)"}`);
    lines.push(`Action: ${log.action_type}`);
    lines.push(`Target: ${log.target || "(none)"}`);
    lines.push("");
    lines.push("Payload:");
    lines.push(JSON.stringify(log.payload, null, 2));
    return lines.join("\n");
  }

  togglePause(): void {
    if (this.monitorView.isStreaming()) {
      this.monitorView.pause();
      this.setStatus("Log streaming paused", "info");
    } else {
      this.monitorView.resume();
      this.buildTree();
      this.setStatus("Log streaming resumed", "success");
    }
  }

  toggleBookmark(): void {
    if (!this.state.selectedLogId) return;

    // Skip group nodes
    if (this.state.selectedLogId.startsWith("agent-") || this.state.selectedLogId.startsWith("action-")) {
      return;
    }

    if (this.state.bookmarkedIds.has(this.state.selectedLogId)) {
      this.state.bookmarkedIds.delete(this.state.selectedLogId);
      this.setStatus("Bookmark removed", "info");
    } else {
      this.state.bookmarkedIds.add(this.state.selectedLogId);
      this.setStatus("Log bookmarked", "success");
    }
  }

  isBookmarked(logId: string): boolean {
    return this.state.bookmarkedIds.has(logId);
  }

  toggleGrouping(): void {
    if (this.state.groupBy === "none") {
      this.state.groupBy = "agent";
    } else if (this.state.groupBy === "agent") {
      this.state.groupBy = "action";
    } else {
      this.state.groupBy = "none";
    }
    this.buildTree();
    this.selectFirstLog();
    this.setStatus(`Grouping: ${this.state.groupBy}`, "info");
  }

  toggleAutoRefresh(): void {
    this.state.autoRefresh = !this.state.autoRefresh;
    if (this.state.autoRefresh) {
      this.startAutoRefresh();
      this.setStatus("Auto-refresh enabled", "success");
    } else {
      this.stopAutoRefresh();
      this.setStatus("Auto-refresh disabled", "info");
    }
  }

  override startAutoRefresh(): void {
    if (this.autoRefreshTimer) return;
    this.autoRefreshTimer = setInterval(() => {
      if (!this.isPaused()) {
        this.doRefresh();
      }
    }, 5000) as unknown as number;
  }

  override stopAutoRefresh(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  private doRefresh(): void {
    this.monitorView.refreshLogs();
    this.buildTree();
    this.setStatus("Logs refreshed", "success");
  }

  override refresh(): Promise<void> {
    this.doRefresh();
    return Promise.resolve();
  }

  exportLogs(): string {
    const exported = this.monitorView.exportLogs();
    this.setStatus(`Exported ${this.monitorView.getFilteredLogs().length} logs`, "success");
    return exported;
  }

  showSearchDialog(): void {
    this.pendingDialogType = "search";
    this.state.activeDialog = new InputDialog({
      title: "Search Logs",
      label: "Enter search query:",
      defaultValue: this.state.searchQuery,
    });
  }

  showFilterByAgentDialog(): void {
    const logs = this.monitorView.getFilteredLogs();
    const agents = [...new Set(logs.map((l) => l.agent_id).filter(Boolean))];
    const agentList = agents.length > 0 ? agents.join(", ") : "(no agents)";

    this.pendingDialogType = "filter-agent";
    this.state.activeDialog = new InputDialog({
      title: "Filter by Agent",
      label: `Available agents: ${agentList}\nEnter agent ID (empty to clear):`,
      defaultValue: "",
    });
  }

  showTimeFilterDialog(): void {
    this.pendingDialogType = "filter-time";
    this.state.activeDialog = new InputDialog({
      title: "Filter by Time",
      label: "Enter time window in minutes (empty to clear):",
      defaultValue: "",
    });
  }

  private handleSearchResult(query: string): void {
    this.state.searchQuery = query;
    this.setStatus(`Searching for: ${query}`, "info");
  }

  private handleAgentFilterResult(agent: string): void {
    this.monitorView.setFilter({ agent: agent || undefined });
    this.buildTree();
    this.selectFirstLog();
    this.setStatus(agent ? `Filtered by agent: ${agent}` : "Filter cleared", "info");
  }

  private handleTimeFilterResult(minutes: string): void {
    if (minutes) {
      const ms = parseInt(minutes, 10) * 60 * 1000;
      this.monitorView.setFilter({ timeWindow: ms });
      this.setStatus(`Showing logs from last ${minutes} minutes`, "info");
    } else {
      this.monitorView.setFilter({ timeWindow: undefined });
      this.setStatus("Time filter cleared", "info");
    }
    this.buildTree();
    this.selectFirstLog();
  }

  // ===== Navigation =====

  private navigateTree(direction: "up" | "down" | "first" | "last"): void {
    if (!this.state.selectedLogId) {
      this.selectFirstLog();
      return;
    }

    let newId: string | null = null;
    switch (direction) {
      case "up":
        newId = getPrevNodeId(this.state.logTree, this.state.selectedLogId);
        break;
      case "down":
        newId = getNextNodeId(this.state.logTree, this.state.selectedLogId);
        break;
      case "first":
        newId = getFirstNodeId(this.state.logTree);
        break;
      case "last":
        newId = getLastNodeId(this.state.logTree);
        break;
    }

    if (newId) {
      this.state.selectedLogId = newId;
    }
  }

  private toggleSelectedNode(): void {
    if (!this.state.selectedLogId) return;
    this.state.logTree = toggleNode(this.state.logTree, this.state.selectedLogId);
  }

  private expandSelectedNode(): void {
    if (!this.state.selectedLogId) return;
    const node = findNode(this.state.logTree, this.state.selectedLogId);
    if (node && node.children.length > 0 && !node.expanded) {
      this.state.logTree = toggleNode(this.state.logTree, this.state.selectedLogId);
    }
  }

  private collapseSelectedNode(): void {
    if (!this.state.selectedLogId) return;
    const node = findNode(this.state.logTree, this.state.selectedLogId);
    if (node && node.children.length > 0 && node.expanded) {
      this.state.logTree = toggleNode(this.state.logTree, this.state.selectedLogId);
    }
  }

  // ===== Key Handling =====

  // Track what dialog is pending
  private pendingDialogType: "search" | "filter-agent" | "filter-time" | null = null;

  handleKey(key: string): Promise<void> {
    // Handle active dialog first
    if (this.state.activeDialog) {
      this.state.activeDialog.handleKey(key);

      // Check if dialog completed
      if (!this.state.activeDialog.isActive()) {
        const dialog = this.state.activeDialog;
        const dialogType = this.pendingDialogType;
        this.state.activeDialog = null;
        this.pendingDialogType = null;

        // Handle dialog result
        if (dialog instanceof InputDialog && dialog.getState() === "confirmed") {
          const result = dialog.getResult();
          if (result.type === "confirmed") {
            switch (dialogType) {
              case "search":
                this.handleSearchResult(result.value);
                break;
              case "filter-agent":
                this.handleAgentFilterResult(result.value);
                break;
              case "filter-time":
                this.handleTimeFilterResult(result.value);
                break;
            }
          }
        }
      }
      return Promise.resolve();
    }

    // Handle detail view
    if (this.state.showDetail) {
      if (key === "escape" || key === "q") {
        this.state.showDetail = false;
      }
      return Promise.resolve();
    }

    // Handle help
    if (this.state.showHelp) {
      if (key === "?" || key === "escape" || key === "q") {
        this.state.showHelp = false;
      }
      return Promise.resolve();
    }

    // Main key handling
    switch (key) {
      case "up":
        this.navigateTree("up");
        break;
      case "down":
        this.navigateTree("down");
        break;
      case "home":
        this.navigateTree("first");
        break;
      case "end":
        this.navigateTree("last");
        break;
      case "left":
        this.collapseSelectedNode();
        break;
      case "right":
        this.expandSelectedNode();
        break;
      case "enter":
        if (this.state.selectedLogId) {
          // If it's a group node, toggle it
          if (
            this.state.selectedLogId.startsWith("agent-") ||
            this.state.selectedLogId.startsWith("action-")
          ) {
            this.toggleSelectedNode();
          } else {
            this.showLogDetail(this.state.selectedLogId);
          }
        }
        break;
      case "space":
        this.togglePause();
        break;
      case "b":
        this.toggleBookmark();
        break;
      case "s":
        this.showSearchDialog();
        break;
      case "f":
        this.showFilterByAgentDialog();
        break;
      case "t":
        this.showTimeFilterDialog();
        break;
      case "g":
        this.toggleGrouping();
        break;
      case "a":
        this.toggleAutoRefresh();
        break;
      case "R":
        this.refresh();
        break;
      case "e":
        this.exportLogs();
        break;
      case "c":
        this.state.logTree = collapseAll(this.state.logTree);
        break;
      case "E":
        this.state.logTree = expandAll(this.state.logTree);
        break;
      case "?":
        this.state.showHelp = true;
        break;
      case "q":
      case "escape":
        // Could emit quit event
        break;
    }
    return Promise.resolve();
  }

  // ===== Lifecycle =====

  cleanup(): void {
    this.stopAutoRefresh();
  }

  getFocusableElements(): string[] {
    return ["log-list", "action-buttons"];
  }
}
