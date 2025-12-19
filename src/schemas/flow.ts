import { z } from "zod";

// FlowStep schema definition
export const FlowStepSchema = z.object({
  id: z.string().min(1, "Step ID cannot be empty"),
  name: z.string().min(1, "Step name cannot be empty"),
  agent: z.string().min(1, "Agent reference cannot be empty"),
  dependsOn: z.array(z.string()).default([]),
  input: z.object({
    source: z.enum(["request", "step", "aggregate"]).default("request"),
    stepId: z.string().optional(),
    transform: z.string().default("passthrough"),
  }).default({}),
  condition: z.string().optional(),
  timeout: z.number().positive().optional(),
  retry: z.object({
    maxAttempts: z.number().int().min(1).default(1),
    backoffMs: z.number().int().min(0).default(1000),
  }).default({}),
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
export type FlowStep = z.infer<typeof FlowStepSchema>;
export type Flow = z.infer<typeof FlowSchema>;
