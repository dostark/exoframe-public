/**
 * Reflexive Agent Tests
 *
 * Tests for Phase 16.4: Reflexion Pattern Implementation
 */

import { assert, assertEquals, assertExists, assertGreater } from "jsr:@std/assert@1";
import type { IModelProvider } from "../../src/ai/providers.ts";
import {
  createCodeReviewReflexiveAgent,
  createHighQualityReflexiveAgent,
  createReflexiveAgent,
  CritiqueSchema,
} from "../../src/services/reflexive_agent.ts";

// ============================================================================
// Mock LLM Provider
// ============================================================================

function createMockProvider(responses: string[]): IModelProvider {
  let callCount = 0;
  return {
    id: "mock-provider",
    generate: (_prompt: string): Promise<string> => {
      const response = responses[Math.min(callCount, responses.length - 1)];
      callCount++;
      return Promise.resolve(response);
    },
  };
}

function makeXMLResponse(thought: string, content: string): string {
  return `<thought>${thought}</thought><content>${content}</content>`;
}

function makeCritiqueJSON(options: {
  quality?: string;
  confidence?: number;
  passed?: boolean;
  issues?: Array<{ type: string; severity: string; description: string }>;
}): string {
  return JSON.stringify({
    quality: options.quality ?? "good",
    confidence: options.confidence ?? 85,
    passed: options.passed ?? true,
    issues: options.issues ?? [],
    reasoning: "Test critique reasoning",
    improvements: [],
  });
}

// ============================================================================
// CritiqueSchema Tests
// ============================================================================

Deno.test("[CritiqueSchema] validates correct critique", () => {
  const validCritique = {
    quality: "good",
    confidence: 85,
    passed: true,
    issues: [
      {
        type: "clarity",
        severity: "minor",
        description: "Could be clearer",
        suggestion: "Add more examples",
      },
    ],
    reasoning: "Overall good response",
    improvements: ["Add examples"],
  };

  const result = CritiqueSchema.safeParse(validCritique);
  assert(result.success);
});

Deno.test("[CritiqueSchema] rejects invalid quality", () => {
  const invalid = {
    quality: "awesome", // Invalid enum value
    confidence: 85,
    passed: true,
    issues: [],
    reasoning: "Test",
  };

  const result = CritiqueSchema.safeParse(invalid);
  assert(!result.success);
});

Deno.test("[CritiqueSchema] rejects confidence out of range", () => {
  const invalid = {
    quality: "good",
    confidence: 150, // Out of range
    passed: true,
    issues: [],
    reasoning: "Test",
  };

  const result = CritiqueSchema.safeParse(invalid);
  assert(!result.success);
});

// ============================================================================
// ReflexiveAgent Basic Tests
// ============================================================================

Deno.test("[ReflexiveAgent] accepts excellent response on first iteration", async () => {
  const mockResponses = [
    // Initial response
    makeXMLResponse("Thinking", "This is a great response"),
    // Critique (excellent, should accept)
    makeCritiqueJSON({ quality: "excellent", confidence: 95, passed: true }),
  ];

  const agent = createReflexiveAgent(createMockProvider(mockResponses));

  const result = await agent.run(
    { systemPrompt: "You are a helpful assistant", agentId: "test" },
    { userPrompt: "Help me", context: {} },
  );

  assertEquals(result.totalIterations, 1);
  assert(result.earlyExit);
  assertEquals(result.final.content, "This is a great response");
  assertEquals(result.finalCritique?.quality, "excellent");
});

Deno.test("[ReflexiveAgent] refines response when quality is poor", async () => {
  const mockResponses = [
    // Initial response
    makeXMLResponse("First attempt", "Initial poor response"),
    // First critique (poor, needs improvement)
    makeCritiqueJSON({
      quality: "poor",
      confidence: 30,
      passed: false,
      issues: [{ type: "accuracy", severity: "critical", description: "Inaccurate" }],
    }),
    // Refined response
    makeXMLResponse("Second attempt", "Improved response"),
    // Second critique (good, should accept)
    makeCritiqueJSON({ quality: "good", confidence: 85, passed: true }),
  ];

  const agent = createReflexiveAgent(createMockProvider(mockResponses), {
    maxIterations: 3,
  });

  const result = await agent.run(
    { systemPrompt: "Test", agentId: "test" },
    { userPrompt: "Help", context: {} },
  );

  assertEquals(result.totalIterations, 2);
  assertEquals(result.final.content, "Improved response");
  assertGreater(result.iterations.length, 1);
});

Deno.test("[ReflexiveAgent] stops at maxIterations", async () => {
  const mockResponses = [
    // All iterations produce poor quality that never passes
    makeXMLResponse("Attempt 1", "Response 1"),
    makeCritiqueJSON({ quality: "poor", confidence: 20, passed: false }),
    makeXMLResponse("Attempt 2", "Response 2"),
    makeCritiqueJSON({ quality: "poor", confidence: 25, passed: false }),
    makeXMLResponse("Attempt 3", "Response 3"),
    makeCritiqueJSON({ quality: "poor", confidence: 30, passed: false }),
  ];

  const agent = createReflexiveAgent(createMockProvider(mockResponses), {
    maxIterations: 3,
    confidenceThreshold: 90,
    minQuality: "excellent",
  });

  const result = await agent.run(
    { systemPrompt: "Test", agentId: "test" },
    { userPrompt: "Help", context: {} },
  );

  assertEquals(result.totalIterations, 3);
  assert(!result.earlyExit);
});

Deno.test("[ReflexiveAgent] tracks iterations correctly", async () => {
  const mockResponses = [
    makeXMLResponse("First", "Content 1"),
    makeCritiqueJSON({ quality: "needs_improvement", confidence: 50, passed: false }),
    makeXMLResponse("Second", "Content 2"),
    makeCritiqueJSON({ quality: "good", confidence: 80, passed: true }),
  ];

  const agent = createReflexiveAgent(createMockProvider(mockResponses), {
    maxIterations: 5,
  });

  const result = await agent.run(
    { systemPrompt: "Test", agentId: "test" },
    { userPrompt: "Help", context: {} },
  );

  assertEquals(result.iterations.length, 2);
  assertEquals(result.iterations[0].iteration, 1);
  assertEquals(result.iterations[1].iteration, 2);
  assertExists(result.iterations[0].critique);
  assertExists(result.iterations[1].critique);
});

// ============================================================================
// Acceptance Logic Tests
// ============================================================================

Deno.test("[ReflexiveAgent] accepts based on confidence threshold", async () => {
  const mockResponses = [
    makeXMLResponse("Test", "Response"),
    makeCritiqueJSON({
      quality: "acceptable",
      confidence: 75, // Above default threshold of 70
      passed: true,
    }),
  ];

  const agent = createReflexiveAgent(createMockProvider(mockResponses), {
    confidenceThreshold: 70,
  });

  const result = await agent.run(
    { systemPrompt: "Test", agentId: "test" },
    { userPrompt: "Help", context: {} },
  );

  assertEquals(result.totalIterations, 1);
  assert(result.earlyExit);
});

Deno.test("[ReflexiveAgent] accepts based on quality level", async () => {
  const mockResponses = [
    makeXMLResponse("Test", "Response"),
    makeCritiqueJSON({
      quality: "good", // Above minQuality of "acceptable"
      confidence: 60, // Below threshold, but quality passes
      passed: true,
    }),
  ];

  const agent = createReflexiveAgent(createMockProvider(mockResponses), {
    minQuality: "acceptable",
    confidenceThreshold: 90,
  });

  const result = await agent.run(
    { systemPrompt: "Test", agentId: "test" },
    { userPrompt: "Help", context: {} },
  );

  assertEquals(result.totalIterations, 1);
});

Deno.test("[ReflexiveAgent] rejects with critical issues", async () => {
  const mockResponses = [
    makeXMLResponse("Test", "Bad response"),
    makeCritiqueJSON({
      quality: "acceptable",
      confidence: 75,
      passed: false, // Not passed due to critical issue
      issues: [{ type: "accuracy", severity: "critical", description: "Wrong info" }],
    }),
    makeXMLResponse("Fixed", "Fixed response"),
    makeCritiqueJSON({ quality: "good", confidence: 85, passed: true }),
  ];

  const agent = createReflexiveAgent(createMockProvider(mockResponses), {
    maxIterations: 3,
  });

  const result = await agent.run(
    { systemPrompt: "Test", agentId: "test" },
    { userPrompt: "Help", context: {} },
  );

  assertEquals(result.totalIterations, 2);
});

// ============================================================================
// Metrics Tests
// ============================================================================

Deno.test("[ReflexiveAgent] tracks metrics correctly", async () => {
  const mockResponses = [
    makeXMLResponse("Test", "Response"),
    makeCritiqueJSON({ quality: "good", confidence: 85, passed: true }),
  ];

  const agent = createReflexiveAgent(createMockProvider(mockResponses));

  await agent.run(
    { systemPrompt: "Test", agentId: "test" },
    { userPrompt: "Help", context: {} },
  );

  const metrics = agent.getMetrics();

  assertEquals(metrics.totalExecutions, 1);
  assertEquals(metrics.totalIterations, 1);
  assertEquals(metrics.qualityDistribution.good, 1);
});

Deno.test("[ReflexiveAgent] accumulates metrics across executions", async () => {
  let callCount = 0;
  const provider: IModelProvider = {
    id: "mock-provider",
    generate: (): Promise<string> => {
      callCount++;
      if (callCount % 2 === 1) {
        return Promise.resolve(makeXMLResponse("Test", "Response"));
      } else {
        return Promise.resolve(makeCritiqueJSON({ quality: "good", confidence: 85, passed: true }));
      }
    },
  };

  const agent = createReflexiveAgent(provider);

  await agent.run(
    { systemPrompt: "Test", agentId: "test" },
    { userPrompt: "Help 1", context: {} },
  );
  await agent.run(
    { systemPrompt: "Test", agentId: "test" },
    { userPrompt: "Help 2", context: {} },
  );

  const metrics = agent.getMetrics();

  assertEquals(metrics.totalExecutions, 2);
  assertEquals(metrics.totalIterations, 2);
});

Deno.test("[ReflexiveAgent] resets metrics", async () => {
  const mockResponses = [
    makeXMLResponse("Test", "Response"),
    makeCritiqueJSON({ quality: "good", confidence: 85, passed: true }),
  ];

  const agent = createReflexiveAgent(createMockProvider(mockResponses));

  await agent.run(
    { systemPrompt: "Test", agentId: "test" },
    { userPrompt: "Help", context: {} },
  );

  agent.resetMetrics();
  const metrics = agent.getMetrics();

  assertEquals(metrics.totalExecutions, 0);
  assertEquals(metrics.totalIterations, 0);
});

// ============================================================================
// Factory Function Tests
// ============================================================================

Deno.test("[createReflexiveAgent] creates agent with defaults", () => {
  const provider = createMockProvider([]);
  const agent = createReflexiveAgent(provider);
  assertExists(agent);
});

Deno.test("[createCodeReviewReflexiveAgent] creates code review optimized agent", async () => {
  const mockResponses = [
    makeXMLResponse("Review", "Code looks good"),
    makeCritiqueJSON({ quality: "good", confidence: 80, passed: true }),
  ];

  const agent = createCodeReviewReflexiveAgent(createMockProvider(mockResponses));

  const result = await agent.run(
    { systemPrompt: "Review code", agentId: "code-reviewer" },
    { userPrompt: "Review this function", context: {} },
  );

  // Should accept good quality quickly (optimized for code review)
  assertEquals(result.totalIterations, 1);
});

Deno.test("[createHighQualityReflexiveAgent] creates high quality agent", () => {
  const provider = createMockProvider([]);
  const agent = createHighQualityReflexiveAgent(provider);
  assertExists(agent);
  // High quality agent should exist with stricter settings
});

// ============================================================================
// Edge Cases
// ============================================================================

Deno.test("[ReflexiveAgent] handles critique parse failure gracefully", async () => {
  const mockResponses = [
    makeXMLResponse("Test", "Response"),
    // Invalid JSON that won't parse
    "This is not valid JSON at all",
  ];

  const agent = createReflexiveAgent(createMockProvider(mockResponses));

  const result = await agent.run(
    { systemPrompt: "Test", agentId: "test" },
    { userPrompt: "Help", context: {} },
  );

  // Should still complete with fallback critique
  assertExists(result.final);
  assertEquals(result.totalIterations, 1);
});

Deno.test("[ReflexiveAgent] calculates average confidence", async () => {
  const mockResponses = [
    makeXMLResponse("First", "Response 1"),
    makeCritiqueJSON({ quality: "needs_improvement", confidence: 60, passed: false }),
    makeXMLResponse("Second", "Response 2"),
    makeCritiqueJSON({ quality: "good", confidence: 80, passed: true }),
  ];

  const agent = createReflexiveAgent(createMockProvider(mockResponses));

  const result = await agent.run(
    { systemPrompt: "Test", agentId: "test" },
    { userPrompt: "Help", context: {} },
  );

  // Average of 60 and 80
  assertEquals(result.averageConfidence, 70);
});

Deno.test("[ReflexiveAgent] tracks total duration", async () => {
  const mockResponses = [
    makeXMLResponse("Test", "Response"),
    makeCritiqueJSON({ quality: "excellent", confidence: 95, passed: true }),
  ];

  const agent = createReflexiveAgent(createMockProvider(mockResponses));

  const result = await agent.run(
    { systemPrompt: "Test", agentId: "test" },
    { userPrompt: "Help", context: {} },
  );

  assertGreater(result.totalDurationMs, 0);
});

Deno.test("[ReflexiveAgent] tracks issue type distribution", async () => {
  const mockResponses = [
    makeXMLResponse("Test", "Response"),
    makeCritiqueJSON({
      quality: "needs_improvement",
      confidence: 50,
      passed: false,
      issues: [
        { type: "accuracy", severity: "major", description: "Wrong" },
        { type: "clarity", severity: "minor", description: "Unclear" },
      ],
    }),
    makeXMLResponse("Fixed", "Better response"),
    makeCritiqueJSON({ quality: "good", confidence: 85, passed: true }),
  ];

  const agent = createReflexiveAgent(createMockProvider(mockResponses));

  await agent.run(
    { systemPrompt: "Test", agentId: "test" },
    { userPrompt: "Help", context: {} },
  );

  const metrics = agent.getMetrics();

  assertEquals(metrics.issueTypeDistribution["accuracy"], 1);
  assertEquals(metrics.issueTypeDistribution["clarity"], 1);
});
