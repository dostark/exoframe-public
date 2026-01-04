/**
 * Memory Bank TUI View
 *
 * Interactive view for Memory Banks in the TUI dashboard.
 * Part of Phase 12.12-12.13: TUI Memory View
 *
 * Features:
 * - Tree navigation for memory bank hierarchy
 * - Detail panel for selected items
 * - Search with live filtering
 * - Keyboard shortcuts (g/p/e/s/n)
 * - Pending proposal actions (approve/reject)
 * - Dialog confirmations for actions
 */

import { TuiSessionBase } from "./tui_common.ts";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "../services/db.ts";
import { MemoryBankService } from "../services/memory_bank.ts";
import { MemoryExtractorService } from "../services/memory_extractor.ts";
import { MemoryEmbeddingService } from "../services/memory_embedding.ts";
import type {
  ExecutionMemory,
  GlobalMemory,
  MemorySearchResult,
  MemoryUpdateProposal,
  ProjectMemory,
} from "../schemas/memory_bank.ts";
import {
  AddLearningDialog,
  BulkApproveDialog,
  ConfirmApproveDialog,
  ConfirmRejectDialog,
  type DialogBase,
  PromoteDialog,
} from "./dialogs/memory_dialogs.ts";
import { renderCategoryBadge, renderConfidence, renderMarkdown, renderSpinner } from "./utils/markdown_renderer.ts";

// ===== Types =====

export type MemoryScope = "global" | "projects" | "executions" | "pending" | "search";

export type TreeNodeType = "root" | "scope" | "project" | "execution" | "learning" | "pattern" | "decision";

export interface TreeNode {
  id: string;
  type: TreeNodeType;
  label: string;
  expanded: boolean;
  children: TreeNode[];
  data?: unknown;
  badge?: number;
}

export interface MemoryViewState {
  activeScope: MemoryScope;
  selectedNodeId: string | null;
  searchQuery: string;
  searchActive: boolean;
  tree: TreeNode[];
  detailContent: string;
  pendingCount: number;
  activeDialog: DialogBase | null;
  isLoading: boolean;
  loadingMessage: string;
  spinnerFrame: number;
  useColors: boolean;
  lastRefresh: number;
}

export interface MemoryServiceInterface {
  getProjects(): Promise<string[]>;
  getProjectMemory(portal: string): Promise<ProjectMemory | null>;
  getGlobalMemory(): Promise<GlobalMemory | null>;
  getExecutionByTraceId(traceId: string): Promise<ExecutionMemory | null>;
  getExecutionHistory(options?: {
    portal?: string;
    limit?: number;
  }): Promise<ExecutionMemory[]>;
  search(
    query: string,
    options?: { portal?: string; limit?: number },
  ): Promise<MemorySearchResult[]>;
  listPending(): Promise<MemoryUpdateProposal[]>;
  getPending(proposalId: string): Promise<MemoryUpdateProposal | null>;
  approvePending(proposalId: string): Promise<void>;
  rejectPending(proposalId: string, reason: string): Promise<void>;
}

// ===== Service Adapter =====

/**
 * Adapter to wrap MemoryBankService for TUI usage
 */
export class MemoryServiceAdapter implements MemoryServiceInterface {
  private memoryBank: MemoryBankService;
  private extractor: MemoryExtractorService;
  private _embedding: MemoryEmbeddingService;
  private projectsDir: string;

  constructor(config: Config, db: DatabaseService) {
    this.memoryBank = new MemoryBankService(config, db);
    this.extractor = new MemoryExtractorService(config, db, this.memoryBank);
    this._embedding = new MemoryEmbeddingService(config);
    this.projectsDir = `${config.system.root}/Memory/Projects`;
  }

  async getProjects(): Promise<string[]> {
    const projects: string[] = [];
    try {
      for await (const entry of Deno.readDir(this.projectsDir)) {
        if (entry.isDirectory) {
          projects.push(entry.name);
        }
      }
    } catch {
      // Directory may not exist
    }
    return projects;
  }

  getProjectMemory(portal: string) {
    return this.memoryBank.getProjectMemory(portal);
  }

  getGlobalMemory() {
    return this.memoryBank.getGlobalMemory();
  }

  getExecutionByTraceId(traceId: string) {
    return this.memoryBank.getExecutionByTraceId(traceId);
  }

  getExecutionHistory(options?: { portal?: string; limit?: number }) {
    return this.memoryBank.getExecutionHistory(options?.portal, options?.limit);
  }

  search(query: string, options?: { portal?: string; limit?: number }) {
    return this.memoryBank.searchMemory(query, options);
  }

  listPending() {
    return this.extractor.listPending();
  }

  getPending(proposalId: string) {
    return this.extractor.getPending(proposalId);
  }

  async approvePending(proposalId: string) {
    await this.extractor.approvePending(proposalId);
  }

  async rejectPending(proposalId: string, reason: string) {
    await this.extractor.rejectPending(proposalId, reason);
  }
}

// ===== TUI Session =====

/**
 * TUI Session for Memory View
 *
 * Manages state and user interaction for Memory Bank navigation.
 */
export class MemoryViewTuiSession extends TuiSessionBase {
  private state: MemoryViewState;
  private service: MemoryServiceInterface;
  private flatNodes: TreeNode[] = [];

  constructor(service: MemoryServiceInterface) {
    super();
    this.service = service;
    this.state = {
      activeScope: "projects",
      selectedNodeId: null,
      searchQuery: "",
      searchActive: false,
      tree: [],
      detailContent: "",
      pendingCount: 0,
      activeDialog: null,
      isLoading: false,
      loadingMessage: "",
      spinnerFrame: 0,
      useColors: true,
      lastRefresh: Date.now(),
    };
  }

  // ===== State Accessors =====

  getState(): MemoryViewState {
    return { ...this.state };
  }

  getActiveScope(): MemoryScope {
    return this.state.activeScope;
  }

  getSelectedNodeId(): string | null {
    return this.state.selectedNodeId;
  }

  getTree(): TreeNode[] {
    return this.state.tree;
  }

  getDetailContent(): string {
    return this.state.detailContent;
  }

  getPendingCount(): number {
    return this.state.pendingCount;
  }

  isLoading(): boolean {
    return this.state.isLoading;
  }

  getLoadingMessage(): string {
    return this.state.loadingMessage;
  }

  setUseColors(useColors: boolean): void {
    this.state.useColors = useColors;
  }

  /** Advance spinner animation frame */
  tickSpinner(): void {
    this.state.spinnerFrame = (this.state.spinnerFrame + 1) % 10;
  }

  isSearchActive(): boolean {
    return this.state.searchActive;
  }

  getSearchQuery(): string {
    return this.state.searchQuery;
  }

  getActiveDialog(): DialogBase | null {
    return this.state.activeDialog;
  }

  hasActiveDialog(): boolean {
    return this.state.activeDialog !== null && this.state.activeDialog.isActive();
  }

  // ===== Initialization =====

  /**
   * Initialize the view by loading memory bank data
   */
  async initialize(): Promise<void> {
    this.state.isLoading = true;
    this.state.loadingMessage = "Loading memory banks...";

    try {
      await this.loadTree();
      await this.loadPendingCount();

      // Select first node if available
      if (this.flatNodes.length > 0) {
        this.state.selectedNodeId = this.flatNodes[0].id;
        await this.loadDetailForNode(this.flatNodes[0]);
      }
    } finally {
      this.state.isLoading = false;
      this.state.loadingMessage = "";
      this.state.lastRefresh = Date.now();
    }
  }

  /**
   * Refresh data if stale (>30 seconds)
   */
  async refreshIfStale(): Promise<void> {
    const staleMs = 30000; // 30 seconds
    if (Date.now() - this.state.lastRefresh > staleMs) {
      await this.refresh();
    }
  }

  /**
   * Force refresh all data
   */
  override async refresh(): Promise<void> {
    this.state.isLoading = true;
    this.state.loadingMessage = "Refreshing...";

    try {
      await this.loadTree();
      await this.loadPendingCount();
      this.state.lastRefresh = Date.now();
    } finally {
      this.state.isLoading = false;
      this.state.loadingMessage = "";
    }
  }

  /**
   * Load the memory bank tree structure
   */
  async loadTree(): Promise<void> {
    const projects = await this.service.getProjects();
    const globalMemory = await this.service.getGlobalMemory();
    const pending = await this.service.listPending();
    const executions = await this.service.getExecutionHistory({ limit: 20 });

    const tree: TreeNode[] = [];

    // Global Memory node
    const globalLearningsCount = globalMemory?.learnings?.length ?? 0;
    tree.push({
      id: "global",
      type: "scope",
      label: `Global Memory`,
      expanded: false,
      children: [],
      badge: globalLearningsCount,
      data: globalMemory,
    });

    // Projects node
    const projectsNode: TreeNode = {
      id: "projects",
      type: "scope",
      label: "Projects",
      expanded: true,
      children: [],
      badge: projects.length,
    };

    for (const portal of projects) {
      const projectMemory = await this.service.getProjectMemory(portal);
      const patternCount = projectMemory?.patterns?.length ?? 0;
      projectsNode.children.push({
        id: `project:${portal}`,
        type: "project",
        label: portal,
        expanded: false,
        children: [],
        badge: patternCount,
        data: projectMemory,
      });
    }
    tree.push(projectsNode);

    // Executions node
    const executionsNode: TreeNode = {
      id: "executions",
      type: "scope",
      label: "Executions",
      expanded: false,
      children: [],
      badge: executions.length,
    };

    for (const exec of executions.slice(0, 10)) {
      executionsNode.children.push({
        id: `execution:${exec.trace_id}`,
        type: "execution",
        label: `${exec.trace_id.slice(0, 8)}... ${exec.summary?.slice(0, 30) ?? ""}`,
        expanded: false,
        children: [],
        data: exec,
      });
    }
    tree.push(executionsNode);

    // Pending node
    if (pending.length > 0) {
      const pendingNode: TreeNode = {
        id: "pending",
        type: "scope",
        label: "Pending",
        expanded: false,
        children: [],
        badge: pending.length,
      };

      for (const proposal of pending) {
        pendingNode.children.push({
          id: `pending:${proposal.id}`,
          type: "learning",
          label: proposal.learning.title,
          expanded: false,
          children: [],
          data: proposal,
        });
      }
      tree.push(pendingNode);
    }

    this.state.tree = tree;
    this.flattenTree();
  }

  /**
   * Load pending proposals count
   */
  async loadPendingCount(): Promise<void> {
    const pending = await this.service.listPending();
    this.state.pendingCount = pending.length;
  }

  /**
   * Flatten tree for navigation
   */
  private flattenTree(): void {
    this.flatNodes = [];
    const flatten = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        this.flatNodes.push(node);
        if (node.expanded && node.children.length > 0) {
          flatten(node.children);
        }
      }
    };
    flatten(this.state.tree);
  }

  // ===== Navigation =====

  /**
   * Handle keyboard input
   */
  async handleKey(key: string): Promise<void> {
    // Dialog mode handling
    if (this.state.activeDialog && this.state.activeDialog.isActive()) {
      this.state.activeDialog.handleKey(key);
      if (!this.state.activeDialog.isActive()) {
        await this.processDialogResult();
      }
      return;
    }

    // Search mode handling
    if (this.state.searchActive) {
      if (key === "escape") {
        this.state.searchActive = false;
        this.state.searchQuery = "";
        await this.loadTree();
        return;
      }
      if (key === "enter") {
        await this.executeSearch();
        this.state.searchActive = false;
        return;
      }
      if (key === "backspace") {
        this.state.searchQuery = this.state.searchQuery.slice(0, -1);
        return;
      }
      if (key.length === 1) {
        this.state.searchQuery += key;
        return;
      }
      return;
    }

    // Shortcut keys
    switch (key) {
      case "g":
        await this.jumpToScope("global");
        return;
      case "p":
        await this.jumpToScope("projects");
        return;
      case "e":
        await this.jumpToScope("executions");
        return;
      case "n":
        await this.jumpToScope("pending");
        return;
      case "s":
      case "/":
        this.state.searchActive = true;
        this.state.searchQuery = "";
        return;
      case "?":
        this.state.detailContent = this.renderHelpContent();
        return;
      case "a":
        await this.approveSelectedProposal();
        return;
      case "r":
        await this.rejectSelectedProposal();
        return;
      case "A":
        await this.approveAllProposals();
        return;
      case "L":
        this.openAddLearningDialog();
        return;
      case "P":
        this.promoteSelectedLearning();
        return;
      case "R":
        await this.refresh();
        return;
    }

    // Navigation keys
    if (this.flatNodes.length === 0) return;

    const currentIndex = this.flatNodes.findIndex((n) => n.id === this.state.selectedNodeId);

    switch (key) {
      case "up":
        if (currentIndex > 0) {
          this.state.selectedNodeId = this.flatNodes[currentIndex - 1].id;
          await this.loadDetailForNode(this.flatNodes[currentIndex - 1]);
        }
        break;
      case "down":
        if (currentIndex < this.flatNodes.length - 1) {
          this.state.selectedNodeId = this.flatNodes[currentIndex + 1].id;
          await this.loadDetailForNode(this.flatNodes[currentIndex + 1]);
        }
        break;
      case "enter":
      case "right":
        await this.toggleExpand();
        break;
      case "left":
        await this.collapseOrParent();
        break;
      case "home":
        this.state.selectedNodeId = this.flatNodes[0].id;
        await this.loadDetailForNode(this.flatNodes[0]);
        break;
      case "end":
        this.state.selectedNodeId = this.flatNodes[this.flatNodes.length - 1].id;
        await this.loadDetailForNode(this.flatNodes[this.flatNodes.length - 1]);
        break;
    }
  }

  /**
   * Jump to a specific scope
   */
  async jumpToScope(scope: MemoryScope): Promise<void> {
    this.state.activeScope = scope;
    const scopeNode = this.flatNodes.find((n) => n.id === scope);
    if (scopeNode) {
      this.state.selectedNodeId = scopeNode.id;
      await this.loadDetailForNode(scopeNode);
    }
  }

  /**
   * Toggle expand/collapse on current node
   */
  async toggleExpand(): Promise<void> {
    const node = this.findNodeById(this.state.selectedNodeId);
    if (!node) return;

    if (node.children.length > 0) {
      node.expanded = !node.expanded;
      this.flattenTree();
    }
    await this.loadDetailForNode(node);
  }

  /**
   * Collapse current node or move to parent
   */
  async collapseOrParent(): Promise<void> {
    const node = this.findNodeById(this.state.selectedNodeId);
    if (!node) return;

    if (node.expanded && node.children.length > 0) {
      node.expanded = false;
      this.flattenTree();
    } else {
      // Move to parent
      const parent = this.findParentNode(this.state.selectedNodeId);
      if (parent) {
        this.state.selectedNodeId = parent.id;
        await this.loadDetailForNode(parent);
      }
    }
  }

  /**
   * Find a node by ID in the tree
   */
  findNodeById(nodeId: string | null): TreeNode | null {
    if (!nodeId) return null;
    const find = (nodes: TreeNode[]): TreeNode | null => {
      for (const node of nodes) {
        if (node.id === nodeId) return node;
        const found = find(node.children);
        if (found) return found;
      }
      return null;
    };
    return find(this.state.tree);
  }

  /**
   * Find parent node
   */
  private findParentNode(nodeId: string | null): TreeNode | null {
    if (!nodeId) return null;
    const findParent = (nodes: TreeNode[], parent: TreeNode | null): TreeNode | null => {
      for (const node of nodes) {
        if (node.id === nodeId) return parent;
        const found = findParent(node.children, node);
        if (found) return found;
      }
      return null;
    };
    return findParent(this.state.tree, null);
  }

  // ===== Actions =====

  /**
   * Open approve dialog for selected pending proposal
   */
  async approveSelectedProposal(): Promise<void> {
    const node = this.findNodeById(this.state.selectedNodeId);
    if (!node || !node.id.startsWith("pending:")) {
      this.statusMessage = "Select a pending proposal to approve";
      return;
    }

    const proposalId = node.id.replace("pending:", "");
    const proposal = await this.service.getPending(proposalId);
    if (!proposal) {
      this.statusMessage = "Proposal not found";
      return;
    }

    this.state.activeDialog = new ConfirmApproveDialog(proposal);
  }

  /**
   * Open reject dialog for selected pending proposal
   */
  async rejectSelectedProposal(): Promise<void> {
    const node = this.findNodeById(this.state.selectedNodeId);
    if (!node || !node.id.startsWith("pending:")) {
      this.statusMessage = "Select a pending proposal to reject";
      return;
    }

    const proposalId = node.id.replace("pending:", "");
    const proposal = await this.service.getPending(proposalId);
    if (!proposal) {
      this.statusMessage = "Proposal not found";
      return;
    }

    this.state.activeDialog = new ConfirmRejectDialog(proposal);
  }

  /**
   * Open bulk approve dialog
   */
  async approveAllProposals(): Promise<void> {
    const pending = await this.service.listPending();
    if (pending.length === 0) {
      this.statusMessage = "No pending proposals to approve";
      return;
    }

    this.state.activeDialog = new BulkApproveDialog(pending.length);
  }

  /**
   * Open add learning dialog
   */
  openAddLearningDialog(): void {
    const node = this.findNodeById(this.state.selectedNodeId);
    let defaultPortal: string | undefined;

    if (node?.id.startsWith("project:")) {
      defaultPortal = node.id.replace("project:", "");
    }

    this.state.activeDialog = new AddLearningDialog(defaultPortal);
  }

  /**
   * Open promote dialog for selected learning
   */
  promoteSelectedLearning(): void {
    const node = this.findNodeById(this.state.selectedNodeId);
    if (!node || node.type !== "learning") {
      this.statusMessage = "Select a learning to promote";
      return;
    }

    // Check if it's a project learning
    const parent = this.findParentNode(node.id);
    if (!parent || !parent.id.startsWith("project:")) {
      this.statusMessage = "Can only promote project learnings";
      return;
    }

    const portal = parent.id.replace("project:", "");
    this.state.activeDialog = new PromoteDialog(node.label, portal);
  }

  /**
   * Process dialog result after it closes
   */
  private async processDialogResult(): Promise<void> {
    const dialog = this.state.activeDialog;
    if (!dialog) return;

    this.state.activeDialog = null;

    // Handle different dialog types with typed results
    if (dialog instanceof ConfirmApproveDialog) {
      const result = dialog.getResult();
      if (result.type === "cancelled") {
        this.statusMessage = "Cancelled";
        return;
      }
      try {
        await this.service.approvePending(result.value.proposalId);
        this.statusMessage = "Proposal approved";
        await this.loadTree();
        await this.loadPendingCount();
      } catch (e) {
        this.statusMessage = `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else if (dialog instanceof ConfirmRejectDialog) {
      const result = dialog.getResult();
      if (result.type === "cancelled") {
        this.statusMessage = "Cancelled";
        return;
      }
      try {
        await this.service.rejectPending(result.value.proposalId, result.value.reason);
        this.statusMessage = "Proposal rejected";
        await this.loadTree();
        await this.loadPendingCount();
      } catch (e) {
        this.statusMessage = `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else if (dialog instanceof BulkApproveDialog) {
      const result = dialog.getResult();
      if (result.type === "cancelled") {
        this.statusMessage = "Cancelled";
        return;
      }
      try {
        const pending = await this.service.listPending();
        let approved = 0;
        for (const proposal of pending) {
          await this.service.approvePending(proposal.id);
          approved++;
        }
        this.statusMessage = `Approved ${approved} proposals`;
        await this.loadTree();
        await this.loadPendingCount();
      } catch (e) {
        this.statusMessage = `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else if (dialog instanceof AddLearningDialog) {
      const result = dialog.getResult();
      if (result.type === "cancelled") {
        this.statusMessage = "Cancelled";
        return;
      }
      // AddLearning would require additional service method
      this.statusMessage = "Learning add not implemented yet";
    } else if (dialog instanceof PromoteDialog) {
      const result = dialog.getResult();
      if (result.type === "cancelled") {
        this.statusMessage = "Cancelled";
        return;
      }
      // Promote would require additional service method
      this.statusMessage = "Promote not implemented yet";
    }
  }

  // ===== Detail Content =====

  /**
   * Load detail content for a node
   */
  async loadDetailForNode(node: TreeNode): Promise<void> {
    switch (node.type) {
      case "scope":
        this.state.detailContent = this.renderScopeDetail(node);
        break;
      case "project":
        this.state.detailContent = await this.renderProjectDetail(node);
        break;
      case "execution":
        this.state.detailContent = await this.renderExecutionDetail(node);
        break;
      case "learning":
        this.state.detailContent = this.renderLearningDetail(node);
        break;
      default:
        this.state.detailContent = `Selected: ${node.label}`;
    }
  }

  private renderScopeDetail(node: TreeNode): string {
    if (node.id === "global") {
      const memory = node.data as GlobalMemory | null;
      if (!memory) return "Global memory not initialized.\n\nRun: exoctl memory global show";
      return [
        "# Global Memory",
        "",
        `Learnings: ${memory.learnings?.length ?? 0}`,
        `Patterns: ${memory.patterns?.length ?? 0}`,
        `Anti-patterns: ${memory.anti_patterns?.length ?? 0}`,
        "",
        "## Recent Learnings",
        ...(memory.learnings?.slice(0, 5).map((l) => `- ${l.title} [${l.category}]`) ?? []),
      ].join("\n");
    }
    if (node.id === "projects") {
      return [
        "# Projects",
        "",
        `${node.badge ?? 0} project memories`,
        "",
        "Select a project to view details.",
      ].join("\n");
    }
    if (node.id === "executions") {
      return [
        "# Executions",
        "",
        `${node.badge ?? 0} total executions`,
        "",
        "Select an execution to view details.",
      ].join("\n");
    }
    if (node.id === "pending") {
      return [
        "# Pending Proposals",
        "",
        `${node.badge ?? 0} proposals awaiting review`,
        "",
        "Press [a] to approve, [r] to reject.",
      ].join("\n");
    }
    return `Scope: ${node.label}`;
  }

  private async renderProjectDetail(node: TreeNode): Promise<string> {
    const portal = node.id.replace("project:", "");
    const memory = node.data as ProjectMemory | null;
    if (!memory) {
      const fresh = await this.service.getProjectMemory(portal);
      if (!fresh) return `Project '${portal}' has no memory bank.`;
      return this.formatProjectMemory(portal, fresh);
    }
    return this.formatProjectMemory(portal, memory);
  }

  private formatProjectMemory(portal: string, memory: ProjectMemory): string {
    const lines = [
      `# Project: ${portal}`,
      "",
    ];

    if (memory.overview) {
      lines.push("## Overview");
      lines.push(memory.overview.slice(0, 200) + (memory.overview.length > 200 ? "..." : ""));
      lines.push("");
    }

    if (memory.patterns && memory.patterns.length > 0) {
      lines.push("## Patterns");
      for (const p of memory.patterns.slice(0, 5)) {
        lines.push(`- ${p.name} [${p.tags?.join(", ") ?? ""}]`);
      }
      lines.push("");
    }

    if (memory.decisions && memory.decisions.length > 0) {
      lines.push("## Decisions");
      for (const d of memory.decisions.slice(0, 5)) {
        lines.push(`- ${d.decision}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private async renderExecutionDetail(node: TreeNode): Promise<string> {
    const traceId = node.id.replace("execution:", "");
    const memory = node.data as ExecutionMemory | null;
    if (!memory) {
      const fresh = await this.service.getExecutionByTraceId(traceId);
      if (!fresh) return `Execution '${traceId}' not found.`;
      return this.formatExecutionMemory(fresh);
    }
    return this.formatExecutionMemory(memory);
  }

  private formatExecutionMemory(memory: ExecutionMemory): string {
    const lines = [
      `# Execution: ${memory.trace_id.slice(0, 8)}...`,
      "",
      `**Status:** ${memory.status}`,
      `**Agent:** ${memory.agent}`,
      `**Portal:** ${memory.portal}`,
      `**Started:** ${memory.started_at}`,
      memory.completed_at ? `**Completed:** ${memory.completed_at}` : "",
      "",
    ];

    if (memory.summary) {
      lines.push("## Summary");
      lines.push(memory.summary.slice(0, 200));
      lines.push("");
    }

    if (memory.changes) {
      const totalChanges = (memory.changes.files_created?.length ?? 0) +
        (memory.changes.files_modified?.length ?? 0) +
        (memory.changes.files_deleted?.length ?? 0);
      if (totalChanges > 0) {
        lines.push("## Changes");
        if (memory.changes.files_created?.length) {
          lines.push(`  Created: ${memory.changes.files_created.length} files`);
        }
        if (memory.changes.files_modified?.length) {
          lines.push(`  Modified: ${memory.changes.files_modified.length} files`);
        }
        if (memory.changes.files_deleted?.length) {
          lines.push(`  Deleted: ${memory.changes.files_deleted.length} files`);
        }
        lines.push("");
      }
    }

    if (memory.lessons_learned && memory.lessons_learned.length > 0) {
      lines.push("## Lessons Learned");
      for (const lesson of memory.lessons_learned) {
        lines.push(`- ${lesson}`);
      }
    }

    return lines.filter((l) => l !== "").join("\n");
  }

  private renderLearningDetail(node: TreeNode): string {
    const proposal = node.data as MemoryUpdateProposal | null;
    if (!proposal) return `Learning: ${node.label}`;

    const learning = proposal.learning;
    const useColors = this.state.useColors;

    // Build content with color badges
    const categoryBadge = renderCategoryBadge(learning.category, useColors);
    const confidenceBadge = renderConfidence(learning.confidence, useColors);

    const content = [
      `# ${learning.title}`,
      "",
      `**Category:** ${categoryBadge}`,
      `**Confidence:** ${confidenceBadge}`,
      `**Scope:** ${proposal.target_scope}`,
      proposal.target_project ? `**Project:** ${proposal.target_project}` : "",
      `**Tags:** ${learning.tags?.join(", ") ?? "none"}`,
      "",
      "## Description",
      learning.description,
      "",
      "## Reason for Proposal",
      proposal.reason,
      "",
      `[a] Approve  [r] Reject`,
    ].filter((l) => l !== "").join("\n");

    return renderMarkdown(content, { useColors });
  }

  // ===== Search =====

  /**
   * Execute search query
   */
  async executeSearch(): Promise<void> {
    if (!this.state.searchQuery.trim()) {
      await this.loadTree();
      return;
    }

    const results = await this.service.search(this.state.searchQuery);

    // Build search results tree
    const searchNode: TreeNode = {
      id: "search-results",
      type: "scope",
      label: `Search: "${this.state.searchQuery}"`,
      expanded: true,
      children: [],
      badge: results.length,
    };

    for (const result of results.slice(0, 20)) {
      const score = result.relevance_score?.toFixed(2) ?? "0.00";
      searchNode.children.push({
        id: `search:${result.id ?? result.trace_id ?? result.title}`,
        type: "learning",
        label: `${result.title} (${score})`,
        expanded: false,
        children: [],
        data: result,
      });
    }

    this.state.tree = [searchNode];
    this.flattenTree();

    if (this.flatNodes.length > 0) {
      this.state.selectedNodeId = this.flatNodes[0].id;
    }

    this.state.detailContent = [
      `# Search Results`,
      "",
      `Found ${results.length} results for "${this.state.searchQuery}"`,
      "",
      ...results.slice(0, 10).map((r) => {
        const score = r.relevance_score?.toFixed(2) ?? "0.00";
        return `- ${r.title} [${r.type}] (score: ${score})`;
      }),
    ].join("\n");
  }

  // ===== Help =====

  private renderHelpContent(): string {
    return [
      "# Memory View Help",
      "",
      "## Navigation",
      "- ↑/↓: Navigate items",
      "- ←/→: Collapse/Expand",
      "- Enter: Select/Toggle",
      "- Home/End: First/Last item",
      "",
      "## Shortcuts",
      "- g: Jump to Global Memory",
      "- p: Jump to Projects",
      "- e: Jump to Executions",
      "- n: Jump to Pending",
      "- s or /: Search",
      "- R: Refresh data",
      "- ?: Show this help",
      "",
      "## Actions",
      "- a: Approve selected proposal",
      "- r: Reject selected proposal",
      "- A: Approve all pending",
      "- L: Add new learning",
      "- P: Promote to global",
      "",
      "Press any key to close.",
    ].join("\n");
  }

  // ===== Rendering =====

  /**
   * Render the tree panel
   */
  renderTreePanel(): string {
    // Show loading state
    if (this.state.isLoading) {
      const spinner = renderSpinner(this.state.spinnerFrame);
      return `${spinner} ${this.state.loadingMessage}`;
    }

    const lines: string[] = [];
    const renderNode = (node: TreeNode, indent: number) => {
      const prefix = "  ".repeat(indent);
      const arrow = node.children.length > 0 ? (node.expanded ? "▾" : "▸") : " ";
      const badge = node.badge !== undefined ? ` (${node.badge})` : "";
      const selected = node.id === this.state.selectedNodeId ? ">" : " ";
      lines.push(`${selected}${prefix}${arrow} ${node.label}${badge}`);

      if (node.expanded) {
        for (const child of node.children) {
          renderNode(child, indent + 1);
        }
      }
    };

    for (const node of this.state.tree) {
      renderNode(node, 0);
    }

    return lines.join("\n");
  }

  /**
   * Render the status bar
   */
  renderStatusBar(): string {
    if (this.state.isLoading) {
      const spinner = renderSpinner(this.state.spinnerFrame);
      return `${spinner} ${this.state.loadingMessage}`;
    }
    if (this.state.searchActive) {
      return `Search: ${this.state.searchQuery}█`;
    }
    const pending = this.state.pendingCount > 0 ? ` | ${this.state.pendingCount} pending` : "";
    return `[g]lobal [p]rojects [e]xecutions [s]earch [R]efresh [?]help${pending}`;
  }

  /**
   * Render action buttons for current selection
   */
  renderActionButtons(): string {
    const node = this.findNodeById(this.state.selectedNodeId);
    if (!node) return "[L] Add Learning";

    if (node.id.startsWith("pending:")) {
      return "[a] Approve  [r] Reject  [A] Approve All  [Enter] View Details";
    }
    if (node.id === "pending") {
      return "[A] Approve All  [Enter] Expand";
    }
    if (node.type === "project") {
      return "[L] Add Learning  [Enter] View  [Tab] Switch Panel";
    }
    if (node.type === "learning") {
      const parent = this.findParentNode(node.id);
      if (parent?.id.startsWith("project:")) {
        return "[P] Promote to Global  [Enter] View Details";
      }
    }
    return "[L] Add Learning  [Enter] Select  [Tab] Switch Panel";
  }

  /**
   * Get focusable elements for accessibility
   */
  getFocusableElements(): string[] {
    return ["tree-panel", "detail-panel", "search-input", "action-buttons"];
  }

  /**
   * Render dialog overlay if active
   */
  renderDialog(width: number, height: number): string | null {
    if (!this.state.activeDialog || !this.state.activeDialog.isActive()) {
      return null;
    }
    return this.state.activeDialog.render(width, height);
  }
}

// ===== View =====

/**
 * Memory Bank View
 *
 * Controller for Memory Bank TUI interface.
 */
export class MemoryView {
  private service: MemoryServiceInterface;

  constructor(service: MemoryServiceInterface) {
    this.service = service;
  }

  /**
   * Create a new TUI session
   */
  createTuiSession(): MemoryViewTuiSession {
    return new MemoryViewTuiSession(this.service);
  }

  /**
   * Get the service for direct access
   */
  getService(): MemoryServiceInterface {
    return this.service;
  }
}
