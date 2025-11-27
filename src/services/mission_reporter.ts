/**
 * Mission Reporter - Step 4.5 of Implementation Plan
 *
 * Generates comprehensive mission reports after successful task execution.
 * Creates episodic memory for agents, enables learning from past executions,
 * and provides an audit trail.
 */

import { basename, join, relative } from "@std/path";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Trace data containing all information needed to generate a report
 */
export interface TraceData {
  /** UUID linking request → plan → execution → report */
  traceId: string;

  /** Original request ID (e.g., "implement-auth") */
  requestId: string;

  /** Agent that executed the task */
  agentId: string;

  /** Execution status: "completed" or "failed" */
  status: "completed" | "failed";

  /** Git branch where changes were made */
  branch: string;

  /** When the execution completed */
  completedAt: Date;

  /** Context files that were used during execution */
  contextFiles: string[];

  /** Agent's reasoning for decisions made */
  reasoning: string;

  /** Summary of what was accomplished */
  summary: string;
}

/**
 * Configuration for the MissionReporter
 */
export interface ReportConfig {
  /** Directory where reports are written */
  reportsDirectory: string;

  /** Knowledge base root for relative path calculation */
  knowledgeRoot: string;

  /** Database service for activity logging */
  db?: DatabaseService;
}

/**
 * Result of report generation
 */
export interface ReportResult {
  /** Absolute path to the generated report */
  reportPath: string;

  /** Generated report content */
  content: string;

  /** Timestamp when report was created */
  createdAt: Date;
}

/**
 * Git change statistics from diff analysis
 */
interface GitChangeStats {
  filesCreated: string[];
  filesModified: string[];
  filesDeleted: string[];
  insertions: number;
  deletions: number;
  totalFilesChanged: number;
  commitSha: string;
}

// ============================================================================
// MissionReporter Implementation
// ============================================================================

export class MissionReporter {
  private config: Config;
  private reportConfig: ReportConfig;

  constructor(config: Config, reportConfig: ReportConfig) {
    this.config = config;
    this.reportConfig = reportConfig;
  }

  /**
   * Generate a mission report for a completed trace
   */
  async generate(traceData: TraceData): Promise<ReportResult> {
    const startTime = Date.now();

    try {
      // Build the report content
      const content = await this.buildReport(traceData);

      // Generate filename: {date}_{shortTraceId}_{requestId}.md
      const filename = this.generateFilename(traceData);
      const reportPath = join(this.reportConfig.reportsDirectory, filename);

      // Write report to file
      await Deno.writeTextFile(reportPath, content);

      const createdAt = new Date();

      // Log success to Activity Journal
      this.logReportGenerated(traceData, reportPath, Date.now() - startTime);

      return {
        reportPath,
        content,
        createdAt,
      };
    } catch (error) {
      // Log failure to Activity Journal
      this.logReportFailed(traceData, error as Error, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Build the complete report content
   */
  private async buildReport(traceData: TraceData): Promise<string> {
    const sections: string[] = [];

    // 1. TOML Frontmatter
    sections.push(this.buildFrontmatter(traceData));

    // 2. Title
    sections.push(this.buildTitle(traceData));

    // 3. Summary Section
    sections.push(this.buildSummarySection(traceData));

    // 4. Changes Made Section
    const changes = await this.analyzeGitChanges(traceData);
    sections.push(this.buildChangesSection(changes));

    // 5. Git Summary Section
    sections.push(this.buildGitSummary(traceData, changes));

    // 6. Context Used Section
    sections.push(this.buildContextSection(traceData));

    // 7. Reasoning Section
    sections.push(this.buildReasoningSection(traceData));

    // 8. Next Steps Section
    sections.push(this.buildNextStepsSection(traceData));

    return sections.join("\n");
  }

  /**
   * Generate TOML frontmatter for the report
   */
  private buildFrontmatter(traceData: TraceData): string {
    const completedAt = traceData.completedAt.toISOString();

    return `+++
trace_id = "${traceData.traceId}"
request_id = "${traceData.requestId}"
status = "${traceData.status}"
completed_at = "${completedAt}"
agent_id = "${traceData.agentId}"
branch = "${traceData.branch}"
+++

`;
  }

  /**
   * Generate title from request ID (convert kebab-case to Title Case)
   */
  private buildTitle(traceData: TraceData): string {
    const title = this.formatTitle(traceData.requestId);
    return `# Mission Report: ${title}\n\n`;
  }

  /**
   * Convert kebab-case to Title Case
   */
  private formatTitle(requestId: string): string {
    return requestId
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  /**
   * Build the summary section
   */
  private buildSummarySection(traceData: TraceData): string {
    if (!traceData.summary) {
      return "## Summary\n\nNo summary provided.\n\n";
    }
    return `## Summary\n\n${traceData.summary}\n\n`;
  }

  /**
   * Analyze git changes for the trace's branch
   */
  private async analyzeGitChanges(traceData: TraceData): Promise<GitChangeStats> {
    const repoPath = this.config.system.root;
    const defaultStats: GitChangeStats = {
      filesCreated: [],
      filesModified: [],
      filesDeleted: [],
      insertions: 0,
      deletions: 0,
      totalFilesChanged: 0,
      commitSha: "",
    };

    try {
      // Get the diff stat comparing branch to main
      const diffStatResult = await this.runGitCommand(repoPath, [
        "diff",
        "--stat",
        "--name-status",
        "HEAD~1..HEAD",
      ]);

      // Parse the output
      return this.parseDiffOutput(diffStatResult, defaultStats);
    } catch {
      // If git diff fails, return empty stats
      return defaultStats;
    }
  }

  /**
   * Parse git diff output to categorize changes
   */
  private parseDiffOutput(output: string, defaults: GitChangeStats): GitChangeStats {
    const stats = { ...defaults };
    const lines = output.trim().split("\n");

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      const status = parts[0];
      const filePath = parts.slice(1).join(" ");

      switch (status) {
        case "A":
          stats.filesCreated.push(filePath);
          break;
        case "M":
          stats.filesModified.push(filePath);
          break;
        case "D":
          stats.filesDeleted.push(filePath);
          break;
      }
    }

    stats.totalFilesChanged = stats.filesCreated.length + stats.filesModified.length + stats.filesDeleted.length;

    // Try to get insertion/deletion stats
    const summaryMatch = output.match(/(\d+) insertions?\(\+\)/);
    const deletionsMatch = output.match(/(\d+) deletions?\(-\)/);

    if (summaryMatch) stats.insertions = parseInt(summaryMatch[1], 10);
    if (deletionsMatch) stats.deletions = parseInt(deletionsMatch[1], 10);

    return stats;
  }

  /**
   * Build the Changes Made section
   */
  private buildChangesSection(changes: GitChangeStats): string {
    const sections: string[] = ["## Changes Made\n"];

    if (changes.filesCreated.length > 0) {
      sections.push(`### Files Created (${changes.filesCreated.length})\n`);
      for (const file of changes.filesCreated) {
        sections.push(`- \`${file}\``);
      }
      sections.push("");
    }

    if (changes.filesModified.length > 0) {
      sections.push(`### Files Modified (${changes.filesModified.length})\n`);
      for (const file of changes.filesModified) {
        sections.push(`- \`${file}\``);
      }
      sections.push("");
    }

    if (changes.filesDeleted.length > 0) {
      sections.push(`### Files Deleted (${changes.filesDeleted.length})\n`);
      for (const file of changes.filesDeleted) {
        sections.push(`- \`${file}\``);
      }
      sections.push("");
    }

    if (changes.totalFilesChanged === 0) {
      sections.push("No file changes detected.\n");
    }

    sections.push("");
    return sections.join("\n");
  }

  /**
   * Build the Git Summary section
   */
  private buildGitSummary(traceData: TraceData, changes: GitChangeStats): string {
    const sections: string[] = ["## Git Summary\n"];

    sections.push("```");
    sections.push(
      `${changes.totalFilesChanged} files changed, ${changes.insertions} insertions(+), ${changes.deletions} deletions(-)`,
    );
    sections.push(`Branch: ${traceData.branch}`);
    if (changes.commitSha) {
      sections.push(`Commit: ${changes.commitSha}`);
    }
    sections.push("```\n");

    return sections.join("\n");
  }

  /**
   * Build the Context Used section with Obsidian wiki links
   */
  private buildContextSection(traceData: TraceData): string {
    const sections: string[] = ["## Context Used\n"];

    if (traceData.contextFiles.length === 0) {
      sections.push("No context files were used.\n");
      return sections.join("\n");
    }

    for (const file of traceData.contextFiles) {
      const wikiLink = this.toWikiLink(file);
      sections.push(`- ${wikiLink}`);
    }
    sections.push("\n");

    return sections.join("\n");
  }

  /**
   * Convert file path to Obsidian wiki link
   */
  private toWikiLink(filePath: string): string {
    // Get relative path from knowledge root
    let relativePath: string;
    try {
      relativePath = relative(this.reportConfig.knowledgeRoot, filePath);
    } catch {
      // If relative fails, use basename
      relativePath = basename(filePath);
    }

    // Remove .md extension for wiki link
    const linkPath = relativePath.replace(/\.md$/, "");

    return `[[${linkPath}]]`;
  }

  /**
   * Build the Reasoning section
   */
  private buildReasoningSection(traceData: TraceData): string {
    if (!traceData.reasoning) {
      return "## Reasoning\n\nNo reasoning provided.\n\n";
    }
    return `## Reasoning\n\n${traceData.reasoning}\n\n`;
  }

  /**
   * Build the Next Steps section
   */
  private buildNextStepsSection(traceData: TraceData): string {
    const sections = ["## Next Steps\n"];

    if (traceData.status === "completed") {
      sections.push("- Review the changes in the pull request");
      sections.push("- Test the implemented functionality");
      sections.push("- Merge to main after approval");
    } else {
      sections.push("- Review the error and adjust the request");
      sections.push("- Move corrected request back to /Inbox/Requests");
      sections.push("- System will retry execution");
    }

    sections.push("\n");
    return sections.join("\n");
  }

  /**
   * Generate filename following naming convention: {date}_{shortTraceId}_{requestId}.md
   */
  private generateFilename(traceData: TraceData): string {
    const date = this.formatDate(traceData.completedAt);
    const shortTraceId = traceData.traceId.substring(0, 8);
    return `${date}_${shortTraceId}_${traceData.requestId}.md`;
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  /**
   * Run a git command and return output
   */
  private async runGitCommand(cwd: string, args: string[]): Promise<string> {
    const cmd = new Deno.Command("git", {
      args,
      cwd,
      stdout: "piped",
      stderr: "piped",
    });

    const { stdout, code } = await cmd.output();

    if (code !== 0) {
      throw new Error(`Git command failed: git ${args.join(" ")}`);
    }

    return new TextDecoder().decode(stdout);
  }

  /**
   * Log successful report generation to Activity Journal
   */
  private logReportGenerated(
    traceData: TraceData,
    reportPath: string,
    durationMs: number,
  ): void {
    if (!this.reportConfig.db) return;

    try {
      this.reportConfig.db.logActivity(
        "system",
        "report.generated",
        reportPath,
        {
          report_path: reportPath,
          status: traceData.status,
          duration_ms: durationMs,
          request_id: traceData.requestId,
          agent_id: traceData.agentId,
        },
        traceData.traceId,
        traceData.agentId,
      );
    } catch (error) {
      console.error("Failed to log report generation:", error);
    }
  }

  /**
   * Log failed report generation to Activity Journal
   */
  private logReportFailed(
    traceData: TraceData,
    error: Error,
    durationMs: number,
  ): void {
    if (!this.reportConfig.db) return;

    try {
      this.reportConfig.db.logActivity(
        "system",
        "report.failed",
        null,
        {
          error: error.message,
          duration_ms: durationMs,
          request_id: traceData.requestId,
          agent_id: traceData.agentId,
        },
        traceData.traceId,
        traceData.agentId,
      );
    } catch (err) {
      console.error("Failed to log report failure:", err);
    }
  }
}
