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
    if (!reason) throw new Error("Rejection reason required when using PlanCommands");
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
