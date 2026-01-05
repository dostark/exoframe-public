import { z } from "zod";

// Gate evaluation configuration schema
export const GateEvaluateSchema = z.object({
  /** Judge agent ID */
  agent: z.string(),
  /** Criteria to evaluate (names from built-in library or custom) */
  criteria: z.array(z.string()),
  /** Score threshold for passing (0.0 - 1.0) */
  threshold: z.number().min(0).max(1).default(0.8),
  /** Action on failure */
  onFail: z.enum(["retry", "halt", "continue-with-warning"]).default("halt"),
  /** Max retries if onFail is "retry" */
  maxRetries: z.number().int().min(1).default(3),
});

// Feedback loop configuration schema
export const FeedbackLoopSchema = z.object({
  /** Maximum iterations */
  maxIterations: z.number().int().min(1).max(10).default(3),
  /** Target score to achieve */
  targetScore: z.number().min(0).max(1).default(0.9),
  /** Step ID to loop back to */
  backTo: z.string().optional(),
});

// Branch condition schema
export const BranchConditionSchema = z.object({
  /** Condition expression */
  condition: z.string(),
  /** Step ID to goto if condition matches */
  goto: z.string(),
});

// Consensus configuration schema
export const ConsensusConfigSchema = z.object({
  /** Consensus method */
  method: z.enum(["majority", "weighted", "unanimous", "judge"]).default("judge"),
  /** Judge agent for "judge" method */
  judge: z.string().optional(),
  /** Weights for "weighted" method */
  weights: z.record(z.number()).optional(),
});

// FlowStep schema definition
export const FlowStepSchema = z.object({
  id: z.string().min(1, "Step ID cannot be empty"),
  name: z.string().min(1, "Step name cannot be empty"),
  /** Step type: standard agent step, gate, branch, or consensus. Defaults to "agent" */
  type: z.enum(["agent", "gate", "branch", "consensus"]).optional().default("agent"),
  /** Agent reference (required for agent type, optional for others) */
  agent: z.string().min(1, "Agent reference cannot be empty"),
  dependsOn: z.array(z.string()).default([]),
  input: z.object({
    source: z.enum(["request", "step", "aggregate", "feedback"]).default("request"),
    stepId: z.string().optional(),
    from: z.array(z.string()).optional(), // For aggregate source
    transform: z.union([z.string(), z.function()]).default("passthrough"),
    transformArgs: z.any().optional(), // Arguments for transform functions
    feedbackStepId: z.string().optional(), // For feedback source
  }).default({}),
  /** Condition for step execution (JavaScript expression) */
  condition: z.string().optional(),
  timeout: z.number().positive().optional(),
  retry: z.object({
    maxAttempts: z.number().int().min(1).default(1),
    backoffMs: z.number().int().min(0).default(1000),
  }).default({}),
  /** Gate evaluation config (for type: "gate") */
  evaluate: GateEvaluateSchema.optional(),
  /** Feedback loop config */
  loop: FeedbackLoopSchema.optional(),
  /** Branch conditions (for type: "branch") */
  branches: z.array(BranchConditionSchema).optional(),
  /** Default branch if no condition matches */
  default: z.string().optional(),
  /** Consensus config (for type: "consensus") */
  consensus: ConsensusConfigSchema.optional(),
});

// Flow schema definition
export const FlowSchema = z.object({
  id: z.string().min(1, "Flow ID cannot be empty"),
  name: z.string().min(1, "Flow name cannot be empty"),
  description: z.string().min(1, "Flow description cannot be empty"),
  version: z.string().default("1.0.0"),
  steps: z.array(FlowStepSchema).min(1, "Flow must have at least one step"),
  output: z.object({
    from: z.union([z.string(), z.array(z.string())]),
    format: z.enum(["markdown", "json", "concat"]).default("markdown"),
  }),
  settings: z.object({
    maxParallelism: z.number().int().min(1).default(3),
    failFast: z.boolean().default(true),
    timeout: z.number().positive().optional(),
  }).default({}),
});

// Type exports for use in other modules
/** FlowStep type after schema parsing (with defaults applied) */
export type FlowStep = z.infer<typeof FlowStepSchema>;
/** FlowStep input type (before defaults are applied, fields with defaults are optional) */
export type FlowStepInput = z.input<typeof FlowStepSchema>;
/** Flow type after schema parsing (with defaults applied) */
export type Flow = z.infer<typeof FlowSchema>;
/** Flow input type (before defaults are applied) */
export type FlowInput = z.input<typeof FlowSchema>;
export type GateEvaluate = z.infer<typeof GateEvaluateSchema>;
export type FeedbackLoopConfig = z.infer<typeof FeedbackLoopSchema>;
export type BranchCondition = z.infer<typeof BranchConditionSchema>;
export type ConsensusConfig = z.infer<typeof ConsensusConfigSchema>;
