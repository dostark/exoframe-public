/**
 * Agent Runtime - Combines Blueprints and Requests, executes via LLM providers
 * Implements Step 3.2 of the ExoFrame Implementation Plan
 */

import type { IModelProvider } from "../ai/providers.ts";

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
}

/**
 * ParsedRequest represents the user's intent and any additional context
 */
export interface ParsedRequest {
  /** The user's request/prompt */
  userPrompt: string;

  /** Additional context (e.g., file contents, environment info) */
  context: Record<string, unknown>;
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

// ============================================================================
// Agent Runner Service
// ============================================================================

/**
 * AgentRunner combines Blueprint (system prompt) with ParsedRequest (user prompt),
 * executes via an LLM provider, and parses the structured XML response.
 */
export class AgentRunner {
  constructor(private readonly modelProvider: IModelProvider) {}

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
    // Step 1: Construct the combined prompt
    const combinedPrompt = this.constructPrompt(blueprint, request);

    // Step 2: Execute via the model provider
    const rawResponse = await this.modelProvider.generate(combinedPrompt);

    // Step 3: Parse the response to extract thought and content
    const result = this.parseResponse(rawResponse);

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
    // Regex to extract <thought>...</thought>
    const thoughtRegex = /<thought>([\s\S]*?)<\/thought>/i;
    const thoughtMatch = rawResponse.match(thoughtRegex);

    // Regex to extract <content>...</content>
    const contentRegex = /<content>([\s\S]*?)<\/content>/i;
    const contentMatch = rawResponse.match(contentRegex);

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
      content = rawResponse;
      thought = "";
    }

    return {
      thought,
      content,
      raw: rawResponse,
    };
  }
}
