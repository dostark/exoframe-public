/**
 * Plan Reviewer TUI View
 *
 * Phase 13.4: Enhanced with modern TUI patterns
 * - Tree view by plan status
 * - Diff viewer with markdown rendering
 * - Confirm dialogs for approve/reject
 * - Search/filter functionality
 * - Help screen
 * - Bulk operations
 * - Color theming
 */

// --- Adapter: PlanCommands as PlanService ---
import type { PlanCommands } from "../cli/plan_commands.ts";
import { TuiSessionBase } from "./tui_common.ts";
import { ConfirmDialog, type DialogBase, InputDialog } from "./utils/dialog_base.ts";
import { type HelpSection, renderHelpScreen } from "./utils/help_renderer.ts";
import type { KeyBinding } from "./utils/keyboard.ts";
import { type SpinnerState } from "./utils/spinner.ts";
import {
  collapseAll,
  createGroupNode,
  createNode,
  expandAll,
  flattenTree,
  getNextNodeId,
  getPrevNodeId,
  renderTree,
  toggleNode,
  type TreeNode,
  type TreeRenderOptions,
} from "./utils/tree_view.ts";

// ===== Plan Types =====

export type Plan = {
  id: string;
  title: string;
  author?: string;
  status?: string;
  created_at?: string;
};

export type PlanStatus = "pending" | "approved" | "rejected" | "unknown";

// ===== Plan View State =====

export interface PlanViewState {
  /** Currently selected plan ID */
  selectedPlanId: string | null;
  /** Plan tree organized by status */
  planTree: TreeNode<Plan>[];
  /** Filter text for searching */
  filterText: string;
  /** Whether loading */
  isLoading: boolean;
  /** Loading message */
  loadingMessage: string;
  /** Show help screen */
  showHelp: boolean;
  /** Show diff view */
  showDiff: boolean;
  /** Current diff content */
  diffContent: string;
  /** Active dialog */
  activeDialog: DialogBase | null;
  /** Use colors */
  useColors: boolean;
  /** Spinner frame for animation */
  spinnerFrame: number;
  /** Last refresh timestamp */
  lastRefresh: number;
  /** Scroll offset for plan list */
  scrollOffset: number;
}

function createPlanViewState(): PlanViewState {
  return {
    selectedPlanId: null,
    planTree: [],
    filterText: "",
    isLoading: false,
    loadingMessage: "",
    showHelp: false,
    showDiff: false,
    diffContent: "",
    activeDialog: null,
    useColors: true,
    spinnerFrame: 0,
    lastRefresh: 0,
    scrollOffset: 0,
  };
}

// ===== Plan Status Icons =====

const PLAN_ICONS = {
  pending: "🔶",
  approved: "✅",
  rejected: "❌",
  unknown: "❓",
  folder: "📁",
} as const;

// ===== Key Bindings =====

const PLAN_KEY_BINDINGS: KeyBinding<string>[] = [
  { key: "up", action: "navigate-up", description: "Move up", category: "Navigation" },
  { key: "down", action: "navigate-down", description: "Move down", category: "Navigation" },
  { key: "home", action: "navigate-home", description: "Go to first", category: "Navigation" },
  { key: "end", action: "navigate-end", description: "Go to last", category: "Navigation" },
  { key: "enter", action: "view-diff", description: "View diff", category: "Actions" },
  { key: "a", action: "approve", description: "Approve plan", category: "Actions" },
  { key: "r", action: "reject", description: "Reject plan", category: "Actions" },
  { key: "A", action: "approve-all", description: "Approve all pending", category: "Actions" },
  { key: "left", action: "collapse", description: "Collapse node", category: "Navigation" },
  { key: "right", action: "expand", description: "Expand node", category: "Navigation" },
  { key: "s", action: "search", description: "Search/filter", category: "Actions" },
  { key: "escape", action: "cancel", description: "Close/Cancel", category: "Actions" },
  { key: "R", action: "refresh-view", description: "Refresh view", category: "View" },
  { key: "?", action: "help", description: "Toggle help", category: "View" },
  { key: "e", action: "expand-all", description: "Expand all", category: "View" },
  { key: "c", action: "collapse-all", description: "Collapse all", category: "View" },
];

// ===== Service Interface =====

export interface PlanService {
  listPending(): Promise<Plan[]>;
  getDiff(planId: string): Promise<string>;
  approve(planId: string, reviewer: string): Promise<boolean>;
  reject(planId: string, reviewer: string, reason?: string): Promise<boolean>;
}

// ===== Service Adapters =====

/**
 * Adapter: PlanCommands as PlanService
 */
export class PlanCommandsServiceAdapter implements PlanService {
  constructor(private readonly cmd: PlanCommands) {}
  async listPending() {
    const rows = await this.cmd.list("pending");
    return rows.map((r: any) => ({
      id: r.id,
      title: (r as any).title ?? r.id,
      author: r.agent_id ?? r.reviewed_by,
      status: r.status,
    }));
  }
  async getDiff(planId: string) {
    const details = await this.cmd.show(planId);
    return details.content ?? "";
  }
  async approve(planId: string, _reviewer: string) {
    await this.cmd.approve(planId);
    return true;
  }
  async reject(planId: string, _reviewer: string, reason?: string) {
    if (!reason) throw new Error("Rejection reason is required");
    await this.cmd.reject(planId, reason);
    return true;
  }
}

/**
 * Adapter: DB-like mock as PlanService
 */
export class DbLikePlanServiceAdapter implements PlanService {
  constructor(private readonly dbLike: any) {}
  listPending() {
    return this.dbLike.getPendingPlans();
  }
  getDiff(planId: string) {
    return this.dbLike.getPlanDiff(planId);
  }
  async approve(planId: string, reviewer: string) {
    await this.dbLike.updatePlanStatus(planId, "approved");
    await this.dbLike.logActivity({
      action_type: "plan.approve",
      plan_id: planId,
      reviewer,
      timestamp: new Date().toISOString(),
    });
    return true;
  }
  async reject(planId: string, reviewer: string, reason?: string) {
    await this.dbLike.updatePlanStatus(planId, "rejected");
    await this.dbLike.logActivity({
      action_type: "plan.reject",
      plan_id: planId,
      reason: reason ?? null,
      reviewer,
      timestamp: new Date().toISOString(),
    });
    return true;
  }
}

/**
 * Minimal PlanService mock for TUI session tests.
 */
export class MinimalPlanServiceMock implements PlanService {
  listPending: () => Promise<Plan[]> = () => Promise.resolve([]);
  getDiff = (_: string) => Promise.resolve("");
  approve = (_: string, _r: string) => Promise.resolve(true);
  reject = (_: string, _r: string, _reason?: string) => Promise.resolve(true);
}

// ===== TUI Session =====

export class PlanReviewerTuiSession extends TuiSessionBase {
  private plans: Plan[];
  private readonly service: PlanService;
  private state: PlanViewState;
  private localSpinnerState: SpinnerState;
  private pendingRejectId: string | null = null;

  constructor(plans: Plan[], service: PlanService, useColors = true) {
    super(useColors);
    this.plans = plans;
    this.service = service;
    this.state = createPlanViewState();
    this.state.useColors = useColors;
    this.localSpinnerState = {
      active: false,
      frame: 0,
      message: "",
      startTime: 0,
    };
    this.buildTree(plans);
  }

  // ===== Tree Building =====

  private buildTree(plans: Plan[]): void {
    const pending: TreeNode<Plan>[] = [];
    const approved: TreeNode<Plan>[] = [];
    const rejected: TreeNode<Plan>[] = [];
    const unknown: TreeNode<Plan>[] = [];

    for (const plan of plans) {
      const status = (plan.status || "unknown") as PlanStatus;
      const node = createNode<Plan>(
        plan.id,
        plan.title || plan.id,
        "plan",
        {
          data: plan,
          icon: PLAN_ICONS[status] || PLAN_ICONS.unknown,
          badge: status,
        },
      );

      switch (status) {
        case "pending":
          pending.push(node);
          break;
        case "approved":
          approved.push(node);
          break;
        case "rejected":
          rejected.push(node);
          break;
        default:
          unknown.push(node);
      }
    }

    this.state.planTree = [];

    if (pending.length > 0) {
      this.state.planTree.push(
        createGroupNode("pending-group", `Pending (${pending.length})`, "group", pending, {
          icon: PLAN_ICONS.pending,
          badge: pending.length,
        }),
      );
    }

    if (approved.length > 0) {
      this.state.planTree.push(
        createGroupNode("approved-group", `Approved (${approved.length})`, "group", approved, {
          icon: PLAN_ICONS.approved,
          badge: approved.length,
        }),
      );
    }

    if (rejected.length > 0) {
      this.state.planTree.push(
        createGroupNode("rejected-group", `Rejected (${rejected.length})`, "group", rejected, {
          icon: PLAN_ICONS.rejected,
          badge: rejected.length,
        }),
      );
    }

    if (unknown.length > 0) {
      this.state.planTree.push(
        createGroupNode("unknown-group", `Unknown (${unknown.length})`, "group", unknown, {
          icon: PLAN_ICONS.unknown,
          badge: unknown.length,
        }),
      );
    }

    // Select first plan if none selected
    if (!this.state.selectedPlanId && plans.length > 0) {
      const flat = flattenTree(this.state.planTree);
      const firstPlan = flat.find((f) => f.node.type === "plan");
      if (firstPlan) {
        this.state.selectedPlanId = firstPlan.node.id;
      }
    }
  }

  // ===== Backwards Compatibility =====

  override setSelectedIndex(idx: number, maxLength?: number): void {
    const len = maxLength ?? this.plans.length;
    super.setSelectedIndex(idx, len);
    // Sync with ID-based selection
    if (idx >= 0 && idx < this.plans.length && this.plans[idx]) {
      this.state.selectedPlanId = this.plans[idx].id;
    }
  }

  // ===== Navigation =====

  private navigateUp(): void {
    const prevId = getPrevNodeId(this.state.planTree, this.state.selectedPlanId || "");
    if (prevId) {
      this.state.selectedPlanId = prevId;
      this.syncSelectedIndex();
    }
  }

  private navigateDown(): void {
    const nextId = getNextNodeId(this.state.planTree, this.state.selectedPlanId || "");
    if (nextId) {
      this.state.selectedPlanId = nextId;
      this.syncSelectedIndex();
    }
  }

  private syncSelectedIndex(): void {
    if (this.state.selectedPlanId) {
      const idx = this.plans.findIndex((p) => p.id === this.state.selectedPlanId);
      if (idx >= 0) {
        this.selectedIndex = idx;
      }
    }
  }

  // ===== Key Handling =====

  async handleKey(key: string): Promise<void> {
    // Handle dialogs first
    if (this.state.activeDialog) {
      this.state.activeDialog.handleKey(key);
      if (!this.state.activeDialog.isActive()) {
        const dialog = this.state.activeDialog;
        this.state.activeDialog = null;

        // Handle dialog result
        if (dialog instanceof ConfirmDialog && dialog.getState() === "confirmed") {
          if (this.pendingRejectId) {
            await this.executeReject(this.pendingRejectId, "Rejected via TUI");
            this.pendingRejectId = null;
          } else {
            await this.executeApprove();
          }
        } else if (dialog instanceof InputDialog && dialog.getState() === "confirmed") {
          const result = dialog.getResult();
          if (result.type === "confirmed" && this.pendingRejectId) {
            await this.executeReject(this.pendingRejectId, result.value || "Rejected via TUI");
            this.pendingRejectId = null;
          }
        }
      }
      return;
    }

    // Handle help screen
    if (this.state.showHelp) {
      if (key === "?" || key === "escape" || key === "q") {
        this.state.showHelp = false;
      }
      return;
    }

    // Handle diff view
    if (this.state.showDiff) {
      if (key === "escape" || key === "q" || key === "enter") {
        this.state.showDiff = false;
        this.state.diffContent = "";
      }
      return;
    }

    // Handle search mode
    if (this.state.filterText !== "" && key === "escape") {
      this.state.filterText = "";
      this.buildTree(this.plans);
      return;
    }

    // Navigation
    switch (key) {
      case "up":
        this.navigateUp();
        return;
      case "down":
        this.navigateDown();
        return;
      case "home": {
        const flat = flattenTree(this.state.planTree);
        if (flat.length > 0) {
          this.state.selectedPlanId = flat[0].node.id;
          this.syncSelectedIndex();
        }
        return;
      }
      case "end": {
        const flat = flattenTree(this.state.planTree);
        if (flat.length > 0) {
          this.state.selectedPlanId = flat[flat.length - 1].node.id;
          this.syncSelectedIndex();
        }
        return;
      }
      case "left": {
        // Collapse current group
        const flat = flattenTree(this.state.planTree);
        const current = flat.find((f) => f.node.id === this.state.selectedPlanId);
        if (current && current.node.children.length > 0 && current.node.expanded) {
          this.state.planTree = toggleNode(this.state.planTree, current.node.id);
        }
        return;
      }
      case "right": {
        // Expand current group
        const flat = flattenTree(this.state.planTree);
        const current = flat.find((f) => f.node.id === this.state.selectedPlanId);
        if (current && current.node.children.length > 0 && !current.node.expanded) {
          this.state.planTree = toggleNode(this.state.planTree, current.node.id);
        }
        return;
      }
    }

    // Backwards-compatible handling for legacy tests
    if (this.plans.length === 0) return;
    if (super.handleNavigationKey(key, this.plans.length)) {
      return;
    }

    // Actions
    switch (key) {
      case "enter": {
        const selected = this.getSelectedPlan();
        if (selected && selected.type === "group") {
          this.state.planTree = toggleNode(this.state.planTree, selected.id);
        } else if (selected) {
          await this.showDiff();
        }
        break;
      }
      case "a":
        this.showApproveConfirmDialog();
        break;
      case "r":
        this.showRejectDialog();
        break;
      case "A":
        await this.approveAllPending();
        break;
      case "R":
        await this.refreshView();
        break;
      case "?":
        this.state.showHelp = true;
        break;
      case "e":
        this.state.planTree = expandAll(this.state.planTree);
        break;
      case "c":
        this.state.planTree = collapseAll(this.state.planTree);
        break;
    }

    this.clampSelection(this.plans.length);
  }

  // ===== Actions =====

  private async showDiff(): Promise<void> {
    const plan = this.plans[this.selectedIndex];
    if (!plan) return;

    this.state.isLoading = true;
    this.state.loadingMessage = `Loading diff for ${plan.id}...`;

    try {
      const diff = await this.service.getDiff(plan.id);
      this.state.diffContent = diff;
      this.state.showDiff = true;
      this.statusMessage = "";
    } catch (e) {
      this.statusMessage = e instanceof Error ? `Error: ${e.message}` : `Error: ${String(e)}`;
    } finally {
      this.state.isLoading = false;
      this.state.loadingMessage = "";
    }
  }

  private showApproveConfirmDialog(): void {
    const plan = this.plans[this.selectedIndex];
    if (!plan) return;

    this.state.activeDialog = new ConfirmDialog({
      title: "Approve Plan",
      message: `Approve plan "${plan.title}"?\nThis action will move the plan to active status.`,
      confirmText: "Approve",
      cancelText: "Cancel",
    });
  }

  private async executeApprove(): Promise<void> {
    const plan = this.plans[this.selectedIndex];
    if (!plan) return;

    this.state.isLoading = true;
    this.state.loadingMessage = `Approving ${plan.id}...`;

    try {
      await this.service.approve(plan.id, "reviewer");
      this.statusMessage = `Approved ${plan.id}`;
      await this.refreshView();
    } catch (e) {
      this.statusMessage = e instanceof Error ? `Error: ${e.message}` : `Error: ${String(e)}`;
    } finally {
      this.state.isLoading = false;
      this.state.loadingMessage = "";
    }
  }

  private showRejectDialog(): void {
    const plan = this.plans[this.selectedIndex];
    if (!plan) return;

    this.pendingRejectId = plan.id;
    this.state.activeDialog = new ConfirmDialog({
      title: "Reject Plan",
      message: `Reject plan "${plan.title}"?\nThis action will move the plan to rejected status.`,
      confirmText: "Reject",
      cancelText: "Cancel",
      destructive: true,
    });
  }

  private async executeReject(planId: string, reason: string): Promise<void> {
    this.state.isLoading = true;
    this.state.loadingMessage = `Rejecting ${planId}...`;

    try {
      await this.service.reject(planId, "reviewer", reason);
      this.statusMessage = `Rejected ${planId}`;
      await this.refreshView();
    } catch (e) {
      this.statusMessage = e instanceof Error ? `Error: ${e.message}` : `Error: ${String(e)}`;
    } finally {
      this.state.isLoading = false;
      this.state.loadingMessage = "";
    }
  }

  private async approveAllPending(): Promise<void> {
    const pendingGroup = this.state.planTree.find((n) => n.id === "pending-group");
    if (!pendingGroup || pendingGroup.children.length === 0) {
      this.statusMessage = "No pending plans to approve";
      return;
    }

    this.state.isLoading = true;
    this.state.loadingMessage = "Approving all pending plans...";
    let approved = 0;

    try {
      for (const node of pendingGroup.children) {
        if (node.data) {
          await this.service.approve(node.id, "reviewer");
          approved++;
        }
      }
      this.statusMessage = `Approved ${approved} plans`;
      await this.refreshView();
    } catch (e) {
      this.statusMessage = e instanceof Error ? `Error: ${e.message}` : `Error: ${String(e)}`;
    } finally {
      this.state.isLoading = false;
      this.state.loadingMessage = "";
    }
  }

  private async refreshView(): Promise<void> {
    this.state.isLoading = true;
    this.state.loadingMessage = "Refreshing plans...";

    try {
      const newPlans = await this.service.listPending();
      this.updatePlans(newPlans);
      this.state.lastRefresh = Date.now();
      this.statusMessage = "Refreshed";
    } catch (e) {
      this.statusMessage = e instanceof Error ? `Error: ${e.message}` : `Error: ${String(e)}`;
    } finally {
      this.state.isLoading = false;
      this.state.loadingMessage = "";
    }
  }

  // ===== State Accessors =====

  getSelectedPlan(): TreeNode<Plan> | null {
    const flat = flattenTree(this.state.planTree);
    return flat.find((f) => f.node.id === this.state.selectedPlanId)?.node || null;
  }

  updatePlans(newPlans: Plan[]): void {
    this.plans = newPlans;
    this.buildTree(newPlans);

    if (this.selectedIndex >= newPlans.length) {
      this.selectedIndex = Math.max(0, newPlans.length - 1);
    }
  }

  getSelectedPlanDetails(): Plan | undefined {
    if (this.plans.length === 0) return undefined;
    return this.plans[this.selectedIndex];
  }

  getPlanTree(): TreeNode<Plan>[] {
    return this.state.planTree;
  }

  isLoading(): boolean {
    return this.state.isLoading;
  }

  getLoadingMessage(): string {
    return this.state.loadingMessage;
  }

  override isHelpVisible(): boolean {
    return this.state.showHelp;
  }

  isDiffVisible(): boolean {
    return this.state.showDiff;
  }

  getDiffContent(): string {
    return this.state.diffContent;
  }

  getActiveDialog(): DialogBase | null {
    return this.state.activeDialog;
  }

  hasActiveDialog(): boolean {
    return this.state.activeDialog !== null && this.state.activeDialog.isActive();
  }

  setUseColors(useColors: boolean): void {
    this.state.useColors = useColors;
  }

  tickSpinner(): void {
    this.state.spinnerFrame = (this.state.spinnerFrame + 1) % 10;
  }

  // ===== Rendering =====

  renderActionButtons(): string {
    if (!this.plans.length) return "";
    return `[Enter] View diff   [a] Approve   [r] Reject   [A] Approve all   [?] Help`;
  }

  renderStatusBar(): string {
    if (this.state.isLoading) {
      return this.state.loadingMessage;
    }
    return this.statusMessage ? `Status: ${this.statusMessage}` : "Ready";
  }

  renderPlanTree(options: Partial<TreeRenderOptions> = {}): string[] {
    return renderTree(this.state.planTree, {
      useColors: this.state.useColors,
      selectedId: this.state.selectedPlanId || undefined,
      ...options,
    });
  }

  renderHelp(): string[] {
    const sections: HelpSection[] = [
      {
        title: "Navigation",
        items: [
          { key: "↑/↓", description: "Move selection" },
          { key: "Home/End", description: "Jump to first/last" },
          { key: "←/→", description: "Collapse/Expand" },
          { key: "e/c", description: "Expand/Collapse all" },
        ],
      },
      {
        title: "Actions",
        items: [
          { key: "Enter", description: "View diff" },
          { key: "a", description: "Approve plan" },
          { key: "r", description: "Reject plan" },
          { key: "A", description: "Approve all pending" },
          { key: "R", description: "Refresh view" },
        ],
      },
      {
        title: "View",
        items: [
          { key: "s", description: "Search plans" },
          { key: "?", description: "Toggle help" },
          { key: "Esc", description: "Close/Cancel" },
        ],
      },
    ];

    return renderHelpScreen({
      title: "Plan Reviewer Help",
      sections,
      useColors: this.state.useColors,
      width: 50,
    });
  }

  renderDiff(): string[] {
    if (!this.state.showDiff) return [];

    const lines: string[] = [];
    lines.push("═".repeat(60));
    lines.push(" DIFF VIEWER (Press ESC or Enter to close)");
    lines.push("═".repeat(60));
    lines.push("");

    // Render diff with simple syntax highlighting
    for (const line of this.state.diffContent.split("\n")) {
      if (line.startsWith("+")) {
        lines.push(`  + ${line.slice(1)}`);
      } else if (line.startsWith("-")) {
        lines.push(`  - ${line.slice(1)}`);
      } else if (line.startsWith("@@")) {
        lines.push(`  ${line}`);
      } else {
        lines.push(`    ${line}`);
      }
    }

    lines.push("");
    lines.push("═".repeat(60));
    return lines;
  }

  getFocusableElements(): string[] {
    return ["plan-list", "action-buttons", "status-bar"];
  }

  override getStatusMessage(): string {
    return this.statusMessage;
  }

  override getKeyBindings(): KeyBinding<string>[] {
    return PLAN_KEY_BINDINGS as KeyBinding<string>[];
  }

  override getViewName(): string {
    return "Plan Reviewer";
  }
}

// ===== View Controller =====

export class PlanReviewerView implements PlanService {
  constructor(public readonly service: PlanService) {}

  createTuiSession(plans: Plan[], useColors = true): PlanReviewerTuiSession {
    return new PlanReviewerTuiSession(plans, this.service, useColors);
  }

  listPending(): Promise<Plan[]> {
    return this.service.listPending();
  }

  getDiff(planId: string): Promise<string> {
    return this.service.getDiff(planId);
  }

  approve(planId: string, reviewer: string): Promise<boolean> {
    return this.service.approve(planId, reviewer);
  }

  reject(planId: string, reviewer: string, reason?: string): Promise<boolean> {
    return this.service.reject(planId, reviewer, reason);
  }

  renderPlanList(plans: Plan[]): string {
    return plans.map((p) => `${p.id} ${p.title} [${p.status ?? "unknown"}]`).join("\n");
  }

  renderDiff(diff: string): string {
    return diff;
  }
}
