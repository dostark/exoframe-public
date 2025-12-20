import { Flow, FlowSchema } from "../schemas/flow.ts";

/**
 * Helper function to define a flow with full TypeScript type safety.
 * Provides autocomplete, compile-time validation, and applies sensible defaults.
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
      from?: string[]; // For aggregate source
      transform?: string;
    };
    condition?: string;
    timeout?: number;
    retry?: {
      maxAttempts?: number;
      backoffMs?: number;
    };
  }>;
  output: {
    from: string | string[];
    format?: "markdown" | "json" | "concat";
  };
  settings?: {
    maxParallelism?: number;
    failFast?: boolean;
    timeout?: number;
  };
}): Flow {
  // Apply defaults and create the flow object
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
      },
      condition: step.condition,
      timeout: step.timeout,
      retry: {
        maxAttempts: step.retry?.maxAttempts ?? 1,
        backoffMs: step.retry?.backoffMs ?? 1000,
      },
    })),
    output: {
      from: config.output.from,
      format: config.output.format ?? "markdown",
    },
    settings: {
      maxParallelism: config.settings?.maxParallelism ?? 3,
      failFast: config.settings?.failFast ?? true,
      timeout: config.settings?.timeout,
    },
  };

  // Validate the flow against the schema
  return FlowSchema.parse(flow);
}
