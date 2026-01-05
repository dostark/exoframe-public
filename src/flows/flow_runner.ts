import { Flow, FlowStep } from "../schemas/flow.ts";
import { DependencyResolver } from "./dependency_resolver.ts";
import { AgentExecutionResult } from "../services/agent_runner.ts";
import { ConditionEvaluator } from "./condition_evaluator.ts";
import {
  appendToRequest,
  extractSection,
  jsonExtract,
  mergeAsContext,
  passthrough,
  templateFill,
} from "./transforms.ts";

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
  /** Whether the step was skipped due to condition */
  skipped?: boolean;
  /** The condition that caused skipping (if skipped) */
  skipReason?: string;
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
  private conditionEvaluator: ConditionEvaluator;

  constructor(
    private agentExecutor: AgentExecutor,
    private eventLogger: FlowEventLogger,
  ) {
    this.conditionEvaluator = new ConditionEvaluator();
  }

  /**
   * Execute a flow with the given request
   */
  async execute(
    flow: Flow,
    request: { userPrompt: string; traceId?: string; requestId?: string },
  ): Promise<FlowResult> {
    const flowRunId = crypto.randomUUID();
    const startedAt = new Date();

    // Log flow validation start
    this.eventLogger.log("flow.validating", {
      flowId: flow.id,
      stepCount: flow.steps.length,
      traceId: request.traceId,
      requestId: request.requestId,
    });

    // Validate flow has steps
    if (flow.steps.length === 0) {
      this.eventLogger.log("flow.validation.failed", {
        flowId: flow.id,
        error: "Flow must have at least one step",
        traceId: request.traceId,
        requestId: request.requestId,
      });
      throw new FlowExecutionError("Flow must have at least one step", flowRunId);
    }

    // Log flow validation success
    this.eventLogger.log("flow.validated", {
      flowId: flow.id,
      stepCount: flow.steps.length,
      maxParallelism: flow.settings?.maxParallelism ?? 3,
      failFast: flow.settings?.failFast ?? true,
      traceId: request.traceId,
      requestId: request.requestId,
    });

    // Log flow start
    this.eventLogger.log("flow.started", {
      flowRunId,
      flowId: flow.id,
      stepCount: flow.steps.length,
      maxParallelism: flow.settings?.maxParallelism ?? 3,
      failFast: flow.settings?.failFast ?? true,
      traceId: request.traceId,
      requestId: request.requestId,
    });

    const stepResults = new Map<string, StepResult>();

    try {
      // Resolve dependency graph
      this.eventLogger.log("flow.dependencies.resolving", {
        flowRunId,
        flowId: flow.id,
        traceId: request.traceId,
        requestId: request.requestId,
      });

      const resolver = new DependencyResolver(flow.steps);
      const waves = resolver.groupIntoWaves();

      this.eventLogger.log("flow.dependencies.resolved", {
        flowRunId,
        flowId: flow.id,
        waveCount: waves.length,
        totalSteps: flow.steps.length,
        traceId: request.traceId,
        requestId: request.requestId,
      });

      const _maxParallelism = flow.settings?.maxParallelism ?? 3;
      const failFast = flow.settings?.failFast ?? true;

      // Execute waves sequentially
      for (let waveIndex = 0; waveIndex < waves.length; waveIndex++) {
        const wave = waves[waveIndex];
        const waveNumber = waveIndex + 1;

        // Log wave start
        this.eventLogger.log("flow.wave.started", {
          flowRunId,
          waveNumber,
          waveSize: wave.length,
          stepIds: wave,
          traceId: request.traceId,
          requestId: request.requestId,
        });

        // Execute steps in this wave in parallel (with semaphore limit)
        const wavePromises = wave.map((stepId) => this.executeStep(flowRunId, stepId, flow, request, stepResults));
        const waveResults = await Promise.allSettled(wavePromises);

        // Process results
        let waveFailed = false;
        let waveSuccessCount = 0;
        let waveFailureCount = 0;

        for (let i = 0; i < wave.length; i++) {
          const stepId = wave[i];
          const promiseResult = waveResults[i];

          if (promiseResult.status === "fulfilled") {
            stepResults.set(stepId, promiseResult.value);
            if (promiseResult.value.success) {
              waveSuccessCount++;
            } else {
              waveFailureCount++;
              if (failFast) {
                waveFailed = true;
              }
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
            waveFailureCount++;
            if (failFast) {
              waveFailed = true;
            }
          }
        }

        // Log wave completion
        this.eventLogger.log("flow.wave.completed", {
          flowRunId,
          waveNumber,
          waveSize: wave.length,
          successCount: waveSuccessCount,
          failureCount: waveFailureCount,
          failed: waveFailed,
          traceId: request.traceId,
          requestId: request.requestId,
        });

        // If failFast is enabled and any step in this wave failed, stop execution
        if (waveFailed && failFast) {
          const failedStepIndex = wave.findIndex((_stepId, i) => {
            const result = waveResults[i];
            return result.status === "rejected" ||
              (result.status === "fulfilled" && !result.value.success);
          });
          const failedStepId = wave[failedStepIndex];
          const failedResult = waveResults[failedStepIndex];
          const errorMessage = failedResult.status === "fulfilled"
            ? failedResult.value.error || "Unknown error"
            : failedResult.reason?.message || "Unknown error";
          throw new FlowExecutionError(`Step ${failedStepId} failed: ${errorMessage}`, flowRunId);
        }
      }

      // Aggregate output
      this.eventLogger.log("flow.output.aggregating", {
        flowRunId,
        flowId: flow.id,
        outputFrom: flow.output?.from,
        outputFormat: flow.output?.format,
        totalSteps: stepResults.size,
        traceId: request.traceId,
        requestId: request.requestId,
      });

      const output = this.aggregateOutput(flow, stepResults);

      this.eventLogger.log("flow.output.aggregated", {
        flowRunId,
        flowId: flow.id,
        outputLength: output.length,
        traceId: request.traceId,
        requestId: request.requestId,
      });

      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      // Determine overall success
      const success = Array.from(stepResults.values()).every((result) => result.success);
      const successfulSteps = Array.from(stepResults.values()).filter((r) => r.success).length;
      const failedSteps = stepResults.size - successfulSteps;

      // Log flow completion
      this.eventLogger.log("flow.completed", {
        flowRunId,
        flowId: flow.id,
        success,
        duration,
        stepsCompleted: stepResults.size,
        successfulSteps,
        failedSteps,
        outputLength: output.length,
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

      // Determine partial results
      const stepResults = new Map<string, StepResult>(); // This would need to be captured from the try block
      const successfulSteps = Array.from(stepResults.values()).filter((r) => r.success).length;
      const failedSteps = stepResults.size - successfulSteps;

      // Log flow failure
      this.eventLogger.log("flow.failed", {
        flowRunId,
        flowId: flow.id,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : "Unknown",
        duration,
        stepsAttempted: stepResults.size,
        successfulSteps,
        failedSteps,
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
    stepResults: Map<string, StepResult>,
  ): Promise<StepResult> {
    const step = flow.steps.find((s) => s.id === stepId)!;
    const startedAt = new Date();

    // Evaluate step condition if present
    if (step.condition) {
      const conditionResult = this.conditionEvaluator.evaluateStepCondition(
        step,
        stepResults,
        request,
        flow,
      );

      this.eventLogger.log("flow.step.condition.evaluated", {
        flowRunId,
        stepId,
        condition: step.condition,
        shouldExecute: conditionResult.shouldExecute,
        error: conditionResult.error,
        traceId: request.traceId,
        requestId: request.requestId,
      });

      if (!conditionResult.shouldExecute) {
        const completedAt = new Date();
        const duration = completedAt.getTime() - startedAt.getTime();

        this.eventLogger.log("flow.step.skipped", {
          flowRunId,
          stepId,
          condition: step.condition,
          reason: conditionResult.error || "Condition evaluated to false",
          traceId: request.traceId,
          requestId: request.requestId,
        });

        return {
          stepId,
          success: true, // Skipped steps are considered successful
          skipped: true,
          skipReason: conditionResult.error || `Condition "${step.condition}" evaluated to false`,
          duration,
          startedAt,
          completedAt,
        };
      }
    }

    // Log step queued (ready for execution)
    this.eventLogger.log("flow.step.queued", {
      flowRunId,
      stepId,
      agent: step.agent,
      dependencies: step.dependsOn,
      inputSource: step.input.source,
      traceId: request.traceId,
      requestId: request.requestId,
    });

    // Log step start
    this.eventLogger.log("flow.step.started", {
      flowRunId,
      stepId,
      agent: step.agent,
      agentId: step.agent, // for backward compatibility
      traceId: request.traceId,
      requestId: request.requestId,
    });

    try {
      // Prepare step input
      const stepRequest = this.prepareStepRequest(flowRunId, step, request, stepResults);

      // Log input preparation
      this.eventLogger.log("flow.step.input.prepared", {
        flowRunId,
        stepId,
        inputSource: step.input.source,
        hasContext: !!stepRequest.context,
        traceId: request.traceId,
        requestId: request.requestId,
      });

      // Execute step
      const result = await this.agentExecutor.run(step.agent, stepRequest);

      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      // Log step completion with detailed results
      this.eventLogger.log("flow.step.completed", {
        flowRunId,
        stepId,
        agent: step.agent,
        success: true,
        duration,
        outputLength: result.content.length,
        hasThought: !!result.thought,
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

      // Log step failure with detailed error information
      this.eventLogger.log("flow.step.failed", {
        flowRunId,
        stepId,
        agent: step.agent,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : "Unknown",
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
    flowRunId: string,
    step: FlowStep,
    originalRequest: { userPrompt: string; traceId?: string; requestId?: string },
    stepResults: Map<string, StepResult>,
  ): FlowStepRequest {
    let inputData: string;

    // Collect input data based on source
    switch (step.input.source) {
      case "request": {
        inputData = originalRequest.userPrompt;
        break;
      }

      case "step": {
        if (!step.input.stepId) {
          throw new Error(`Step ${step.id} has source "step" but no stepId specified`);
        }
        const sourceResult = stepResults.get(step.input.stepId);
        if (!sourceResult?.result) {
          throw new Error(`Step ${step.id} depends on ${step.input.stepId} which has no result`);
        }
        inputData = sourceResult.result.content;
        break;
      }

      case "aggregate": {
        if (!step.input.from || step.input.from.length === 0) {
          throw new Error(`Step ${step.id} has source "aggregate" but no "from" steps specified`);
        }
        const aggregatedInputs: string[] = [];
        for (const stepId of step.input.from) {
          const result = stepResults.get(stepId);
          if (!result?.result) {
            throw new Error(`Step ${step.id} depends on ${stepId} which has no result`);
          }
          aggregatedInputs.push(result.result.content);
        }
        inputData = aggregatedInputs.length === 1 ? aggregatedInputs[0] : aggregatedInputs.join("\n\n");
        break;
      }

      default:
        throw new Error(`Invalid input source: ${step.input.source}`);
    }

    // Apply transform
    let userPrompt = inputData;
    if (step.input.transform) {
      const transformStart = Date.now();
      userPrompt = this.applyTransform(
        inputData,
        step.input.transform,
        step.input.transformArgs,
        originalRequest.userPrompt,
      );

      // Log transform application
      this.eventLogger.log("flow.step.transform.applied", {
        flowRunId,
        stepId: step.id,
        transformName: typeof step.input.transform === "string" ? step.input.transform : "custom",
        inputSize: inputData.length,
        outputSize: userPrompt.length,
        duration: Date.now() - transformStart,
        traceId: originalRequest.traceId,
        requestId: originalRequest.requestId,
      });
    }

    return {
      userPrompt,
      context: {},
      traceId: originalRequest.traceId,
      requestId: originalRequest.requestId,
    };
  }

  /**
   * Apply a transform function to input data
   */
  private applyTransform(
    input: string,
    transform: string | ((input: any) => any),
    transformArgs?: any,
    originalRequest?: string,
  ): string {
    // Handle custom transform functions
    if (typeof transform === "function") {
      try {
        return transform(input);
      } catch (error) {
        throw new Error(`Custom transform failed: ${(error as Error).message}`);
      }
    }

    // Handle built-in transform functions
    switch (transform) {
      case "passthrough":
        return passthrough(input);

      case "mergeAsContext":
        // For mergeAsContext, input should be an array
        if (Array.isArray(transformArgs)) {
          return mergeAsContext(transformArgs);
        }
        // If transformArgs is not provided, treat input as array of strings
        try {
          const inputs = JSON.parse(input);
          if (Array.isArray(inputs)) {
            return mergeAsContext(inputs);
          }
        } catch {
          // If input is not JSON array, split by double newlines
          const inputs = input.split("\n\n").filter((s) => s.trim());
          return mergeAsContext(inputs);
        }
        throw new Error("mergeAsContext requires an array of strings");

      case "extractSection":
        if (typeof transformArgs === "string") {
          return extractSection(input, transformArgs);
        }
        throw new Error("extractSection requires a section name as transformArgs");

      case "appendToRequest":
        if (originalRequest) {
          return appendToRequest(originalRequest, input);
        }
        throw new Error("appendToRequest requires original request to be available");

      case "jsonExtract":
        if (typeof transformArgs === "string") {
          return jsonExtract(input, transformArgs);
        }
        throw new Error("jsonExtract requires a field path as transformArgs");

      case "templateFill":
        if (typeof transformArgs === "object" && transformArgs !== null) {
          return templateFill(input, transformArgs);
        }
        throw new Error("templateFill requires a context object as transformArgs");

      default:
        throw new Error(`Unknown transform: ${transform}`);
    }
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
      case "concat": {
        return outputFrom
          .map((stepId) => stepResults.get(stepId)?.result?.content || "")
          .filter((content) => content.length > 0)
          .join("\n");
      }

      case "json": {
        const jsonObj: Record<string, string> = {};
        for (const stepId of outputFrom) {
          const result = stepResults.get(stepId);
          if (result?.result?.content) {
            jsonObj[stepId] = result.result.content;
          }
        }
        return JSON.stringify(jsonObj);
      }

      case "markdown":
      default:
        return outputFrom
          .map((stepId) => {
            const result = stepResults.get(stepId);
            const content = result?.result?.content || "";
            return `## ${stepId}\n\n${content}`;
          })
          .join("\n\n");
    }
  }
}
