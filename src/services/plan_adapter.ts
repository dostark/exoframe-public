/**
 * Plan Adapter - JSON validation and markdown conversion for LLM plans
 * Implements Step 6.7 of the ExoFrame Implementation Plan
 *
 * Responsibilities:
 * 1. Parse and validate JSON plan output from LLMs
 * 2. Convert validated Plan objects to readable markdown
 * 3. Provide structured error reporting for validation failures
 */

import { ZodError } from "zod";
import { Plan, PlanSchema } from "../schemas/plan_schema.ts";

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown when plan validation fails
 */
export class PlanValidationError extends Error {
  constructor(
    message: string,
    public details: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PlanValidationError";
  }
}

// ============================================================================
// Plan Adapter Service
// ============================================================================

/**
 * PlanAdapter validates JSON plans and converts them to markdown
 */
export class PlanAdapter {
  /**
   * Parse and validate LLM plan content as JSON
   * @param content - Raw LLM content from <content> tags
   * @returns Validated Plan object
   * @throws PlanValidationError if JSON is invalid or doesn't match schema
   */
  parse(content: string): Plan {
    let json: unknown;

    // Step 1: Parse JSON
    try {
      json = JSON.parse(content.trim());
    } catch (error) {
      throw new PlanValidationError(
        "Plan content is not valid JSON",
        { cause: error, rawContent: content },
      );
    }

    // Step 2: Validate against schema
    try {
      return PlanSchema.parse(json);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new PlanValidationError(
          "Plan JSON does not match required schema",
          {
            zodErrors: error.errors,
            rawContent: content,
            parsedJson: json,
          },
        );
      }
      throw error;
    }
  }

  /**
   * Convert Plan object to markdown for human readability
   * (used for plan file storage and display)
   */
  toMarkdown(plan: Plan): string {
    const sections = [
      `# ${plan.title}`,
      "",
      plan.description,
      "",
    ];

    if (plan.estimatedDuration) {
      sections.push(`**Estimated Duration:** ${plan.estimatedDuration}`, "");
    }

    if (plan.risks && plan.risks.length > 0) {
      sections.push("## Risks", "");
      plan.risks.forEach((risk) => sections.push(`- ${risk}`));
      sections.push("");
    }

    sections.push("## Execution Steps", "");

    plan.steps.forEach((step) => {
      sections.push(`## Step ${step.step}: ${step.title}`);
      sections.push("");
      sections.push(step.description);
      sections.push("");

      if (step.dependencies && step.dependencies.length > 0) {
        sections.push(`**Dependencies:** Steps ${step.dependencies.join(", ")}`);
        sections.push("");
      }

      if (step.tools && step.tools.length > 0) {
        sections.push(`**Tools:** ${step.tools.join(", ")}`);
        sections.push("");
      }

      if (step.successCriteria && step.successCriteria.length > 0) {
        sections.push("**Success Criteria:**");
        step.successCriteria.forEach((criteria) => sections.push(`- ${criteria}`));
        sections.push("");
      }

      if (step.rollback) {
        sections.push(`**Rollback:** ${step.rollback}`);
        sections.push("");
      }
    });

    return sections.join("\n");
  }
}
