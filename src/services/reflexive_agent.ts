/**
 * Reflexive Agent - Self-Critique and Improvement Loop
 *
 * Phase 16.4 implementation: Agents self-critique and improve outputs before finalizing.
 *
 * Features:
 * - Wraps AgentRunner for reflexive execution
 * - Configurable iteration limit
 * - Critique extraction (issues, severity, suggestions)
 * - Early exit when no issues found
 * - Metrics tracking
 */

import { z } from "zod";
import type { IModelProvider } from "../ai/providers.ts";
import type { DatabaseService } from "./db.ts";
import {
  type AgentExecutionResult,
  AgentRunner,
  type AgentRunnerConfig,
  type Blueprint,
  type ParsedRequest,
} from "./agent_runner.ts";
import { createOutputValidator, OutputValidator } from "./output_validator.ts";

// ============================================================================
// Critique Schema
// ============================================================================

/**
 * Schema for critique output from self-evaluation
 */
export const CritiqueSchema = z.object({
  quality: z.enum(["excellent", "good", "acceptable", "needs_improvement", "poor"]),
  confidence: z.number().min(0).max(100),
  passed: z.boolean(),
  issues: z.array(z.object({
    type: z.enum(["accuracy", "completeness", "clarity", "relevance", "format", "logic", "other"]),
    severity: z.enum(["critical", "major", "minor", "suggestion"]),
    description: z.string(),
    suggestion: z.string().optional(),
  })).default([]),
  reasoning: z.string(),
  improvements: z.array(z.string()).optional(),
});

export type Critique = z.infer<typeof CritiqueSchema>;

// ============================================================================
// Reflexive Execution Types
// ============================================================================

export interface ReflexiveAgentConfig extends AgentRunnerConfig {
  maxIterations?: number;
  minQuality?: Critique["quality"];
  confidenceThreshold?: number;
  critiquePromptTemplate?: string;
  refinementPromptTemplate?: string;
  verbose?: boolean;
}

export interface ReflexionIteration {
  iteration: number;
  response: AgentExecutionResult;
  critique: Critique | null;
  durationMs: number;
}

export interface ReflexiveExecutionResult {
  final: AgentExecutionResult;
  finalCritique: Critique | null;
  iterations: ReflexionIteration[];
  totalIterations: number;
  earlyExit: boolean;
  totalDurationMs: number;
  averageConfidence: number;
}

export interface ReflexionMetrics {
  totalExecutions: number;
  totalIterations: number;
  averageIterationsPerExecution: number;
  earlyExitCount: number;
  earlyExitRate: number;
  qualityDistribution: Record<Critique["quality"], number>;
  issueTypeDistribution: Record<string, number>;
}

// ============================================================================
// Critique Prompt Templates
// ============================================================================

const DEFAULT_CRITIQUE_PROMPT = `You are a quality assurance expert evaluating an AI-generated response.

## Original Request
{request}

## Response to Evaluate
{response}

## Your Task
Critically evaluate the response and provide structured feedback.

Consider:
1. **Accuracy**: Is the information correct and reliable?
2. **Completeness**: Does it fully address the request?
3. **Clarity**: Is it well-organized and easy to understand?
4. **Relevance**: Does it stay focused on the request?
5. **Format**: Does it follow any required formatting?
6. **Logic**: Is the reasoning sound and well-supported?

## Response Format
Respond with a JSON object:
{
  "quality": "excellent" | "good" | "acceptable" | "needs_improvement" | "poor",
  "confidence": <0-100>,
  "passed": <true if quality is acceptable or better>,
  "issues": [
    {
      "type": "accuracy" | "completeness" | "clarity" | "relevance" | "format" | "logic" | "other",
      "severity": "critical" | "major" | "minor" | "suggestion",
      "description": "...",
      "suggestion": "..."
    }
  ],
  "reasoning": "Overall assessment explanation",
  "improvements": ["Specific improvement 1", "Specific improvement 2"]
}`;

const DEFAULT_REFINEMENT_PROMPT = `You are refining a previous response based on feedback.

## Original Request
{request}

## Previous Response
{previousResponse}

## Critique Feedback
Quality: {quality}
Confidence: {confidence}%

### Issues Found
{issues}

### Suggested Improvements
{improvements}

## Your Task
Generate an improved response that addresses ALL identified issues.
Focus especially on issues marked as "critical" or "major".

Maintain the same format as the original response, but with improved quality.`;

// ============================================================================
// ReflexiveAgent Class
// ============================================================================

export class ReflexiveAgent {
  private agentRunner: AgentRunner;
  private critiqueRunner: AgentRunner;
  private outputValidator: OutputValidator;
  private db?: DatabaseService;

  private config: {
    maxIterations: number;
    minQuality: Critique["quality"];
    confidenceThreshold: number;
    critiquePromptTemplate: string;
    refinementPromptTemplate: string;
    verbose: boolean;
    agentRunnerConfig: AgentRunnerConfig;
  };

  private metrics: ReflexionMetrics = {
    totalExecutions: 0,
    totalIterations: 0,
    averageIterationsPerExecution: 0,
    earlyExitCount: 0,
    earlyExitRate: 0,
    qualityDistribution: {
      excellent: 0,
      good: 0,
      acceptable: 0,
      needs_improvement: 0,
      poor: 0,
    },
    issueTypeDistribution: {},
  };

  constructor(modelProvider: IModelProvider, config: ReflexiveAgentConfig = {}) {
    const {
      maxIterations = 3,
      minQuality = "acceptable",
      confidenceThreshold = 70,
      critiquePromptTemplate = DEFAULT_CRITIQUE_PROMPT,
      refinementPromptTemplate = DEFAULT_REFINEMENT_PROMPT,
      verbose = false,
      ...agentRunnerConfig
    } = config;

    this.config = {
      maxIterations,
      minQuality,
      confidenceThreshold,
      critiquePromptTemplate,
      refinementPromptTemplate,
      verbose,
      agentRunnerConfig,
    };

    this.db = agentRunnerConfig.db;
    this.agentRunner = new AgentRunner(modelProvider, agentRunnerConfig);
    this.critiqueRunner = new AgentRunner(modelProvider, agentRunnerConfig);
    this.outputValidator = createOutputValidator({ autoRepair: true });
  }

  async run(blueprint: Blueprint, request: ParsedRequest): Promise<ReflexiveExecutionResult> {
    const startTime = performance.now();
    const iterations: ReflexionIteration[] = [];
    let currentResponse: AgentExecutionResult | null = null;
    let finalCritique: Critique | null = null;
    let earlyExit = false;

    this.metrics.totalExecutions++;

    for (let i = 1; i <= this.config.maxIterations; i++) {
      const iterationStart = performance.now();

      if (i === 1) {
        currentResponse = await this.agentRunner.run(blueprint, request);
      } else {
        currentResponse = await this.refine(blueprint, request, currentResponse!, finalCritique!);
      }

      const critique = await this.critique(request, currentResponse);

      const iterationDuration = performance.now() - iterationStart;
      iterations.push({
        iteration: i,
        response: currentResponse,
        critique,
        durationMs: iterationDuration,
      });

      this.metrics.totalIterations++;
      this.updateMetrics(critique);

      this.logActivity("reflexive_agent", "reflexion.iteration", null, {
        iteration: i,
        quality: critique.quality,
        confidence: critique.confidence,
        passed: critique.passed,
        issueCount: critique.issues.length,
        durationMs: iterationDuration,
      }, request.traceId);

      if (this.shouldAccept(critique)) {
        finalCritique = critique;
        earlyExit = i < this.config.maxIterations;
        if (earlyExit) {
          this.metrics.earlyExitCount++;
        }
        break;
      }

      finalCritique = critique;
    }

    const totalDuration = performance.now() - startTime;

    this.metrics.earlyExitRate = this.metrics.earlyExitCount / this.metrics.totalExecutions;
    this.metrics.averageIterationsPerExecution = this.metrics.totalIterations / this.metrics.totalExecutions;

    this.logActivity("reflexive_agent", "reflexion.complete", null, {
      totalIterations: iterations.length,
      earlyExit,
      finalQuality: finalCritique?.quality,
      finalConfidence: finalCritique?.confidence,
      totalDurationMs: totalDuration,
    }, request.traceId);

    const confidences = iterations.map((it) => it.critique?.confidence ?? 0).filter((c) => c > 0);
    const averageConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

    return {
      final: currentResponse!,
      finalCritique,
      iterations,
      totalIterations: iterations.length,
      earlyExit,
      totalDurationMs: totalDuration,
      averageConfidence,
    };
  }

  private async critique(request: ParsedRequest, response: AgentExecutionResult): Promise<Critique> {
    const critiquePrompt = this.config.critiquePromptTemplate
      .replace("{request}", request.userPrompt)
      .replace("{response}", response.content);

    const critiqueBlueprint: Blueprint = {
      systemPrompt:
        "You are a quality assurance expert. Evaluate responses critically and provide structured JSON feedback.",
      agentId: "critique-evaluator",
    };

    const critiqueRequest: ParsedRequest = {
      userPrompt: critiquePrompt,
      context: {},
      traceId: request.traceId,
    };

    const critiqueResult = await this.critiqueRunner.run(critiqueBlueprint, critiqueRequest);

    const validationResult = this.outputValidator.validate(critiqueResult.content, CritiqueSchema);

    if (validationResult.success && validationResult.value) {
      return validationResult.value;
    }

    return {
      quality: "acceptable",
      confidence: 50,
      passed: true,
      issues: [],
      reasoning: "Unable to parse critique response, defaulting to acceptable",
    };
  }

  private async refine(
    blueprint: Blueprint,
    originalRequest: ParsedRequest,
    previousResponse: AgentExecutionResult,
    critique: Critique,
  ): Promise<AgentExecutionResult> {
    const issuesFormatted = critique.issues
      .map((issue) =>
        `- [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}${
          issue.suggestion ? ` -> ${issue.suggestion}` : ""
        }`
      )
      .join("\n");

    const improvementsFormatted = critique.improvements?.join("\n- ") || "No specific improvements suggested";

    const refinementPrompt = this.config.refinementPromptTemplate
      .replace("{request}", originalRequest.userPrompt)
      .replace("{previousResponse}", previousResponse.content)
      .replace("{quality}", critique.quality)
      .replace("{confidence}", String(critique.confidence))
      .replace("{issues}", issuesFormatted || "No specific issues listed")
      .replace("{improvements}", improvementsFormatted);

    const refinementRequest: ParsedRequest = {
      userPrompt: refinementPrompt,
      context: originalRequest.context,
      traceId: originalRequest.traceId,
    };

    return await this.agentRunner.run(blueprint, refinementRequest);
  }

  private shouldAccept(critique: Critique): boolean {
    // Critical issues should always trigger refinement, regardless of confidence/quality
    const hasCriticalIssues = critique.issues.some((issue) => issue.severity === "critical");
    if (hasCriticalIssues) {
      return false;
    }

    // Check confidence threshold
    if (critique.confidence >= this.config.confidenceThreshold) {
      return true;
    }

    // Check quality level
    const qualityOrder: Critique["quality"][] = ["excellent", "good", "acceptable", "needs_improvement", "poor"];
    const currentQualityIndex = qualityOrder.indexOf(critique.quality);
    const minQualityIndex = qualityOrder.indexOf(this.config.minQuality);

    if (currentQualityIndex <= minQualityIndex) {
      return true;
    }

    return critique.passed;
  }

  getMetrics(): ReflexionMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalExecutions: 0,
      totalIterations: 0,
      averageIterationsPerExecution: 0,
      earlyExitCount: 0,
      earlyExitRate: 0,
      qualityDistribution: {
        excellent: 0,
        good: 0,
        acceptable: 0,
        needs_improvement: 0,
        poor: 0,
      },
      issueTypeDistribution: {},
    };
  }

  private updateMetrics(critique: Critique): void {
    this.metrics.qualityDistribution[critique.quality]++;
    for (const issue of critique.issues) {
      this.metrics.issueTypeDistribution[issue.type] = (this.metrics.issueTypeDistribution[issue.type] || 0) + 1;
    }
  }

  private logActivity(
    actor: string,
    actionType: string,
    target: string | null,
    payload: Record<string, unknown>,
    traceId?: string,
  ): void {
    if (this.config.verbose) {
      console.log(`[${actor}] ${actionType}:`, payload);
    }

    if (this.db) {
      this.db.logActivity(actor, actionType, target, payload, traceId, "reflexive-agent");
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createReflexiveAgent(
  modelProvider: IModelProvider,
  config?: ReflexiveAgentConfig,
): ReflexiveAgent {
  return new ReflexiveAgent(modelProvider, config);
}

export function createCodeReviewReflexiveAgent(
  modelProvider: IModelProvider,
  config?: ReflexiveAgentConfig,
): ReflexiveAgent {
  return new ReflexiveAgent(modelProvider, {
    maxIterations: 2,
    minQuality: "good",
    confidenceThreshold: 80,
    ...config,
  });
}

export function createHighQualityReflexiveAgent(
  modelProvider: IModelProvider,
  config?: ReflexiveAgentConfig,
): ReflexiveAgent {
  return new ReflexiveAgent(modelProvider, {
    maxIterations: 5,
    minQuality: "excellent",
    confidenceThreshold: 90,
    ...config,
  });
}
