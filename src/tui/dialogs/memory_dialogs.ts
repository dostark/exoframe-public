/**
 * Memory Dialogs - Interactive dialogs for memory management actions
 *
 * Part of Phase 12.13: TUI Memory View - Pending & Actions
 *
 * Provides:
 * - ConfirmApproveDialog - Confirm approval of a pending proposal
 * - ConfirmRejectDialog - Confirm rejection with optional reason
 * - AddLearningDialog - Form for manual learning entry
 * - PromoteDialog - Promote project learning to global
 */

import type { MemoryUpdateProposal } from "../../schemas/memory_bank.ts";

// ===== Dialog Types =====

export type DialogResult<T = unknown> =
  | { type: "confirmed"; value: T }
  | { type: "cancelled" };

export type DialogState = "active" | "confirmed" | "cancelled";

// ===== Base Dialog =====

export abstract class DialogBase<T = unknown> {
  protected state: DialogState = "active";
  protected focusIndex = 0;

  isActive(): boolean {
    return this.state === "active";
  }

  getState(): DialogState {
    return this.state;
  }

  abstract getFocusableElements(): string[];
  abstract handleKey(key: string): void;
  abstract render(width: number, height: number): string;
  abstract getResult(): DialogResult<T>;

  protected cancel(): void {
    this.state = "cancelled";
  }

  protected confirm(value: T): void {
    this.state = "confirmed";
    this._resultValue = value;
  }

  protected _resultValue?: T;
}

// ===== Confirm Approve Dialog =====

export interface ApproveDialogResult {
  proposalId: string;
}

export class ConfirmApproveDialog extends DialogBase<ApproveDialogResult> {
  private proposal: MemoryUpdateProposal;

  constructor(proposal: MemoryUpdateProposal) {
    super();
    this.proposal = proposal;
  }

  getFocusableElements(): string[] {
    return ["approve-btn", "cancel-btn"];
  }

  handleKey(key: string): void {
    switch (key) {
      case "left":
      case "right":
      case "tab":
        this.focusIndex = this.focusIndex === 0 ? 1 : 0;
        break;
      case "enter":
        if (this.focusIndex === 0) {
          this.confirm({ proposalId: this.proposal.id });
        } else {
          this.cancel();
        }
        break;
      case "y":
        this.confirm({ proposalId: this.proposal.id });
        break;
      case "n":
      case "escape":
        this.cancel();
        break;
    }
  }

  render(width: number, _height: number): string {
    const lines: string[] = [];
    const innerWidth = Math.min(width - 4, 70);
    const border = "─".repeat(innerWidth);

    lines.push(`┌─ Approve Proposal ${border.slice(17)}┐`);
    lines.push(`│${" ".repeat(innerWidth)}│`);
    lines.push(`│  Title: ${this.proposal.learning.title.slice(0, innerWidth - 12).padEnd(innerWidth - 10)}│`);
    lines.push(`│  Scope: ${this.proposal.target_scope.padEnd(innerWidth - 10)}│`);
    lines.push(`│  Category: ${this.proposal.learning.category.padEnd(innerWidth - 13)}│`);
    lines.push(`│${" ".repeat(innerWidth)}│`);

    // Description (truncated)
    const desc = this.proposal.learning.description?.slice(0, innerWidth - 6) ?? "(no description)";
    lines.push(`│  ${desc.padEnd(innerWidth - 2)}│`);
    lines.push(`│${" ".repeat(innerWidth)}│`);

    // Tags if available
    if (this.proposal.learning.tags && this.proposal.learning.tags.length > 0) {
      const tagsLine = `Tags: ${this.proposal.learning.tags.join(", ")}`.slice(0, innerWidth - 4);
      lines.push(`│  ${tagsLine.padEnd(innerWidth - 2)}│`);
      lines.push(`│${" ".repeat(innerWidth)}│`);
    }

    // Buttons
    const approveBtn = this.focusIndex === 0 ? "[Yes, Approve]" : " Yes, Approve ";
    const cancelBtn = this.focusIndex === 1 ? "[No, Cancel]" : " No, Cancel ";
    const buttonsLine = `${approveBtn}    ${cancelBtn}`;
    const padding = Math.floor((innerWidth - buttonsLine.length) / 2);
    lines.push(`│${" ".repeat(padding)}${buttonsLine}${" ".repeat(innerWidth - padding - buttonsLine.length)}│`);
    lines.push(`│${" ".repeat(innerWidth)}│`);
    lines.push(`└${border}┘`);

    return lines.join("\n");
  }

  getResult(): DialogResult<ApproveDialogResult> {
    if (this.state === "confirmed" && this._resultValue) {
      return { type: "confirmed", value: this._resultValue };
    }
    return { type: "cancelled" };
  }

  getProposal(): MemoryUpdateProposal {
    return this.proposal;
  }
}

// ===== Confirm Reject Dialog =====

export interface RejectDialogResult {
  proposalId: string;
  reason: string;
}

export class ConfirmRejectDialog extends DialogBase<RejectDialogResult> {
  private proposal: MemoryUpdateProposal;
  private reason = "";
  private inputActive = false;

  constructor(proposal: MemoryUpdateProposal) {
    super();
    this.proposal = proposal;
  }

  getFocusableElements(): string[] {
    return ["reason-input", "reject-btn", "cancel-btn"];
  }

  handleKey(key: string): void {
    if (this.inputActive) {
      if (key === "escape" || key === "enter") {
        this.inputActive = false;
        if (key === "enter") {
          this.focusIndex = 1; // Move to reject button
        }
      } else if (key === "backspace") {
        this.reason = this.reason.slice(0, -1);
      } else if (key.length === 1) {
        this.reason += key;
      }
      return;
    }

    switch (key) {
      case "tab":
      case "down":
        this.focusIndex = (this.focusIndex + 1) % 3;
        break;
      case "up":
        this.focusIndex = (this.focusIndex - 1 + 3) % 3;
        break;
      case "enter":
        if (this.focusIndex === 0) {
          this.inputActive = true;
        } else if (this.focusIndex === 1) {
          this.confirm({ proposalId: this.proposal.id, reason: this.reason });
        } else {
          this.cancel();
        }
        break;
      case "escape":
        this.cancel();
        break;
    }
  }

  render(width: number, _height: number): string {
    const lines: string[] = [];
    const innerWidth = Math.min(width - 4, 70);
    const border = "─".repeat(innerWidth);

    lines.push(`┌─ Reject Proposal ${border.slice(16)}┐`);
    lines.push(`│${" ".repeat(innerWidth)}│`);
    lines.push(`│  Title: ${this.proposal.learning.title.slice(0, innerWidth - 12).padEnd(innerWidth - 10)}│`);
    lines.push(`│${" ".repeat(innerWidth)}│`);

    // Reason input
    const reasonLabel = this.focusIndex === 0 ? "[Reason (optional)]:" : " Reason (optional): ";
    const reasonValue = this.reason || (this.inputActive ? "│" : "(none)");
    lines.push(`│  ${reasonLabel}${" ".repeat(Math.max(0, innerWidth - reasonLabel.length - 3))}│`);
    lines.push(`│  ${reasonValue.slice(0, innerWidth - 4).padEnd(innerWidth - 2)}│`);
    lines.push(`│${" ".repeat(innerWidth)}│`);

    // Buttons
    const rejectBtn = this.focusIndex === 1 ? "[Yes, Reject]" : " Yes, Reject ";
    const cancelBtn = this.focusIndex === 2 ? "[No, Cancel]" : " No, Cancel ";
    const buttonsLine = `${rejectBtn}    ${cancelBtn}`;
    const padding = Math.floor((innerWidth - buttonsLine.length) / 2);
    lines.push(`│${" ".repeat(padding)}${buttonsLine}${" ".repeat(innerWidth - padding - buttonsLine.length)}│`);
    lines.push(`│${" ".repeat(innerWidth)}│`);
    lines.push(`└${border}┘`);

    return lines.join("\n");
  }

  getResult(): DialogResult<RejectDialogResult> {
    if (this.state === "confirmed" && this._resultValue) {
      return { type: "confirmed", value: this._resultValue };
    }
    return { type: "cancelled" };
  }

  getReason(): string {
    return this.reason;
  }
}

// ===== Add Learning Dialog =====

export interface AddLearningResult {
  title: string;
  category: string;
  content: string;
  tags: string[];
  scope: "global" | "project";
  portal?: string;
}

export class AddLearningDialog extends DialogBase<AddLearningResult> {
  private title = "";
  private category = "pattern";
  private content = "";
  private tags = "";
  private scope: "global" | "project" = "global";
  private portal = "";
  private activeField = 0;
  private editMode = false;

  private readonly categories = [
    "pattern",
    "decision",
    "anti-pattern",
    "insight",
    "troubleshooting",
  ];

  constructor(defaultPortal?: string) {
    super();
    if (defaultPortal) {
      this.portal = defaultPortal;
      this.scope = "project";
    }
  }

  getFocusableElements(): string[] {
    return [
      "title-input",
      "category-select",
      "content-input",
      "tags-input",
      "scope-select",
      "portal-input",
      "save-btn",
      "cancel-btn",
    ];
  }

  handleKey(key: string): void {
    if (this.editMode) {
      this.handleEditModeKey(key);
      return;
    }

    switch (key) {
      case "tab":
      case "down":
        this.activeField = (this.activeField + 1) % 8;
        break;
      case "up":
        this.activeField = (this.activeField - 1 + 8) % 8;
        break;
      case "enter":
        if (this.activeField === 6) {
          // Save button
          if (this.validate()) {
            this.confirm(this.buildResult());
          }
        } else if (this.activeField === 7) {
          // Cancel button
          this.cancel();
        } else {
          this.editMode = true;
        }
        break;
      case "escape":
        this.cancel();
        break;
    }
  }

  private handleEditModeKey(key: string): void {
    if (key === "escape" || key === "enter") {
      this.editMode = false;
      return;
    }

    switch (this.activeField) {
      case 0: // title
        if (key === "backspace") {
          this.title = this.title.slice(0, -1);
        } else if (key.length === 1) {
          this.title += key;
        }
        break;
      case 1: // category - cycle through
        if (key === "left" || key === "right" || key.length === 1) {
          const idx = this.categories.indexOf(this.category);
          this.category = this.categories[(idx + 1) % this.categories.length];
        }
        break;
      case 2: // content
        if (key === "backspace") {
          this.content = this.content.slice(0, -1);
        } else if (key.length === 1) {
          this.content += key;
        }
        break;
      case 3: // tags
        if (key === "backspace") {
          this.tags = this.tags.slice(0, -1);
        } else if (key.length === 1) {
          this.tags += key;
        }
        break;
      case 4: // scope
        this.scope = this.scope === "global" ? "project" : "global";
        break;
      case 5: // portal
        if (key === "backspace") {
          this.portal = this.portal.slice(0, -1);
        } else if (key.length === 1) {
          this.portal += key;
        }
        break;
    }
  }

  private validate(): boolean {
    if (!this.title.trim()) {
      return false;
    }
    if (this.scope === "project" && !this.portal.trim()) {
      return false;
    }
    return true;
  }

  private buildResult(): AddLearningResult {
    return {
      title: this.title.trim(),
      category: this.category,
      content: this.content.trim(),
      tags: this.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t),
      scope: this.scope,
      portal: this.scope === "project" ? this.portal.trim() : undefined,
    };
  }

  render(width: number, _height: number): string {
    const lines: string[] = [];
    const innerWidth = Math.min(width - 4, 70);
    const border = "─".repeat(innerWidth);

    lines.push(`┌─ Add Learning ${border.slice(13)}┐`);
    lines.push(`│${" ".repeat(innerWidth)}│`);

    // Title
    const titleLabel = this.activeField === 0 ? "[Title]:" : " Title: ";
    const titleValue = this.title || (this.editMode && this.activeField === 0 ? "│" : "(required)");
    lines.push(`│  ${titleLabel} ${titleValue.slice(0, innerWidth - 12).padEnd(innerWidth - 11)}│`);

    // Category
    const catLabel = this.activeField === 1 ? "[Category]:" : " Category: ";
    lines.push(`│  ${catLabel} ${this.category.padEnd(innerWidth - 14)}│`);

    // Content
    const contLabel = this.activeField === 2 ? "[Content]:" : " Content: ";
    const contValue = this.content || (this.editMode && this.activeField === 2 ? "│" : "(optional)");
    lines.push(`│  ${contLabel} ${contValue.slice(0, innerWidth - 13).padEnd(innerWidth - 12)}│`);

    // Tags
    const tagsLabel = this.activeField === 3 ? "[Tags]:" : " Tags: ";
    const tagsValue = this.tags || (this.editMode && this.activeField === 3 ? "│" : "(comma-separated)");
    lines.push(`│  ${tagsLabel} ${tagsValue.slice(0, innerWidth - 10).padEnd(innerWidth - 9)}│`);

    // Scope
    const scopeLabel = this.activeField === 4 ? "[Scope]:" : " Scope: ";
    lines.push(`│  ${scopeLabel} ${this.scope.padEnd(innerWidth - 11)}│`);

    // Portal (only if project scope)
    if (this.scope === "project") {
      const portalLabel = this.activeField === 5 ? "[Portal]:" : " Portal: ";
      const portalValue = this.portal || (this.editMode && this.activeField === 5 ? "│" : "(required)");
      lines.push(`│  ${portalLabel} ${portalValue.slice(0, innerWidth - 12).padEnd(innerWidth - 11)}│`);
    }

    lines.push(`│${" ".repeat(innerWidth)}│`);

    // Buttons
    const saveBtn = this.activeField === 6 ? "[Save]" : " Save ";
    const cancelBtn = this.activeField === 7 ? "[Cancel]" : " Cancel ";
    const buttonsLine = `${saveBtn}    ${cancelBtn}`;
    const padding = Math.floor((innerWidth - buttonsLine.length) / 2);
    lines.push(`│${" ".repeat(padding)}${buttonsLine}${" ".repeat(innerWidth - padding - buttonsLine.length)}│`);
    lines.push(`│${" ".repeat(innerWidth)}│`);
    lines.push(`└${border}┘`);

    return lines.join("\n");
  }

  getResult(): DialogResult<AddLearningResult> {
    if (this.state === "confirmed" && this._resultValue) {
      return { type: "confirmed", value: this._resultValue };
    }
    return { type: "cancelled" };
  }

  // For testing
  setTitle(t: string): void {
    this.title = t;
  }
  setContent(c: string): void {
    this.content = c;
  }
  setCategory(c: string): void {
    this.category = c;
  }
  setScope(s: "global" | "project"): void {
    this.scope = s;
  }
  setPortal(p: string): void {
    this.portal = p;
  }
  getTitle(): string {
    return this.title;
  }
  getCategory(): string {
    return this.category;
  }
  getScope(): "global" | "project" {
    return this.scope;
  }
}

// ===== Promote Dialog =====

export interface PromoteDialogResult {
  learningTitle: string;
  sourcePortal: string;
}

export class PromoteDialog extends DialogBase<PromoteDialogResult> {
  private learningTitle: string;
  private sourcePortal: string;

  constructor(learningTitle: string, sourcePortal: string) {
    super();
    this.learningTitle = learningTitle;
    this.sourcePortal = sourcePortal;
  }

  getFocusableElements(): string[] {
    return ["promote-btn", "cancel-btn"];
  }

  handleKey(key: string): void {
    switch (key) {
      case "left":
      case "right":
      case "tab":
        this.focusIndex = this.focusIndex === 0 ? 1 : 0;
        break;
      case "enter":
        if (this.focusIndex === 0) {
          this.confirm({
            learningTitle: this.learningTitle,
            sourcePortal: this.sourcePortal,
          });
        } else {
          this.cancel();
        }
        break;
      case "y":
        this.confirm({
          learningTitle: this.learningTitle,
          sourcePortal: this.sourcePortal,
        });
        break;
      case "n":
      case "escape":
        this.cancel();
        break;
    }
  }

  render(width: number, _height: number): string {
    const lines: string[] = [];
    const innerWidth = Math.min(width - 4, 70);
    const border = "─".repeat(innerWidth);

    lines.push(`┌─ Promote to Global ${border.slice(18)}┐`);
    lines.push(`│${" ".repeat(innerWidth)}│`);
    lines.push(`│  Learning: ${this.learningTitle.slice(0, innerWidth - 14).padEnd(innerWidth - 12)}│`);
    lines.push(`│  From: ${this.sourcePortal.padEnd(innerWidth - 9)}│`);
    lines.push(`│${" ".repeat(innerWidth)}│`);
    lines.push(`│  This will copy the learning to Global Memory.${" ".repeat(Math.max(0, innerWidth - 47))}│`);
    lines.push(`│  The original will remain in project memory.${" ".repeat(Math.max(0, innerWidth - 46))}│`);
    lines.push(`│${" ".repeat(innerWidth)}│`);

    // Buttons
    const promoteBtn = this.focusIndex === 0 ? "[Promote]" : " Promote ";
    const cancelBtn = this.focusIndex === 1 ? "[Cancel]" : " Cancel ";
    const buttonsLine = `${promoteBtn}    ${cancelBtn}`;
    const padding = Math.floor((innerWidth - buttonsLine.length) / 2);
    lines.push(`│${" ".repeat(padding)}${buttonsLine}${" ".repeat(innerWidth - padding - buttonsLine.length)}│`);
    lines.push(`│${" ".repeat(innerWidth)}│`);
    lines.push(`└${border}┘`);

    return lines.join("\n");
  }

  getResult(): DialogResult<PromoteDialogResult> {
    if (this.state === "confirmed" && this._resultValue) {
      return { type: "confirmed", value: this._resultValue };
    }
    return { type: "cancelled" };
  }

  getLearningTitle(): string {
    return this.learningTitle;
  }

  getSourcePortal(): string {
    return this.sourcePortal;
  }
}

// ===== Bulk Approve Dialog =====

export interface BulkApproveResult {
  count: number;
}

export class BulkApproveDialog extends DialogBase<BulkApproveResult> {
  private count: number;
  private progress = 0;
  private inProgress = false;

  constructor(count: number) {
    super();
    this.count = count;
  }

  getFocusableElements(): string[] {
    return ["approve-all-btn", "cancel-btn"];
  }

  handleKey(key: string): void {
    if (this.inProgress) return; // Ignore keys during progress

    switch (key) {
      case "left":
      case "right":
      case "tab":
        this.focusIndex = this.focusIndex === 0 ? 1 : 0;
        break;
      case "enter":
        if (this.focusIndex === 0) {
          this.confirm({ count: this.count });
        } else {
          this.cancel();
        }
        break;
      case "y":
        this.confirm({ count: this.count });
        break;
      case "n":
      case "escape":
        this.cancel();
        break;
    }
  }

  setProgress(current: number): void {
    this.progress = current;
    this.inProgress = current < this.count;
  }

  render(width: number, _height: number): string {
    const lines: string[] = [];
    const innerWidth = Math.min(width - 4, 70);
    const border = "─".repeat(innerWidth);

    lines.push(`┌─ Approve All Proposals ${border.slice(22)}┐`);
    lines.push(`│${" ".repeat(innerWidth)}│`);
    lines.push(`│  ${this.count} proposal(s) will be approved.${" ".repeat(Math.max(0, innerWidth - 36))}│`);
    lines.push(`│${" ".repeat(innerWidth)}│`);

    if (this.inProgress) {
      // Show progress bar
      const progressPct = Math.floor((this.progress / this.count) * 100);
      const barWidth = innerWidth - 20;
      const filled = Math.floor((this.progress / this.count) * barWidth);
      const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
      lines.push(`│  Progress: [${bar}] ${progressPct}%${" ".repeat(Math.max(0, innerWidth - barWidth - 18))}│`);
      lines.push(`│  ${this.progress}/${this.count} completed${" ".repeat(Math.max(0, innerWidth - 18))}│`);
    } else {
      lines.push(`│  This action cannot be undone.${" ".repeat(Math.max(0, innerWidth - 33))}│`);
    }

    lines.push(`│${" ".repeat(innerWidth)}│`);

    if (!this.inProgress) {
      // Buttons
      const approveBtn = this.focusIndex === 0 ? "[Approve All]" : " Approve All ";
      const cancelBtn = this.focusIndex === 1 ? "[Cancel]" : " Cancel ";
      const buttonsLine = `${approveBtn}    ${cancelBtn}`;
      const padding = Math.floor((innerWidth - buttonsLine.length) / 2);
      lines.push(`│${" ".repeat(padding)}${buttonsLine}${" ".repeat(innerWidth - padding - buttonsLine.length)}│`);
      lines.push(`│${" ".repeat(innerWidth)}│`);
    }

    lines.push(`└${border}┘`);

    return lines.join("\n");
  }

  getResult(): DialogResult<BulkApproveResult> {
    if (this.state === "confirmed" && this._resultValue) {
      return { type: "confirmed", value: this._resultValue };
    }
    return { type: "cancelled" };
  }

  getCount(): number {
    return this.count;
  }
}
