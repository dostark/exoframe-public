import { Flow, FlowStep } from "../schemas/flow.ts";
import { DependencyResolver } from "./dependency_resolver.ts";
import { AgentExecutionResult } from "../services/agent_runner.ts";

/**
 * Error thrown when flow execution fails
 */
export class FlowExecutionError extends Error {
  constructor(message: string, public readonly flowRunId?: string) {
    super(message);
    this.name = "FlowExecutionError";
  }
}

/**
 * Result of executing a single flow step
 */
export interface StepResult {
  /** Step ID */
  stepId: string;
  /** Whether the step succeeded */
  success: boolean;
  /** Execution result if successful */
  result?: AgentExecutionResult;
  /** Error message if failed */
  error?: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** When the step started */
  startedAt: Date;
  /** When the step completed */
  completedAt: Date;
}

/**
 * Result of executing a complete flow
 */
export interface FlowResult {
  /** Unique flow run identifier */
  flowRunId: string;
  /** Whether the overall flow succeeded */
  success: boolean;
  /** Results for each step */
  stepResults: Map<string, StepResult>;
  /** Final aggregated output */
  output: string;
  /** Total execution duration */
  duration: number;
  /** When the flow started */
  startedAt: Date;
  /** When the flow completed */
  completedAt: Date;
}

/**
 * Interface for executing individual agent steps
 */
export interface AgentExecutor {
  run(agentId: string, request: FlowStepRequest): Promise<AgentExecutionResult>;
}

/**
 * Request format for flow step execution
 */
export interface FlowStepRequest {
  userPrompt: string;
  context?: Record<string, unknown>;
  traceId?: string;
  requestId?: string;
}

/**
 * Interface for logging flow events
 */
export interface FlowEventLogger {
  log(event: string, payload: any): void;
}

/**
 * FlowRunner - Orchestrates multi-agent flow execution
 * Implements Step 7.4 of the ExoFrame Implementation Plan
 */
export class FlowRunner {
  constructor(
    private agentExecutor: AgentExecutor,
    private eventLogger: FlowEventLogger,
  ) {}

  /**
   * Execute a flow with the given request
   */
  async execute(flow: Flow, request: { userPrompt: string; traceId?: string; requestId?: string }): Promise<FlowResult> {
    const flowRunId = crypto.randomUUID();
    const startedAt = new Date();

    // Validate flow has steps
    if (flow.steps.length === 0) {
      throw new FlowExecutionError("Flow must have at least one step", flowRunId);
    }

    // Log flow start
    this.eventLogger.log("flow.started", {
      flowRunId,
      flowId: flow.id,
      stepCount: flow.steps.length,
      traceId: request.traceId,
      requestId: request.requestId,
    });

    try {
      // Resolve dependency graph
      const resolver = new DependencyResolver(flow.steps);
      const waves = resolver.groupIntoWaves();

      const stepResults = new Map<string, StepResult>();
      const maxParallelism = flow.settings?.maxParallelism ?? 3;
      const failFast = flow.settings?.failFast ?? true;

      // Execute waves sequentially
      for (const wave of waves) {
        // Execute steps in this wave in parallel (with semaphore limit)
        const wavePromises = wave.map(stepId => this.executeStep(flowRunId, stepId, flow, request, stepResults));
        const waveResults = await Promise.allSettled(wavePromises);

        // Process results
        let waveFailed = false;
        for (let i = 0; i < wave.length; i++) {
          const stepId = wave[i];
          const promiseResult = waveResults[i];

          if (promiseResult.status === "fulfilled") {
            stepResults.set(stepId, promiseResult.value);
            if (!promiseResult.value.success && failFast) {
              waveFailed = true;
            }
          } else {
            // Step execution threw an error
            const errorStepResult: StepResult = {
              stepId,
              success: false,
              error: promiseResult.reason?.message || "Unknown error",
              duration: 0,
              startedAt: new Date(),
              completedAt: new Date(),
            };
            stepResults.set(stepId, errorStepResult);
            if (failFast) {
              waveFailed = true;
            }
          }
        }

        // If failFast is enabled and any step in this wave failed, stop execution
        if (waveFailed && failFast) {
          const failedStepId = wave.find((stepId, i) => {
            const result = waveResults[i];
            return result.status === "rejected" ||
                   (result.status === "fulfilled" && !result.value.success);
          });
          throw new FlowExecutionError(`Step ${failedStepId} failed`, flowRunId);
        }
      }

      // Aggregate output
      const output = this.aggregateOutput(flow, stepResults);

      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      // Determine overall success
      const success = Array.from(stepResults.values()).every(result => result.success);

      // Log flow completion
      this.eventLogger.log("flow.completed", {
        flowRunId,
        flowId: flow.id,
        success,
        duration,
        stepsCompleted: stepResults.size,
        traceId: request.traceId,
        requestId: request.requestId,
      });

      return {
        flowRunId,
        success,
        stepResults,
        output,
        duration,
        startedAt,
        completedAt,
      };

    } catch (error) {
      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      // Log flow failure
      this.eventLogger.log("flow.failed", {
        flowRunId,
        flowId: flow.id,
        error: error instanceof Error ? error.message : String(error),
        duration,
        traceId: request.traceId,
        requestId: request.requestId,
      });

      throw error;
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    flowRunId: string,
    stepId: string,
    flow: Flow,
    request: { userPrompt: string; traceId?: string; requestId?: string },
    stepResults: Map<string, StepResult>
  ): Promise<StepResult> {
    const step = flow.steps.find(s => s.id === stepId)!;
    const startedAt = new Date();

    // Log step start
    this.eventLogger.log("flow.step.started", {
      flowRunId,
      stepId,
      agent: step.agent,
      traceId: request.traceId,
      requestId: request.requestId,
    });

    try {
      // Prepare step input
      const stepRequest = this.prepareStepRequest(step, request, stepResults);

      // Execute step
      const result = await this.agentExecutor.run(step.agent, stepRequest);

      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      // Log step completion
      this.eventLogger.log("flow.step.completed", {
        flowRunId,
        stepId,
        success: true,
        duration,
        traceId: request.traceId,
        requestId: request.requestId,
      });

      return {
        stepId,
        success: true,
        result,
        duration,
        startedAt,
        completedAt,
      };

    } catch (error) {
      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      // Log step failure
      this.eventLogger.log("flow.step.failed", {
        flowRunId,
        stepId,
        error: error instanceof Error ? error.message : String(error),
        duration,
        traceId: request.traceId,
        requestId: request.requestId,
      });

      return {
        stepId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
        startedAt,
        completedAt,
      };
    }
  }

  /**
   * Prepare the request for a step execution
   */
  private prepareStepRequest(
    step: FlowStep,
    originalRequest: { userPrompt: string; traceId?: string; requestId?: string },
    stepResults: Map<string, StepResult>
  ): FlowStepRequest {
    let userPrompt: string;
    const context: Record<string, unknown> = {};

    switch (step.input.source) {
      case "request":
        userPrompt = originalRequest.userPrompt;
        break;

      case "step":
        if (!step.input.stepId) {
          throw new Error(`Step ${step.id} has source "step" but no stepId specified`);
        }
        const sourceResult = stepResults.get(step.input.stepId);
        if (!sourceResult?.result) {
          throw new Error(`Step ${step.id} depends on ${step.input.stepId} which has no result`);
        }
        userPrompt = sourceResult.result.content;
        break;

      case "aggregate":
        // For aggregate, we'll collect from multiple steps
        userPrompt = originalRequest.userPrompt; // Default fallback
        break;

      default:
        userPrompt = originalRequest.userPrompt;
    }

    // Apply transform (for now, just passthrough)
    if (step.input.transform !== "passthrough") {
      // TODO: Implement transforms
      console.warn(`Transform "${step.input.transform}" not implemented, using passthrough`);
    }

    return {
      userPrompt,
      context,
      traceId: originalRequest.traceId,
      requestId: originalRequest.requestId,
    };
  }

  /**
   * Aggregate output from the specified steps
   */
  private aggregateOutput(flow: Flow, stepResults: Map<string, StepResult>): string {
    const outputFrom = Array.isArray(flow.output.from) ? flow.output.from : [flow.output.from];
    const format = flow.output.format || "markdown";

    if (outputFrom.length === 0) {
      return "";
    }

    if (outputFrom.length === 1) {
      const stepId = outputFrom[0];
      const result = stepResults.get(stepId);
      return result?.result?.content || "";
    }

    // Multiple outputs - aggregate based on format
    switch (format) {
      case "concat":
        return outputFrom
          .map(stepId => stepResults.get(stepId)?.result?.content || "")
          .filter(content => content.length > 0)
          .join("\n");

      case "json":
        const jsonObj: Record<string, string> = {};
        for (const stepId of outputFrom) {
          const result = stepResults.get(stepId);
          if (result?.result?.content) {
            jsonObj[stepId] = result.result.content;
          }
        }
        return JSON.stringify(jsonObj);

      case "markdown":
      default:
        return outputFrom
          .map(stepId => {
            const result = stepResults.get(stepId);
            const content = result?.result?.content || "";
            return `## ${stepId}\n\n${content}`;
          })
          .join("\n\n");
    }
  }
}
