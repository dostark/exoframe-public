/**
 * Agent Runtime - Combines Blueprints and Requests, executes via LLM providers
 * Implements Step 3.2 of the ExoFrame Implementation Plan
 * Enhanced with retry/recovery (Phase 16.3)
 */

import type { IModelProvider } from "../ai/providers.ts";
import type { DatabaseService } from "./db.ts";
import { createLLMRetryPolicy, type RetryPolicy, type RetryPolicyConfig, type RetryResult } from "./retry_policy.ts";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Blueprint defines the agent's persona and system instructions
 * Initially just a system prompt, can be extended later
 */
export interface Blueprint {
  /** System prompt that defines the agent's behavior and capabilities */
  systemPrompt: string;

  /** Optional: Agent identifier for logging */
  agentId?: string;
}

/**
 * ParsedRequest represents the user's intent and any additional context
 */
export interface ParsedRequest {
  /** The user's request/prompt */
  userPrompt: string;

  /** Additional context (e.g., file contents, environment info) */
  context: Record<string, unknown>;

  /** Optional: Request ID for logging */
  requestId?: string;

  /** Optional: Trace ID for logging */
  traceId?: string;
}

/**
 * Result of agent execution containing structured response
 */
export interface AgentExecutionResult {
  /** The agent's internal reasoning (extracted from <thought> tags) */
  thought: string;

  /** The user-facing response (extracted from <content> tags) */
  content: string;

  /** The raw, unparsed response from the LLM */
  raw: string;
}

/**
 * Configuration for AgentRunner
 */
export interface AgentRunnerConfig {
  /** Optional: Database service for activity logging */
  db?: DatabaseService;

  /** Optional: Retry policy configuration */
  retryPolicy?: Partial<RetryPolicyConfig>;

  /** Optional: Disable retries entirely */
  disableRetry?: boolean;
}

// ============================================================================
// Agent Runner Service
// ============================================================================

/**
 * AgentRunner combines Blueprint (system prompt) with ParsedRequest (user prompt),
 * executes via an LLM provider, and parses the structured XML response.
 *
 * Enhanced with retry/recovery (Phase 16.3):
 * - Exponential backoff on transient failures
 * - Temperature adjustment on retries
 * - Detailed retry logging
 */
export class AgentRunner {
  private db?: DatabaseService;
  private retryPolicy: RetryPolicy;
  private disableRetry: boolean;

  constructor(
    private readonly modelProvider: IModelProvider,
    config?: AgentRunnerConfig,
  ) {
    this.db = config?.db;
    this.disableRetry = config?.disableRetry ?? false;
    this.retryPolicy = createLLMRetryPolicy();

    // Set up retry logging
    this.retryPolicy.setOnRetry((ctx) => {
      this.logActivity(
        "agent",
        "agent.retry_attempt",
        null,
        {
          attempt: ctx.attempt,
          delay_ms: ctx.delayMs,
          temperature: ctx.temperature,
          elapsed_ms: ctx.elapsedMs,
          error_type: ctx.error.constructor.name,
          error_message: ctx.error.message,
        },
      );
    });
  }

  /**
   * Run the agent with a blueprint and request
   * @param blueprint - The agent's blueprint (system prompt)
   * @param request - The parsed user request
   * @returns Structured execution result with thought and content
   */
  async run(
    blueprint: Blueprint,
    request: ParsedRequest,
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const agentId = blueprint.agentId || "unknown";
    const traceId = request.traceId;
    const requestId = request.requestId;

    // Log agent execution start
    this.logActivity(
      "agent",
      "agent.execution_started",
      requestId || null,
      {
        agent_id: agentId,
        prompt_length: request.userPrompt.length,
        has_context: Object.keys(request.context).length > 0,
        retry_enabled: !this.disableRetry,
      },
      traceId,
      agentId,
    );

    // Step 1: Construct the combined prompt
    const combinedPrompt = this.constructPrompt(blueprint, request);

    // Step 2: Execute via the model provider (with retry if enabled)
    let retryResult: RetryResult<string>;

    if (this.disableRetry) {
      // Direct execution without retry
      try {
        const rawResponse = await this.modelProvider.generate(combinedPrompt);
        retryResult = {
          success: true,
          value: rawResponse,
          totalAttempts: 1,
          totalTimeMs: Date.now() - startTime,
          retryHistory: [],
        };
      } catch (error) {
        retryResult = {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          totalAttempts: 1,
          totalTimeMs: Date.now() - startTime,
          retryHistory: [],
        };
      }
    } else {
      // Execute with retry policy
      retryResult = await this.retryPolicy.execute(
        async () => await this.modelProvider.generate(combinedPrompt),
      );
    }

    const duration = Date.now() - startTime;

    // Handle retry failure
    if (!retryResult.success) {
      this.logActivity(
        "agent",
        "agent.execution_failed",
        requestId || null,
        {
          agent_id: agentId,
          duration_ms: duration,
          total_attempts: retryResult.totalAttempts,
          retry_history: retryResult.retryHistory,
          error_type: retryResult.error?.constructor.name || "Unknown",
          error_message: retryResult.error?.message || "Unknown error",
        },
        traceId,
        agentId,
      );

      throw retryResult.error || new Error("Agent execution failed after retries");
    }

    // Step 3: Parse the response to extract thought and content
    const rawResponse = retryResult.value!;
    const result = this.parseResponse(rawResponse);

    // Log successful execution
    this.logActivity(
      "agent",
      "agent.execution_completed",
      requestId || null,
      {
        agent_id: agentId,
        duration_ms: duration,
        total_attempts: retryResult.totalAttempts,
        retry_history: retryResult.retryHistory.length > 0 ? retryResult.retryHistory : undefined,
        response_length: rawResponse?.length || 0,
        has_thought: result.thought.length > 0,
        has_content: result.content.length > 0,
      },
      traceId,
      agentId,
    );

    return result;
  }

  /**
   * Construct the combined prompt from blueprint and request
   * @param blueprint - Agent blueprint
   * @param request - User request
   * @returns Combined prompt string
   */
  private constructPrompt(blueprint: Blueprint, request: ParsedRequest): string {
    // Simple combination: system prompt first, then user prompt
    // Separated by double newlines for clarity
    const parts: string[] = [];

    if (blueprint.systemPrompt.trim()) {
      parts.push(blueprint.systemPrompt);
    }

    if (request.userPrompt.trim()) {
      parts.push(request.userPrompt);
    }

    return parts.join("\n\n");
  }

  /**
   * Parse the LLM response to extract <thought> and <content> tags
   * Falls back to treating the whole response as content if tags are missing
   * @param rawResponse - Raw response from the LLM
   * @returns Parsed result with thought, content, and raw response
   */
  private parseResponse(rawResponse: string): AgentExecutionResult {
    // Handle null/undefined responses
    if (rawResponse == null) {
      return {
        thought: "",
        content: "",
        raw: "",
      };
    }

    // Ensure rawResponse is a string
    const responseStr = String(rawResponse);

    // Regex to extract <thought>...</thought>
    const thoughtRegex = /<thought>([\s\S]*?)<\/thought>/i;
    const thoughtMatch = responseStr.match(thoughtRegex);

    // Regex to extract <content>...</content>
    const contentRegex = /<content>([\s\S]*?)<\/content>/i;
    const contentMatch = responseStr.match(contentRegex);

    let thought = "";
    let content = "";

    if (thoughtMatch) {
      thought = thoughtMatch[1].trim();
    }

    if (contentMatch) {
      content = contentMatch[1].trim();
    }

    // Fallback: if no tags found, treat whole response as content
    if (!thoughtMatch && !contentMatch) {
      content = responseStr;
      thought = "";
    }

    return {
      thought,
      content,
      raw: responseStr,
    };
  }

  /**
   * Log activity to Activity Journal (if database provided)
   */
  private logActivity(
    actor: string,
    actionType: string,
    target: string | null,
    payload: Record<string, unknown>,
    traceId?: string,
    agentId?: string | null,
  ): void {
    if (!this.db) {
      return; // No database, skip logging
    }

    try {
      this.db.logActivity(actor, actionType, target, payload, traceId, agentId || null);
    } catch (error) {
      console.error("[AgentRunner] Failed to log activity:", error);
    }
  }
}
