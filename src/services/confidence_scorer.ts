/**
 * Confidence Scoring Service
 *
 * Phase 16.7 implementation: Agents express confidence in their outputs.
 *
 * Features:
 * - Extract confidence score (0-100) from agent responses
 * - Parse confidence reasoning and supporting evidence
 * - Flag low-confidence outputs for human review
 * - Propagate confidence to plan outputs
 * - Aggregation strategies for multi-agent scenarios
 */

import { z } from "zod";
import type { IModelProvider } from "../ai/providers.ts";
import type { DatabaseService } from "./db.ts";
import { AgentRunner, type Blueprint, type ParsedRequest } from "./agent_runner.ts";
import { createOutputValidator, OutputValidator } from "./output_validator.ts";

// ============================================================================
// Confidence Schema
// ============================================================================

/**
 * Schema for confidence assessment output
 */
export const ConfidenceSchema = z.object({
  score: z.number().min(0).max(100),
  level: z.enum(["very_high", "high", "medium", "low", "very_low"]),
  reasoning: z.string(),
  factors: z.array(z.object({
    name: z.string(),
    impact: z.enum(["positive", "negative", "neutral"]),
    weight: z.number().min(0).max(1),
    description: z.string(),
  })).default([]),
  uncertainty_areas: z.array(z.string()).default([]),
  requires_review: z.boolean(),
});

export type ConfidenceAssessment = z.infer<typeof ConfidenceSchema>;

// ============================================================================
// Configuration Types
// ============================================================================

export interface ConfidenceScorerConfig {
  lowConfidenceThreshold?: number;
  veryLowThreshold?: number;
  highConfidenceThreshold?: number;
  autoReview?: boolean;
  extractionPromptTemplate?: string;
  verbose?: boolean;
  db?: DatabaseService;
}

export interface ConfidenceResult {
  content: string;
  confidence: ConfidenceAssessment;
  flaggedForReview: boolean;
  extractedAt: Date;
}

export interface AggregatedConfidence {
  average: number;
  min: number;
  max: number;
  weighted: number;
  level: ConfidenceAssessment["level"];
  sources: Array<{
    agentId: string;
    score: number;
    weight: number;
  }>;
  anyFlaggedForReview: boolean;
}

export interface ConfidenceMetrics {
  totalAssessments: number;
  averageScore: number;
  flaggedCount: number;
  flaggedRate: number;
  levelDistribution: Record<ConfidenceAssessment["level"], number>;
}

// ============================================================================
// Default Prompt Template
// ============================================================================

const DEFAULT_EXTRACTION_PROMPT = `You are analyzing an AI-generated response to assess confidence level.

## Original Request
{request}

## Response to Assess
{response}

## Your Task
Assess the confidence level of this response. Consider:

1. **Knowledge Certainty**: Is the response based on well-established facts or uncertain information?
2. **Completeness**: Does the response fully address the request?
3. **Evidence Quality**: Are claims supported by concrete evidence or reasoning?
4. **Ambiguity**: Is the response clear and unambiguous?
5. **Limitations Acknowledged**: Does the response acknowledge its limitations?

## Response Format
Respond with a JSON object:
{
  "score": <0-100 confidence score>,
  "level": "very_high" | "high" | "medium" | "low" | "very_low",
  "reasoning": "Why this confidence level was assigned",
  "factors": [
    {
      "name": "factor name",
      "impact": "positive" | "negative" | "neutral",
      "weight": <0-1 importance>,
      "description": "How this factor affects confidence"
    }
  ],
  "uncertainty_areas": ["area 1", "area 2"],
  "requires_review": <true if human should verify>
}

Scoring Guidelines:
- 90-100: Very high confidence - well-established facts, clear answer
- 70-89: High confidence - reliable but some minor uncertainties
- 50-69: Medium confidence - reasonable answer but notable gaps
- 30-49: Low confidence - significant uncertainties or assumptions
- 0-29: Very low confidence - speculative, requires verification`;

// ============================================================================
// ConfidenceScorer Class
// ============================================================================

export class ConfidenceScorer {
  private agentRunner: AgentRunner;
  private outputValidator: OutputValidator;

  private config: {
    lowConfidenceThreshold: number;
    veryLowThreshold: number;
    highConfidenceThreshold: number;
    autoReview: boolean;
    extractionPromptTemplate: string;
    verbose: boolean;
    db?: DatabaseService;
  };

  private metrics: ConfidenceMetrics = {
    totalAssessments: 0,
    averageScore: 0,
    flaggedCount: 0,
    flaggedRate: 0,
    levelDistribution: {
      very_high: 0,
      high: 0,
      medium: 0,
      low: 0,
      very_low: 0,
    },
  };

  private scoreSum = 0;

  constructor(modelProvider: IModelProvider, config: ConfidenceScorerConfig = {}) {
    const {
      lowConfidenceThreshold = 50,
      veryLowThreshold = 30,
      highConfidenceThreshold = 80,
      autoReview = true,
      extractionPromptTemplate = DEFAULT_EXTRACTION_PROMPT,
      verbose = false,
      db,
    } = config;

    this.config = {
      lowConfidenceThreshold,
      veryLowThreshold,
      highConfidenceThreshold,
      autoReview,
      extractionPromptTemplate,
      verbose,
      db,
    };

    this.agentRunner = new AgentRunner(modelProvider, { db });
    this.outputValidator = createOutputValidator({ autoRepair: true });
  }

  /**
   * Extract confidence assessment from a response
   */
  async assess(request: string, response: string, traceId?: string): Promise<ConfidenceResult> {
    const assessmentPrompt = this.config.extractionPromptTemplate
      .replace("{request}", request)
      .replace("{response}", response);

    const blueprint: Blueprint = {
      systemPrompt: "You are an expert at assessing AI response confidence. Provide structured JSON output.",
      agentId: "confidence-assessor",
    };

    const parsedRequest: ParsedRequest = {
      userPrompt: assessmentPrompt,
      context: {},
      traceId,
    };

    const result = await this.agentRunner.run(blueprint, parsedRequest);

    const validationResult = this.outputValidator.validate(result.content, ConfidenceSchema);

    let confidence: ConfidenceAssessment;
    if (validationResult.success && validationResult.value) {
      confidence = validationResult.value;
    } else {
      confidence = this.createDefaultAssessment();
    }

    const flaggedForReview = this.shouldFlagForReview(confidence);

    this.updateMetrics(confidence, flaggedForReview);

    if (this.config.verbose) {
      console.log(
        `[ConfidenceScorer] Score: ${confidence.score}, Level: ${confidence.level}, Flagged: ${flaggedForReview}`,
      );
    }

    if (this.config.db && flaggedForReview) {
      this.config.db.logActivity(
        "confidence_scorer",
        "confidence.flagged",
        null,
        {
          score: confidence.score,
          level: confidence.level,
          reasoning: confidence.reasoning,
          uncertainty_areas: confidence.uncertainty_areas,
        },
        traceId,
        "confidence-assessor",
      );
    }

    return {
      content: response,
      confidence,
      flaggedForReview,
      extractedAt: new Date(),
    };
  }

  /**
   * Quick assessment without LLM call - based on heuristics
   */
  assessQuick(response: string): ConfidenceAssessment {
    let score = 70;

    const indicators = {
      certainWords: ["definitely", "certainly", "absolutely", "always", "never"],
      uncertainWords: ["maybe", "perhaps", "possibly", "might", "could be", "not sure", "uncertain"],
      hedgingWords: ["I think", "I believe", "probably", "likely", "seems"],
      qualifiers: ["however", "although", "but", "on the other hand"],
    };

    const lowered = response.toLowerCase();

    for (const word of indicators.certainWords) {
      if (lowered.includes(word)) score += 3;
    }

    for (const word of indicators.uncertainWords) {
      if (lowered.includes(word)) score -= 8;
    }

    for (const word of indicators.hedgingWords) {
      if (lowered.includes(word)) score -= 5;
    }

    for (const word of indicators.qualifiers) {
      if (lowered.includes(word)) score -= 2;
    }

    if (response.includes("?") && !response.includes('?"')) {
      score -= 10;
    }

    if (response.length < 50) score -= 15;
    if (response.length < 20) score -= 20;

    score = Math.max(0, Math.min(100, score));

    return {
      score,
      level: this.scoreToLevel(score),
      reasoning: "Quick heuristic-based assessment",
      factors: [],
      uncertainty_areas: [],
      requires_review: score < this.config.lowConfidenceThreshold,
    };
  }

  /**
   * Aggregate confidence from multiple sources
   */
  aggregate(
    confidences: Array<{ agentId: string; confidence: ConfidenceAssessment; weight?: number }>,
  ): AggregatedConfidence {
    if (confidences.length === 0) {
      return {
        average: 0,
        min: 0,
        max: 0,
        weighted: 0,
        level: "very_low",
        sources: [],
        anyFlaggedForReview: false,
      };
    }

    const scores = confidences.map((c) => c.confidence.score);
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    const min = Math.min(...scores);
    const max = Math.max(...scores);

    const totalWeight = confidences.reduce((sum, c) => sum + (c.weight ?? 1), 0);
    const weighted = confidences.reduce((sum, c) => {
      const w = c.weight ?? 1;
      return sum + (c.confidence.score * w);
    }, 0) / totalWeight;

    const anyFlaggedForReview = confidences.some((c) => c.confidence.requires_review);

    return {
      average,
      min,
      max,
      weighted,
      level: this.scoreToLevel(weighted),
      sources: confidences.map((c) => ({
        agentId: c.agentId,
        score: c.confidence.score,
        weight: c.weight ?? 1,
      })),
      anyFlaggedForReview,
    };
  }

  /**
   * Create confidence-aware wrapper for agent execution
   */
  wrapWithConfidence(
    agentRunner: AgentRunner,
  ): (blueprint: Blueprint, request: ParsedRequest) => Promise<ConfidenceResult> {
    return async (blueprint: Blueprint, request: ParsedRequest): Promise<ConfidenceResult> => {
      const result = await agentRunner.run(blueprint, request);
      return await this.assess(request.userPrompt, result.content, request.traceId);
    };
  }

  getMetrics(): ConfidenceMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalAssessments: 0,
      averageScore: 0,
      flaggedCount: 0,
      flaggedRate: 0,
      levelDistribution: {
        very_high: 0,
        high: 0,
        medium: 0,
        low: 0,
        very_low: 0,
      },
    };
    this.scoreSum = 0;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private shouldFlagForReview(confidence: ConfidenceAssessment): boolean {
    if (!this.config.autoReview) return false;

    if (confidence.requires_review) return true;

    if (confidence.score < this.config.lowConfidenceThreshold) return true;

    return false;
  }

  private scoreToLevel(score: number): ConfidenceAssessment["level"] {
    if (score >= 90) return "very_high";
    if (score >= this.config.highConfidenceThreshold) return "high";
    if (score >= this.config.lowConfidenceThreshold) return "medium";
    if (score >= this.config.veryLowThreshold) return "low";
    return "very_low";
  }

  private createDefaultAssessment(): ConfidenceAssessment {
    return {
      score: 50,
      level: "medium",
      reasoning: "Unable to parse confidence assessment, defaulting to medium",
      factors: [],
      uncertainty_areas: [],
      requires_review: true,
    };
  }

  private updateMetrics(confidence: ConfidenceAssessment, flagged: boolean): void {
    this.metrics.totalAssessments++;
    this.scoreSum += confidence.score;
    this.metrics.averageScore = this.scoreSum / this.metrics.totalAssessments;
    this.metrics.levelDistribution[confidence.level]++;

    if (flagged) {
      this.metrics.flaggedCount++;
    }
    this.metrics.flaggedRate = this.metrics.flaggedCount / this.metrics.totalAssessments;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createConfidenceScorer(
  modelProvider: IModelProvider,
  config?: ConfidenceScorerConfig,
): ConfidenceScorer {
  return new ConfidenceScorer(modelProvider, config);
}

export function createStrictConfidenceScorer(
  modelProvider: IModelProvider,
  config?: ConfidenceScorerConfig,
): ConfidenceScorer {
  return new ConfidenceScorer(modelProvider, {
    lowConfidenceThreshold: 70,
    veryLowThreshold: 50,
    highConfidenceThreshold: 90,
    autoReview: true,
    ...config,
  });
}

export function createLenientConfidenceScorer(
  modelProvider: IModelProvider,
  config?: ConfidenceScorerConfig,
): ConfidenceScorer {
  return new ConfidenceScorer(modelProvider, {
    lowConfidenceThreshold: 30,
    veryLowThreshold: 15,
    highConfidenceThreshold: 70,
    autoReview: false,
    ...config,
  });
}
