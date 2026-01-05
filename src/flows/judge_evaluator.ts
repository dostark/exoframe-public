/**
 * JudgeEvaluator - LLM-as-a-Judge integration for output evaluation
 *
 * Phase 15.3: Implements judge agent invocation and result parsing
 * for quality evaluation of agent outputs.
 *
 * @module flows/judge_evaluator
 */

import { buildEvaluationPrompt, EvaluationCriterion, EvaluationResult } from "./evaluation_criteria.ts";
import { JudgeInvoker } from "./gate_evaluator.ts";

/**
 * Interface for running agents
 */
export interface AgentRunner {
  run(
    agentId: string,
    request: { userPrompt: string; context?: Record<string, unknown> },
  ): Promise<{ content: string }>;
}

/**
 * JudgeEvaluator - Wraps agent runner to implement JudgeInvoker
 *
 * Handles:
 * - Building evaluation prompts
 * - Invoking judge agents
 * - Parsing and validating JSON responses
 * - Recovering from malformed JSON
 */
export class JudgeEvaluator implements JudgeInvoker {
  constructor(private agentRunner: AgentRunner) {}

  /**
   * Evaluate content using a judge agent
   */
  async evaluate(
    agentId: string,
    content: string,
    criteria: EvaluationCriterion[],
    context?: string,
  ): Promise<EvaluationResult> {
    // Build evaluation prompt
    const prompt = buildEvaluationPrompt(content, criteria, context);

    // Invoke judge agent
    const response = await this.agentRunner.run(agentId, {
      userPrompt: prompt,
      context: {
        evaluationMode: true,
        expectedResponseFormat: "json",
        criteria: criteria.map((c) => c.name),
      },
    });

    // Parse and validate response
    return this.parseEvaluationResponse(response.content, criteria);
  }

  /**
   * Parse evaluation response from judge agent
   */
  private parseEvaluationResponse(
    response: string,
    criteria: EvaluationCriterion[],
  ): EvaluationResult {
    // Try to extract JSON from response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
      response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      // Fallback: extract scores using heuristics
      return this.parseHeuristicResponse(response, criteria);
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];

    try {
      const parsed = JSON.parse(jsonStr);
      return this.normalizeEvaluationResult(parsed, criteria);
    } catch (_e) {
      // Try to repair JSON
      const repaired = this.repairJson(jsonStr);
      if (repaired) {
        return this.normalizeEvaluationResult(repaired, criteria);
      }

      // Fallback to heuristic parsing
      return this.parseHeuristicResponse(response, criteria);
    }
  }

  /**
   * Normalize parsed JSON to EvaluationResult format
   */
  private normalizeEvaluationResult(
    parsed: Record<string, unknown>,
    criteria: EvaluationCriterion[],
  ): EvaluationResult {
    const criteriaScores: EvaluationResult["criteriaScores"] = {};

    // Try different response formats
    for (const criterion of criteria) {
      const name = criterion.name;

      // Check for direct criterion scores
      if (parsed.criteriaScores && typeof parsed.criteriaScores === "object") {
        const scores = parsed.criteriaScores as Record<string, unknown>;
        if (scores[name] && typeof scores[name] === "object") {
          const scoreObj = scores[name] as Record<string, unknown>;
          criteriaScores[name] = {
            name,
            score: this.normalizeScore(scoreObj.score),
            reasoning: String(scoreObj.reasoning || scoreObj.reason || ""),
            issues: Array.isArray(scoreObj.issues) ? scoreObj.issues.map(String) : [],
            passed: this.normalizeScore(scoreObj.score) >=
              0.7,
          };
          continue;
        }
      }

      // Check for scores object
      if (parsed.scores && typeof parsed.scores === "object") {
        const scores = parsed.scores as Record<string, unknown>;
        if (name in scores) {
          const score = this.normalizeScore(scores[name]);
          criteriaScores[name] = {
            name,
            score,
            reasoning: "",
            issues: [],
            passed: score >= 0.7,
          };
          continue;
        }
      }

      // Check for direct criterion name at top level
      if (name in parsed) {
        const value = parsed[name];
        if (typeof value === "object" && value !== null) {
          const obj = value as Record<string, unknown>;
          criteriaScores[name] = {
            name,
            score: this.normalizeScore(obj.score ?? obj.value ?? 0),
            reasoning: String(obj.reasoning || obj.reason || obj.feedback || ""),
            issues: Array.isArray(obj.issues) ? obj.issues.map(String) : [],
            passed: this.normalizeScore(obj.score ?? obj.value ?? 0) >=
              0.7,
          };
        } else {
          const score = this.normalizeScore(value);
          criteriaScores[name] = {
            name,
            score,
            reasoning: "",
            issues: [],
            passed: score >= 0.7,
          };
        }
        continue;
      }

      // Default: criterion not found
      criteriaScores[name] = {
        name,
        score: 0,
        reasoning: "Criterion not evaluated",
        issues: ["Criterion score not found in response"],
        passed: false,
      };
    }

    // Calculate overall score
    const scores = Object.values(criteriaScores);
    const overallScore = scores.length > 0 ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length : 0;

    return {
      overallScore,
      criteriaScores,
      pass: overallScore >= 0.7,
      feedback: String(parsed.feedback || parsed.summary || ""),
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
      metadata: {
        evaluatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Normalize score to 0-1 range
   */
  private normalizeScore(value: unknown): number {
    if (typeof value === "number") {
      // Handle percentage (0-100) vs decimal (0-1)
      if (value > 1) {
        return Math.min(1, value / 100);
      }
      return Math.max(0, Math.min(1, value));
    }

    if (typeof value === "string") {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return this.normalizeScore(num);
      }
    }

    return 0;
  }

  /**
   * Try to repair malformed JSON
   */
  private repairJson(jsonStr: string): Record<string, unknown> | null {
    try {
      // Common fixes
      const repaired = jsonStr
        // Remove trailing commas
        .replace(/,\s*([\]}])/g, "$1")
        // Add missing quotes around keys
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
        // Replace single quotes with double quotes
        .replace(/'/g, '"');

      // Try parsing repaired JSON
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }

  /**
   * Parse scores using heuristics when JSON parsing fails
   */
  private parseHeuristicResponse(
    response: string,
    criteria: EvaluationCriterion[],
  ): EvaluationResult {
    const criteriaScores: EvaluationResult["criteriaScores"] = {};

    for (const criterion of criteria) {
      const name = criterion.name;

      // Look for patterns like "CriterionName: 0.8" or "CriterionName - 80%"
      const patterns = [
        new RegExp(`${name}[:\\s-]+([\\d.]+)`, "i"),
        new RegExp(`${name}[:\\s-]+([\\d]+)%`, "i"),
        new RegExp(`${name.replace(/_/g, "\\s*")}[:\\s-]+([\\d.]+)`, "i"),
      ];

      let score = 0;
      let found = false;

      for (const pattern of patterns) {
        const match = response.match(pattern);
        if (match) {
          score = this.normalizeScore(match[1]);
          found = true;
          break;
        }
      }

      // Extract reasoning near the criterion name
      const reasoningMatch = response.match(
        new RegExp(`${name}[^.]*\\.\\s*([^.]+\\.)`, "i"),
      );

      criteriaScores[name] = {
        name,
        score,
        reasoning: reasoningMatch ? reasoningMatch[1].trim() : "",
        issues: found ? [] : ["Score extracted heuristically"],
        passed: score >= 0.7,
      };
    }

    const scores = Object.values(criteriaScores);
    const overallScore = scores.length > 0 ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length : 0;

    return {
      overallScore,
      criteriaScores,
      pass: overallScore >= 0.7,
      feedback: "Evaluation extracted heuristically from response",
      suggestions: [],
      metadata: {
        evaluatedAt: new Date().toISOString(),
      },
    };
  }
}

/**
 * Create a JudgeEvaluator from an agent runner
 */
export function createJudgeEvaluator(agentRunner: AgentRunner): JudgeEvaluator {
  return new JudgeEvaluator(agentRunner);
}
