/**
 * Plan Writer - Formats agent execution results into structured plans
 * Implements Step 3.4 and Step 6.7 of the ExoFrame Implementation Plan
 *
 * Step 6.7 Update:
 * - LLMs now output JSON plans within <content> tags
 * - PlanAdapter validates JSON against schema
 * - Converts validated plan to markdown for storage
 */

import type { DatabaseService } from "./db.ts";
import { PlanAdapter, PlanValidationError } from "./plan_adapter.ts";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Metadata about the request that generated this plan
 */
export interface RequestMetadata {
  /** Original request file name (without extension) */
  requestId: string;

  /** Trace ID linking request → plan → execution */
  traceId: string;

  /** Timestamp when request was created */
  createdAt: Date;

  /** Context files that were loaded for this request */
  contextFiles: string[];

  /** Warnings from context loading (truncation, etc.) */
  contextWarnings: string[];

  /** Optional: Model override for this request */
  model?: string;
}

/**
 * Configuration for plan writing
 */
export interface PlanWriterConfig {
  /** Directory to write plans to (default: /Inbox/Plans) */
  plansDirectory: string;

  /** Whether to include reasoning section */
  includeReasoning: boolean;

  /** Whether to generate Obsidian wiki links */
  generateWikiLinks: boolean;

  /** Knowledge base root for relative path calculation */
  knowledgeRoot: string;

  /** System directory root for database access (default: /System) */
  systemRoot: string;

  /** Optional: Database service for activity logging */
  db?: DatabaseService;
}

/**
 * Result of plan writing operation
 */
export interface PlanWriteResult {
  /** Absolute path to written plan file */
  planPath: string;

  /** Generated plan content */
  content: string;

  /** Timestamp when plan was written */
  writtenAt: Date;
}

/**
 * Agent execution result (from Step 3.2: AgentRunner)
 */
export interface AgentExecutionResult {
  /** Agent's internal reasoning from <thought> tags */
  thought: string;

  /** Actual plan content from <content> tags */
  content: string;

  /** Raw response from LLM */
  raw: string;
}

// ============================================================================
// Plan Writer Service
// ============================================================================

/**
 * PlanWriter formats agent execution results into structured markdown plans
 * and writes them to /Inbox/Plans for user review
 */
export class PlanWriter {
  private adapter: PlanAdapter;

  constructor(private config: PlanWriterConfig) {
    this.adapter = new PlanAdapter();
  }

  /**
   * Write a plan document based on agent execution result
   */
  async writePlan(
    result: AgentExecutionResult,
    metadata: RequestMetadata,
  ): Promise<PlanWriteResult> {
    // Generate plan content (with JSON validation)
    const content = await this.formatPlan(result, metadata);

    // Generate filename: request-id_plan.md
    const filename = this.generateFilename(metadata.requestId);
    const planPath = `${this.config.plansDirectory}/${filename}`;

    // Write to file
    await Deno.writeTextFile(planPath, content);

    const writtenAt = new Date();

    // Log to Activity Journal
    await this.logPlanCreation(planPath, metadata.traceId, metadata);

    return {
      planPath,
      content,
      writtenAt,
    };
  }

  /**
   * Format the complete plan document
   * Step 6.7: Validates JSON plan and converts to markdown
   */
  private async formatPlan(
    result: AgentExecutionResult,
    metadata: RequestMetadata,
  ): Promise<string> {
    const sections: string[] = [];

    // 1. Frontmatter
    sections.push(this.generateFrontmatter(metadata));

    // 2. Validate and convert JSON plan to markdown
    let planMarkdown: string;
    try {
      const plan = this.adapter.parse(result.content);
      planMarkdown = this.adapter.toMarkdown(plan);

      // Log validation success
      await this.logPlanValidation(
        "plan.validation.success",
        metadata.requestId,
        metadata.traceId,
        {
          step_count: plan.steps.length,
          has_risks: plan.risks !== undefined && plan.risks.length > 0,
          has_dependencies: plan.steps.some((s) => s.dependencies && s.dependencies.length > 0),
        },
      );
    } catch (error) {
      if (error instanceof PlanValidationError) {
        // Log validation failure
        await this.logPlanValidation(
          "plan.validation.failed",
          metadata.requestId,
          metadata.traceId,
          {
            error_type: "PlanValidationError",
            error_message: error.message,
            raw_preview: result.content.substring(0, 200),
          },
        );
        throw error;
      }
      throw error;
    }

    // Log successful parsing
    await this.logPlanValidation(
      "plan.parsed",
      metadata.requestId,
      metadata.traceId,
      { file_path: `${this.config.plansDirectory}/${this.generateFilename(metadata.requestId)}` },
    );

    // 3. Reasoning (from thought tags)
    if (this.config.includeReasoning && result.thought) {
      sections.push(`## Reasoning\n`);
      sections.push(result.thought);
      sections.push("");
    }

    // 4. Plan content (converted from JSON)
    sections.push(planMarkdown);
    sections.push("");

    // 6. Context References
    if (metadata.contextFiles.length > 0) {
      sections.push(this.generateContextReferences(metadata));
    }

    // 7. Next Steps
    sections.push(this.generateNextSteps(metadata.requestId));

    return sections.join("\n");
  }

  /**
   * Generate YAML frontmatter
   */
  private generateFrontmatter(metadata: RequestMetadata): string {
    const lines = [
      "---",
      `trace_id: "${metadata.traceId}"`,
      `request_id: "${metadata.requestId}"`,
      `status: review`,
      `created_at: ${metadata.createdAt.toISOString()}`,
    ];

    if (metadata.model) {
      lines.push(`model: "${metadata.model}"`);
    }

    lines.push("---");
    lines.push("");
    return lines.join("\n");
  }

  /**
   * Generate context references section with wiki links
   */
  private generateContextReferences(metadata: RequestMetadata): string {
    const lines: string[] = [
      "## Context References\n",
      "This plan was based on the following context:\n",
    ];

    // Generate wiki links for context files
    if (this.config.generateWikiLinks) {
      const wikiLinks = this.generateWikiLinks(metadata.contextFiles);
      lines.push(...wikiLinks.map((link) => `- ${link}`));
    } else {
      lines.push(...metadata.contextFiles.map((file) => `- ${file}`));
    }

    // Add warnings if any
    if (metadata.contextWarnings.length > 0) {
      lines.push("\n**Context Warnings:**");
      lines.push(...metadata.contextWarnings.map((w) => `- ${w}`));
    }

    lines.push("");
    return lines.join("\n");
  }

  /**
   * Generate Obsidian wiki links from file paths
   */
  private generateWikiLinks(filePaths: string[]): string[] {
    return filePaths.map((path) => {
      // Convert absolute path to relative to knowledge base
      const relativePath = path.replace(this.config.knowledgeRoot + "/", "");

      // Extract filename without extension for wiki link
      const filename = relativePath.split("/").pop()?.replace(/\.md$/, "") ||
        relativePath;

      // Generate wiki link: [[filename]]
      return `[[${filename}]]`;
    });
  }

  /**
   * Generate filename for plan: requestId_plan.md
   */
  private generateFilename(requestId: string): string {
    return `${requestId}_plan.md`;
  }

  /**
   * Extract title from content (first # heading)
   */
  private extractTitle(content: string): string | null {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1] : null;
  }

  /**
   * Extract summary (first paragraph or generate from title)
   */
  private extractSummary(content: string): string {
    // Find first paragraph after any headings
    const lines = content.split("\n");
    let inParagraph = false;
    const paragraphLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("#")) {
        inParagraph = false;
        continue;
      }

      if (line.trim() && !inParagraph) {
        inParagraph = true;
      }

      if (inParagraph) {
        if (!line.trim()) {
          break; // End of paragraph
        }
        paragraphLines.push(line);
      }
    }

    return paragraphLines.length > 0
      ? paragraphLines.join("\n")
      : "Generated implementation plan based on request analysis.";
  }

  /**
   * Generate next steps section
   */
  private generateNextSteps(requestId: string): string {
    return [
      "## Next Steps\n",
      "1. Review this plan for correctness and completeness",
      `2. If approved, move to \`/System/Active/${requestId}.md\``,
      "3. Agent will execute changes on a separate git branch",
      "4. Review the pull request before merging to main\n",
    ].join("\n");
  }

  /**
   * Log plan validation events to Activity Journal
   */
  private async logPlanValidation(
    actionType: string,
    requestId: string,
    traceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!this.config.db) {
      // If no database provided, skip logging (testing mode)
      return;
    }

    try {
      await this.config.db.logActivity(
        "agent",
        actionType,
        requestId,
        metadata,
        traceId,
      );
    } catch (error) {
      // Log to stderr but don't fail validation
      console.error(`[Activity] Failed to log ${actionType}:`, error);
    }
  }

  /**
   * Log plan creation to Activity Journal
   */
  private async logPlanCreation(
    planPath: string,
    traceId: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    if (!this.config.db) {
      // If no database provided, skip logging (testing mode)
      return;
    }

    try {
      await this.config.db.logActivity(
        "agent",
        "plan.created",
        metadata.requestId,
        {
          plan_path: planPath,
          request_id: metadata.requestId,
          context_files_count: metadata.contextFiles.length,
          context_warnings_count: metadata.contextWarnings.length,
          has_reasoning: this.config.includeReasoning,
        },
        traceId,
      );
    } catch (error) {
      // Log to stderr but don't fail plan creation
      console.error("[Activity] Failed to log plan.created:", error);
    }
  }
}
