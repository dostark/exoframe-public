/**
 * Evaluation Criteria Library
 *
 * Phase 15.3: LLM-as-a-Judge Integration
 * Provides built-in criteria definitions for evaluating agent outputs.
 *
 * @module flows/evaluation_criteria
 */

import { z } from "zod";

/**
 * Schema for an evaluation criterion
 */
export const EvaluationCriterionSchema = z.object({
  /** Unique identifier for the criterion */
  name: z.string(),
  /** Human-readable description for the LLM judge */
  description: z.string(),
  /** Weight for scoring (default 1.0) */
  weight: z.number().min(0).max(10).default(1.0),
  /** Whether this criterion must pass for overall pass */
  required: z.boolean().default(false),
  /** Category for grouping criteria */
  category: z.enum([
    "quality",
    "correctness",
    "completeness",
    "security",
    "style",
    "performance",
  ]).optional(),
});

export type EvaluationCriterion = z.infer<typeof EvaluationCriterionSchema>;

/**
 * Schema for criterion evaluation result
 */
export const CriterionResultSchema = z.object({
  /** Criterion name */
  name: z.string(),
  /** Score from 0.0 to 1.0 */
  score: z.number().min(0).max(1),
  /** Brief reasoning for the score */
  reasoning: z.string(),
  /** Specific issues found */
  issues: z.array(z.string()).default([]),
  /** Whether this criterion passed (score >= threshold) */
  passed: z.boolean(),
});

export type CriterionResult = z.infer<typeof CriterionResultSchema>;

/**
 * Schema for complete evaluation result
 */
export const EvaluationResultSchema = z.object({
  /** Overall weighted score */
  overallScore: z.number().min(0).max(1),
  /** Individual criterion results */
  criteriaScores: z.record(CriterionResultSchema),
  /** Whether overall evaluation passed */
  pass: z.boolean(),
  /** Overall feedback summary */
  feedback: z.string(),
  /** Suggestions for improvement */
  suggestions: z.array(z.string()).default([]),
  /** Evaluation metadata */
  metadata: z.object({
    evaluatedAt: z.string(),
    evaluatorAgent: z.string().optional(),
    evaluationDurationMs: z.number().optional(),
  }).optional(),
});

export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

/**
 * Built-in evaluation criteria for common use cases
 */
export const CRITERIA = {
  // Code Quality Criteria
  CODE_CORRECTNESS: {
    name: "code_correctness",
    description:
      "Code is syntactically correct and would compile/run without errors. Check for syntax errors, type mismatches, and logical correctness.",
    weight: 2.0,
    required: true,
    category: "correctness" as const,
  },

  CODE_COMPLETENESS: {
    name: "code_completeness",
    description:
      "All requirements from the prompt are addressed. Implementation covers all requested functionality without missing features.",
    weight: 1.5,
    required: true,
    category: "completeness" as const,
  },

  HAS_TESTS: {
    name: "has_tests",
    description:
      "Implementation includes appropriate test coverage. Tests cover main functionality, edge cases, and error scenarios.",
    weight: 1.0,
    required: false,
    category: "quality" as const,
  },

  FOLLOWS_CONVENTIONS: {
    name: "follows_conventions",
    description:
      "Code follows project style and naming conventions. Consistent formatting, meaningful variable names, and idiomatic patterns.",
    weight: 0.8,
    required: false,
    category: "style" as const,
  },

  NO_SECURITY_ISSUES: {
    name: "no_security_issues",
    description:
      "No obvious security vulnerabilities. Checks for injection risks, exposed secrets, insecure patterns, and unsafe operations.",
    weight: 2.0,
    required: true,
    category: "security" as const,
  },

  ERROR_HANDLING: {
    name: "error_handling",
    description:
      "Proper error handling is implemented. Errors are caught, logged appropriately, and meaningful messages are provided.",
    weight: 1.0,
    required: false,
    category: "quality" as const,
  },

  // Content Quality Criteria
  CLARITY: {
    name: "clarity",
    description:
      "Output is clear, well-organized, and understandable. Logical structure, good formatting, and easy to follow.",
    weight: 1.0,
    required: false,
    category: "quality" as const,
  },

  ACCURACY: {
    name: "accuracy",
    description: "Information provided is factually correct and accurate. No hallucinations or incorrect statements.",
    weight: 2.0,
    required: true,
    category: "correctness" as const,
  },

  RELEVANCE: {
    name: "relevance",
    description:
      "Response is relevant to the original request. Directly addresses the question without unnecessary tangents.",
    weight: 1.2,
    required: false,
    category: "completeness" as const,
  },

  CONCISENESS: {
    name: "conciseness",
    description:
      "Response is appropriately concise without unnecessary verbosity. Information is presented efficiently.",
    weight: 0.5,
    required: false,
    category: "style" as const,
  },

  // Technical Documentation Criteria
  DOCUMENTATION_QUALITY: {
    name: "documentation_quality",
    description:
      "Documentation is clear, comprehensive, and follows best practices. Includes examples where appropriate.",
    weight: 1.0,
    required: false,
    category: "quality" as const,
  },

  API_CONSISTENCY: {
    name: "api_consistency",
    description: "API design is consistent with existing patterns. Follows established conventions and naming schemes.",
    weight: 0.8,
    required: false,
    category: "style" as const,
  },

  // Performance Criteria
  PERFORMANCE_CONSIDERATIONS: {
    name: "performance_considerations",
    description:
      "Implementation considers performance implications. Avoids obvious inefficiencies and uses appropriate algorithms.",
    weight: 0.7,
    required: false,
    category: "performance" as const,
  },

  SCALABILITY: {
    name: "scalability",
    description: "Solution can scale appropriately. Handles edge cases like empty inputs and large datasets.",
    weight: 0.5,
    required: false,
    category: "performance" as const,
  },
} as const;

/**
 * Pre-defined criterion sets for common evaluation scenarios
 */
export const CRITERION_SETS = {
  /** Basic code review criteria */
  CODE_REVIEW: [
    CRITERIA.CODE_CORRECTNESS,
    CRITERIA.CODE_COMPLETENESS,
    CRITERIA.FOLLOWS_CONVENTIONS,
    CRITERIA.ERROR_HANDLING,
    CRITERIA.NO_SECURITY_ISSUES,
  ],

  /** Full code review with tests and docs */
  CODE_REVIEW_FULL: [
    CRITERIA.CODE_CORRECTNESS,
    CRITERIA.CODE_COMPLETENESS,
    CRITERIA.HAS_TESTS,
    CRITERIA.FOLLOWS_CONVENTIONS,
    CRITERIA.ERROR_HANDLING,
    CRITERIA.NO_SECURITY_ISSUES,
    CRITERIA.DOCUMENTATION_QUALITY,
    CRITERIA.PERFORMANCE_CONSIDERATIONS,
  ],

  /** Security-focused review */
  SECURITY_REVIEW: [
    CRITERIA.NO_SECURITY_ISSUES,
    CRITERIA.ERROR_HANDLING,
    CRITERIA.CODE_CORRECTNESS,
  ],

  /** Content/document quality */
  CONTENT_QUALITY: [
    CRITERIA.CLARITY,
    CRITERIA.ACCURACY,
    CRITERIA.RELEVANCE,
    CRITERIA.CONCISENESS,
    CRITERIA.DOCUMENTATION_QUALITY,
  ],

  /** Minimal quality gate */
  MINIMAL_GATE: [
    CRITERIA.CODE_CORRECTNESS,
    CRITERIA.ACCURACY,
    CRITERIA.RELEVANCE,
  ],

  /** API design review */
  API_REVIEW: [
    CRITERIA.CODE_CORRECTNESS,
    CRITERIA.API_CONSISTENCY,
    CRITERIA.DOCUMENTATION_QUALITY,
    CRITERIA.ERROR_HANDLING,
  ],
};

/**
 * Get criteria by names
 */
export function getCriteriaByNames(names: string[]): EvaluationCriterion[] {
  const criteria: EvaluationCriterion[] = [];

  for (const name of names) {
    const upperName = name.toUpperCase().replace(/-/g, "_");
    const criterion = CRITERIA[upperName as keyof typeof CRITERIA];
    if (criterion) {
      criteria.push(criterion);
    } else {
      // Check if it's a custom criterion name, skip if not found
      console.warn(`Unknown criterion: ${name}`);
    }
  }

  return criteria;
}

/**
 * Calculate weighted average score from criterion results
 */
export function calculateWeightedScore(
  criteriaResults: Record<string, CriterionResult>,
  criteria: EvaluationCriterion[],
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const criterion of criteria) {
    const result = criteriaResults[criterion.name];
    if (result) {
      weightedSum += result.score * criterion.weight;
      totalWeight += criterion.weight;
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Check if all required criteria passed
 */
export function checkRequiredCriteria(
  criteriaResults: Record<string, CriterionResult>,
  criteria: EvaluationCriterion[],
  threshold: number = 0.7,
): boolean {
  for (const criterion of criteria) {
    if (criterion.required) {
      const result = criteriaResults[criterion.name];
      if (!result || result.score < threshold) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Create a custom evaluation criterion
 */
export function createCriterion(
  name: string,
  description: string,
  options: Partial<Omit<EvaluationCriterion, "name" | "description">> = {},
): EvaluationCriterion {
  return EvaluationCriterionSchema.parse({
    name,
    description,
    ...options,
  });
}

/**
 * Build evaluation prompt for judge agent
 */
export function buildEvaluationPrompt(
  content: string,
  criteria: EvaluationCriterion[],
  context?: string,
): string {
  const criteriaList = criteria
    .map((c, i) =>
      `${i + 1}. **${c.name}** (weight: ${c.weight}${c.required ? ", REQUIRED" : ""})\n   ${c.description}`
    )
    .join("\n\n");

  return `## Evaluation Request

${context ? `### Context\n${context}\n\n` : ""}### Content to Evaluate

\`\`\`
${content}
\`\`\`

### Evaluation Criteria

${criteriaList}

### Instructions

Evaluate the content against each criterion above. For each criterion:
1. Assign a score from 0.0 to 1.0
2. Provide brief reasoning (1-2 sentences)
3. List specific issues found (if any)

Then provide an overall assessment.

### Required Output Format

Respond with valid JSON only:

\`\`\`json
{
  "overallScore": 0.85,
  "criteriaScores": {
    "criterion_name": {
      "name": "criterion_name",
      "score": 0.9,
      "reasoning": "Brief explanation",
      "issues": ["issue 1", "issue 2"],
      "passed": true
    }
  },
  "pass": true,
  "feedback": "Overall assessment summary",
  "suggestions": ["suggestion 1", "suggestion 2"]
}
\`\`\``;
}
