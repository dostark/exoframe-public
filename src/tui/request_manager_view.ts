// --- Service interface for Request management ---
export interface RequestService {
  listRequests(status?: string): Promise<Request[]>;
  getRequestContent(requestId: string): Promise<string>;
  createRequest(description: string, options?: RequestOptions): Promise<Request>;
  updateRequestStatus(requestId: string, status: string): Promise<boolean>;
}

// --- Request data types ---
export interface Request {
  trace_id: string;
  filename: string;
  title: string;
  status: string;
  priority: string;
  agent: string;
  portal?: string;
  model?: string;
  created: string;
  created_by: string;
  source: string;
}

export interface RequestOptions {
  agent?: string;
  priority?: "low" | "normal" | "high" | "critical";
  portal?: string;
  model?: string;
}

// --- Phase 13.6: View state interface ---
export interface RequestViewState {
  selectedRequestId: string | null;
  requestTree: TreeNode[];
  showHelp: boolean;
  showDetail: boolean;
  detailContent: string;
  activeDialog: InputDialog | ConfirmDialog | null;
  searchQuery: string;
  filterStatus: string | null;
  filterPriority: string | null;
  filterAgent: string | null;
  groupBy: "none" | "status" | "priority" | "agent";
}

// --- Phase 13.6: Visual constants ---
export const PRIORITY_ICONS: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  normal: "⚪",
  low: "🔵",
};

export const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  planned: "📋",
  in_progress: "🔄",
  completed: "✅",
  cancelled: "❌",
  failed: "💥",
};

export const STATUS_COLORS: Record<string, string> = {
  pending: "yellow",
  planned: "cyan",
  in_progress: "blue",
  completed: "green",
  cancelled: "dim",
  failed: "red",
};

// --- Phase 13.6: Key bindings ---
export const REQUEST_KEY_BINDINGS: KeyBinding[] = [
  { key: "↑/↓", description: "Navigate requests", action: "navigate" },
  { key: "Home/End", description: "Jump to first/last", action: "navigate-edge" },
  { key: "←/→", description: "Collapse/Expand group", action: "collapse-expand" },
  { key: "Enter", description: "View request details", action: "view-detail" },
  { key: "c", description: "Create new request", action: "create" },
  { key: "d", description: "Cancel request", action: "delete" },
  { key: "p", description: "Change priority", action: "priority" },
  { key: "s", description: "Search requests", action: "search" },
  { key: "f", description: "Filter by status", action: "filter-status" },
  { key: "a", description: "Filter by agent", action: "filter-agent" },
  { key: "g", description: "Toggle grouping", action: "toggle-grouping" },
  { key: "R", description: "Force refresh", action: "refresh" },
  { key: "c/E", description: "Collapse/Expand all", action: "collapse-expand-all" },
  { key: "?", description: "Show help", action: "help" },
];

// --- Imports for Phase 13.6 ---
import { TuiSessionBase } from "./tui_common.ts";
import {
  collapseAll,
  createGroupNode,
  createNode,
  expandAll,
  findNode,
  flattenTree,
  renderTree,
  toggleNode,
  type TreeNode,
} from "./utils/tree_view.ts";
import { ConfirmDialog, InputDialog } from "./utils/dialog_base.ts";
import { type HelpSection, renderHelpScreen } from "./utils/help_renderer.ts";
import type { KeyBinding } from "./utils/keyboard.ts";

// --- Adapter: RequestCommands as RequestService ---
import type { RequestCommands } from "../cli/request_commands.ts";

/**
 * Adapter: RequestCommands as RequestService
 */
export class RequestCommandsServiceAdapter implements RequestService {
  constructor(private readonly cmd: RequestCommands) {}

  async listRequests(status?: string): Promise<Request[]> {
    const requests = await this.cmd.list(status);
    return requests.map((r) => ({
      trace_id: r.trace_id,
      filename: r.filename,
      title: `Request ${r.trace_id.slice(0, 8)}`,
      status: r.status,
      priority: r.priority,
      agent: r.agent,
      portal: r.portal,
      model: r.model,
      created: r.created,
      created_by: r.created_by,
      source: r.source,
    }));
  }

  async getRequestContent(requestId: string): Promise<string> {
    const result = await this.cmd.show(requestId);
    return result.content;
  }

  async createRequest(description: string, options?: RequestOptions): Promise<Request> {
    const metadata = await this.cmd.create(description, options);
    return {
      trace_id: metadata.trace_id,
      filename: metadata.filename,
      title: `Request ${metadata.trace_id.slice(0, 8)}`,
      status: metadata.status,
      priority: metadata.priority,
      agent: metadata.agent,
      portal: metadata.portal,
      model: metadata.model,
      created: metadata.created,
      created_by: metadata.created_by,
      source: metadata.source,
    };
  }

  updateRequestStatus(requestId: string, status: string): Promise<boolean> {
    // RequestCommands doesn't have update status method, so we'll need to implement this
    // For now, return true as a placeholder
    console.warn(`updateRequestStatus not implemented for ${requestId} -> ${status}`);
    return Promise.resolve(true);
  }
}

// --- Minimal RequestService mock for TUI session tests ---
/**
 * Minimal RequestService mock for TUI session tests.
 */
export class MinimalRequestServiceMock implements RequestService {
  listRequests = (_status?: string) => Promise.resolve([]);
  getRequestContent = (_: string) => Promise.resolve("");
  createRequest = (_: string, __?: RequestOptions) => Promise.resolve({} as Request);
  updateRequestStatus = (_: string, __: string) => Promise.resolve(true);
}

// --- Phase 13.6: Enhanced TUI Session ---
/**
 * Enhanced TUI session for Request Manager.
 * Features: tree view, grouping, detail panel, search/filter, help screen.
 */
export class RequestManagerTuiSession extends TuiSessionBase {
  // Enhanced state
  protected state: RequestViewState;

  // Request list cache
  protected requests: Request[] = [];

  // Track pending dialog type for result handling
  private pendingDialogType: "search" | "filter-status" | "filter-agent" | "create" | "priority" | null = null;

  // Pending cancel request ID for confirm dialog
  private pendingCancelRequestId: string | null = null;

  constructor(
    requests: Request[],
    protected readonly service: RequestService,
    useColors = true,
  ) {
    super(useColors);
    this.requests = requests;

    this.state = {
      selectedRequestId: requests[0]?.trace_id || null,
      requestTree: [],
      showHelp: false,
      showDetail: false,
      detailContent: "",
      activeDialog: null,
      searchQuery: "",
      filterStatus: null,
      filterPriority: null,
      filterAgent: null,
      groupBy: "none",
    };

    // Build initial tree
    this.buildTree();
  }

  // ===== State Accessors =====

  getState(): RequestViewState {
    return this.state;
  }

  getRequests(): Request[] {
    return this.requests;
  }

  getSelectedRequest(): Request | null {
    if (!this.state.selectedRequestId) return null;
    return this.requests.find((r) => r.trace_id === this.state.selectedRequestId) || null;
  }

  /**
   * Check if an ID is a group node ID (not a request ID).
   */
  private isGroupNode(id: string): boolean {
    return id.startsWith("status-") || id.startsWith("priority-") || id.startsWith("agent-");
  }

  /**
   * Get the index of the currently selected request (for backwards compatibility).
   * Returns the index in the requests array, or 0 if nothing selected.
   */
  getSelectedIndexInRequests(): number {
    if (!this.state.selectedRequestId) return 0;
    const idx = this.requests.findIndex((r) => r.trace_id === this.state.selectedRequestId);
    return idx >= 0 ? idx : 0;
  }

  /**
   * Set selection by index (for backwards compatibility).
   * Selects the request at the given index in the requests array.
   */
  setSelectedByIndex(idx: number): void {
    if (idx >= 0 && idx < this.requests.length) {
      this.state.selectedRequestId = this.requests[idx].trace_id;
    }
  }

  // ===== Tree Building =====

  buildTree(): void {
    const filtered = this.getFilteredRequests();

    switch (this.state.groupBy) {
      case "status":
        this.state.requestTree = this.buildGroupedByStatus(filtered);
        break;
      case "priority":
        this.state.requestTree = this.buildGroupedByPriority(filtered);
        break;
      case "agent":
        this.state.requestTree = this.buildGroupedByAgent(filtered);
        break;
      default:
        this.state.requestTree = this.buildFlatTree(filtered);
    }

    // Ensure selection is valid
    if (this.state.selectedRequestId) {
      const node = findNode(this.state.requestTree, this.state.selectedRequestId);
      if (!node) {
        // Selection not found, select first available
        const flat = flattenTree(this.state.requestTree);
        const first = flat.find((n) => n.node.type === "item");
        this.state.selectedRequestId = first?.node.id || null;
      }
    }
  }

  private buildFlatTree(requests: Request[]): TreeNode[] {
    return requests.map((r) => this.createRequestNode(r));
  }

  private buildGroupedByStatus(requests: Request[]): TreeNode[] {
    const groups = new Map<string, Request[]>();
    for (const req of requests) {
      const status = req.status || "unknown";
      if (!groups.has(status)) groups.set(status, []);
      groups.get(status)!.push(req);
    }

    return Array.from(groups.entries()).map(([status, reqs]) => {
      const icon = STATUS_ICONS[status] || "❓";
      return createGroupNode(
        `status-${status}`,
        `${icon} ${status} (${reqs.length})`,
        "group",
        reqs.map((r) => this.createRequestNode(r)),
        { expanded: true },
      );
    });
  }

  private buildGroupedByPriority(requests: Request[]): TreeNode[] {
    const priorityOrder = ["critical", "high", "normal", "low"];
    const groups = new Map<string, Request[]>();

    for (const req of requests) {
      const priority = req.priority || "normal";
      if (!groups.has(priority)) groups.set(priority, []);
      groups.get(priority)!.push(req);
    }

    return priorityOrder
      .filter((p) => groups.has(p))
      .map((priority) => {
        const reqs = groups.get(priority)!;
        const icon = PRIORITY_ICONS[priority] || "⚪";
        return createGroupNode(
          `priority-${priority}`,
          `${icon} ${priority} (${reqs.length})`,
          "group",
          reqs.map((r) => this.createRequestNode(r)),
          { expanded: true },
        );
      });
  }

  private buildGroupedByAgent(requests: Request[]): TreeNode[] {
    const groups = new Map<string, Request[]>();
    for (const req of requests) {
      const agent = req.agent || "unassigned";
      if (!groups.has(agent)) groups.set(agent, []);
      groups.get(agent)!.push(req);
    }

    return Array.from(groups.entries()).map(([agent, reqs]) => {
      return createGroupNode(
        `agent-${agent}`,
        `👤 ${agent} (${reqs.length})`,
        "group",
        reqs.map((r) => this.createRequestNode(r)),
        { expanded: true },
      );
    });
  }

  private createRequestNode(request: Request): TreeNode {
    const statusIcon = STATUS_ICONS[request.status] || "❓";
    const priorityIcon = PRIORITY_ICONS[request.priority] || "⚪";
    const date = new Date(request.created).toLocaleString();
    const label = `${statusIcon} ${priorityIcon} ${request.title} - ${request.agent} - ${date}`;

    return createNode(request.trace_id, label, "item");
  }

  // ===== Filtering =====

  getFilteredRequests(): Request[] {
    let filtered = this.requests;

    // Apply status filter
    if (this.state.filterStatus) {
      filtered = filtered.filter((r) => r.status === this.state.filterStatus);
    }

    // Apply priority filter
    if (this.state.filterPriority) {
      filtered = filtered.filter((r) => r.priority === this.state.filterPriority);
    }

    // Apply agent filter
    if (this.state.filterAgent) {
      const query = this.state.filterAgent.toLowerCase();
      filtered = filtered.filter((r) => r.agent.toLowerCase().includes(query));
    }

    // Apply search query
    if (this.state.searchQuery) {
      const query = this.state.searchQuery.toLowerCase();
      filtered = filtered.filter((r) =>
        r.title.toLowerCase().includes(query) ||
        r.trace_id.toLowerCase().includes(query) ||
        r.agent.toLowerCase().includes(query) ||
        r.created_by.toLowerCase().includes(query)
      );
    }

    return filtered;
  }

  // ===== Grouping =====

  toggleGrouping(): void {
    const modes: Array<"none" | "status" | "priority" | "agent"> = [
      "none",
      "status",
      "priority",
      "agent",
    ];
    const currentIdx = modes.indexOf(this.state.groupBy);
    this.state.groupBy = modes[(currentIdx + 1) % modes.length];
    this.buildTree();
    this.setStatus(`Grouping: ${this.state.groupBy}`, "info");
  }

  // ===== Navigation =====

  navigateTree(direction: "up" | "down" | "first" | "last"): void {
    const flat = flattenTree(this.state.requestTree);
    if (flat.length === 0) return;

    const currentIdx = this.state.selectedRequestId
      ? flat.findIndex((n) => n.node.id === this.state.selectedRequestId)
      : -1;

    let newIdx: number;
    switch (direction) {
      case "up":
        newIdx = currentIdx > 0 ? currentIdx - 1 : 0;
        break;
      case "down":
        newIdx = currentIdx < flat.length - 1 ? currentIdx + 1 : flat.length - 1;
        break;
      case "first":
        newIdx = 0;
        break;
      case "last":
        newIdx = flat.length - 1;
        break;
    }

    this.state.selectedRequestId = flat[newIdx]?.node.id || null;
  }

  // Node expansion/collapse
  expandSelectedNode(): void {
    if (!this.state.selectedRequestId) return;
    const node = findNode(this.state.requestTree, this.state.selectedRequestId);
    if (node && node.type === "group" && !node.expanded) {
      this.state.requestTree = toggleNode(this.state.requestTree, this.state.selectedRequestId);
    }
  }

  collapseSelectedNode(): void {
    if (!this.state.selectedRequestId) return;
    const node = findNode(this.state.requestTree, this.state.selectedRequestId);
    if (node && node.type === "group" && node.expanded) {
      this.state.requestTree = toggleNode(this.state.requestTree, this.state.selectedRequestId);
    }
  }

  toggleSelectedNode(): void {
    if (!this.state.selectedRequestId) return;
    this.state.requestTree = toggleNode(this.state.requestTree, this.state.selectedRequestId);
  }

  // ===== Detail View =====

  async showRequestDetail(requestId: string): Promise<void> {
    try {
      const content = await this.service.getRequestContent(requestId);
      const request = this.requests.find((r) => r.trace_id === requestId);

      this.state.detailContent = this.formatDetailContent(request, content);
      this.state.showDetail = true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.setStatus(`Failed to load details: ${msg}`, "error");
    }
  }

  private formatDetailContent(request: Request | undefined, content: string): string {
    if (!request) return content;

    const lines = [
      `╔══════════════════════════════════════════════════════════════╗`,
      `║                      REQUEST DETAILS                         ║`,
      `╠══════════════════════════════════════════════════════════════╣`,
      `║ ID:       ${request.trace_id.padEnd(50)}║`,
      `║ Title:    ${request.title.padEnd(50)}║`,
      `║ Status:   ${request.status.padEnd(50)}║`,
      `║ Priority: ${request.priority.padEnd(50)}║`,
      `║ Agent:    ${request.agent.padEnd(50)}║`,
      `║ Created:  ${new Date(request.created).toLocaleString().padEnd(50)}║`,
      `║ Creator:  ${request.created_by.padEnd(50)}║`,
      `╠══════════════════════════════════════════════════════════════╣`,
      `║ Content:                                                     ║`,
      `╠══════════════════════════════════════════════════════════════╣`,
    ];

    // Add content lines
    const contentLines = content.split("\n");
    for (const line of contentLines) {
      lines.push(`║ ${line.slice(0, 60).padEnd(60)}║`);
    }

    lines.push(`╚══════════════════════════════════════════════════════════════╝`);
    lines.push("");
    lines.push("Press ESC or q to close");

    return lines.join("\n");
  }

  renderDetail(): string {
    return this.state.detailContent;
  }

  // ===== Dialogs =====

  showSearchDialog(): void {
    this.state.activeDialog = new InputDialog({
      title: "Search Requests",
      label: "Enter search term:",
      placeholder: "title, ID, or agent...",
      defaultValue: this.state.searchQuery,
    });
    this.pendingDialogType = "search";
  }

  showFilterStatusDialog(): void {
    this.state.activeDialog = new InputDialog({
      title: "Filter by Status",
      label: "Status (pending, planned, in_progress, completed, cancelled):",
      placeholder: "status...",
      defaultValue: this.state.filterStatus || "",
    });
    this.pendingDialogType = "filter-status";
  }

  showFilterAgentDialog(): void {
    this.state.activeDialog = new InputDialog({
      title: "Filter by Agent",
      label: "Enter agent name (or empty for all):",
      placeholder: "agent name...",
      defaultValue: this.state.filterAgent || "",
    });
    this.pendingDialogType = "filter-agent";
  }

  showCreateDialog(): void {
    this.state.activeDialog = new InputDialog({
      title: "Create Request",
      label: "Enter request description:",
      placeholder: "What would you like to request?",
    });
    this.pendingDialogType = "create";
  }

  showCancelConfirm(requestId: string): void {
    const request = this.requests.find((r) => r.trace_id === requestId);
    if (!request) return;

    this.state.activeDialog = new ConfirmDialog({
      title: "Cancel Request",
      message: `Are you sure you want to cancel request "${request.title}"?`,
      confirmText: "Cancel Request",
      cancelText: "Keep",
    });
    this.pendingCancelRequestId = requestId;
  }

  showPriorityDialog(): void {
    this.state.activeDialog = new InputDialog({
      title: "Change Priority",
      label: "Enter new priority (low, normal, high, critical):",
      placeholder: "priority...",
    });
    this.pendingDialogType = "priority";
  }

  // Dialog result handlers
  private handleSearchResult(value: string): void {
    this.state.searchQuery = value;
    this.buildTree();
    this.setStatus(value ? `Search: "${value}"` : "Search cleared", "info");
  }

  private handleFilterStatusResult(value: string): void {
    this.state.filterStatus = value || null;
    this.buildTree();
    this.setStatus(value ? `Filtering: status=${value}` : "Status filter cleared", "info");
  }

  private handleFilterAgentResult(value: string): void {
    this.state.filterAgent = value || null;
    this.buildTree();
    this.setStatus(value ? `Filtering: agent=${value}` : "Agent filter cleared", "info");
  }

  private async handleCreateResult(description: string): Promise<void> {
    if (!description) return;

    try {
      this.startLoading("Creating request...");
      const newRequest = await this.service.createRequest(description, { priority: "normal" });
      this.requests.push(newRequest);
      this.buildTree();
      this.setStatus(`Created request: ${newRequest.trace_id.slice(0, 8)}`, "success");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.setStatus(`Failed to create: ${msg}`, "error");
    } finally {
      this.stopLoading();
    }
  }

  private async handleCancelConfirm(): Promise<void> {
    if (!this.pendingCancelRequestId) return;

    const requestId = this.pendingCancelRequestId;
    this.pendingCancelRequestId = null;

    try {
      this.startLoading("Cancelling request...");
      await this.service.updateRequestStatus(requestId, "cancelled");

      // Update local state
      const request = this.requests.find((r) => r.trace_id === requestId);
      if (request) {
        request.status = "cancelled";
      }
      this.buildTree();
      this.setStatus(`Cancelled request: ${requestId.slice(0, 8)}`, "success");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.setStatus(`Failed to cancel: ${msg}`, "error");
    } finally {
      this.stopLoading();
    }
  }

  private handlePriorityResult(value: string): void {
    if (!value || !this.state.selectedRequestId) return;

    const validPriorities = ["low", "normal", "high", "critical"];
    if (!validPriorities.includes(value.toLowerCase())) {
      this.setStatus("Invalid priority. Use: low, normal, high, critical", "error");
      return;
    }

    // For now, just update local state (service may not support this)
    const request = this.requests.find((r) => r.trace_id === this.state.selectedRequestId);
    if (request) {
      request.priority = value.toLowerCase();
      this.buildTree();
      this.setStatus(`Priority changed to ${value}`, "success");
    }
  }

  // ===== Help =====

  getHelpSections(): HelpSection[] {
    return [
      {
        title: "Navigation",
        items: [
          { key: "↑/↓", description: "Navigate requests" },
          { key: "Home/End", description: "Jump to first/last" },
          { key: "←/→", description: "Collapse/Expand group" },
          { key: "Enter", description: "View request details" },
        ],
      },
      {
        title: "Actions",
        items: [
          { key: "c", description: "Create new request" },
          { key: "d", description: "Cancel selected request" },
          { key: "p", description: "Change priority" },
          { key: "R", description: "Refresh list" },
        ],
      },
      {
        title: "Search & Filter",
        items: [
          { key: "s", description: "Search requests" },
          { key: "f", description: "Filter by status" },
          { key: "a", description: "Filter by agent" },
          { key: "g", description: "Toggle grouping" },
        ],
      },
      {
        title: "View",
        items: [
          { key: "c/E", description: "Collapse/Expand all" },
          { key: "?", description: "Toggle help" },
          { key: "q/ESC", description: "Close/Exit" },
        ],
      },
    ];
  }

  renderHelp(): string[] {
    return renderHelpScreen({
      title: "Request Manager Help",
      sections: this.getHelpSections(),
      useColors: this.useColors,
      width: 60,
    });
  }

  // ===== Rendering =====

  renderTree(): string[] {
    if (this.state.requestTree.length === 0) {
      return ["No requests found."];
    }

    return renderTree(this.state.requestTree, {
      selectedId: this.state.selectedRequestId || undefined,
      useColors: this.useColors,
    });
  }

  render(): string {
    // If help is showing
    if (this.state.showHelp) {
      return this.renderHelp().join("\n");
    }

    // If detail is showing
    if (this.state.showDetail) {
      return this.renderDetail();
    }

    // Build header
    const lines: string[] = [];
    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("                     REQUEST MANAGER                            ");
    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("");

    // Show current filters
    const filters: string[] = [];
    if (this.state.searchQuery) filters.push(`search="${this.state.searchQuery}"`);
    if (this.state.filterStatus) filters.push(`status=${this.state.filterStatus}`);
    if (this.state.filterAgent) filters.push(`agent=${this.state.filterAgent}`);
    if (filters.length > 0) {
      lines.push(`Filters: ${filters.join(", ")}`);
    }
    lines.push(
      `Grouping: ${this.state.groupBy} | Total: ${this.requests.length} | Shown: ${this.getFilteredRequests().length}`,
    );
    lines.push("───────────────────────────────────────────────────────────────");
    lines.push("");

    // Tree
    lines.push(...this.renderTree());
    lines.push("");

    // Status bar
    if (this.spinnerState.active) {
      lines.push(`${this.spinnerState.message}`);
    } else if (this.statusMessage) {
      lines.push(this.statusMessage);
    }

    lines.push("───────────────────────────────────────────────────────────────");
    lines.push("↑↓:Navigate  Enter:View  c:Create  d:Cancel  s:Search  ?:Help");

    return lines.join("\n");
  }

  // ===== Key Handling =====

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

        // Handle InputDialog results
        if (dialog instanceof InputDialog && dialog.getState() === "confirmed") {
          const result = dialog.getResult();
          if (result.type === "confirmed") {
            switch (dialogType) {
              case "search":
                this.handleSearchResult(result.value);
                break;
              case "filter-status":
                this.handleFilterStatusResult(result.value);
                break;
              case "filter-agent":
                this.handleFilterAgentResult(result.value);
                break;
              case "create":
                // Async handling - fire and forget with proper error handling
                this.handleCreateResult(result.value).catch((e) => {
                  this.setStatus(`Error: ${e}`, "error");
                });
                break;
              case "priority":
                this.handlePriorityResult(result.value);
                break;
            }
          }
        }

        // Handle ConfirmDialog results
        if (dialog instanceof ConfirmDialog && dialog.getState() === "confirmed") {
          this.handleCancelConfirm().catch((e) => {
            this.setStatus(`Error: ${e}`, "error");
          });
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
        if (this.state.selectedRequestId) {
          // If it's a group node, toggle it
          if (this.isGroupNode(this.state.selectedRequestId)) {
            this.toggleSelectedNode();
          } else {
            // Show detail - fire and forget with error handling
            this.showRequestDetail(this.state.selectedRequestId).catch((e) => {
              this.setStatus(`Error: ${e}`, "error");
            });
          }
        }
        break;
      case "c":
        this.showCreateDialog();
        break;
      case "d":
        if (this.state.selectedRequestId && !this.isGroupNode(this.state.selectedRequestId)) {
          // Only for actual request IDs, not group IDs
          this.showCancelConfirm(this.state.selectedRequestId);
        }
        break;
      case "p":
        if (this.state.selectedRequestId && !this.isGroupNode(this.state.selectedRequestId)) {
          this.showPriorityDialog();
        }
        break;
      case "s":
        this.showSearchDialog();
        break;
      case "f":
        this.showFilterStatusDialog();
        break;
      case "a":
        this.showFilterAgentDialog();
        break;
      case "g":
        this.toggleGrouping();
        break;
      case "R":
        this.refresh();
        break;
      case "C":
        this.state.requestTree = collapseAll(this.state.requestTree);
        break;
      case "E":
        this.state.requestTree = expandAll(this.state.requestTree);
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

  override refresh(): Promise<void> {
    if (this.refreshConfig) {
      return super.refresh();
    }
    // If no refresh config, rebuild tree from current data
    this.buildTree();
    return Promise.resolve();
  }

  setRequests(requests: Request[]): void {
    this.requests = requests;
    this.buildTree();
  }

  getFocusableElements(): string[] {
    return ["request-list", "action-buttons"];
  }
}

// --- Legacy TUI Session (backwards compatibility) ---
/**
 * Legacy TUI session for Request Manager. Encapsulates state and user interaction logic.
 * @deprecated Use RequestManagerTuiSession instead
 */
export class LegacyRequestManagerTuiSession {
  private selectedIndex = 0;
  private statusMessage = "";

  /**
   * @param requests Initial list of requests
   * @param service Service for request operations
   */
  constructor(private readonly requests: Request[], private readonly service: RequestService) {}

  /** Get the currently selected request index. */
  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  /** Set the selected request index, clamped to valid range. */
  setSelectedIndex(idx: number): void {
    if (idx < 0 || idx >= this.requests.length) {
      this.selectedIndex = 0;
    } else {
      this.selectedIndex = idx;
    }
  }

  /** Handle a TUI key event. */
  async handleKey(key: string): Promise<void> {
    if (this.requests.length === 0) return;

    switch (key) {
      case "down":
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.requests.length - 1);
        break;
      case "up":
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        break;
      case "end":
        this.selectedIndex = this.requests.length - 1;
        break;
      case "home":
        this.selectedIndex = 0;
        break;
      case "c":
        await this.#triggerAction("create");
        break;
      case "v":
        await this.#triggerAction("view");
        break;
      case "d":
        await this.#triggerAction("delete");
        break;
    }

    if (this.selectedIndex >= this.requests.length) {
      this.selectedIndex = Math.max(0, this.requests.length - 1);
    }
  }

  /**
   * Trigger a request action and update status.
   * @param action Action to perform
   */
  async #triggerAction(action: "create" | "view" | "delete") {
    try {
      switch (action) {
        case "create": {
          const newRequest = await this.service.createRequest("New request from TUI", { priority: "normal" });
          this.statusMessage = `Created request: ${newRequest.trace_id.slice(0, 8)}`;
          break;
        }
        case "view": {
          const request = this.requests[this.selectedIndex];
          if (request) {
            const _content = await this.service.getRequestContent(request.trace_id);
            this.statusMessage = `Viewing: ${request.trace_id.slice(0, 8)}`;
            // In a real implementation, this would open a detail view
          }
          break;
        }
        case "delete": {
          const delRequest = this.requests[this.selectedIndex];
          if (delRequest) {
            await this.service.updateRequestStatus(delRequest.trace_id, "cancelled");
            this.statusMessage = `Cancelled request: ${delRequest.trace_id.slice(0, 8)}`;
          }
          break;
        }
      }
    } catch (e) {
      if (e && typeof e === "object" && "message" in e) {
        this.statusMessage = `Error: ${(e as Error).message}`;
      } else {
        this.statusMessage = `Error: ${String(e)}`;
      }
    }
  }

  /** Get the current status message. */
  getStatusMessage(): string {
    return this.statusMessage;
  }

  /** Get the currently selected request. */
  getSelectedRequest(): Request | null {
    return this.requests[this.selectedIndex] || null;
  }
}

/**
 * View/controller for Request Manager. Delegates to injected RequestService.
 */
export class RequestManagerView implements RequestService {
  constructor(public readonly service: RequestService) {}

  /** Create a new TUI session for the given requests. */
  createTuiSession(requests: Request[]): RequestManagerTuiSession {
    return new RequestManagerTuiSession(requests, this.service);
  }

  listRequests(status?: string): Promise<Request[]> {
    return this.service.listRequests(status);
  }

  getRequestContent(requestId: string): Promise<string> {
    return this.service.getRequestContent(requestId);
  }

  createRequest(description: string, options?: RequestOptions): Promise<Request> {
    return this.service.createRequest(description, options);
  }

  updateRequestStatus(requestId: string, status: string): Promise<boolean> {
    return this.service.updateRequestStatus(requestId, status);
  }

  /** Render a list of requests for display. */
  renderRequestList(requests: Request[]): string {
    if (requests.length === 0) {
      return "No requests found.";
    }

    const lines = ["Requests:", ""];
    for (const request of requests) {
      const priorityIcon = request.priority === "critical"
        ? "🔴"
        : request.priority === "high"
        ? "🟠"
        : request.priority === "low"
        ? "🔵"
        : "⚪";
      const statusIcon = request.status === "pending"
        ? "⏳"
        : request.status === "planned"
        ? "📋"
        : request.status === "completed"
        ? "✅"
        : request.status === "cancelled"
        ? "❌"
        : "❓";

      lines.push(
        `${statusIcon} ${priorityIcon} ${request.title} - ${request.agent} - ${
          new Date(request.created).toLocaleString()
        }`,
      );
    }
    return lines.join("\n");
  }

  /** Render request content for display. */
  renderRequestContent(content: string): string {
    return content;
  }
}
