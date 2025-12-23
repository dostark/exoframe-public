import { Flow, FlowSchema } from "../schemas/flow.ts";

/**
 * Helper to construct a Flow with sensible defaults and schema validation.
 */
export function defineFlow(config: {
  id: string;
  name: string;
  description: string;
  version?: string;
  steps: Array<{
    id: string;
    name: string;
    agent: string;
    dependsOn?: string[];
    input?: {
      source?: "request" | "step" | "aggregate";
      stepId?: string;
      from?: string[];
      transform?: string;
      transformArgs?: unknown;
    };
    condition?: string;
    timeout?: number;
    retry?: {
      maxAttempts?: number;
      backoffMs?: number;
    };
  }>;
  output: { from: string | string[]; format?: "markdown" | "json" | "concat" };
  settings?: { maxParallelism?: number; failFast?: boolean; timeout?: number };
}): Flow {
  // Basic validation for required top-level fields
  if (!config.id || config.id.trim() === "") throw new Error("Flow ID cannot be empty");
  if (!config.name || config.name.trim() === "") throw new Error("Flow name cannot be empty");
  if (!config.description || config.description.trim() === "") throw new Error("Flow description cannot be empty");
  if (!config.steps || config.steps.length === 0) throw new Error("Flow must have at least one step");

  // Validate each step basic constraints before applying defaults
  for (const s of config.steps) {
    if (!s.id || s.id.trim() === "") throw new Error("Step ID cannot be empty");
    if (!s.name || s.name.trim() === "") throw new Error("Step name cannot be empty");
  }

  const flow: Flow = {
    id: config.id,
    name: config.name,
    description: config.description,
    version: config.version ?? "1.0.0",
    steps: config.steps.map((step) => ({
      id: step.id,
      name: step.name,
      agent: step.agent,
      dependsOn: step.dependsOn ?? [],
      input: {
        source: step.input?.source ?? "request",
        stepId: step.input?.stepId,
        from: step.input?.from,
        transform: step.input?.transform ?? "passthrough",
        transformArgs: step.input?.transformArgs,
      },
      condition: step.condition,
      timeout: step.timeout,
      retry: {
        maxAttempts: step.retry?.maxAttempts ?? 1,
        backoffMs: step.retry?.backoffMs ?? 1000,
      },
    })),
    output: { from: config.output.from, format: config.output.format ?? "markdown" },
    settings: {
      maxParallelism: config.settings?.maxParallelism ?? 3,
      failFast: config.settings?.failFast ?? true,
      timeout: config.settings?.timeout,
    },
  };

  // Validate against schema to surface numeric/range and structural errors
  const parsed = FlowSchema.parse(flow);
  return parsed;
}
