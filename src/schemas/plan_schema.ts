/**
 * Plan Schema - JSON schema validation for LLM plan output
 * Implements Step 6.7 of the ExoFrame Implementation Plan
 *
 * Defines Zod validation schemas for structured plan output from LLMs.
 * LLMs generate JSON within <content> tags that is validated against these schemas
 * before being converted to markdown for storage.
 */

import { z } from "zod";

// ============================================================================
// Plan Step Schema
// ============================================================================

/**
 * Zod schema for individual plan steps
 */
export const PlanStepSchema = z.object({
  /** Step number (1-indexed, sequential) */
  step: z.number().int().positive(),

  /** Step title/summary (max 200 chars) */
  title: z.string().min(1).max(200),

  /** Detailed description of what this step does */
  description: z.string().min(1),

  /** Optional: Tools required for this step */
  tools: z.array(
    z.enum(["read_file", "write_file", "run_command", "list_directory", "search_files"]),
  ).optional(),

  /** Optional: Success criteria to validate step completion */
  successCriteria: z.array(z.string()).optional(),

  /** Optional: Dependencies on other steps (by step number) */
  dependencies: z.array(z.number().int().positive()).optional(),

  /** Optional: Rollback instructions if step fails */
  rollback: z.string().optional(),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

// ============================================================================
// Plan Schema
// ============================================================================

/**
 * Zod schema for complete execution plans
 */
export const PlanSchema = z.object({
  /** Plan title/goal (max 300 chars) */
  title: z.string().min(1).max(300),

  /** Overall plan description */
  description: z.string().min(1),

  /** Ordered list of execution steps (1-50 steps) */
  steps: z.array(PlanStepSchema).min(1).max(50),

  /** Optional: Estimated total duration */
  estimatedDuration: z.string().optional(),

  /** Optional: Risk assessment */
  risks: z.array(z.string()).optional(),
});

export type Plan = z.infer<typeof PlanSchema>;
