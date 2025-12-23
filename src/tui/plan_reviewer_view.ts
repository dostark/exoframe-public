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
import { TuiSessionBase } from "./tui_common.ts";

export class PlanReviewerTuiSession extends TuiSessionBase {
  private readonly plans: Plan[];
  private readonly service: PlanService;

  /**
   * @param plans Initial list of plans
   * @param service Service for plan operations
   */
  constructor(plans: Plan[], service: PlanService) {
    super();
    this.plans = plans;
    this.service = service;
  }

  /** Set the selected plan index, clamped to valid range. */
  override setSelectedIndex(idx: number): void {
    super.setSelectedIndex(idx, this.plans.length);
  }

  /** Handle a TUI key event. */
  async handleKey(key: string): Promise<void> {
    if (this.plans.length === 0) return;
    if (super.handleNavigationKey(key, this.plans.length)) {
      return;
    }
    switch (key) {
      case "a":
        try {
          const maybe = this.service.approve(this.plans[this.selectedIndex].id, "reviewer");
          if (maybe && typeof (maybe as any).then === "function") {
            // handle async result via performAction
            await this.performAction(async () => {
              await maybe;
            });
          } else {
            // synchronous result
            this.statusMessage = "";
          }
        } catch (e) {
          this.statusMessage = e instanceof Error ? `Error: ${e.message}` : `Error: ${String(e)}`;
        }
        break;
      case "r":
        try {
          const maybe = this.service.reject(this.plans[this.selectedIndex].id, "reviewer", "TUI reject");
          if (maybe && typeof (maybe as any).then === "function") {
            await this.performAction(async () => {
              await maybe;
            });
          } else {
            this.statusMessage = "";
          }
        } catch (e) {
          this.statusMessage = e instanceof Error ? `Error: ${e.message}` : `Error: ${String(e)}`;
        }
        break;
    }
    this.clampSelection(this.plans.length);
  }

  override getStatusMessage(): string {
    return super.getStatusMessage();
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
