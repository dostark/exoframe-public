// Removed unused imports
// import { basename, join, relative } from "@std/path";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";
import { MemoryBankService } from "./memory_bank.ts";
import type { ExecutionMemory } from "../schemas/memory_bank.ts";

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
  /** Directory where reports are written (now Memory/Execution/) */
  reportsDirectory: string;
}

/**
 * Result of report generation
 */
export interface ReportResult {
  /** Whether the report generation succeeded */
  success: boolean;

  /** Absolute path to the generated report directory */
  reportPath?: string;

  /** Error message if generation failed */
  error?: string;

  /** Trace ID for the execution */
  traceId: string;

  /** Timestamp when report was created */
  createdAt: Date;

  /** Size of generated files in bytes */
  fileSize?: number;

  /** Git change statistics */
  gitStats?: GitChangeStats;
}

/**
 * Git change statistics from diff analysis
 */
export interface GitChangeStats {
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
  private memoryBank: MemoryBankService;
  private db?: DatabaseService;

  constructor(
    config: Config,
    reportConfig: ReportConfig,
    memoryBank: MemoryBankService,
    db?: DatabaseService,
  ) {
    this.config = config;
    this.reportConfig = reportConfig;
    this.memoryBank = memoryBank;
    this.db = db;
  }

  /**
   * Generate a mission report for a completed trace using Memory Banks
   */
  async generate(traceData: TraceData): Promise<ReportResult> {
    const startTime = Date.now();

    try {
      // Get git changes for this trace
      const gitStats = await this.getGitStats(traceData.branch, traceData.traceId);

      // Extract lessons learned from reasoning and summary
      const lessonsLearned = this.extractLessonsLearned(traceData.reasoning, traceData.summary);

      // Create execution memory record
      const executionMemory: ExecutionMemory = {
        trace_id: traceData.traceId,
        request_id: traceData.requestId,
        started_at: new Date(Date.now() - (5 * 60 * 1000)).toISOString(), // Approximate start time
        completed_at: traceData.completedAt.toISOString(),
        status: traceData.status,
        portal: this.extractPortalFromContext(traceData.contextFiles),
        agent: traceData.agentId,
        summary: traceData.summary,
        context_files: traceData.contextFiles,
        context_portals: [this.extractPortalFromContext(traceData.contextFiles)],
        changes: {
          files_created: gitStats.filesCreated,
          files_modified: gitStats.filesModified,
          files_deleted: gitStats.filesDeleted,
        },
        lessons_learned: lessonsLearned,
        error_message: traceData.status === "failed" ? "Execution failed" : undefined,
      };

      // Create execution record using Memory Bank service
      await this.memoryBank.createExecutionRecord(executionMemory);

      const createdAt = new Date();
      const reportPath = `Memory/Execution/${traceData.traceId}/summary.md`;

      // Log success
      this.logActivity({
        event_type: "report.generated",
        target: traceData.requestId,
        trace_id: traceData.traceId,
        metadata: {
          agent: traceData.agentId,
          status: traceData.status,
          context_files_count: traceData.contextFiles.length,
          files_changed: gitStats.totalFilesChanged,
          generation_time_ms: Date.now() - startTime,
        },
      });

      return {
        success: true,
        reportPath,
        traceId: traceData.traceId,
        createdAt,
        fileSize: 0, // Will be calculated by memory bank service
        gitStats,
      };
    } catch (error) {
      // Log error
      this.logActivity({
        event_type: "report.error",
        target: traceData.requestId,
        trace_id: traceData.traceId,
        metadata: {
          error: (error as Error).message,
          generation_time_ms: Date.now() - startTime,
        },
      });

      return {
        success: false,
        error: `Failed to generate mission report: ${(error as Error).message}`,
        traceId: traceData.traceId,
        createdAt: new Date(),
      };
    }
  }

  /**
   * Extract lessons learned from reasoning and summary text
   */
  private extractLessonsLearned(reasoning: string, summary: string): string[] {
    const lessons: string[] = [];
    const text = `${reasoning} ${summary}`.toLowerCase();

    // Look for common lesson patterns
    const patterns = [
      /learned that (.+?)[\\.!\\?]/g,
      /discovered (.+?)[\\.!\\?]/g,
      /found that (.+?)[\\.!\\?]/g,
      /realized (.+?)[\\.!\\?]/g,
      /important to (.+?)[\\.!\\?]/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const lesson = match[1].trim();
        if (lesson.length > 10 && lesson.length < 200) {
          lessons.push(lesson.charAt(0).toUpperCase() + lesson.slice(1));
        }
      }
    }

    return lessons.slice(0, 5); // Limit to 5 lessons
  }

  /**
   * Extract portal name from context files
   */
  private extractPortalFromContext(contextFiles: string[]): string {
    for (const file of contextFiles) {
      if (file.includes("Portals/")) {
        const parts = file.split("/");
        const portalIndex = parts.indexOf("Portals");
        if (portalIndex >= 0 && portalIndex + 1 < parts.length) {
          return parts[portalIndex + 1];
        }
      }
    }
    return "unknown"; // Default portal name
  }

  /**
   * Log activity to database if available
   */
  private logActivity(activityData: {
    event_type: string;
    target: string;
    trace_id: string;
    metadata: Record<string, unknown>;
  }): void {
    if (!this.db) return;

    try {
      this.db.logActivity(
        "system",
        activityData.event_type,
        activityData.target,
        activityData.metadata,
        activityData.trace_id,
        "mission_reporter",
      );
    } catch (error) {
      console.error("Failed to log activity:", error);
    }
  }

  /**
   * Get git statistics for the trace's branch
   */
  private async getGitStats(_branch: string, _traceId: string): Promise<GitChangeStats> {
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
    const lines = output.trim().split("\\n");

    for (const line of lines) {
      const parts = line.split(/\\s+/);
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
    const summaryMatch = output.match(/(\\d+) insertions?\\(\\+\\)/);
    const deletionsMatch = output.match(/(\\d+) deletions?\\(-\\)/);

    if (summaryMatch) stats.insertions = parseInt(summaryMatch[1], 10);
    if (deletionsMatch) stats.deletions = parseInt(deletionsMatch[1], 10);

    return stats;
  }

  /**
   * Run git command and return output
   */
  private async runGitCommand(cwd: string, args: string[]): Promise<string> {
    try {
      const cmd = new Deno.Command("git", {
        args,
        cwd,
        stdout: "piped",
        stderr: "piped",
      });
      const { stdout, code } = await cmd.output();
      if (code !== 0) {
        return "";
      }
      return new TextDecoder().decode(stdout);
    } catch {
      return "";
    }
  }
}
