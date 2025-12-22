// --- TUI Session for Plan Reviewer ---
export class PlanReviewerTuiSession {
  private selectedIndex = 0;
  private statusMessage = "";
  constructor(private plans: any[], private service: any) {}

  getSelectedIndex() {
    return this.selectedIndex;
  }

  setSelectedIndex(idx: number) {
    if (idx < 0 || idx >= this.plans.length) {
      this.selectedIndex = 0;
    } else {
      this.selectedIndex = idx;
    }
  }

  handleKey(key: string) {
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
        this.#triggerAction("approve");
        break;
      case "r":
        this.#triggerAction("reject");
        break;
    }
    if (this.selectedIndex >= this.plans.length) {
      this.selectedIndex = Math.max(0, this.plans.length - 1);
    }
  }

  #triggerAction(action: "approve" | "reject") {
    const plan = this.plans[this.selectedIndex];
    if (!plan) {
      this.statusMessage = `Error: No plan selected`;
      return;
    }
    try {
      switch (action) {
        case "approve":
          this.service.approve(plan.id, "reviewer");
          break;
        case "reject":
          this.service.reject(plan.id, "reviewer", "TUI reject");
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

  getStatusMessage() {
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

import { PlanCommands } from "../cli/plan_commands.ts";

export class PlanReviewerView {
  service: any;
  constructor(service?: any) {
    // store optional injected service for tests or runtime
    this.service = service;
  }

  // TUI: Expose a TUI session interface for tests or integration
  createTuiSession(plans: any[]) {
    return new PlanReviewerTuiSession(plans, this.service);
  }

  private isPlanCommands(obj: any): obj is PlanCommands {
    return obj && typeof obj.list === "function" && typeof obj.approve === "function";
  }

  private isDbLike(obj: any): boolean {
    return obj && typeof obj.getPendingPlans === "function";
  }

  private ensurePlanCommands(): PlanCommands {
    if (this.isPlanCommands(this.service)) return this.service;
    if ((globalThis as any).CLIContext && (globalThis as any).WORKSPACE_ROOT) {
      return new PlanCommands((globalThis as any).CLIContext, (globalThis as any).WORKSPACE_ROOT);
    }
    throw new Error("PlanCommands instance not provided and global CLI context missing");
  }

  async listPending(): Promise<Plan[]> {
    // If a DB-like service was injected (tests), use it directly
    if (this.isDbLike(this.service)) {
      return await this.service.getPendingPlans();
    }

    const cmd = await this.ensurePlanCommands();
    const rows = await cmd.list("pending");
    // Map PlanMetadata -> Plan
    return rows.map((r: any) => ({
      id: r.id,
      title: (r as any).title ?? r.id,
      author: r.agent_id ?? r.reviewed_by,
      status: r.status,
    }));
  }

  async getDiff(planId: string): Promise<string> {
    if (this.isDbLike(this.service)) {
      return await this.service.getPlanDiff(planId);
    }
    const cmd = await this.ensurePlanCommands();
    const details = await cmd.show(planId);
    // PlanCommands.show returns the plan body; return it as the diff/content for TUI
    return details.content ?? "";
  }

  async approve(planId: string, _reviewer: string): Promise<boolean> {
    if (this.isDbLike(this.service)) {
      await this.service.updatePlanStatus(planId, "approved");
      await this.service.logActivity({
        action_type: "plan.approve",
        plan_id: planId,
        timestamp: new Date().toISOString(),
      });
      return true;
    }
    const cmd = await this.ensurePlanCommands();
    await cmd.approve(planId);
    return true;
  }

  async reject(planId: string, _reviewer: string, reason?: string): Promise<boolean> {
    if (this.isDbLike(this.service)) {
      await this.service.updatePlanStatus(planId, "rejected");
      await this.service.logActivity({
        action_type: "plan.reject",
        plan_id: planId,
        reason: reason ?? null,
        timestamp: new Date().toISOString(),
      });
      return true;
    }
    if (!reason) throw new Error("Rejection reason is required");
    const cmd = await this.ensurePlanCommands();
    await cmd.reject(planId, reason);
    return true;
  }

  // Placeholder rendering helpers for TUI integration (to be expanded)
  renderPlanList(plans: Plan[]): string {
    return plans.map((p) => `${p.id} ${p.title} [${p.status ?? "unknown"}]`).join("\n");
  }

  renderDiff(diff: string): string {
    // Very small helper; real TUI would colorize and paginate
    return diff;
  }
}
