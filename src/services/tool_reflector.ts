/**
 * Tool Result Reflection Service
 *
 * Phase 16.5 implementation: Agents evaluate tool results before proceeding.
 *
 * Features:
 * - Reflect on tool call results to verify success
 * - Automatic retry with different parameters on failure
 * - Parallel execution for independent tool calls
 * - Metrics tracking for tool retry frequency
 */

import { z } from "zod";
import type { IModelProvider } from "../ai/providers.ts";
import type { DatabaseService } from "./db.ts";
import { AgentRunner, type Blueprint, type ParsedRequest } from "./agent_runner.ts";
import { createOutputValidator, OutputValidator } from "./output_validator.ts";

// ============================================================================
// Reflection Schema
// ============================================================================

/**
 * Schema for tool reflection output
 */
export const ToolReflectionSchema = z.object({
  success: z.boolean(),
  confidence: z.number().min(0).max(100),
  achieved_purpose: z.boolean(),
  issues: z.array(z.object({
    type: z.enum(["error", "incomplete", "unexpected", "timeout", "permission", "format", "other"]),
    description: z.string(),
    severity: z.enum(["critical", "major", "minor"]),
  })).default([]),
  retry_suggested: z.boolean(),
  retry_reason: z.string().optional(),
  alternative_parameters: z.record(z.unknown()).optional(),
  insights: z.array(z.string()).default([]),
});

export type ToolReflection = z.infer<typeof ToolReflectionSchema>;

// ============================================================================
// Types
// ============================================================================

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
  purpose: string;
  dependencies?: string[];
}

export interface ToolResult {
  callId: string;
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
}

export interface ReflectedToolResult extends ToolResult {
  reflection: ToolReflection;
  retryCount: number;
  finalOutput: unknown;
}

export interface ToolReflectorConfig {
  maxRetries?: number;
  reflectionThreshold?: number;
  parallelExecution?: boolean;
  reflectionPromptTemplate?: string;
  verbose?: boolean;
  db?: DatabaseService;
}

export interface ToolReflectorMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalRetries: number;
  retryRate: number;
  averageRetriesPerCall: number;
  toolDistribution: Record<string, number>;
  issueTypeDistribution: Record<string, number>;
}

// ============================================================================
// Default Prompt Template
// ============================================================================

const DEFAULT_REFLECTION_PROMPT = `You are evaluating whether a tool call achieved its intended purpose.

## Tool Call Information
Tool Name: {tool_name}
Purpose: {purpose}
Parameters: {parameters}

## Tool Result
Success: {success}
Output: {output}
Error: {error}

## Your Task
Evaluate whether this tool call achieved its purpose. Consider:

1. **Success Status**: Did the tool execute without errors?
2. **Output Validity**: Is the output meaningful and usable?
3. **Purpose Alignment**: Does the output fulfill the stated purpose?
4. **Data Quality**: Is the data complete and well-formed?
5. **Side Effects**: Are there any unexpected consequences?

## Response Format
Respond with a JSON object:
{
  "success": <true if tool call succeeded>,
  "confidence": <0-100 confidence in assessment>,
  "achieved_purpose": <true if purpose was fulfilled>,
  "issues": [
    {
      "type": "error" | "incomplete" | "unexpected" | "timeout" | "permission" | "format" | "other",
      "description": "Issue description",
      "severity": "critical" | "major" | "minor"
    }
  ],
  "retry_suggested": <true if retry would help>,
  "retry_reason": "Why retry might help (if applicable)",
  "alternative_parameters": { "key": "value" } (if retry suggested),
  "insights": ["Insight 1", "Insight 2"]
}`;

// ============================================================================
// ToolReflector Class
// ============================================================================

export class ToolReflector {
  private agentRunner: AgentRunner;
  private outputValidator: OutputValidator;

  private config: {
    maxRetries: number;
    reflectionThreshold: number;
    parallelExecution: boolean;
    reflectionPromptTemplate: string;
    verbose: boolean;
    db?: DatabaseService;
  };

  private metrics: ToolReflectorMetrics = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    totalRetries: 0,
    retryRate: 0,
    averageRetriesPerCall: 0,
    toolDistribution: {},
    issueTypeDistribution: {},
  };

  constructor(modelProvider: IModelProvider, config: ToolReflectorConfig = {}) {
    const {
      maxRetries = 2,
      reflectionThreshold = 70,
      parallelExecution = true,
      reflectionPromptTemplate = DEFAULT_REFLECTION_PROMPT,
      verbose = false,
      db,
    } = config;

    this.config = {
      maxRetries,
      reflectionThreshold,
      parallelExecution,
      reflectionPromptTemplate,
      verbose,
      db,
    };

    this.agentRunner = new AgentRunner(modelProvider, { db });
    this.outputValidator = createOutputValidator({ autoRepair: true });
  }

  /**
   * Execute a tool call with reflection
   */
  async executeWithReflection(
    toolCall: ToolCall,
    executor: (params: Record<string, unknown>) => Promise<ToolResult>,
    traceId?: string,
  ): Promise<ReflectedToolResult> {
    let currentParams = { ...toolCall.parameters };
    let retryCount = 0;
    let lastResult: ToolResult | null = null;
    let lastReflection: ToolReflection | null = null;

    this.metrics.totalCalls++;
    this.metrics.toolDistribution[toolCall.name] = (this.metrics.toolDistribution[toolCall.name] || 0) + 1;

    while (retryCount <= this.config.maxRetries) {
      lastResult = await executor(currentParams);

      lastReflection = await this.reflect(toolCall, lastResult, traceId);

      this.updateMetrics(lastReflection);

      if (this.config.verbose) {
        console.log(
          `[ToolReflector] ${toolCall.name}: success=${lastReflection.success}, confidence=${lastReflection.confidence}, retry=${lastReflection.retry_suggested}`,
        );
      }

      if (this.shouldAccept(lastReflection)) {
        this.metrics.successfulCalls++;
        break;
      }

      if (!lastReflection.retry_suggested || retryCount >= this.config.maxRetries) {
        this.metrics.failedCalls++;
        break;
      }

      if (lastReflection.alternative_parameters) {
        currentParams = { ...currentParams, ...lastReflection.alternative_parameters };
      }

      retryCount++;
      this.metrics.totalRetries++;

      this.logActivity("tool_reflector", "tool.retry", toolCall.name, {
        retryCount,
        reason: lastReflection.retry_reason,
        newParams: currentParams,
      }, traceId);
    }

    this.updateAggregateMetrics();

    return {
      ...lastResult!,
      reflection: lastReflection!,
      retryCount,
      finalOutput: lastResult!.output,
    };
  }

  /**
   * Execute multiple tool calls, potentially in parallel
   */
  async executeMultiple(
    toolCalls: ToolCall[],
    executor: (call: ToolCall) => Promise<ToolResult>,
    traceId?: string,
  ): Promise<ReflectedToolResult[]> {
    if (!this.config.parallelExecution) {
      const results: ReflectedToolResult[] = [];
      for (const call of toolCalls) {
        const result = await this.executeWithReflection(
          call,
          (params) => executor({ ...call, parameters: params }),
          traceId,
        );
        results.push(result);
      }
      return results;
    }

    const dependencyGroups = this.groupByDependencies(toolCalls);
    const results: ReflectedToolResult[] = [];
    const completedCalls = new Map<string, ReflectedToolResult>();

    for (const group of dependencyGroups) {
      const groupPromises = group.map((call) =>
        this.executeWithReflection(
          call,
          (params) => executor({ ...call, parameters: params }),
          traceId,
        ).then((result) => {
          completedCalls.set(call.id, result);
          return result;
        })
      );

      const groupResults = await Promise.all(groupPromises);
      results.push(...groupResults);
    }

    return results;
  }

  /**
   * Reflect on a tool result
   */
  private async reflect(toolCall: ToolCall, result: ToolResult, traceId?: string): Promise<ToolReflection> {
    const reflectionPrompt = this.config.reflectionPromptTemplate
      .replace("{tool_name}", toolCall.name)
      .replace("{purpose}", toolCall.purpose)
      .replace("{parameters}", JSON.stringify(toolCall.parameters, null, 2))
      .replace("{success}", String(result.success))
      .replace("{output}", this.formatOutput(result.output))
      .replace("{error}", result.error || "None");

    const blueprint: Blueprint = {
      systemPrompt:
        "You are a tool result evaluator. Assess whether tool calls achieved their purpose. Provide structured JSON output.",
      agentId: "tool-reflector",
    };

    const request: ParsedRequest = {
      userPrompt: reflectionPrompt,
      context: {},
      traceId,
    };

    const llmResult = await this.agentRunner.run(blueprint, request);

    const validationResult = this.outputValidator.validate(llmResult.content, ToolReflectionSchema);

    if (validationResult.success && validationResult.value) {
      return validationResult.value;
    }

    return this.createDefaultReflection(result);
  }

  /**
   * Determine if reflection result should be accepted
   */
  private shouldAccept(reflection: ToolReflection): boolean {
    if (!reflection.success) return false;
    if (!reflection.achieved_purpose) return false;
    if (reflection.confidence < this.config.reflectionThreshold) return false;

    const hasCriticalIssues = reflection.issues.some((i) => i.severity === "critical");
    if (hasCriticalIssues) return false;

    return true;
  }

  /**
   * Group tool calls by dependencies for parallel execution
   */
  private groupByDependencies(toolCalls: ToolCall[]): ToolCall[][] {
    const groups: ToolCall[][] = [];
    const completed = new Set<string>();
    const remaining = [...toolCalls];

    while (remaining.length > 0) {
      const currentGroup: ToolCall[] = [];

      for (let i = remaining.length - 1; i >= 0; i--) {
        const call = remaining[i];
        const deps = call.dependencies || [];
        const allDepsComplete = deps.every((dep) => completed.has(dep));

        if (allDepsComplete) {
          currentGroup.push(call);
          remaining.splice(i, 1);
        }
      }

      if (currentGroup.length === 0 && remaining.length > 0) {
        currentGroup.push(remaining.shift()!);
      }

      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup.forEach((c) => completed.add(c.id));
      }
    }

    return groups;
  }

  private formatOutput(output: unknown): string {
    if (output === null || output === undefined) return "null";
    if (typeof output === "string") {
      return output.length > 1000 ? output.substring(0, 1000) + "... (truncated)" : output;
    }
    try {
      const json = JSON.stringify(output, null, 2);
      return json.length > 1000 ? json.substring(0, 1000) + "... (truncated)" : json;
    } catch {
      return String(output);
    }
  }

  private createDefaultReflection(result: ToolResult): ToolReflection {
    return {
      success: result.success,
      confidence: result.success ? 60 : 20,
      achieved_purpose: result.success,
      issues: result.error ? [{ type: "error", description: result.error, severity: "major" as const }] : [],
      retry_suggested: !result.success,
      insights: [],
    };
  }

  private updateMetrics(reflection: ToolReflection): void {
    for (const issue of reflection.issues) {
      this.metrics.issueTypeDistribution[issue.type] = (this.metrics.issueTypeDistribution[issue.type] || 0) + 1;
    }
  }

  private updateAggregateMetrics(): void {
    if (this.metrics.totalCalls > 0) {
      this.metrics.retryRate = this.metrics.totalRetries / this.metrics.totalCalls;
      this.metrics.averageRetriesPerCall = this.metrics.totalRetries / this.metrics.totalCalls;
    }
  }

  private logActivity(
    actor: string,
    actionType: string,
    target: string,
    payload: Record<string, unknown>,
    traceId?: string,
  ): void {
    if (this.config.db) {
      this.config.db.logActivity(actor, actionType, target, payload, traceId, "tool-reflector");
    }
  }

  getMetrics(): ToolReflectorMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalRetries: 0,
      retryRate: 0,
      averageRetriesPerCall: 0,
      toolDistribution: {},
      issueTypeDistribution: {},
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createToolReflector(
  modelProvider: IModelProvider,
  config?: ToolReflectorConfig,
): ToolReflector {
  return new ToolReflector(modelProvider, config);
}

export function createStrictToolReflector(
  modelProvider: IModelProvider,
  config?: ToolReflectorConfig,
): ToolReflector {
  return new ToolReflector(modelProvider, {
    maxRetries: 3,
    reflectionThreshold: 85,
    parallelExecution: false,
    ...config,
  });
}

export function createFastToolReflector(
  modelProvider: IModelProvider,
  config?: ToolReflectorConfig,
): ToolReflector {
  return new ToolReflector(modelProvider, {
    maxRetries: 1,
    reflectionThreshold: 50,
    parallelExecution: true,
    ...config,
  });
}
