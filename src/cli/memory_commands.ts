/**
 * Memory Bank CLI Commands
 *
 * Provides commands for interacting with Memory Banks:
 * - memory list: List all memory banks (projects, executions)
 * - memory search: Search across all memory
 * - memory project list|show: Project memory operations
 * - memory execution list|show: Execution history operations
 *
 * Part of Phase 12.5: Core CLI Commands for Memory Banks v2
 */

import { join } from "@std/path";
import { exists } from "@std/fs";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "../services/db.ts";
import { MemoryBankService } from "../services/memory_bank.ts";
import type {
  ExecutionMemory,
  GlobalMemory,
  GlobalMemoryStats,
  Learning,
  MemorySearchResult,
  ProjectMemory,
} from "../schemas/memory_bank.ts";

export type OutputFormat = "table" | "json" | "md";

export interface MemoryBankSummary {
  projects: string[];
  executions: number;
  lastActivity: string | null;
}

export interface MemoryCommandsContext {
  config: Config;
  db: DatabaseService;
}

/**
 * Memory Commands handler
 *
 * Provides CLI interface for Memory Banks operations.
 */
export class MemoryCommands {
  private config: Config;
  private db: DatabaseService;
  private memoryBank: MemoryBankService;
  private memoryRoot: string;

  constructor(context: MemoryCommandsContext) {
    this.config = context.config;
    this.db = context.db;
    this.memoryBank = new MemoryBankService(context.config, context.db);
    this.memoryRoot = join(context.config.system.root, "Memory");
  }

  // ===== Memory List Command =====

  /**
   * List all memory banks with summary information
   *
   * @param format - Output format (table, json, md)
   * @returns Formatted output string
   */
  async list(format: OutputFormat = "table"): Promise<string> {
    const summary = await this.getSummary();

    switch (format) {
      case "json":
        return JSON.stringify(summary, null, 2);
      case "md":
        return this.formatListMarkdown(summary);
      case "table":
      default:
        return this.formatListTable(summary);
    }
  }

  /**
   * Get memory banks summary
   */
  async getSummary(): Promise<MemoryBankSummary> {
    const projects: string[] = [];
    let executions = 0;
    let lastActivity: string | null = null;

    // List projects
    const projectsDir = join(this.memoryRoot, "Projects");
    if (await exists(projectsDir)) {
      for await (const entry of Deno.readDir(projectsDir)) {
        if (entry.isDirectory) {
          projects.push(entry.name);
        }
      }
    }

    // Count executions and find last activity
    const executionDir = join(this.memoryRoot, "Execution");
    if (await exists(executionDir)) {
      const executionList = await this.memoryBank.getExecutionHistory(undefined, 1);
      executions = await this.countExecutions();
      if (executionList.length > 0) {
        lastActivity = executionList[0].started_at;
      }
    }

    return {
      projects: projects.sort(),
      executions,
      lastActivity,
    };
  }

  /**
   * Count total executions
   */
  private async countExecutions(): Promise<number> {
    let count = 0;
    const executionDir = join(this.memoryRoot, "Execution");
    if (await exists(executionDir)) {
      for await (const entry of Deno.readDir(executionDir)) {
        if (entry.isDirectory) {
          count++;
        }
      }
    }
    return count;
  }

  private formatListTable(summary: MemoryBankSummary): string {
    const lines: string[] = [
      "Memory Banks Summary",
      "═".repeat(50),
      "",
      `Projects:    ${summary.projects.length}`,
      `Executions:  ${summary.executions}`,
      `Last Active: ${summary.lastActivity || "Never"}`,
      "",
    ];

    if (summary.projects.length > 0) {
      lines.push("Projects:");
      lines.push("─".repeat(30));
      for (const project of summary.projects) {
        lines.push(`  • ${project}`);
      }
    }

    return lines.join("\n");
  }

  private formatListMarkdown(summary: MemoryBankSummary): string {
    const lines: string[] = [
      "# Memory Banks Summary",
      "",
      "| Metric | Value |",
      "|--------|-------|",
      `| Projects | ${summary.projects.length} |`,
      `| Executions | ${summary.executions} |`,
      `| Last Active | ${summary.lastActivity || "Never"} |`,
      "",
    ];

    if (summary.projects.length > 0) {
      lines.push("## Projects");
      lines.push("");
      for (const project of summary.projects) {
        lines.push(`- ${project}`);
      }
    }

    return lines.join("\n");
  }

  // ===== Memory Search Command =====

  /**
   * Search across all memory banks
   *
   * @param query - Search query
   * @param options - Search options
   * @returns Formatted search results
   */
  async search(
    query: string,
    options?: {
      portal?: string;
      tags?: string[];
      limit?: number;
      format?: OutputFormat;
    },
  ): Promise<string> {
    const format = options?.format || "table";
    const limit = options?.limit || 20;

    const results = await this.memoryBank.searchMemory(query, {
      portal: options?.portal,
      limit,
    }); // Filter by tags if specified
    const filteredResults = options?.tags ? this.filterByTags(results, options.tags) : results;

    switch (format) {
      case "json":
        return JSON.stringify(filteredResults, null, 2);
      case "md":
        return this.formatSearchMarkdown(query, filteredResults);
      case "table":
      default:
        return this.formatSearchTable(query, filteredResults);
    }
  }

  private filterByTags(
    results: MemorySearchResult[],
    _tags: string[],
  ): MemorySearchResult[] {
    // For now, return all results - tag filtering will be enhanced in Phase 12.10
    // This is a placeholder that maintains API compatibility
    return results;
  }

  private formatSearchTable(query: string, results: MemorySearchResult[]): string {
    if (results.length === 0) {
      return `No results found for "${query}"`;
    }

    const lines: string[] = [
      `Search Results for "${query}"`,
      "═".repeat(60),
      "",
      `Found ${results.length} result(s)`,
      "",
      "Type       │ Portal          │ Title",
      "───────────┼─────────────────┼" + "─".repeat(30),
    ];

    for (const result of results) {
      const type = result.type.padEnd(10);
      const portal = (result.portal || "-").padEnd(15);
      const title = result.title.substring(0, 30);
      lines.push(`${type} │ ${portal} │ ${title}`);
    }

    return lines.join("\n");
  }

  private formatSearchMarkdown(
    query: string,
    results: MemorySearchResult[],
  ): string {
    if (results.length === 0) {
      return `# Search Results\n\nNo results found for "${query}"`;
    }

    const lines: string[] = [
      `# Search Results for "${query}"`,
      "",
      `Found ${results.length} result(s)`,
      "",
      "| Type | Portal | Title | Score |",
      "|------|--------|-------|-------|",
    ];

    for (const result of results) {
      const score = (result.relevance_score || 0).toFixed(2);
      lines.push(
        `| ${result.type} | ${result.portal || "-"} | ${result.title} | ${score} |`,
      );
    }

    return lines.join("\n");
  }

  // ===== Project Commands =====

  /**
   * List all project memories
   *
   * @param format - Output format
   * @returns Formatted project list
   */
  async projectList(format: OutputFormat = "table"): Promise<string> {
    const projects: { name: string; patterns: number; decisions: number }[] = [];

    const projectsDir = join(this.memoryRoot, "Projects");
    if (await exists(projectsDir)) {
      for await (const entry of Deno.readDir(projectsDir)) {
        if (entry.isDirectory) {
          const projectMem = await this.memoryBank.getProjectMemory(entry.name);
          if (projectMem) {
            projects.push({
              name: entry.name,
              patterns: projectMem.patterns.length,
              decisions: projectMem.decisions.length,
            });
          }
        }
      }
    }

    projects.sort((a, b) => a.name.localeCompare(b.name));

    switch (format) {
      case "json":
        return JSON.stringify(projects, null, 2);
      case "md":
        return this.formatProjectListMarkdown(projects);
      case "table":
      default:
        return this.formatProjectListTable(projects);
    }
  }

  private formatProjectListTable(
    projects: { name: string; patterns: number; decisions: number }[],
  ): string {
    if (projects.length === 0) {
      return "No project memories found.";
    }

    const lines: string[] = [
      "Project Memories",
      "═".repeat(50),
      "",
      "Name                 │ Patterns │ Decisions",
      "─────────────────────┼──────────┼──────────",
    ];

    for (const project of projects) {
      const name = project.name.padEnd(20);
      const patterns = String(project.patterns).padStart(8);
      const decisions = String(project.decisions).padStart(9);
      lines.push(`${name} │${patterns} │${decisions}`);
    }

    lines.push("");
    lines.push(`Total: ${projects.length} project(s)`);

    return lines.join("\n");
  }

  private formatProjectListMarkdown(
    projects: { name: string; patterns: number; decisions: number }[],
  ): string {
    if (projects.length === 0) {
      return "# Project Memories\n\nNo project memories found.";
    }

    const lines: string[] = [
      "# Project Memories",
      "",
      "| Project | Patterns | Decisions |",
      "|---------|----------|-----------|",
    ];

    for (const project of projects) {
      lines.push(
        `| ${project.name} | ${project.patterns} | ${project.decisions} |`,
      );
    }

    lines.push("");
    lines.push(`**Total:** ${projects.length} project(s)`);

    return lines.join("\n");
  }

  /**
   * Show details of a specific project memory
   *
   * @param portal - Portal name
   * @param format - Output format
   * @returns Formatted project details or error message
   */
  async projectShow(portal: string, format: OutputFormat = "table"): Promise<string> {
    const projectMem = await this.memoryBank.getProjectMemory(portal);

    if (!projectMem) {
      return `Error: Project memory not found for portal "${portal}"`;
    }

    switch (format) {
      case "json":
        return JSON.stringify(projectMem, null, 2);
      case "md":
        return this.formatProjectShowMarkdown(projectMem);
      case "table":
      default:
        return this.formatProjectShowTable(projectMem);
    }
  }

  private formatProjectShowTable(project: ProjectMemory): string {
    const lines: string[] = [
      `Project Memory: ${project.portal}`,
      "═".repeat(60),
      "",
      "Overview:",
      "─".repeat(40),
      project.overview.substring(0, 500),
      "",
    ];

    if (project.patterns.length > 0) {
      lines.push(`Patterns (${project.patterns.length}):`);
      lines.push("─".repeat(40));
      for (const pattern of project.patterns) {
        lines.push(`  • ${pattern.name}`);
        lines.push(`    ${pattern.description.substring(0, 60)}...`);
      }
      lines.push("");
    }

    if (project.decisions.length > 0) {
      lines.push(`Decisions (${project.decisions.length}):`);
      lines.push("─".repeat(40));
      for (const decision of project.decisions) {
        lines.push(`  • [${decision.date}] ${decision.decision.substring(0, 50)}...`);
      }
      lines.push("");
    }

    if (project.references.length > 0) {
      lines.push(`References (${project.references.length}):`);
      lines.push("─".repeat(40));
      for (const ref of project.references) {
        lines.push(`  • [${ref.type}] ${ref.path}`);
      }
    }

    return lines.join("\n");
  }

  private formatProjectShowMarkdown(project: ProjectMemory): string {
    const lines: string[] = [
      `# Project Memory: ${project.portal}`,
      "",
      "## Overview",
      "",
      project.overview,
      "",
    ];

    if (project.patterns.length > 0) {
      lines.push(`## Patterns (${project.patterns.length})`);
      lines.push("");
      for (const pattern of project.patterns) {
        lines.push(`### ${pattern.name}`);
        lines.push("");
        lines.push(pattern.description);
        if (pattern.tags && pattern.tags.length > 0) {
          lines.push("");
          lines.push(`**Tags:** ${pattern.tags.join(", ")}`);
        }
        lines.push("");
      }
    }

    if (project.decisions.length > 0) {
      lines.push(`## Decisions (${project.decisions.length})`);
      lines.push("");
      for (const decision of project.decisions) {
        lines.push(`### ${decision.date}`);
        lines.push("");
        lines.push(`**Decision:** ${decision.decision}`);
        lines.push("");
        lines.push(`**Rationale:** ${decision.rationale}`);
        if (decision.tags && decision.tags.length > 0) {
          lines.push("");
          lines.push(`**Tags:** ${decision.tags.join(", ")}`);
        }
        lines.push("");
      }
    }

    if (project.references.length > 0) {
      lines.push(`## References (${project.references.length})`);
      lines.push("");
      for (const ref of project.references) {
        lines.push(`- **[${ref.type}]** ${ref.path}: ${ref.description}`);
      }
    }

    return lines.join("\n");
  }

  // ===== Execution Commands =====

  /**
   * List execution history
   *
   * @param options - List options (portal filter, limit)
   * @returns Formatted execution list
   */
  async executionList(
    options?: {
      portal?: string;
      limit?: number;
      format?: OutputFormat;
    },
  ): Promise<string> {
    const format = options?.format || "table";
    const limit = options?.limit || 20;

    const executions = await this.memoryBank.getExecutionHistory(
      options?.portal,
      limit,
    );

    switch (format) {
      case "json":
        return JSON.stringify(executions, null, 2);
      case "md":
        return this.formatExecutionListMarkdown(executions);
      case "table":
      default:
        return this.formatExecutionListTable(executions);
    }
  }

  private formatExecutionListTable(executions: ExecutionMemory[]): string {
    if (executions.length === 0) {
      return "No execution history found.";
    }

    const lines: string[] = [
      "Execution History",
      "═".repeat(80),
      "",
      "Trace ID   │ Status    │ Portal          │ Started",
      "───────────┼───────────┼─────────────────┼" + "─".repeat(20),
    ];

    for (const exec of executions) {
      const traceId = exec.trace_id.substring(0, 8) + "..";
      const status = exec.status.padEnd(9);
      const portal = exec.portal.padEnd(15);
      const started = exec.started_at.substring(0, 19);
      lines.push(`${traceId} │ ${status} │ ${portal} │ ${started}`);
    }

    lines.push("");
    lines.push(`Showing ${executions.length} execution(s)`);

    return lines.join("\n");
  }

  private formatExecutionListMarkdown(executions: ExecutionMemory[]): string {
    if (executions.length === 0) {
      return "# Execution History\n\nNo execution history found.";
    }

    const lines: string[] = [
      "# Execution History",
      "",
      "| Trace ID | Status | Portal | Agent | Started |",
      "|----------|--------|--------|-------|---------|",
    ];

    for (const exec of executions) {
      const traceId = exec.trace_id.substring(0, 8);
      lines.push(
        `| ${traceId}... | ${exec.status} | ${exec.portal} | ${exec.agent} | ${exec.started_at} |`,
      );
    }

    lines.push("");
    lines.push(`**Showing:** ${executions.length} execution(s)`);

    return lines.join("\n");
  }

  /**
   * Show details of a specific execution
   *
   * @param traceId - Execution trace ID
   * @param format - Output format
   * @returns Formatted execution details or error message
   */
  async executionShow(traceId: string, format: OutputFormat = "table"): Promise<string> {
    const execution = await this.memoryBank.getExecutionByTraceId(traceId);

    if (!execution) {
      return `Error: Execution not found for trace ID "${traceId}"`;
    }

    switch (format) {
      case "json":
        return JSON.stringify(execution, null, 2);
      case "md":
        return this.formatExecutionShowMarkdown(execution);
      case "table":
      default:
        return this.formatExecutionShowTable(execution);
    }
  }

  private formatExecutionShowTable(exec: ExecutionMemory): string {
    const lines: string[] = [
      `Execution Details: ${exec.trace_id}`,
      "═".repeat(70),
      "",
      `Trace ID:    ${exec.trace_id}`,
      `Request ID:  ${exec.request_id}`,
      `Status:      ${exec.status}`,
      `Portal:      ${exec.portal}`,
      `Agent:       ${exec.agent}`,
      `Started:     ${exec.started_at}`,
      `Completed:   ${exec.completed_at || "In progress"}`,
      "",
      "Summary:",
      "─".repeat(40),
      exec.summary,
      "",
    ];

    if (exec.context_files && exec.context_files.length > 0) {
      lines.push(`Context Files (${exec.context_files.length}):`);
      lines.push("─".repeat(40));
      for (const file of exec.context_files) {
        lines.push(`  • ${file}`);
      }
      lines.push("");
    }

    if (exec.changes) {
      const created = exec.changes.files_created?.length || 0;
      const modified = exec.changes.files_modified?.length || 0;
      const deleted = exec.changes.files_deleted?.length || 0;

      if (created + modified + deleted > 0) {
        lines.push("Changes:");
        lines.push("─".repeat(40));
        if (created > 0) {
          lines.push(`  Created:  ${created} file(s)`);
          for (const f of exec.changes.files_created || []) {
            lines.push(`    + ${f}`);
          }
        }
        if (modified > 0) {
          lines.push(`  Modified: ${modified} file(s)`);
          for (const f of exec.changes.files_modified || []) {
            lines.push(`    ~ ${f}`);
          }
        }
        if (deleted > 0) {
          lines.push(`  Deleted:  ${deleted} file(s)`);
          for (const f of exec.changes.files_deleted || []) {
            lines.push(`    - ${f}`);
          }
        }
        lines.push("");
      }
    }

    if (exec.lessons_learned && exec.lessons_learned.length > 0) {
      lines.push("Lessons Learned:");
      lines.push("─".repeat(40));
      for (const lesson of exec.lessons_learned) {
        lines.push(`  • ${lesson}`);
      }
      lines.push("");
    }

    if (exec.error_message) {
      lines.push("Error:");
      lines.push("─".repeat(40));
      lines.push(`  ${exec.error_message}`);
    }

    return lines.join("\n");
  }

  private formatExecutionShowMarkdown(exec: ExecutionMemory): string {
    const lines: string[] = [
      `# Execution: ${exec.trace_id}`,
      "",
      "## Details",
      "",
      "| Field | Value |",
      "|-------|-------|",
      `| Trace ID | \`${exec.trace_id}\` |`,
      `| Request ID | \`${exec.request_id}\` |`,
      `| Status | ${exec.status} |`,
      `| Portal | ${exec.portal} |`,
      `| Agent | ${exec.agent} |`,
      `| Started | ${exec.started_at} |`,
      `| Completed | ${exec.completed_at || "In progress"} |`,
      "",
      "## Summary",
      "",
      exec.summary,
      "",
    ];

    if (exec.context_files && exec.context_files.length > 0) {
      lines.push("## Context Files");
      lines.push("");
      for (const file of exec.context_files) {
        lines.push(`- \`${file}\``);
      }
      lines.push("");
    }

    if (exec.changes) {
      const created = exec.changes.files_created || [];
      const modified = exec.changes.files_modified || [];
      const deleted = exec.changes.files_deleted || [];

      if (created.length + modified.length + deleted.length > 0) {
        lines.push("## Changes");
        lines.push("");
        if (created.length > 0) {
          lines.push("### Created");
          for (const f of created) lines.push(`- \`${f}\``);
          lines.push("");
        }
        if (modified.length > 0) {
          lines.push("### Modified");
          for (const f of modified) lines.push(`- \`${f}\``);
          lines.push("");
        }
        if (deleted.length > 0) {
          lines.push("### Deleted");
          for (const f of deleted) lines.push(`- \`${f}\``);
          lines.push("");
        }
      }
    }

    if (exec.lessons_learned && exec.lessons_learned.length > 0) {
      lines.push("## Lessons Learned");
      lines.push("");
      for (const lesson of exec.lessons_learned) {
        lines.push(`- ${lesson}`);
      }
      lines.push("");
    }

    if (exec.error_message) {
      lines.push("## Error");
      lines.push("");
      lines.push("```");
      lines.push(exec.error_message);
      lines.push("```");
    }

    return lines.join("\n");
  }

  // ===== Global Memory Commands (Phase 12.8) =====

  /**
   * Show global memory contents
   *
   * @param format - Output format
   * @returns Formatted global memory or error message
   */
  async globalShow(format: OutputFormat = "table"): Promise<string> {
    const globalMem = await this.memoryBank.getGlobalMemory();

    if (!globalMem) {
      return "Global memory not initialized. Run 'exoctl memory global init' first.";
    }

    switch (format) {
      case "json":
        return JSON.stringify(globalMem, null, 2);
      case "md":
        return this.formatGlobalShowMarkdown(globalMem);
      case "table":
      default:
        return this.formatGlobalShowTable(globalMem);
    }
  }

  private formatGlobalShowTable(globalMem: GlobalMemory): string {
    const lines: string[] = [
      "Global Memory",
      "═".repeat(60),
      "",
      `Version:    ${globalMem.version}`,
      `Updated:    ${globalMem.updated_at}`,
      `Learnings:  ${globalMem.learnings.length}`,
      `Patterns:   ${globalMem.patterns.length}`,
      `Anti-Patterns: ${globalMem.anti_patterns.length}`,
      "",
    ];

    if (globalMem.learnings.length > 0) {
      lines.push("Recent Learnings (top 5):");
      lines.push("─".repeat(50));
      for (const learning of globalMem.learnings.slice(0, 5)) {
        lines.push(`  • [${learning.category}] ${learning.title}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private formatGlobalShowMarkdown(globalMem: GlobalMemory): string {
    const lines: string[] = [
      "# Global Memory",
      "",
      "| Property | Value |",
      "|----------|-------|",
      `| Version | ${globalMem.version} |`,
      `| Updated | ${globalMem.updated_at} |`,
      `| Learnings | ${globalMem.learnings.length} |`,
      `| Patterns | ${globalMem.patterns.length} |`,
      `| Anti-Patterns | ${globalMem.anti_patterns.length} |`,
      "",
      "## Statistics",
      "",
      `- **Total Learnings:** ${globalMem.statistics.total_learnings}`,
      `- **Last Activity:** ${globalMem.statistics.last_activity}`,
      "",
    ];

    if (Object.keys(globalMem.statistics.by_category).length > 0) {
      lines.push("### By Category");
      lines.push("");
      for (const [cat, count] of Object.entries(globalMem.statistics.by_category)) {
        lines.push(`- ${cat}: ${count}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * List all global learnings
   *
   * @param format - Output format
   * @returns Formatted learnings list
   */
  async globalListLearnings(format: OutputFormat = "table"): Promise<string> {
    const globalMem = await this.memoryBank.getGlobalMemory();

    if (!globalMem) {
      return "Global memory not initialized.";
    }

    const learnings = globalMem.learnings;

    if (learnings.length === 0) {
      return "No learnings in global memory.";
    }

    switch (format) {
      case "json":
        return JSON.stringify(learnings, null, 2);
      case "md":
        return this.formatGlobalLearningsMarkdown(learnings);
      case "table":
      default:
        return this.formatGlobalLearningsTable(learnings);
    }
  }

  private formatGlobalLearningsTable(learnings: Learning[]): string {
    const lines: string[] = [
      "Global Learnings",
      "═".repeat(80),
      "",
      "ID         │ Category      │ Confidence │ Title",
      "───────────┼───────────────┼────────────┼" + "─".repeat(40),
    ];

    for (const l of learnings) {
      const id = l.id.substring(0, 8) + "..";
      const category = l.category.padEnd(13);
      const confidence = l.confidence.padEnd(10);
      const title = l.title.substring(0, 35);
      lines.push(`${id} │ ${category} │ ${confidence} │ ${title}`);
    }

    lines.push("");
    lines.push(`Total: ${learnings.length} learning(s)`);

    return lines.join("\n");
  }

  private formatGlobalLearningsMarkdown(learnings: Learning[]): string {
    const lines: string[] = [
      "# Global Learnings",
      "",
      "| ID | Category | Title | Confidence | Source |",
      "|----|----------|-------|------------|--------|",
    ];

    for (const l of learnings) {
      lines.push(
        `| ${l.id.substring(0, 8)}... | ${l.category} | ${l.title} | ${l.confidence} | ${l.source} |`,
      );
    }

    lines.push("");
    lines.push(`**Total:** ${learnings.length} learning(s)`);

    return lines.join("\n");
  }

  /**
   * Show global memory statistics
   *
   * @param format - Output format
   * @returns Formatted statistics
   */
  async globalStats(format: OutputFormat = "table"): Promise<string> {
    const globalMem = await this.memoryBank.getGlobalMemory();

    if (!globalMem) {
      return "Global memory not initialized.";
    }

    const stats = globalMem.statistics;

    switch (format) {
      case "json":
        return JSON.stringify(stats, null, 2);
      case "md":
        return this.formatGlobalStatsMarkdown(stats);
      case "table":
      default:
        return this.formatGlobalStatsTable(stats);
    }
  }

  private formatGlobalStatsTable(stats: GlobalMemoryStats): string {
    const lines: string[] = [
      "Global Memory Statistics",
      "═".repeat(50),
      "",
      `Total Learnings: ${stats.total_learnings}`,
      `Last Activity:   ${stats.last_activity}`,
      "",
    ];

    if (Object.keys(stats.by_category).length > 0) {
      lines.push("By Category:");
      lines.push("─".repeat(30));
      for (const [cat, count] of Object.entries(stats.by_category)) {
        lines.push(`  ${cat.padEnd(20)} ${count}`);
      }
      lines.push("");
    }

    if (Object.keys(stats.by_project).length > 0) {
      lines.push("By Project:");
      lines.push("─".repeat(30));
      for (const [project, count] of Object.entries(stats.by_project)) {
        lines.push(`  ${project.padEnd(20)} ${count}`);
      }
    }

    return lines.join("\n");
  }

  private formatGlobalStatsMarkdown(stats: GlobalMemoryStats): string {
    const lines: string[] = [
      "# Global Memory Statistics",
      "",
      "| Metric | Value |",
      "|--------|-------|",
      `| Total Learnings | ${stats.total_learnings} |`,
      `| Last Activity | ${stats.last_activity} |`,
      "",
    ];

    if (Object.keys(stats.by_category).length > 0) {
      lines.push("## By Category");
      lines.push("");
      for (const [cat, count] of Object.entries(stats.by_category)) {
        lines.push(`- **${cat}:** ${count}`);
      }
      lines.push("");
    }

    if (Object.keys(stats.by_project).length > 0) {
      lines.push("## By Project");
      lines.push("");
      for (const [project, count] of Object.entries(stats.by_project)) {
        lines.push(`- **${project}:** ${count}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Promote a learning from project to global scope
   *
   * @param portal - Source portal name
   * @param promotion - Promotion details
   * @returns Success or error message
   */
  async promote(
    portal: string,
    promotion: {
      type: "pattern" | "decision";
      name: string;
      title: string;
      description: string;
      category: Learning["category"];
      tags: string[];
      confidence: Learning["confidence"];
    },
  ): Promise<string> {
    try {
      const learningId = await this.memoryBank.promoteLearning(portal, promotion);
      return `Learning promoted successfully.\nID: ${learningId}\nTitle: ${promotion.title}\nFrom: ${portal} → global`;
    } catch (error) {
      return `Error: ${(error as Error).message}`;
    }
  }

  /**
   * Demote a learning from global to project scope
   *
   * @param learningId - ID of the learning to demote
   * @param targetPortal - Target portal name
   * @returns Success or error message
   */
  async demote(learningId: string, targetPortal: string): Promise<string> {
    try {
      await this.memoryBank.demoteLearning(learningId, targetPortal);
      return `Learning demoted successfully.\nID: ${learningId}\nTo: ${targetPortal}`;
    } catch (error) {
      return `Error: ${(error as Error).message}`;
    }
  }

  // ===== Rebuild Index Command =====

  /**
   * Rebuild all memory bank indices
   *
   * @returns Status message
   */
  async rebuildIndex(): Promise<string> {
    await this.memoryBank.rebuildIndices();
    return "Memory bank indices rebuilt successfully.";
  }
}
