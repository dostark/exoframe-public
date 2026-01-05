/**
 * Skills Manager TUI View
 *
 * Interactive view for managing Skills in the TUI dashboard.
 * Part of Phase 17.13: TUI Skills Support
 *
 * Features:
 * - Tree navigation for skills by source (core/project/learned)
 * - Detail panel with skill information
 * - Search and filtering
 * - Keyboard shortcuts
 */

import { TuiSessionBase } from "./tui_common.ts";
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
import { createSpinnerState, type SpinnerState, startSpinner, stopSpinner } from "./utils/spinner.ts";

// ===== Service Interface =====

/**
 * Skill data for TUI display
 */
export interface SkillSummary {
  id: string;
  name: string;
  version: string;
  status: "active" | "draft" | "deprecated";
  source: "core" | "project" | "learned";
  description?: string;
  triggers?: {
    keywords?: string[];
    taskTypes?: string[];
    filePatterns?: string[];
  };
  instructions?: string;
}

/**
 * Service interface for skills operations
 */
export interface SkillsViewService {
  listSkills(filter?: { source?: string; status?: string }): Promise<SkillSummary[]>;
  getSkill(skillId: string): Promise<SkillSummary | null>;
  deleteSkill(skillId: string): Promise<boolean>;
}

// ===== View State =====

export interface SkillsViewState {
  selectedSkillId: string | null;
  skillTree: TreeNode<unknown>[];
  showHelp: boolean;
  showDetail: boolean;
  detailContent: string;
  activeDialog: ConfirmDialog | InputDialog | null;
  searchQuery: string;
  filterSource: "all" | "core" | "project" | "learned";
  filterStatus: "all" | "active" | "draft" | "deprecated";
  groupBy: "source" | "status" | "none";
}

// ===== Icons and Visual Constants =====

export const SOURCE_ICONS: Record<string, string> = {
  core: "📦",
  project: "📁",
  learned: "📚",
};

export const STATUS_ICONS: Record<string, string> = {
  active: "🟢",
  draft: "🟡",
  deprecated: "⚫",
};

export const SKILL_ICON = "🎯";

// ===== Key Bindings =====

export const SKILLS_KEY_BINDINGS: KeyBinding[] = [
  { key: "↑/↓", description: "Navigate skills", action: "navigate" },
  { key: "Home/End", description: "Jump to first/last", action: "navigate-edge" },
  { key: "←/→", description: "Collapse/Expand group", action: "collapse-expand" },
  { key: "Enter", description: "View skill details", action: "view-detail" },
  { key: "d", description: "Delete skill", action: "delete" },
  { key: "/", description: "Search skills", action: "search" },
  { key: "f", description: "Filter by source", action: "filter-source" },
  { key: "s", description: "Filter by status", action: "filter-status" },
  { key: "g", description: "Toggle grouping", action: "toggle-grouping" },
  { key: "R", description: "Force refresh", action: "refresh" },
  { key: "c/E", description: "Collapse/Expand all", action: "collapse-expand-all" },
  { key: "?", description: "Show help", action: "help" },
  { key: "q/Esc", description: "Back/Close", action: "back" },
];

// ===== Help Sections =====

const SKILLS_HELP_SECTIONS: HelpSection[] = [
  {
    title: "Navigation",
    items: [
      { key: "↑/↓ or j/k", description: "Move up/down" },
      { key: "Home/End", description: "Jump to first/last" },
      { key: "← / →", description: "Collapse/Expand group" },
      { key: "Enter", description: "View skill details" },
    ],
  },
  {
    title: "Actions",
    items: [
      { key: "d", description: "Delete selected skill" },
      { key: "/", description: "Search skills" },
      { key: "f", description: "Filter by source" },
      { key: "s", description: "Filter by status" },
      { key: "g", description: "Cycle grouping mode" },
      { key: "R", description: "Force refresh" },
    ],
  },
  {
    title: "View Controls",
    items: [
      { key: "c", description: "Collapse all groups" },
      { key: "E", description: "Expand all groups" },
      { key: "?", description: "Toggle this help" },
      { key: "q / Esc", description: "Close detail/help/dialog" },
    ],
  },
];

// ===== Skills Manager View Class =====

/**
 * View/controller for skills management
 */
export class SkillsManagerView {
  private selectedSkillId: string | null = null;
  private skills: SkillSummary[] = [];

  constructor(private readonly skillsService: SkillsViewService) {}

  async getSkillsList(filter?: { source?: string; status?: string }): Promise<SkillSummary[]> {
    this.skills = await this.skillsService.listSkills(filter);
    return this.skills;
  }

  getCachedSkills(): SkillSummary[] {
    return [...this.skills];
  }

  async getSkillDetail(skillId: string): Promise<SkillSummary | null> {
    return await this.skillsService.getSkill(skillId);
  }

  async deleteSkill(skillId: string): Promise<boolean> {
    return await this.skillsService.deleteSkill(skillId);
  }

  selectSkill(skillId: string): void {
    this.selectedSkillId = skillId;
  }

  getSelectedSkill(): string | null {
    return this.selectedSkillId;
  }

  createTuiSession(useColors = true): SkillsManagerTuiSession {
    return new SkillsManagerTuiSession(this, useColors);
  }
}

// ===== Minimal Mock for Tests =====

export class MinimalSkillsServiceMock implements SkillsViewService {
  private skills: SkillSummary[] = [];

  constructor(skills: SkillSummary[] = []) {
    this.skills = skills;
  }

  listSkills(filter?: { source?: string; status?: string }): Promise<SkillSummary[]> {
    let result = [...this.skills];
    if (filter?.source) {
      result = result.filter((s) => s.source === filter.source);
    }
    if (filter?.status) {
      result = result.filter((s) => s.status === filter.status);
    }
    return Promise.resolve(result);
  }

  getSkill(skillId: string): Promise<SkillSummary | null> {
    return Promise.resolve(this.skills.find((s) => s.id === skillId) || null);
  }

  deleteSkill(skillId: string): Promise<boolean> {
    const idx = this.skills.findIndex((s) => s.id === skillId);
    if (idx >= 0) {
      this.skills.splice(idx, 1);
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  setSkills(skills: SkillSummary[]): void {
    this.skills = skills;
  }
}

// ===== TUI Session Class =====

/**
 * Interactive TUI session for Skills Manager View
 */
export class SkillsManagerTuiSession extends TuiSessionBase {
  private readonly skillsView: SkillsManagerView;
  private state: SkillsViewState;
  private localSpinnerState: SpinnerState;
  private skills: SkillSummary[] = [];
  private pendingDeleteSkillId: string | null = null;
  private pendingDialogType: string | null = null;

  constructor(skillsView: SkillsManagerView, useColors = true) {
    super(useColors);
    this.skillsView = skillsView;
    this.localSpinnerState = createSpinnerState();
    this.state = {
      selectedSkillId: null,
      skillTree: [],
      showHelp: false,
      showDetail: false,
      detailContent: "",
      activeDialog: null,
      searchQuery: "",
      filterSource: "all",
      filterStatus: "all",
      groupBy: "source",
    };
  }

  // ===== Initialization =====

  async initialize(): Promise<void> {
    this.localSpinnerState = startSpinner(this.localSpinnerState, "Loading skills...");
    try {
      await this.loadSkills();
      this.buildTree();

      // Select first skill if available
      const firstId = getFirstNodeId(this.state.skillTree);
      if (firstId && !this.isGroupNode(firstId)) {
        this.state.selectedSkillId = firstId;
      }
    } finally {
      this.localSpinnerState = stopSpinner(this.localSpinnerState);
    }
  }

  private async loadSkills(): Promise<void> {
    const filter: { source?: string; status?: string } = {};
    if (this.state.filterSource !== "all") {
      filter.source = this.state.filterSource;
    }
    if (this.state.filterStatus !== "all") {
      filter.status = this.state.filterStatus;
    }
    this.skills = await this.skillsView.getSkillsList(filter);
  }

  // ===== Tree Building =====

  private buildTree(): void {
    let filteredSkills = [...this.skills];

    // Apply search filter
    if (this.state.searchQuery) {
      const query = this.state.searchQuery.toLowerCase();
      filteredSkills = filteredSkills.filter(
        (s) =>
          s.id.toLowerCase().includes(query) ||
          s.name.toLowerCase().includes(query) ||
          s.triggers?.keywords?.some((k) => k.toLowerCase().includes(query)),
      );
    }

    // Build tree based on grouping
    if (this.state.groupBy === "none") {
      this.state.skillTree = filteredSkills.map((s) => this.createSkillNode(s));
    } else if (this.state.groupBy === "source") {
      this.state.skillTree = this.buildGroupedTree(filteredSkills, "source");
    } else {
      this.state.skillTree = this.buildGroupedTree(filteredSkills, "status");
    }
  }

  private buildGroupedTree(skills: SkillSummary[], groupBy: "source" | "status"): TreeNode[] {
    const groups = new Map<string, SkillSummary[]>();

    for (const skill of skills) {
      const key = groupBy === "source" ? skill.source : skill.status;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(skill);
    }

    const tree: TreeNode[] = [];
    const order = groupBy === "source" ? ["core", "project", "learned"] : ["active", "draft", "deprecated"];

    for (const key of order) {
      const groupSkills = groups.get(key);
      if (groupSkills && groupSkills.length > 0) {
        const icon = groupBy === "source" ? SOURCE_ICONS[key] : STATUS_ICONS[key];
        const label = `${icon} ${key.charAt(0).toUpperCase() + key.slice(1)} Skills (${groupSkills.length})`;
        tree.push(
          createGroupNode(
            `group-${key}`,
            label,
            "group",
            groupSkills.map((s) => this.createSkillNode(s)),
            { expanded: true },
          ),
        );
      }
    }

    return tree;
  }

  private createSkillNode(skill: SkillSummary): TreeNode {
    const statusIcon = STATUS_ICONS[skill.status] || "⚪";
    return createNode(`skill-${skill.id}`, `${SKILL_ICON} ${skill.name} ${statusIcon}`, "skill");
  }

  private isGroupNode(nodeId: string): boolean {
    return nodeId.startsWith("group-");
  }

  private getSkillIdFromNodeId(nodeId: string): string | null {
    if (nodeId.startsWith("skill-")) {
      return nodeId.substring(6);
    }
    return null;
  }

  // ===== Navigation =====

  navigateUp(): void {
    if (this.state.selectedSkillId) {
      const prevId = getPrevNodeId(this.state.skillTree, this.state.selectedSkillId);
      if (prevId) {
        this.state.selectedSkillId = prevId;
      }
    }
  }

  navigateDown(): void {
    if (this.state.selectedSkillId) {
      const nextId = getNextNodeId(this.state.skillTree, this.state.selectedSkillId);
      if (nextId) {
        this.state.selectedSkillId = nextId;
      }
    } else {
      // No selection, go to first
      const firstId = getFirstNodeId(this.state.skillTree);
      if (firstId) {
        this.state.selectedSkillId = firstId;
      }
    }
  }

  navigateToFirst(): void {
    const firstId = getFirstNodeId(this.state.skillTree);
    if (firstId) {
      this.state.selectedSkillId = firstId;
    }
  }

  navigateToLast(): void {
    const lastId = getLastNodeId(this.state.skillTree);
    if (lastId) {
      this.state.selectedSkillId = lastId;
    }
  }

  toggleExpand(): void {
    if (this.state.selectedSkillId) {
      const node = findNode(this.state.skillTree, this.state.selectedSkillId);
      if (node && node.children.length > 0) {
        toggleNode(this.state.skillTree, this.state.selectedSkillId);
      }
    }
  }

  expandAll(): void {
    expandAll(this.state.skillTree);
  }

  collapseAll(): void {
    collapseAll(this.state.skillTree);
  }

  // ===== Detail View =====

  async showDetail(): Promise<void> {
    if (!this.state.selectedSkillId || this.isGroupNode(this.state.selectedSkillId)) {
      return;
    }

    const skillId = this.getSkillIdFromNodeId(this.state.selectedSkillId);
    if (!skillId) return;

    this.localSpinnerState = startSpinner(this.localSpinnerState, "Loading skill details...");
    try {
      const skill = await this.skillsView.getSkillDetail(skillId);
      if (skill) {
        this.state.detailContent = this.formatDetailContent(skill);
        this.state.showDetail = true;
      }
    } finally {
      this.localSpinnerState = stopSpinner(this.localSpinnerState);
    }
  }

  private formatDetailContent(skill: SkillSummary): string {
    const lines: string[] = [];
    lines.push(`Skill: ${skill.name}`);
    lines.push(`ID: ${skill.id}`);
    lines.push(`Version: ${skill.version}`);
    lines.push(`Status: ${STATUS_ICONS[skill.status]} ${skill.status.toUpperCase()}`);
    lines.push(`Source: ${SOURCE_ICONS[skill.source]} ${skill.source}`);

    if (skill.description) {
      lines.push("");
      lines.push("Description:");
      lines.push(`  ${skill.description}`);
    }

    if (skill.triggers) {
      lines.push("");
      lines.push("Triggers:");
      if (skill.triggers.keywords?.length) {
        lines.push(`  Keywords: ${skill.triggers.keywords.join(", ")}`);
      }
      if (skill.triggers.taskTypes?.length) {
        lines.push(`  Task Types: ${skill.triggers.taskTypes.join(", ")}`);
      }
      if (skill.triggers.filePatterns?.length) {
        lines.push(`  File Patterns: ${skill.triggers.filePatterns.join(", ")}`);
      }
    }

    if (skill.instructions) {
      lines.push("");
      lines.push("Instructions:");
      const instrLines = skill.instructions.split("\n").slice(0, 10);
      for (const line of instrLines) {
        lines.push(`  ${line}`);
      }
      if (skill.instructions.split("\n").length > 10) {
        lines.push("  ...(truncated)");
      }
    }

    return lines.join("\n");
  }

  hideDetail(): void {
    this.state.showDetail = false;
    this.state.detailContent = "";
  }

  // ===== Dialogs =====

  showSearchDialog(): void {
    this.state.activeDialog = new InputDialog({
      title: "Search Skills",
      label: "Enter search term:",
      placeholder: "name, ID, or keyword...",
      defaultValue: this.state.searchQuery,
    });
    this.pendingDialogType = "search";
  }

  showFilterSourceDialog(): void {
    this.state.activeDialog = new InputDialog({
      title: "Filter by Source",
      label: "Source (all, core, project, learned):",
      placeholder: "source...",
      defaultValue: this.state.filterSource,
    });
    this.pendingDialogType = "filter-source";
  }

  showFilterStatusDialog(): void {
    this.state.activeDialog = new InputDialog({
      title: "Filter by Status",
      label: "Status (all, active, draft, deprecated):",
      placeholder: "status...",
      defaultValue: this.state.filterStatus,
    });
    this.pendingDialogType = "filter-status";
  }

  showDeleteConfirm(): void {
    if (!this.state.selectedSkillId || this.isGroupNode(this.state.selectedSkillId)) {
      return;
    }

    const skillId = this.getSkillIdFromNodeId(this.state.selectedSkillId);
    if (!skillId) return;

    const skill = this.skills.find((s) => s.id === skillId);
    if (!skill) return;

    // Don't allow deleting core skills
    if (skill.source === "core") {
      this.setStatus("Cannot delete core skills", "error");
      return;
    }

    this.state.activeDialog = new ConfirmDialog({
      title: "Delete Skill",
      message: `Are you sure you want to delete skill "${skill.name}"?`,
      confirmText: "Delete",
      cancelText: "Cancel",
    });
    this.pendingDeleteSkillId = skillId;
  }

  // ===== Dialog Handlers =====

  private handleSearchResult(value: string): void {
    this.state.searchQuery = value;
    this.buildTree();
    this.setStatus(value ? `Search: "${value}"` : "Search cleared", "info");
  }

  private handleFilterSourceResult(value: string): void {
    const normalized = value.toLowerCase().trim();
    if (["all", "core", "project", "learned"].includes(normalized)) {
      this.state.filterSource = normalized as "all" | "core" | "project" | "learned";
      this.loadSkills().then(() => {
        this.buildTree();
        this.setStatus(`Filter: source=${normalized}`, "info");
      });
    } else {
      this.setStatus("Invalid source. Use: all, core, project, learned", "error");
    }
  }

  private handleFilterStatusResult(value: string): void {
    const normalized = value.toLowerCase().trim();
    if (["all", "active", "draft", "deprecated"].includes(normalized)) {
      this.state.filterStatus = normalized as "all" | "active" | "draft" | "deprecated";
      this.loadSkills().then(() => {
        this.buildTree();
        this.setStatus(`Filter: status=${normalized}`, "info");
      });
    } else {
      this.setStatus("Invalid status. Use: all, active, draft, deprecated", "error");
    }
  }

  private async handleDeleteConfirm(): Promise<void> {
    if (!this.pendingDeleteSkillId) return;

    try {
      this.localSpinnerState = startSpinner(this.localSpinnerState, "Deleting skill...");
      const success = await this.skillsView.deleteSkill(this.pendingDeleteSkillId);
      if (success) {
        await this.loadSkills();
        this.buildTree();
        this.setStatus(`Deleted skill: ${this.pendingDeleteSkillId}`, "success");
      } else {
        this.setStatus("Failed to delete skill", "error");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.setStatus(`Delete failed: ${msg}`, "error");
    } finally {
      this.localSpinnerState = stopSpinner(this.localSpinnerState);
      this.pendingDeleteSkillId = null;
    }
  }

  // ===== Grouping =====

  cycleGrouping(): void {
    const modes: Array<"source" | "status" | "none"> = ["source", "status", "none"];
    const currentIdx = modes.indexOf(this.state.groupBy);
    this.state.groupBy = modes[(currentIdx + 1) % modes.length];
    this.buildTree();
    this.setStatus(`Grouping: ${this.state.groupBy}`, "info");
  }

  // ===== Refresh =====

  override async refresh(): Promise<void> {
    this.localSpinnerState = startSpinner(this.localSpinnerState, "Refreshing...");
    try {
      await this.loadSkills();
      this.buildTree();
      this.setStatus("Refreshed", "success");
    } finally {
      this.localSpinnerState = stopSpinner(this.localSpinnerState);
    }
  }

  // ===== Rendering =====

  render(): string {
    const lines: string[] = [];

    // Header
    lines.push("╔══════════════════════════════════════════════════════════════╗");
    lines.push("║                    🎯 SKILLS MANAGER                         ║");
    lines.push("╠══════════════════════════════════════════════════════════════╣");

    // Filter info
    const filterInfo = [];
    if (this.state.filterSource !== "all") filterInfo.push(`source=${this.state.filterSource}`);
    if (this.state.filterStatus !== "all") filterInfo.push(`status=${this.state.filterStatus}`);
    if (this.state.searchQuery) filterInfo.push(`search="${this.state.searchQuery}"`);
    if (filterInfo.length > 0) {
      lines.push(`║ Filters: ${filterInfo.join(", ").padEnd(50)}║`);
      lines.push("╠══════════════════════════════════════════════════════════════╣");
    }

    // Tree view
    if (this.state.skillTree.length === 0) {
      lines.push("║                                                              ║");
      lines.push("║   No skills found.                                           ║");
      lines.push("║                                                              ║");
    } else {
      const treeLines = renderTree(this.state.skillTree, {
        useColors: this.useColors,
        selectedId: this.state.selectedSkillId ?? undefined,
        indentSize: 2,
      });
      for (const line of treeLines.slice(0, 15)) {
        lines.push(`║ ${line.padEnd(60)}║`);
      }
    }

    lines.push("╠══════════════════════════════════════════════════════════════╣");

    // Status bar
    const statusText = this.statusMessage || "Ready";
    lines.push(`║ ${statusText.padEnd(60)}║`);

    // Key hints
    lines.push("║ ↑↓:nav  Enter:detail  /:search  f:source  s:status  ?:help   ║");
    lines.push("╚══════════════════════════════════════════════════════════════╝");

    return lines.join("\n");
  }

  renderHelp(): string[] {
    return renderHelpScreen({
      title: "Skills Manager Help",
      sections: SKILLS_HELP_SECTIONS,
    });
  }

  renderDetail(): string {
    return this.state.detailContent;
  }

  // ===== Input Handling =====

  async handleInput(key: string): Promise<boolean> {
    // Handle dialog first
    if (this.state.activeDialog) {
      this.state.activeDialog.handleKey(key);
      if (!this.state.activeDialog.isActive()) {
        // Dialog completed
        const result = this.state.activeDialog.getResult();
        if (result.type === "confirmed") {
          if (this.state.activeDialog instanceof InputDialog) {
            const value = result.value as string;
            switch (this.pendingDialogType) {
              case "search":
                this.handleSearchResult(value);
                break;
              case "filter-source":
                this.handleFilterSourceResult(value);
                break;
              case "filter-status":
                this.handleFilterStatusResult(value);
                break;
            }
          } else if (this.state.activeDialog instanceof ConfirmDialog) {
            await this.handleDeleteConfirm();
          }
        }
        this.state.activeDialog = null;
        this.pendingDialogType = null;
      }
      return true;
    }

    // Handle help screen
    if (this.state.showHelp) {
      if (key === "q" || key === "escape" || key === "?") {
        this.state.showHelp = false;
        return true;
      }
      return true;
    }

    // Handle detail view
    if (this.state.showDetail) {
      if (key === "q" || key === "escape") {
        this.hideDetail();
        return true;
      }
      return true;
    }

    // Main view input handling
    switch (key) {
      case "up":
      case "k":
        this.navigateUp();
        return true;
      case "down":
      case "j":
        this.navigateDown();
        return true;
      case "home":
        this.navigateToFirst();
        return true;
      case "end":
        this.navigateToLast();
        return true;
      case "left":
      case "right":
        this.toggleExpand();
        return true;
      case "return":
      case "enter":
        await this.showDetail();
        return true;
      case "/":
        this.showSearchDialog();
        return true;
      case "f":
        this.showFilterSourceDialog();
        return true;
      case "s":
        this.showFilterStatusDialog();
        return true;
      case "g":
        this.cycleGrouping();
        return true;
      case "d":
        this.showDeleteConfirm();
        return true;
      case "R":
        await this.refresh();
        return true;
      case "c":
        this.collapseAll();
        return true;
      case "E":
        this.expandAll();
        return true;
      case "?":
        this.state.showHelp = true;
        return true;
      case "q":
      case "escape":
        return false; // Let parent handle exit
    }

    return false;
  }

  // ===== Getters =====

  getState(): SkillsViewState {
    return { ...this.state };
  }

  isShowingHelp(): boolean {
    return this.state.showHelp;
  }

  isShowingDetail(): boolean {
    return this.state.showDetail;
  }

  hasActiveDialog(): boolean {
    return this.state.activeDialog !== null;
  }

  renderDialog(): string[] {
    if (this.state.activeDialog) {
      return this.state.activeDialog.render({ useColors: this.useColors, width: 70, height: 10 });
    }
    return [];
  }
}

// ===== View Factory =====

/**
 * Create a SkillsManagerView instance
 */
export function createSkillsManagerView(service: SkillsViewService): SkillsManagerView {
  return new SkillsManagerView(service);
}
