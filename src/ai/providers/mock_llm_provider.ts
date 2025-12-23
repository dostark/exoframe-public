/**
 * MockLLMProvider - Deterministic LLM responses for testing
 *
 * Testing Strategy §3.1: Mock LLM Provider
 *
 * Provides multiple strategies for mocking LLM responses without making actual API calls.
 * Each strategy serves a specific testing purpose:
 *

/**
 * MockLLMProvider - Deterministic LLM responses for testing.
 *
 * Provides multiple strategies for mocking LLM responses without making actual API calls.
 *
 * Strategies:
 * - "recorded": Replay real LLM responses captured from previous API calls.
 * - "scripted": Return predefined responses in a fixed sequence.
 * - "pattern": Generate dynamic responses based on prompt content.
 * - "failing": Simulate API failures and network errors.
 * - "slow": Simulate network latency and slow API responses.
 *
 * Helper functions:
 * - createPlanGeneratorMock(): Pattern-based mock with common plan formats.
 * - createFailingMock(message?): Failing mock with custom error message.
 * - createSlowMock(delayMs?): Slow mock with configurable delay.
 */


import { IModelProvider, ModelOptions } from "../providers.ts";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Available mock strategies
 */
export type MockStrategy = "recorded" | "scripted" | "pattern" | "failing" | "slow";

/**
 * Recorded response from a real LLM call
 */
export interface RecordedResponse {
  /** Hash of the prompt for lookup */
  promptHash: string;
  /** Preview of the prompt for debugging */
  promptPreview: string;
  /** The actual response from the LLM */
  response: string;
  /** Model that generated the response */
  model: string;
  /** Token counts */
  tokens: { input: number; output: number };
  /** When this was recorded */
  recordedAt: string;
}

/**
 * Pattern matcher for dynamic responses
 */
export interface PatternMatcher {
  /** Regex pattern to match against prompts */
  pattern: RegExp;
  /** Response string or function that generates response */
  response: string | ((match: RegExpMatchArray) => string);
}

/**
 * Token tracking
 */
export interface TokenCount {
  input: number;
  output: number;
}

/**
 * Record of a call made to the provider
 */
export interface CallRecord {
  /** The prompt that was sent */
  prompt: string;
  /** Options passed with the call */
  options?: ModelOptions;
  /** Response returned */
  response: string;
  /** When the call was made */
  timestamp: Date;
}

/**
 * Options for configuring MockLLMProvider
 */
export interface MockLLMProviderOptions {
  /** Custom provider ID */
  id?: string;
  /** Responses for scripted/slow strategies */
  responses?: string[];
  /** Recorded responses for recorded strategy */
  recordings?: RecordedResponse[];
  /** Directory to load recordings from */
  fixtureDir?: string;
  /** Pattern matchers for pattern strategy */
  patterns?: PatternMatcher[];
  /** Error message for failing strategy */
  errorMessage?: string;
  /** Delay in ms for slow strategy */
  delayMs?: number;
  /** Token counts per response */
  tokensPerResponse?: TokenCount;
}

// ============================================================================
// Custom Error Type
// ============================================================================

/**
 * Error thrown by MockLLMProvider
 */
export class MockLLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MockLLMError";
  }
}

// ============================================================================
// MockLLMProvider Implementation
// ============================================================================

/**
 * Mock LLM provider for deterministic testing.
 * Implements IModelProvider for use in tests.
 */
export class MockLLMProvider implements IModelProvider {
  public readonly id: string;

  private readonly strategy: MockStrategy;
  private readonly responses: string[];
  private readonly recordings: RecordedResponse[];
  private readonly patterns: PatternMatcher[];
  private readonly errorMessage: string;
  private readonly delayMs: number;
  private readonly tokensPerResponse: TokenCount;

  private responseIndex: number = 0;
  private _callCount: number = 0;
  private _callHistory: CallRecord[] = [];
  private _totalTokens: TokenCount = { input: 0, output: 0 };

  /**
   * @param strategy Mock strategy to use
   * @param options Configuration options for the mock provider
   */
  constructor(strategy: MockStrategy, options: MockLLMProviderOptions = {}) {
    this.id = options.id ?? "mock-llm-provider";
    this.strategy = strategy;
    this.responses = options.responses ?? ["Default mock response"];
    this.recordings = options.recordings ?? [];
    this.patterns = options.patterns ?? [];
    this.errorMessage = options.errorMessage ?? "MockLLMProvider error (failing strategy)";
    this.delayMs = options.delayMs ?? 500; // Default 500ms delay for slow strategy
    this.tokensPerResponse = options.tokensPerResponse ?? { input: 100, output: 50 };

    // Load recordings from fixture directory if specified
    if (options.fixtureDir) {
      this.loadRecordingsFromDir(options.fixtureDir);
    }

    // For recorded strategy without recordings, add default patterns as fallback
    // Only if patterns were not explicitly provided (even if empty)
    if (
      strategy === "recorded" &&
      this.recordings.length === 0 &&
      this.patterns.length === 0 &&
      !("patterns" in options)
    ) {
      console.warn(
        "MockLLMProvider: 'recorded' strategy specified but no recordings available. " +
          "Adding default pattern fallbacks for testing.",
      );
      this.patterns = this.getDefaultPatterns();
    }
  }

  // ============================================================================
  // IModelProvider Implementation
  // ============================================================================

  /**
   * Generate a response based on the configured strategy.
   * @param prompt The prompt to generate a response for
   * @param options Optional model options
   */
  async generate(prompt: string, options?: ModelOptions): Promise<string> {
    if (this.strategy === "failing") {
      this._callCount++;
      this._callHistory.push({
        prompt,
        options,
        response: "[ERROR]",
        timestamp: new Date(),
      });
      throw new MockLLMError(this.errorMessage);
    }

    let response: string;
    switch (this.strategy) {
      case "recorded":
        response = await this.generateRecorded(prompt);
        break;
      case "scripted":
        response = await this.generateScripted();
        break;
      case "pattern":
        response = await this.generatePattern(prompt);
        break;
      case "slow":
        response = await this.generateSlow();
        break;
      default:
        throw new MockLLMError(`Unknown strategy: ${this.strategy}`);
    }

    this._callCount++;
    this._callHistory.push({
      prompt,
      options,
      response,
      timestamp: new Date(),
    });
    this._totalTokens.input += this.tokensPerResponse.input;
    this._totalTokens.output += this.tokensPerResponse.output;
    return response;
  }

  // ============================================================================
  // Strategy Implementations
  // ============================================================================

  /**
   * Recorded strategy: Look up response by prompt hash
   */
  private generateRecorded(prompt: string): string {
    const hash = this.hashPrompt(prompt);

    // Try exact hash match first
    const recording = this.recordings.find((r) => r.promptHash === hash);
    if (recording) {
      return recording.response;
    }

    // Try matching by prompt preview (partial match)
    const previewMatch = this.recordings.find((r) =>
      prompt.startsWith(r.promptPreview) || r.promptPreview.startsWith(prompt)
    );
    if (previewMatch) {
      return previewMatch.response;
    }

    // Fall back to pattern matching if available
    if (this.patterns.length > 0) {
      console.warn(
        `No exact recording found for prompt, falling back to pattern matching:\n` +
          `Hash: ${hash}\n` +
          `Preview: "${prompt.substring(0, 50)}..."`,
      );
      return this.generatePattern(prompt);
    }

    throw new MockLLMError(
      `No recorded response found for prompt hash: ${hash}\n` +
        `Prompt preview: "${prompt.substring(0, 50)}..."\n` +
        `Available recordings: ${this.recordings.length}\n` +
        `Hint: Add recordings or use 'pattern' strategy instead`,
    );
  }

  /**
   * Scripted strategy: Return responses in sequence
   */
  private generateScripted(): string {
    const response = this.responses[this.responseIndex];
    this.responseIndex = (this.responseIndex + 1) % this.responses.length;
    return response;
  }

  /**
   * Pattern strategy: Match prompt against patterns
   */
  private generatePattern(prompt: string): string {
    for (const matcher of this.patterns) {
      const match = prompt.match(matcher.pattern);
      if (match) {
        if (typeof matcher.response === "function") {
          return matcher.response(match);
        }
        return matcher.response;
      }
    }

    throw new MockLLMError(
      `No pattern matched for prompt: "${prompt.substring(0, 100)}..."\n` +
        `Available patterns: ${this.patterns.length}`,
    );
  }

  /**
   * Failing strategy: Always throw error
   */
  private generateFailing(): Promise<never> {
    throw new MockLLMError(this.errorMessage);
  }

  /**
   * Slow strategy: Add delay before returning response
   */
  private async generateSlow(): Promise<string> {
    await this.delay(this.delayMs);
    return this.responses[this.responseIndex++ % this.responses.length];
  }

  // ============================================================================
  // Public Utilities
  // ============================================================================

  /**
   * Get the number of calls made to this provider
   */
  get callCount(): number {
    return this._callCount;
  }

  /**
   * Get the history of all calls made
   */
  get callHistory(): CallRecord[] {
    return [...this._callHistory];
  }

  /**
   * Get total token usage
   */
  get totalTokens(): TokenCount {
    return { ...this._totalTokens };
  }

  /**
   * Get the most recent call made
   */
  getLastCall(): CallRecord | undefined {
    if (this._callHistory.length === 0) {
      return undefined;
    }
    return this._callHistory[this._callHistory.length - 1];
  }

  /**
   * Reset provider state (call count, history, token tracking)
   */
  reset(): void {
    this._callCount = 0;
    this._callHistory = [];
    this._totalTokens = { input: 0, output: 0 };
    this.responseIndex = 0;
  }

  /**
   * Hash a prompt for recording lookup
   */
  hashPrompt(prompt: string): string {
    const encoder = new TextEncoder();
    const data = encoder.encode(prompt);

    // Use synchronous hash computation
    const hashBuffer = new Uint8Array(32);
    const view = new DataView(hashBuffer.buffer);

    // Simple hash for testing (not cryptographically secure, but deterministic)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash + data[i]) | 0;
    }
    view.setInt32(0, hash);

    // Add more entropy from the string
    let hash2 = 5381;
    for (let i = 0; i < data.length; i++) {
      hash2 = (hash2 * 33) ^ data[i];
    }
    view.setInt32(4, hash2);

    // Convert to hex string (first 8 chars)
    return Array.from(hashBuffer.slice(0, 8))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Record a response for later playback
   */
  recordResponse(prompt: string, response: string, model: string = "mock"): RecordedResponse {
    const recording: RecordedResponse = {
      promptHash: this.hashPrompt(prompt),
      promptPreview: prompt.substring(0, 100),
      response,
      model,
      tokens: { ...this.tokensPerResponse },
      recordedAt: new Date().toISOString(),
    };

    this.recordings.push(recording);
    return recording;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Load recordings from a fixture directory
   */
  private loadRecordingsFromDir(dir: string): void {
    try {
      for (const entry of Deno.readDirSync(dir)) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          const path = `${dir}/${entry.name}`;
          const content = Deno.readTextFileSync(path);
          const recording = JSON.parse(content) as RecordedResponse;
          this.recordings.push(recording);
        }
      }
    } catch (error) {
      // Directory might not exist yet, that's OK
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
  }

  /**
   * Simple delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get default patterns for fallback when no recordings available
   *
   * Updated for Step 6.7: Plans now use JSON format validated by PlanSchema.
   * JSON is output within <content> tags and gets validated/converted to markdown by PlanAdapter.
   */
  private getDefaultPatterns(): PatternMatcher[] {
    return [
      {
        pattern: /implement|add|create/i,
        response: `<thought>
I need to analyze the request and create a plan for implementation.
</thought>

<content>
{
  "title": "Implementation Plan",
  "description": "Based on the request, I will implement the required functionality with a structured approach.",
  "steps": [
    {
      "step": 1,
      "title": "Analyze Requirements",
      "description": "Review the request and identify key requirements for the implementation."
    },
    {
      "step": 2,
      "title": "Design Solution",
      "description": "Create a technical design for the implementation, considering architecture and patterns."
    },
    {
      "step": 3,
      "title": "Implement Code",
      "description": "Write the necessary code changes to implement the feature.",
      "tools": ["write_file"]
    },
    {
      "step": 4,
      "title": "Write Tests",
      "description": "Add unit tests to verify the implementation works correctly.",
      "tools": ["write_file"],
      "dependencies": [3]
    },
    {
      "step": 5,
      "title": "Review",
      "description": "Self-review the changes for quality and ensure all requirements are met."
    }
  ],
  "estimatedDuration": "2-4 hours"
}
</content>`,
      },
      {
        pattern: /fix|bug|error|issue/i,
        response: `<thought>
I need to investigate and fix the reported issue.
</thought>

<content>
{
  "title": "Bug Fix Plan",
  "description": "I will investigate and fix the reported issue systematically.",
  "steps": [
    {
      "step": 1,
      "title": "Reproduce Issue",
      "description": "Verify the bug exists and understand the exact conditions that trigger it."
    },
    {
      "step": 2,
      "title": "Root Cause Analysis",
      "description": "Identify why the bug occurs by analyzing the relevant code paths.",
      "tools": ["read_file"]
    },
    {
      "step": 3,
      "title": "Implement Fix",
      "description": "Apply the necessary correction to resolve the issue.",
      "tools": ["write_file"],
      "dependencies": [2]
    },
    {
      "step": 4,
      "title": "Test Fix",
      "description": "Verify the bug is resolved and the fix works as expected.",
      "tools": ["write_file"],
      "dependencies": [3]
    },
    {
      "step": 5,
      "title": "Regression Test",
      "description": "Ensure no new issues are introduced by the fix.",
      "dependencies": [4]
    }
  ],
  "estimatedDuration": "1-2 hours",
  "risks": ["Fix may have unintended side effects on related functionality"]
}
</content>`,
      },
      {
        pattern: /.*/,
        response: `<thought>
I will create a plan to address this request.
</thought>

<content>
{
  "title": "Execution Plan",
  "description": "I will address the user's request with a structured approach.",
  "steps": [
    {
      "step": 1,
      "title": "Analyze",
      "description": "Review the request details and understand what needs to be done."
    },
    {
      "step": 2,
      "title": "Plan",
      "description": "Design the approach and identify files that need to be modified."
    },
    {
      "step": 3,
      "title": "Implement",
      "description": "Execute the changes according to the plan.",
      "tools": ["write_file"]
    },
    {
      "step": 4,
      "title": "Test",
      "description": "Verify the solution works correctly.",
      "dependencies": [3]
    }
  ]
}
</content>`,
      },
    ];
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a MockLLMProvider with common plan generation responses.
 * Pattern-based mock for plan/bugfix/execution flows.
 */
export function createPlanGeneratorMock(): MockLLMProvider {
  return new MockLLMProvider("pattern", {
    patterns: [
      {
        pattern: /implement|add|create/i,
        response: `<content>
${
          JSON.stringify({
            title: "Implementation Plan",
            description: "Based on the request, I will implement the required functionality.",
            steps: [
              {
                step: 1,
                title: "Analyze Requirements",
                description: "Review the request and identify key requirements for the implementation.",
              },
              {
                step: 2,
                title: "Design Solution",
                description: "Create a technical design for the implementation, considering architecture and patterns.",
              },
              {
                step: 3,
                title: "Implement Code",
                description: "Write the necessary code changes to implement the feature.",
                tools: ["write_file"],
              },
              {
                step: 4,
                title: "Write Tests",
                description: "Add unit tests to verify the implementation works correctly.",
                tools: ["write_file"],
                dependencies: [3],
              },
              {
                step: 5,
                title: "Review",
                description: "Self-review the changes for quality and ensure all requirements are met.",
              },
            ],
            estimatedDuration: "2-4 hours",
          })
        }
</content>`,
      },
      {
        pattern: /fix|bug|error/i,
        response: `<content>
${
          JSON.stringify({
            title: "Bug Fix Plan",
            description: "I will investigate and fix the reported issue.",
            steps: [
              {
                step: 1,
                title: "Reproduce Issue",
                description: "Verify the bug exists and understand the exact conditions that trigger it.",
              },
              {
                step: 2,
                title: "Root Cause Analysis",
                description: "Identify why the bug occurs by analyzing the relevant code paths.",
                tools: ["read_file"],
              },
              {
                step: 3,
                title: "Implement Fix",
                description: "Apply the necessary correction to resolve the issue.",
                tools: ["write_file"],
                dependencies: [2],
              },
              {
                step: 4,
                title: "Test Fix",
                description: "Verify the bug is resolved and the fix works as expected.",
                dependencies: [3],
              },
              {
                step: 5,
                title: "Regression Test",
                description: "Ensure no new issues are introduced by the fix.",
                dependencies: [4],
              },
            ],
            estimatedDuration: "1-2 hours",
          })
        }
</content>`,
      },
      {
        pattern: /.*/,
        response: `<content>
${
          JSON.stringify({
            title: "Execution Plan",
            description: "I will address the user's request with a structured approach.",
            steps: [
              {
                step: 1,
                title: "Analyze",
                description: "Review the request details and understand what needs to be done.",
              },
              {
                step: 2,
                title: "Plan",
                description: "Design the approach and identify files that need to be modified.",
              },
              {
                step: 3,
                title: "Implement",
                description: "Execute the changes according to the plan.",
                tools: ["write_file"],
              },
            ],
          })
        }
</content>`,
      },
    ],
  });
}

/**
 * Create a MockLLMProvider that simulates API failures.
 * @param errorMessage Optional custom error message
 */
export function createFailingMock(errorMessage?: string): MockLLMProvider {
  return new MockLLMProvider("failing", {
    errorMessage: errorMessage ?? "Simulated API failure",
  });
}

/**
 * Create a MockLLMProvider that simulates slow responses.
 * @param delayMs Delay in milliseconds (default: 5000)
 */
export function createSlowMock(delayMs: number = 5000): MockLLMProvider {
  return new MockLLMProvider("slow", {
    delayMs,
    responses: ["Delayed response"],
  });
}
