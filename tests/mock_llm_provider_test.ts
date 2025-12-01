/**
 * Tests for MockLLMProvider (Testing Strategy §3.1)
 *
 * MockLLMProvider provides deterministic LLM responses for testing without API calls.
 *
 * Mock Strategies:
 * - recorded: Replay real responses based on prompt hash lookup
 * - scripted: Return responses in order (sequence)
 * - pattern: Match prompt patterns and generate responses
 * - failing: Always throw error (for error handling tests)
 * - slow: Add artificial delay (for timeout tests)
 */

import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert@^1.0.0";
import { IModelProvider } from "../src/ai/providers.ts";

import {
  MockLLMProvider,
  MockLLMError,
  type MockStrategy,
  type RecordedResponse,
  type PatternMatcher,
} from "../src/ai/providers/mock_llm_provider.ts";

// ============================================================================
// Test 1: MockLLMProvider implements IModelProvider interface
// ============================================================================

Deno.test("MockLLMProvider implements IModelProvider interface", () => {
  const provider = new MockLLMProvider("scripted");

  // Verify interface compliance
  assertExists(provider.id);
  assertExists(provider.generate);
  assertEquals(typeof provider.id, "string");
  assertEquals(typeof provider.generate, "function");
});

Deno.test("MockLLMProvider has correct default id", () => {
  const provider = new MockLLMProvider("scripted");
  assertEquals(provider.id, "mock-llm-provider");
});

Deno.test("MockLLMProvider accepts custom id", () => {
  const provider = new MockLLMProvider("scripted", { id: "custom-mock" });
  assertEquals(provider.id, "custom-mock");
});

// ============================================================================
// Test 2: Scripted Strategy - Return responses in sequence
// ============================================================================

Deno.test("Scripted: returns responses in order", async () => {
  const provider = new MockLLMProvider("scripted", {
    responses: ["First response", "Second response", "Third response"],
  });

  assertEquals(await provider.generate("prompt 1"), "First response");
  assertEquals(await provider.generate("prompt 2"), "Second response");
  assertEquals(await provider.generate("prompt 3"), "Third response");
});

Deno.test("Scripted: cycles back to first response when exhausted", async () => {
  const provider = new MockLLMProvider("scripted", {
    responses: ["A", "B"],
  });

  assertEquals(await provider.generate("1"), "A");
  assertEquals(await provider.generate("2"), "B");
  assertEquals(await provider.generate("3"), "A"); // Cycles back
  assertEquals(await provider.generate("4"), "B");
});

Deno.test("Scripted: uses default response when no responses configured", async () => {
  const provider = new MockLLMProvider("scripted");

  const result = await provider.generate("test");
  assertExists(result);
  assertEquals(typeof result, "string");
});

Deno.test("Scripted: tracks call count", async () => {
  const provider = new MockLLMProvider("scripted", {
    responses: ["response"],
  });

  assertEquals(provider.callCount, 0);
  await provider.generate("1");
  assertEquals(provider.callCount, 1);
  await provider.generate("2");
  assertEquals(provider.callCount, 2);
});

Deno.test("Scripted: stores call history", async () => {
  const provider = new MockLLMProvider("scripted", {
    responses: ["response"],
  });

  await provider.generate("first prompt");
  await provider.generate("second prompt");

  assertEquals(provider.callHistory.length, 2);
  assertEquals(provider.callHistory[0].prompt, "first prompt");
  assertEquals(provider.callHistory[1].prompt, "second prompt");
});

// ============================================================================
// Test 3: Recorded Strategy - Replay responses by prompt hash
// ============================================================================

Deno.test("Recorded: returns response matching prompt hash", async () => {
  const recordings: RecordedResponse[] = [
    {
      promptHash: "abc123",
      promptPreview: "You are a senior...",
      response: "## Proposed Plan\n\n1. First step",
      model: "claude-3-5-sonnet",
      tokens: { input: 100, output: 50 },
      recordedAt: "2025-12-01T10:00:00Z",
    },
  ];

  const provider = new MockLLMProvider("recorded", { recordings });

  // The provider should hash "You are a senior..." and find a match
  const result = await provider.generate("You are a senior...");
  assertEquals(result, "## Proposed Plan\n\n1. First step");
});

Deno.test("Recorded: throws error when no matching recording found", async () => {
  const provider = new MockLLMProvider("recorded", { recordings: [] });

  await assertRejects(
    async () => await provider.generate("unknown prompt"),
    MockLLMError,
    "No recorded response found",
  );
});

Deno.test("Recorded: can load recordings from fixture directory", async () => {
  const provider = new MockLLMProvider("recorded", {
    fixtureDir: "./tests/fixtures/llm_responses",
  });

  // Provider should load *.json files from the directory
  assertExists(provider);
});

Deno.test("Recorded: hash function is deterministic", () => {
  const provider = new MockLLMProvider("recorded");

  const hash1 = provider.hashPrompt("test prompt");
  const hash2 = provider.hashPrompt("test prompt");
  const hash3 = provider.hashPrompt("different prompt");

  assertEquals(hash1, hash2);
  assert(hash1 !== hash3);
});

// ============================================================================
// Test 4: Pattern Strategy - Match prompts with regex patterns
// ============================================================================

Deno.test("Pattern: matches prompt and returns configured response", async () => {
  const patterns: PatternMatcher[] = [
    {
      pattern: /implement.*authentication/i,
      response: "## Plan: Authentication\n\n1. Create auth module",
    },
    {
      pattern: /fix.*bug/i,
      response: "## Plan: Bug Fix\n\n1. Identify root cause",
    },
  ];

  const provider = new MockLLMProvider("pattern", { patterns });

  const result1 = await provider.generate("Please implement user authentication");
  assertStringIncludes(result1, "Authentication");

  const result2 = await provider.generate("Fix the login bug");
  assertStringIncludes(result2, "Bug Fix");
});

Deno.test("Pattern: uses first matching pattern", async () => {
  const patterns: PatternMatcher[] = [
    { pattern: /test/, response: "First match" },
    { pattern: /test/, response: "Second match" },
  ];

  const provider = new MockLLMProvider("pattern", { patterns });
  const result = await provider.generate("test");

  assertEquals(result, "First match");
});

Deno.test("Pattern: throws error when no pattern matches", async () => {
  const patterns: PatternMatcher[] = [
    { pattern: /specific/, response: "response" },
  ];

  const provider = new MockLLMProvider("pattern", { patterns });

  await assertRejects(
    async () => await provider.generate("no match here"),
    MockLLMError,
    "No pattern matched",
  );
});

Deno.test("Pattern: supports dynamic response generation", async () => {
  const patterns: PatternMatcher[] = [
    {
      pattern: /add (\w+) function/i,
      response: (match) => `## Plan: Add ${match[1]} Function\n\n1. Create function`,
    },
  ];

  const provider = new MockLLMProvider("pattern", { patterns });
  const result = await provider.generate("Add hello function to utils.ts");

  assertStringIncludes(result, "Add hello Function");
});

// ============================================================================
// Test 5: Failing Strategy - Always throw error
// ============================================================================

Deno.test("Failing: throws MockLLMError on every call", async () => {
  const provider = new MockLLMProvider("failing");

  await assertRejects(
    async () => await provider.generate("any prompt"),
    MockLLMError,
  );
});

Deno.test("Failing: uses custom error message", async () => {
  const provider = new MockLLMProvider("failing", {
    errorMessage: "API rate limit exceeded",
  });

  await assertRejects(
    async () => await provider.generate("any prompt"),
    MockLLMError,
    "API rate limit exceeded",
  );
});

Deno.test("Failing: still tracks call count", async () => {
  const provider = new MockLLMProvider("failing");

  try {
    await provider.generate("1");
  } catch { /* expected */ }

  try {
    await provider.generate("2");
  } catch { /* expected */ }

  assertEquals(provider.callCount, 2);
});

// ============================================================================
// Test 6: Slow Strategy - Add artificial delay
// ============================================================================

Deno.test("Slow: adds configured delay before response", async () => {
  const provider = new MockLLMProvider("slow", {
    delayMs: 100,
    responses: ["delayed response"],
  });

  const start = Date.now();
  await provider.generate("test");
  const elapsed = Date.now() - start;

  assert(elapsed >= 100, `Expected at least 100ms delay, got ${elapsed}ms`);
});

Deno.test("Slow: uses default delay when not specified", async () => {
  const provider = new MockLLMProvider("slow", {
    responses: ["response"],
  });

  const start = Date.now();
  await provider.generate("test");
  const elapsed = Date.now() - start;

  // Default delay should be reasonable (e.g., 500ms)
  assert(elapsed >= 100, `Expected some delay, got ${elapsed}ms`);
});

Deno.test({ name: "Slow: can be used for timeout testing", sanitizeOps: false, sanitizeResources: false }, async () => {
  const provider = new MockLLMProvider("slow", {
    delayMs: 5000, // 5 seconds
    responses: ["never reached"],
  });

  // Create an AbortController for clean cancellation
  const controller = new AbortController();

  // Create a timeout that will abort
  const timeoutId = setTimeout(() => controller.abort(), 50);

  try {
    await assertRejects(
      async () => {
        const promise = provider.generate("test");
        // Race against abort signal
        await Promise.race([
          promise,
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener("abort", () => {
              reject(new Error("Timeout"));
            });
          }),
        ]);
      },
      Error,
      "Timeout",
    );
  } finally {
    clearTimeout(timeoutId);
  }
});

// ============================================================================
// Test 7: Token Tracking
// ============================================================================

Deno.test("MockLLMProvider tracks token usage", async () => {
  const provider = new MockLLMProvider("scripted", {
    responses: ["Short response"],
    tokensPerResponse: { input: 100, output: 50 },
  });

  await provider.generate("test prompt");

  assertEquals(provider.totalTokens.input, 100);
  assertEquals(provider.totalTokens.output, 50);
});

Deno.test("MockLLMProvider accumulates tokens across calls", async () => {
  const provider = new MockLLMProvider("scripted", {
    responses: ["response"],
    tokensPerResponse: { input: 100, output: 50 },
  });

  await provider.generate("1");
  await provider.generate("2");
  await provider.generate("3");

  assertEquals(provider.totalTokens.input, 300);
  assertEquals(provider.totalTokens.output, 150);
});

// ============================================================================
// Test 8: Reset and State Management
// ============================================================================

Deno.test("MockLLMProvider reset() clears all state", async () => {
  const provider = new MockLLMProvider("scripted", {
    responses: ["A", "B"],
  });

  await provider.generate("1");
  await provider.generate("2");

  provider.reset();

  assertEquals(provider.callCount, 0);
  assertEquals(provider.callHistory.length, 0);
  assertEquals(provider.totalTokens.input, 0);
  assertEquals(provider.totalTokens.output, 0);

  // Should start from first response again
  assertEquals(await provider.generate("1"), "A");
});

Deno.test("MockLLMProvider getLastCall returns most recent call", async () => {
  const provider = new MockLLMProvider("scripted", {
    responses: ["response"],
  });

  await provider.generate("first");
  await provider.generate("second");

  const lastCall = provider.getLastCall();
  assertExists(lastCall);
  assertEquals(lastCall.prompt, "second");
});

Deno.test("MockLLMProvider getLastCall returns undefined when no calls made", () => {
  const provider = new MockLLMProvider("scripted");
  assertEquals(provider.getLastCall(), undefined);
});

// ============================================================================
// Test 9: Plan Generation Simulation
// ============================================================================

Deno.test("MockLLMProvider can simulate plan generation", async () => {
  const provider = new MockLLMProvider("pattern", {
    patterns: [
      {
        pattern: /.*/,
        response: `## Proposed Plan

### Overview
This plan addresses the user's request.

### Steps
1. Analyze requirements
2. Implement solution
3. Write tests
4. Review and refine

### Expected Outcome
The feature will be implemented according to specifications.`,
      },
    ],
  });

  const result = await provider.generate("Implement feature X");

  assertStringIncludes(result, "## Proposed Plan");
  assertStringIncludes(result, "### Steps");
  assertStringIncludes(result, "1. Analyze");
});

// ============================================================================
// Test 10: Integration with IModelProvider consumers
// ============================================================================

Deno.test("MockLLMProvider can be used as IModelProvider", async () => {
  // Function that accepts any IModelProvider
  async function useProvider(provider: IModelProvider): Promise<string> {
    return await provider.generate("test prompt");
  }

  const mockProvider = new MockLLMProvider("scripted", {
    responses: ["mock response"],
  });

  const result = await useProvider(mockProvider);
  assertEquals(result, "mock response");
});

Deno.test("MockLLMProvider supports ModelOptions parameter", async () => {
  const provider = new MockLLMProvider("scripted", {
    responses: ["response"],
  });

  // Should accept options without error
  const result = await provider.generate("test", {
    temperature: 0.7,
    max_tokens: 1000,
  });

  assertEquals(result, "response");

  // Options should be captured in call history
  const lastCall = provider.getLastCall();
  assertExists(lastCall?.options);
  assertEquals(lastCall?.options?.temperature, 0.7);
});
