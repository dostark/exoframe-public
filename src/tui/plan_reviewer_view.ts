// --- Adapter: PlanCommands as PlanService ---
import type { PlanCommands } from "../cli/plan_commands.ts";

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

// --- Adapter: DB-like mock as PlanService ---
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

// --- Minimal PlanService mock for TUI session tests ---
/**
 * Minimal PlanService mock for TUI session tests.
 */
export class MinimalPlanServiceMock implements PlanService {
  listPending = () => Promise.resolve([]);
  getDiff = (_: string) => Promise.resolve("");
  approve = (_: string, _r: string) => Promise.resolve(true);
  reject = (_: string, _r: string, _reason?: string) => Promise.resolve(true);
}
// --- Service interface for Plan Reviewer ---
export interface PlanService {
  listPending(): Promise<Plan[]>;
  getDiff(planId: string): Promise<string>;
  approve(planId: string, reviewer: string): Promise<boolean>;
  reject(planId: string, reviewer: string, reason?: string): Promise<boolean>;
}

// --- TUI Session for Plan Reviewer ---
/**
 * TUI session for Plan Reviewer. Encapsulates state and user interaction logic.
 */
export class PlanReviewerTuiSession {
  private selectedIndex = 0;
  private statusMessage = "";
  /**
   * @param plans Initial list of plans
   * @param service Service for plan operations
   */
  constructor(private readonly plans: Plan[], private readonly service: PlanService) {}

  /** Get the currently selected plan index. */
  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  /** Set the selected plan index, clamped to valid range. */
  setSelectedIndex(idx: number): void {
    if (idx < 0 || idx >= this.plans.length) {
      this.selectedIndex = 0;
    } else {
      this.selectedIndex = idx;
    }
  }

  /** Handle a TUI key event. */
  async handleKey(key: string): Promise<void> {
    if (this.plans.length === 0) return;
    switch (key) {
      case "down":
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.plans.length - 1);
        break;
      case "up":
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        break;
      case "end":
        this.selectedIndex = this.plans.length - 1;
        break;
      case "home":
        this.selectedIndex = 0;
        break;
      case "a":
        await this.#triggerAction("approve");
        break;
      case "r":
        await this.#triggerAction("reject");
        break;
    }
    if (this.selectedIndex >= this.plans.length) {
      this.selectedIndex = Math.max(0, this.plans.length - 1);
    }
  }

  /**
   * Trigger a plan action and update status.
   * @param action Action to perform
   */
  async #triggerAction(action: "approve" | "reject") {
    const plan = this.plans[this.selectedIndex];
    if (!plan) {
      this.statusMessage = `Error: No plan selected`;
      return;
    }
    try {
      switch (action) {
        case "approve":
          await this.service.approve(plan.id, "reviewer");
          break;
        case "reject":
          await this.service.reject(plan.id, "reviewer", "TUI reject");
          break;
      }
      this.statusMessage = "";
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
}
export type Plan = {
  id: string;
  title: string;
  author?: string;
  status?: string;
  created_at?: string;
};

/**
 * View/controller for Plan Reviewer. Delegates to injected PlanService.
 */
export class PlanReviewerView implements PlanService {
  constructor(public readonly service: PlanService) {}

  /** Create a new TUI session for the given plans. */
  createTuiSession(plans: Plan[]): PlanReviewerTuiSession {
    return new PlanReviewerTuiSession(plans, this.service);
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

  /** Render a list of plans for display. */
  renderPlanList(plans: Plan[]): string {
    return plans.map((p) => `${p.id} ${p.title} [${p.status ?? "unknown"}]`).join("\n");
  }
  /** Render a diff for display. */
  renderDiff(diff: string): string {
    return diff;
  }
}
