/**
 * Agent Runtime - Combines Blueprints and Requests, executes via LLM providers
 * Implements Step 3.2 of the ExoFrame Implementation Plan
 * Enhanced with retry/recovery (Phase 16.3)
 * Enhanced with structured output validation (Phase 16.2)
 * Enhanced with Skills Architecture (Phase 17)
 */

import type { IModelProvider } from "../ai/providers.ts";
import type { DatabaseService } from "./db.ts";
import { createLLMRetryPolicy, type RetryPolicy, type RetryPolicyConfig, type RetryResult } from "./retry_policy.ts";
import { createOutputValidator, OutputValidator, type ValidationMetrics } from "./output_validator.ts";
import type { SkillMatch, SkillsService } from "./skills.ts";

// Note: SkillMatchRequest may be used in future for direct skill matching
// Keeping import for consistency with SkillsService integration

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

  /** Optional: File paths involved in the request (for skill matching) */
  filePaths?: string[];

  /** Optional: Task type (e.g., 'feature', 'bugfix', 'refactor') */
  taskType?: string;

  /** Optional: Tags for skill matching */
  tags?: string[];
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

  /** Skills that were matched and injected (Phase 17) */
  skillsApplied?: string[];
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

  /** Optional: Skills service for procedural memory (Phase 17) */
  skillsService?: SkillsService;

  /** Optional: Disable automatic skill matching */
  disableSkills?: boolean;
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
 *
 * Enhanced with output validation (Phase 16.2):
 * - XML tag extraction (<thought>, <content>)
 * - JSON repair for malformed outputs
 * - Validation metrics tracking
 *
 * Enhanced with Skills Architecture (Phase 17):
 * - Automatic skill matching based on request context
 * - Skill context injection into prompts
 * - Skill usage tracking
 */
export class AgentRunner {
  private db?: DatabaseService;
  private retryPolicy: RetryPolicy;
  private disableRetry: boolean;
  private outputValidator: OutputValidator;
  private skillsService?: SkillsService;
  private disableSkills: boolean;

  constructor(
    private readonly modelProvider: IModelProvider,
    config?: AgentRunnerConfig,
  ) {
    this.db = config?.db;
    this.disableRetry = config?.disableRetry ?? false;
    this.skillsService = config?.skillsService;
    this.disableSkills = config?.disableSkills ?? false;
    this.retryPolicy = createLLMRetryPolicy();
    this.outputValidator = createOutputValidator({ autoRepair: true });

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

    // Phase 17: Match skills based on request context
    let matchedSkills: SkillMatch[] = [];
    let skillContext = "";
    let skillsApplied: string[] = [];

    if (this.skillsService && !this.disableSkills) {
      try {
        matchedSkills = await this.skillsService.matchSkills({
          requestText: request.userPrompt,
          keywords: this.extractKeywords(request.userPrompt),
          taskType: request.taskType,
          filePaths: request.filePaths,
          tags: request.tags,
          agentId,
        });

        if (matchedSkills.length > 0) {
          skillsApplied = matchedSkills.map((m) => m.skillId);
          skillContext = await this.skillsService.buildSkillContext(skillsApplied);

          // Record skill usage
          for (const skillId of skillsApplied) {
            await this.skillsService.recordSkillUsage(skillId);
          }
        }
      } catch (error) {
        console.error("[AgentRunner] Skill matching failed:", error);
        // Continue without skills - non-fatal error
      }
    }

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
        skills_enabled: !this.disableSkills && !!this.skillsService,
        skills_matched: skillsApplied.length,
        skills_applied: skillsApplied,
      },
      traceId,
      agentId,
    );

    // Step 1: Construct the combined prompt (with skill context)
    const combinedPrompt = this.constructPrompt(blueprint, request, skillContext);

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
        skills_applied: skillsApplied.length > 0 ? skillsApplied : undefined,
      },
      traceId,
      agentId,
    );

    return {
      ...result,
      skillsApplied: skillsApplied.length > 0 ? skillsApplied : undefined,
    };
  }

  /**
   * Construct the combined prompt from blueprint and request
   * @param blueprint - Agent blueprint
   * @param request - User request
   * @param skillContext - Optional skill context to inject (Phase 17)
   * @returns Combined prompt string
   */
  private constructPrompt(
    blueprint: Blueprint,
    request: ParsedRequest,
    skillContext?: string,
  ): string {
    // Combination: system prompt first, then skill context, then user prompt
    // Separated by double newlines for clarity
    const parts: string[] = [];

    if (blueprint.systemPrompt.trim()) {
      parts.push(blueprint.systemPrompt);
    }

    // Inject skill context after system prompt (Phase 17)
    if (skillContext?.trim()) {
      parts.push(skillContext);
    }

    if (request.userPrompt.trim()) {
      parts.push(request.userPrompt);
    }

    return parts.join("\n\n");
  }

  /**
   * Extract keywords from text for skill matching (Phase 17)
   * @param text - Text to extract keywords from
   * @returns Array of keywords
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction: split by non-word characters, filter short words
    const words = text.toLowerCase().split(/[^a-z0-9]+/);
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "from",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "shall",
      "can",
      "need",
      "this",
      "that",
      "these",
      "those",
      "it",
      "its",
      "i",
      "you",
      "he",
      "she",
      "we",
      "they",
      "me",
      "him",
      "her",
      "us",
      "them",
      "my",
      "your",
      "his",
      "our",
      "their",
      "what",
      "which",
      "who",
      "whom",
      "whose",
      "when",
      "where",
      "why",
      "how",
      "all",
      "each",
      "every",
      "both",
      "few",
      "more",
      "most",
      "other",
      "some",
      "such",
      "no",
      "not",
      "only",
      "same",
      "so",
      "than",
      "too",
      "very",
      "just",
      "also",
      "now",
      "here",
      "there",
      "if",
      "then",
      "else",
      "as",
      "please",
      "help",
      "want",
      "like",
      "need",
      "make",
      "get",
    ]);

    return [
      ...new Set(
        words.filter((w) => w.length >= 3 && !stopWords.has(w)),
      ),
    ];
  }

  /**
   * Parse the LLM response to extract <thought> and <content> tags
   * Falls back to treating the whole response as content if tags are missing
   * Enhanced with Phase 16.2 OutputValidator for consistent parsing.
   * @param rawResponse - Raw response from the LLM
   * @returns Parsed result with thought, content, and raw response
   */
  private parseResponse(rawResponse: string): AgentExecutionResult {
    // Use OutputValidator for consistent XML parsing (Phase 16.2)
    const parsed = this.outputValidator.parseXMLTags(rawResponse);

    return {
      thought: parsed.thought,
      content: parsed.content,
      raw: parsed.raw,
    };
  }

  /**
   * Get validation metrics from the output validator (Phase 16.2)
   * @returns Current validation metrics
   */
  getValidationMetrics(): ValidationMetrics {
    return this.outputValidator.getMetrics();
  }

  /**
   * Reset validation metrics (Phase 16.2)
   */
  resetValidationMetrics(): void {
    this.outputValidator.resetMetrics();
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
