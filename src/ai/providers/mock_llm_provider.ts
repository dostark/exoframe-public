/**
 * MockLLMProvider - Deterministic LLM responses for testing
 *
 * Testing Strategy §3.1: Mock LLM Provider
 *
 * Provides multiple strategies for mocking LLM responses without making actual API calls.
 * Each strategy serves a specific testing purpose:
 *
 * ## Strategy Details
 *
 * ### recorded
 * **Purpose:** Replay real LLM responses captured from previous API calls
 * **How it works:**
 *   - Hashes the prompt to create a unique fingerprint
 *   - Looks up response by hash (exact match → preview match → pattern fallback)
 *   - Can load recordings from fixture directory (.json files)
 *   - Auto-falls back to pattern matching if no recording found
 * **Use in testing:** Integration tests requiring realistic responses without API costs
 * **Example:** Testing plan generation with actual Claude/GPT responses
 *
 * ### scripted
 * **Purpose:** Return predefined responses in a fixed sequence
 * **How it works:**
 *   - Maintains an index into a responses array
 *   - Returns responses in order, cycling back to first when exhausted
 *   - Deterministic and predictable for every test run
 * **Use in testing:** Multi-step workflows where order matters (e.g., conversation flows)
 * **Example:** Testing request → plan → approval → execution sequence
 *
 * ### pattern
 * **Purpose:** Generate dynamic responses based on prompt content
 * **How it works:**
 *   - Matches prompts against regex patterns
 *   - Returns static string or calls function to generate dynamic response
 *   - Uses first matching pattern in the list
 * **Use in testing:** Flexible testing of various request types without pre-recording
 * **Example:** Testing "implement", "fix", "add" requests with appropriate plan formats
 *
 * ### failing
 * **Purpose:** Simulate API failures and network errors
 * **How it works:**
 *   - Always throws MockLLMError on every generate() call
 *   - Still tracks call count and history for assertions
 *   - Supports custom error messages
 * **Use in testing:** Error handling, retry logic, graceful degradation
 * **Example:** Testing daemon recovery when LLM provider is unavailable
 *
 * ### slow
 * **Purpose:** Simulate network latency and slow API responses
 * **How it works:**
 *   - Adds configurable delay (default 500ms) before returning response
 *   - Cycles through responses like scripted strategy after delay
 * **Use in testing:** Timeout behavior, loading states, race conditions
 * **Example:** Testing request timeout handling or concurrent request processing
 *
 * ## Helper Functions
 *
 * - `createPlanGeneratorMock()` - Pattern-based mock with common plan formats
 * - `createFailingMock(message?)` - Failing mock with custom error message
 * - `createSlowMock(delayMs?)` - Slow mock with configurable delay
 *
 * ## Usage Examples
 *
 * ```typescript
 * // Test with recorded real responses
 * const recorded = new MockLLMProvider("recorded", {
 *   fixtureDir: "./tests/fixtures/llm_responses"
 * });
 *
 * // Test multi-step conversation
 * const scripted = new MockLLMProvider("scripted", {
 *   responses: ["Hello", "How can I help?", "Goodbye"]
 * });
 *
 * // Test dynamic request types
 * const pattern = new MockLLMProvider("pattern", {
 *   patterns: [
 *     { pattern: /implement/i, response: "Implementation plan..." },
 *     { pattern: /fix/i, response: "Bug fix plan..." }
 *   ]
 * });
 *
 * // Test error handling
 * const failing = new MockLLMProvider("failing", {
 *   errorMessage: "API rate limit exceeded"
 * });
 *
 * // Test timeout behavior
 * const slow = new MockLLMProvider("slow", {
 *   delayMs: 5000
 * });
 * ```
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
 * Mock LLM provider for deterministic testing
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
      !("patterns" in options) // Check if patterns key was explicitly set
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
   * Generate a response based on the configured strategy
   */
  async generate(prompt: string, options?: ModelOptions): Promise<string> {
    // For failing strategy, track call before throwing
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

    // Track the call
    this._callCount++;
    this._callHistory.push({
      prompt,
      options,
      response,
      timestamp: new Date(),
    });

    // Track tokens
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
   */
  private getDefaultPatterns(): PatternMatcher[] {
    return [
      {
        pattern: /implement|add|create/i,
        response: `<thought>
I need to analyze the request and create a plan for implementation.
</thought>

<content>
## Proposed Plan

### Overview
Based on the request, I will implement the required functionality.

### Steps
1. **Analyze Requirements** - Review the request and identify key requirements
2. **Design Solution** - Create a technical design for the implementation
3. **Implement Code** - Write the necessary code changes
4. **Write Tests** - Add unit tests to verify the implementation
5. **Review** - Self-review the changes for quality

### Files to Modify
- src/feature.ts (new file)
- tests/feature_test.ts (new file)

### Expected Outcome
The feature will be implemented and tested according to requirements.
</content>`,
      },
      {
        pattern: /fix|bug|error|issue/i,
        response: `<thought>
I need to investigate and fix the reported issue.
</thought>

<content>
## Proposed Plan

### Overview
I will investigate and fix the reported issue.

### Steps
1. **Reproduce Issue** - Verify the bug exists
2. **Root Cause Analysis** - Identify why the bug occurs
3. **Implement Fix** - Apply the necessary correction
4. **Test Fix** - Verify the bug is resolved
5. **Regression Test** - Ensure no new issues introduced

### Files to Modify
- src/affected_module.ts (to fix the bug)
- tests/affected_module_test.ts (add regression test)

### Expected Outcome
The bug will be fixed without introducing regressions.
</content>`,
      },
      {
        pattern: /.*/,
        response: `<thought>
I will create a plan to address this request.
</thought>

<content>
## Proposed Plan

### Overview
I will address the user's request.

### Steps
1. **Analyze** - Review the request details
2. **Plan** - Design the approach
3. **Implement** - Execute the changes
4. **Test** - Verify the solution
5. **Document** - Update relevant documentation

### Expected Outcome
The request will be fulfilled according to specifications.
</content>`,
      },
    ];
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a MockLLMProvider with common plan generation responses
 */
export function createPlanGeneratorMock(): MockLLMProvider {
  return new MockLLMProvider("pattern", {
    patterns: [
      {
        pattern: /implement|add|create/i,
        response: `## Proposed Plan

### Overview
Based on the request, I will implement the required functionality.

### Steps
1. **Analyze Requirements** - Review the request and identify key requirements
2. **Design Solution** - Create a technical design for the implementation
3. **Implement Code** - Write the necessary code changes
4. **Write Tests** - Add unit tests to verify the implementation
5. **Review** - Self-review the changes for quality

### Files to Modify
- src/feature.ts (new file)
- tests/feature_test.ts (new file)

### Expected Outcome
The feature will be implemented and tested.`,
      },
      {
        pattern: /fix|bug|error/i,
        response: `## Proposed Plan

### Overview
I will investigate and fix the reported issue.

### Steps
1. **Reproduce Issue** - Verify the bug exists
2. **Root Cause Analysis** - Identify why the bug occurs
3. **Implement Fix** - Apply the necessary correction
4. **Test Fix** - Verify the bug is resolved
5. **Regression Test** - Ensure no new issues introduced

### Expected Outcome
The bug will be fixed without introducing regressions.`,
      },
      {
        pattern: /.*/,
        response: `## Proposed Plan

### Overview
I will address the user's request.

### Steps
1. Analyze the request
2. Implement the solution
3. Test the changes

### Expected Outcome
The request will be fulfilled.`,
      },
    ],
  });
}

/**
 * Create a MockLLMProvider that simulates API failures
 */
export function createFailingMock(errorMessage?: string): MockLLMProvider {
  return new MockLLMProvider("failing", {
    errorMessage: errorMessage ?? "Simulated API failure",
  });
}

/**
 * Create a MockLLMProvider that simulates slow responses
 */
export function createSlowMock(delayMs: number = 5000): MockLLMProvider {
  return new MockLLMProvider("slow", {
    delayMs,
    responses: ["Delayed response"],
  });
}
