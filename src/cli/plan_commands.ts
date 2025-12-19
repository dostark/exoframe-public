import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { FrontmatterParser } from "../parsers/markdown.ts";
import { BaseCommand, type CommandContext } from "./base.ts";

export interface PlanMetadata {
  id: string;
  status: string;
  trace_id?: string;
  agent_id?: string;
  created_at?: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

export interface PlanDetails extends PlanMetadata {
  content: string;
}

/**
 * PlanCommands provides CLI operations for human review of AI-generated plans.
 * All operations are atomic and logged to activity_log with actor='human'.
 */
export class PlanCommands extends BaseCommand {
  private inboxPlansDir: string;
  private systemActiveDir: string;
  private inboxRejectedDir: string;
  private systemArchiveDir: string;
  private parser: FrontmatterParser;

  constructor(
    context: CommandContext,
    workspaceRoot: string,
  ) {
    super(context);
    this.inboxPlansDir = join(workspaceRoot, "Inbox", "Plans");
    this.systemActiveDir = join(workspaceRoot, "System", "Active");
    this.inboxRejectedDir = join(workspaceRoot, "Inbox", "Rejected");
    this.systemArchiveDir = join(workspaceRoot, "System", "Archive");
    this.parser = new FrontmatterParser();
  }

  /**
   * Approve a plan: move from /Inbox/Plans to /System/Active
   * Only plans with status='review' can be approved.
   */
  async approve(planId: string): Promise<void> {
    const sourcePath = join(this.inboxPlansDir, `${planId}.md`);
    const targetPath = join(this.systemActiveDir, `${planId}.md`);

    // Load and parse plan
    const { frontmatter, body } = await this.loadPlan(sourcePath);

    // Validate status
    if (frontmatter.status !== "review") {
      throw new Error(
        `Only plans with status='review' can be approved. Current status: ${frontmatter.status}`,
      );
    }

    // Validate target path doesn't exist, or archive existing plan
    if (await exists(targetPath)) {
      // Archive existing plan
      await ensureDir(this.systemArchiveDir);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const archivePath = join(this.systemArchiveDir, `${planId}_archived_${timestamp}.md`);
      await Deno.rename(targetPath, archivePath);
    }

    // Get user context
    const { actor, actionLogger, now } = await this.getUserContext();

    // Update frontmatter
    const updatedFrontmatter = {
      ...frontmatter,
      status: "approved",
      approved_by: actor,
      approved_at: now,
    };

    // Write updated plan to target
    await ensureDir(this.systemActiveDir);
    const updatedContent = this.serializePlan(updatedFrontmatter, body);
    await Deno.writeTextFile(targetPath, updatedContent);

    // Remove original (atomic operation complete)
    await Deno.remove(sourcePath);

    // Log activity with user identity
    actionLogger.info("plan.approved", planId, {
      approved_at: now,
      via: "cli",
      command: this.getCommandLineString(),
    }, frontmatter.trace_id as string | undefined);
  }

  /**
   * Reject a plan: move from /Inbox/Plans to /Inbox/Rejected with _rejected.md suffix
   * Requires a rejection reason.
   */
  async reject(planId: string, reason: string): Promise<void> {
    if (!reason || reason.trim() === "") {
      throw new Error("Rejection reason is required");
    }

    const sourcePath = join(this.inboxPlansDir, `${planId}.md`);
    const targetPath = join(this.inboxRejectedDir, `${planId}_rejected.md`);

    // Load and parse plan
    const { frontmatter, body } = await this.loadPlan(sourcePath);

    // Get user context
    const { actor, actionLogger, now } = await this.getUserContext();

    // Update frontmatter
    const updatedFrontmatter = {
      ...frontmatter,
      status: "rejected",
      rejected_by: actor,
      rejected_at: now,
      rejection_reason: reason,
    };

    // Write updated plan to target
    await ensureDir(this.inboxRejectedDir);
    const updatedContent = this.serializePlan(updatedFrontmatter, body);
    await Deno.writeTextFile(targetPath, updatedContent);

    // Remove original (atomic operation complete)
    await Deno.remove(sourcePath);

    // Log activity with user identity
    actionLogger.info("plan.rejected", planId, {
      reason: reason,
      rejected_at: now,
      via: "cli",
      command: this.getCommandLineString(),
    }, frontmatter.trace_id as string | undefined);
  }

  /**
   * Request revision: append review comments to plan and update status to 'needs_revision'
   * Plan remains in /Inbox/Plans for the agent to address.
   */
  async revise(planId: string, comments: string[]): Promise<void> {
    if (!comments || comments.length === 0) {
      throw new Error("At least one comment is required");
    }

    const planPath = join(this.inboxPlansDir, `${planId}.md`);

    // Load and parse plan
    const { frontmatter, body } = await this.loadPlan(planPath);

    // Get user context
    const { actor, actionLogger, now } = await this.getUserContext();

    // Update frontmatter
    const updatedFrontmatter = {
      ...frontmatter,
      status: "needs_revision",
      reviewed_by: actor,
      reviewed_at: now,
    };

    // Append comments to body
    let updatedBody = body;
    const reviewCommentsMarker = "## Review Comments";

    // Check if review comments section exists
    if (updatedBody.includes(reviewCommentsMarker)) {
      // Append to existing section
      const formattedComments = comments.map((c) => `⚠️ ${c}`).join("\n");
      updatedBody = updatedBody.replace(
        reviewCommentsMarker,
        `${reviewCommentsMarker}\n\n${formattedComments}`,
      );
    } else {
      // Add new section at the end
      const formattedComments = comments.map((c) => `⚠️ ${c}`).join("\n");
      updatedBody = `${updatedBody.trim()}\n\n${reviewCommentsMarker}\n\n${formattedComments}\n`;
    }

    // Write updated plan
    const updatedContent = this.serializePlan(updatedFrontmatter, updatedBody);
    await Deno.writeTextFile(planPath, updatedContent);

    // Log activity with user identity
    actionLogger.info("plan.revision_requested", planId, {
      comment_count: comments.length,
      reviewed_at: now,
      via: "cli",
      command: this.getCommandLineString(),
    }, frontmatter.trace_id as string | undefined);
  }

  /**
   * List all plans in /Inbox/Plans, optionally filtered by status
   */
  async list(statusFilter?: string): Promise<PlanMetadata[]> {
    const plans: PlanMetadata[] = [];

    try {
      // Ensure directory exists
      await ensureDir(this.inboxPlansDir);

      // Read directory
      for await (const entry of Deno.readDir(this.inboxPlansDir)) {
        if (!entry.isFile || !entry.name.endsWith(".md")) {
          continue;
        }

        const planId = entry.name.replace(/\.md$/, "");
        const planPath = join(this.inboxPlansDir, entry.name);

        try {
          const content = await Deno.readTextFile(planPath);
          const { frontmatter } = this.extractFrontmatterWithBody(content);

          const metadata: PlanMetadata = {
            id: planId,
            status: (frontmatter.status as string) || "unknown",
            trace_id: frontmatter.trace_id as string | undefined,
            agent_id: frontmatter.agent_id as string | undefined,
            created_at: frontmatter.created_at as string | undefined,
            approved_by: frontmatter.approved_by as string | undefined,
            approved_at: frontmatter.approved_at as string | undefined,
            rejected_by: frontmatter.rejected_by as string | undefined,
            rejected_at: frontmatter.rejected_at as string | undefined,
            rejection_reason: frontmatter.rejection_reason as string | undefined,
            reviewed_by: frontmatter.reviewed_by as string | undefined,
            reviewed_at: frontmatter.reviewed_at as string | undefined,
          };

          // Apply filter if specified
          if (!statusFilter || metadata.status === statusFilter) {
            plans.push(metadata);
          }
        } catch (error) {
          // Handle malformed files gracefully
          console.warn(`Warning: Could not parse plan ${planId}:`, error);
          if (!statusFilter || statusFilter === "unknown") {
            plans.push({
              id: planId,
              status: "unknown",
            });
          }
        }
      }
    } catch (error) {
      // If directory doesn't exist, return empty array
      if (error instanceof Deno.errors.NotFound) {
        return [];
      }
      throw error;
    }

    // Sort by ID for consistent ordering
    return plans.sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Show details of a specific plan
   */
  async show(planId: string): Promise<PlanDetails> {
    const planPath = join(this.inboxPlansDir, `${planId}.md`);

    if (!await exists(planPath)) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const content = await Deno.readTextFile(planPath);

    try {
      const { frontmatter, body } = this.extractFrontmatterWithBody(content);

      return {
        id: planId,
        status: (frontmatter.status as string) || "unknown",
        trace_id: frontmatter.trace_id as string | undefined,
        agent_id: frontmatter.agent_id as string | undefined,
        created_at: frontmatter.created_at as string | undefined,
        approved_by: frontmatter.approved_by as string | undefined,
        approved_at: frontmatter.approved_at as string | undefined,
        rejected_by: frontmatter.rejected_by as string | undefined,
        rejected_at: frontmatter.rejected_at as string | undefined,
        rejection_reason: frontmatter.rejection_reason as string | undefined,
        reviewed_by: frontmatter.reviewed_by as string | undefined,
        reviewed_at: frontmatter.reviewed_at as string | undefined,
        content: body,
      };
    } catch {
      // Handle plans without frontmatter
      return {
        id: planId,
        status: "unknown",
        content: content,
      };
    }
  }

  /**
   * Serialize frontmatter and body back to markdown format (YAML)
   */
  private serializePlan(frontmatter: Record<string, unknown>, body: string): string {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(frontmatter)) {
      if (value === null || value === undefined) {
        continue;
      }
      const strValue = String(value);
      // Quote values with colons or UUIDs
      const needsQuotes = strValue.includes(":") ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strValue);
      if (needsQuotes) {
        lines.push(`${key}: "${strValue}"`);
      } else {
        lines.push(`${key}: ${strValue}`);
      }
    }

    return `---\n${lines.join("\n")}\n---\n\n${body}`;
  }

  /**
   * Extract frontmatter and body from markdown (YAML format)
   * Returns both frontmatter and body, unlike base class version
   */
  private extractFrontmatterWithBody(markdown: string): { frontmatter: Record<string, unknown>; body: string } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
    const match = markdown.match(frontmatterRegex);

    if (!match) {
      throw new Error("No frontmatter found");
    }

    const yamlContent = match[1];
    const body = match[2] || "";

    // Simple YAML parsing for key-value pairs
    const frontmatter: Record<string, unknown> = {};
    const lines = yamlContent.split("\n");

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        let value = line.substring(colonIndex + 1).trim();
        // Remove quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        frontmatter[key] = value;
      }
    }

    return { frontmatter, body };
  }

  /**
   * Load and parse a plan file
   * @private
   */
  private async loadPlan(planPath: string): Promise<{
    content: string;
    frontmatter: Record<string, unknown>;
    body: string;
  }> {
    if (!await exists(planPath)) {
      const planId = planPath.split("/").pop()?.replace(".md", "") || "unknown";
      throw new Error(`Plan not found: ${planId}`);
    }

    const content = await Deno.readTextFile(planPath);
    const { frontmatter, body } = this.extractFrontmatterWithBody(content);

    return { content, frontmatter, body };
  }

  /**
   * Get current user identity and action logger
   * @private
   */
  private async getUserContext(): Promise<{
    actor: string;
    actionLogger: Awaited<ReturnType<BaseCommand["getActionLogger"]>>;
    now: string;
  }> {
    const actor = await this.getUserIdentity();
    const actionLogger = await this.getActionLogger();
    const now = new Date().toISOString();

    return { actor, actionLogger, now };
  }
}
