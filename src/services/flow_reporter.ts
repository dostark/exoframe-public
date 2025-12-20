/**
 * Flow Reporter - Step 7.8 of Implementation Plan
 *
 * Generates comprehensive reports for flow executions, providing detailed
 * analysis of multi-agent orchestration results.
 */

import { join, relative } from "@std/path";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";
import type { FlowResult } from "../flows/flow_runner.ts";
import type { Flow } from "../schemas/flow.ts";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Configuration for the FlowReporter
 */
export interface FlowReportConfig {
  /** Directory where reports are written */
  reportsDirectory: string;

  /** Knowledge base root for relative path calculation */
  knowledgeRoot: string;

  /** Database service for activity logging */
  db?: DatabaseService;
}

/**
 * Result of flow report generation
 */
export interface FlowReportResult {
  /** Absolute path to the generated report */
  reportPath: string;

  /** Generated report content */
  content: string;

  /** Timestamp when report was created */
  createdAt: Date;
}

// ============================================================================
// FlowReporter Implementation
// ============================================================================

export class FlowReporter {
  private config: Config;
  private reportConfig: FlowReportConfig;

  constructor(config: Config, reportConfig: FlowReportConfig) {
    this.config = config;
    this.reportConfig = reportConfig;
  }

  /**
   * Generate a flow report for a completed flow execution
   */
  async generate(
    flow: Flow,
    flowResult: FlowResult,
    requestId?: string,
  ): Promise<FlowReportResult> {
    const startTime = Date.now();

    try {
      // Build the report content
      const content = await this.buildReport(flow, flowResult, requestId);

      // Generate filename: flow_{flowId}_{runId}_{timestamp}.md
      const filename = this.generateFilename(flow, flowResult);
      const reportPath = join(this.reportConfig.reportsDirectory, filename);

      // Write report to file
      await Deno.writeTextFile(reportPath, content);

      const createdAt = new Date();

      // Log success to Activity Journal
      this.logReportGenerated(flow, flowResult, reportPath, Date.now() - startTime);

      return {
        reportPath,
        content,
        createdAt,
      };
    } catch (error) {
      // Log failure to Activity Journal
      this.logReportFailed(flow, flowResult, error as Error, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Build the complete report content
   */
  private async buildReport(
    flow: Flow,
    flowResult: FlowResult,
    requestId?: string,
  ): Promise<string> {
    const sections: string[] = [];

    // 1. YAML Frontmatter
    sections.push(this.buildFrontmatter(flow, flowResult, requestId));

    // 2. Title
    sections.push(this.buildTitle(flow, flowResult));

    // 3. Execution Summary
    sections.push(this.buildExecutionSummary(flowResult));

    // 4. Step Outputs
    sections.push(this.buildStepOutputs(flowResult));

    // 5. Dependency Graph
    sections.push(this.buildDependencyGraph(flow));

    return await sections.join("\n");
  }

  /**
   * Generate YAML frontmatter for the flow report
   */
  private buildFrontmatter(
    flow: Flow,
    flowResult: FlowResult,
    requestId?: string,
  ): string {
    const completedAt = flowResult.completedAt.toISOString();
    const stepsCompleted = Array.from(flowResult.stepResults.values())
      .filter((step) => step.success).length;
    const stepsFailed = Array.from(flowResult.stepResults.values())
      .filter((step) => !step.success).length;

    const frontmatter: Record<string, any> = {
      type: "flow_report",
      flow: flow.id,
      flow_run_id: flowResult.flowRunId,
      duration_ms: flowResult.duration,
      steps_completed: stepsCompleted,
      steps_failed: stepsFailed,
      completed_at: completedAt,
      success: flowResult.success,
    };

    if (requestId) {
      frontmatter.request_id = requestId;
    }

    // Convert to YAML format
    const yamlLines = Object.entries(frontmatter).map(([key, value]) => {
      if (typeof value === "string") {
        return `${key}: "${value}"`;
      }
      return `${key}: ${value}`;
    });

    return `---\n${yamlLines.join("\n")}\n---\n\n`;
  }

  /**
   * Generate title for the flow report
   */
  private buildTitle(flow: Flow, flowResult: FlowResult): string {
    const status = flowResult.success ? "✅ Success" : "❌ Failed";
    return `# Flow Report: ${flow.name} (${status})\n\n`;
  }

  /**
   * Build execution summary table
   */
  private buildExecutionSummary(flowResult: FlowResult): string {
    const steps = Array.from(flowResult.stepResults.values());

    let summary = "## Execution Summary\n\n";
    summary += "| Step | Status | Duration | Started | Completed |\n";
    summary += "|------|--------|----------|---------|-----------|\n";

    for (const step of steps) {
      const status = step.success ? "✅" : "❌";
      const duration = `${step.duration}ms`;
      const started = step.startedAt.toLocaleTimeString();
      const completed = step.completedAt.toLocaleTimeString();

      summary += `| ${step.stepId} | ${status} | ${duration} | ${started} | ${completed} |\n`;
    }

    summary += `\n**Total Duration:** ${flowResult.duration}ms\n`;
    summary += `**Overall Status:** ${flowResult.success ? "✅ Success" : "❌ Failed"}\n\n`;

    return summary;
  }

  /**
   * Build step outputs section
   */
  private buildStepOutputs(flowResult: FlowResult): string {
    let outputs = "## Step Outputs\n\n";

    for (const [stepId, stepResult] of flowResult.stepResults) {
      outputs += `### ${stepId}\n\n`;

      if (stepResult.success && stepResult.result) {
        outputs += `**Status:** ✅ Success\n`;
        outputs += `**Duration:** ${stepResult.duration}ms\n\n`;

        // Include agent response content
        if (stepResult.result.content) {
          outputs += `**Output:**\n\n${stepResult.result.content}\n\n`;
        }

        // Include any additional metadata
        if (stepResult.result.raw) {
          outputs += `**Raw Response:**\n\n\`\`\`\n${stepResult.result.raw}\n\`\`\`\n\n`;
        }
      } else {
        outputs += `**Status:** ❌ Failed\n`;
        outputs += `**Duration:** ${stepResult.duration}ms\n`;
        if (stepResult.error) {
          outputs += `**Error:** ${stepResult.error}\n`;
        }
        outputs += "\n";
      }
    }

    return outputs;
  }

  /**
   * Build dependency graph visualization
   */
  private buildDependencyGraph(flow: Flow): string {
    let graph = "## Dependency Graph\n\n";
    graph += "```mermaid\ngraph TD\n";

    // Add nodes for each step
    for (const step of flow.steps) {
      const stepName = step.id;
      const agent = step.agent;
      graph += `    ${stepName}["${stepName}<br/>(${agent})"]\n`;
    }

    // Add edges for dependencies
    for (const step of flow.steps) {
      if (step.dependsOn && step.dependsOn.length > 0) {
        for (const dep of step.dependsOn) {
          graph += `    ${dep} --> ${step.id}\n`;
        }
      }
    }

    graph += "```\n\n";

    // Add text description
    graph += "**Flow Structure:**\n\n";
    for (const step of flow.steps) {
      const deps = step.dependsOn && step.dependsOn.length > 0
        ? ` (depends on: ${step.dependsOn.join(", ")})`
        : " (no dependencies)";
      graph += `- **${step.id}**: ${step.name}${deps}\n`;
    }

    graph += "\n";
    return graph;
  }

  /**
   * Generate filename for the flow report
   */
  private generateFilename(flow: Flow, flowResult: FlowResult): string {
    const timestamp = flowResult.completedAt.toISOString().replace(/[:.]/g, "-");
    const shortRunId = flowResult.flowRunId.slice(0, 8);
    return `flow_${flow.id}_${shortRunId}_${timestamp}.md`;
  }

  /**
   * Log successful report generation to Activity Journal
   */
  private logReportGenerated(
    flow: Flow,
    flowResult: FlowResult,
    reportPath: string,
    duration: number,
  ): void {
    if (!this.reportConfig.db) return;

    const relativePath = relative(this.reportConfig.knowledgeRoot, reportPath);

    this.reportConfig.db.logActivity(
      "system",
      "flow.report.generated",
      flow.id,
      {
        flow_run_id: flowResult.flowRunId,
        report_path: relativePath,
        duration_ms: duration,
        steps_completed: Array.from(flowResult.stepResults.values()).filter((s) => s.success).length,
        steps_failed: Array.from(flowResult.stepResults.values()).filter((s) => !s.success).length,
        success: flowResult.success,
      },
    );
  }

  /**
   * Log failed report generation to Activity Journal
   */
  private logReportFailed(
    flow: Flow,
    flowResult: FlowResult,
    error: Error,
    duration: number,
  ): void {
    if (!this.reportConfig.db) return;

    this.reportConfig.db.logActivity(
      "system",
      "flow.report.failed",
      flow.id,
      {
        flow_run_id: flowResult.flowRunId,
        error: error.message,
        duration_ms: duration,
      },
    );
  }
}
