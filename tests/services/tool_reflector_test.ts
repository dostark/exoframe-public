/**
 * Tool Reflector Tests
 *
 * Tests for Phase 16.5: Tool Result Reflection Implementation
 */

import { assert, assertEquals, assertExists, assertGreater } from "jsr:@std/assert@1";
import type { IModelProvider } from "../../src/ai/providers.ts";
import {
  createFastToolReflector,
  createStrictToolReflector,
  createToolReflector,
  type ToolCall,
  ToolReflectionSchema,
  type ToolResult,
} from "../../src/services/tool_reflector.ts";

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

function makeReflectionJSON(options: {
  success?: boolean;
  confidence?: number;
  achieved_purpose?: boolean;
  retry_suggested?: boolean;
  retry_reason?: string;
  alternative_parameters?: Record<string, unknown>;
  issues?: Array<{ type: string; description: string; severity: string }>;
}): string {
  return JSON.stringify({
    success: options.success ?? true,
    confidence: options.confidence ?? 85,
    achieved_purpose: options.achieved_purpose ?? true,
    issues: options.issues ?? [],
    retry_suggested: options.retry_suggested ?? false,
    retry_reason: options.retry_reason,
    alternative_parameters: options.alternative_parameters,
    insights: [],
  });
}

function createMockToolResult(success: boolean, output: unknown = "result", error?: string): ToolResult {
  return {
    callId: "call-1",
    success,
    output,
    error,
    durationMs: 100,
  };
}

function createMockToolCall(overrides?: Partial<ToolCall>): ToolCall {
  return {
    id: "tool-1",
    name: "read_file",
    parameters: { path: "/test/file.txt" },
    purpose: "Read file contents",
    ...overrides,
  };
}

// ============================================================================
// ToolReflectionSchema Tests
// ============================================================================

Deno.test("[ToolReflectionSchema] validates correct reflection", () => {
  const valid = {
    success: true,
    confidence: 90,
    achieved_purpose: true,
    issues: [
      { type: "incomplete", description: "Missing data", severity: "minor" },
    ],
    retry_suggested: false,
    insights: ["File exists", "Content valid"],
  };

  const result = ToolReflectionSchema.safeParse(valid);
  assert(result.success);
});

Deno.test("[ToolReflectionSchema] rejects invalid issue type", () => {
  const invalid = {
    success: true,
    confidence: 90,
    achieved_purpose: true,
    issues: [{ type: "unknown_type", description: "Test", severity: "major" }],
    retry_suggested: false,
  };

  const result = ToolReflectionSchema.safeParse(invalid);
  assert(!result.success);
});

Deno.test("[ToolReflectionSchema] rejects confidence out of range", () => {
  const invalid = {
    success: true,
    confidence: 150,
    achieved_purpose: true,
    issues: [],
    retry_suggested: false,
  };

  const result = ToolReflectionSchema.safeParse(invalid);
  assert(!result.success);
});

// ============================================================================
// ToolReflector Basic Tests
// ============================================================================

Deno.test("[ToolReflector] accepts successful tool result", async () => {
  const mockResponses = [
    makeReflectionJSON({ success: true, confidence: 90, achieved_purpose: true }),
  ];

  const reflector = createToolReflector(createMockProvider(mockResponses));

  const executor = (_params: Record<string, unknown>) => {
    return Promise.resolve(createMockToolResult(true, "file contents"));
  };

  const result = await reflector.executeWithReflection(createMockToolCall(), executor);

  assertEquals(result.reflection.success, true);
  assertEquals(result.reflection.achieved_purpose, true);
  assertEquals(result.retryCount, 0);
});

Deno.test("[ToolReflector] retries on failed reflection", async () => {
  const mockResponses = [
    makeReflectionJSON({
      success: false,
      confidence: 30,
      achieved_purpose: false,
      retry_suggested: true,
      retry_reason: "Try again",
    }),
    makeReflectionJSON({ success: true, confidence: 85, achieved_purpose: true }),
  ];

  const reflector = createToolReflector(createMockProvider(mockResponses));

  let executionCount = 0;
  const executor = (_params: Record<string, unknown>) => {
    executionCount++;
    return Promise.resolve(createMockToolResult(executionCount > 1, "result"));
  };

  const result = await reflector.executeWithReflection(createMockToolCall(), executor);

  assertEquals(result.retryCount, 1);
  assertEquals(result.reflection.success, true);
});

Deno.test("[ToolReflector] stops after maxRetries", async () => {
  const mockResponses = [
    makeReflectionJSON({ success: false, confidence: 20, achieved_purpose: false, retry_suggested: true }),
    makeReflectionJSON({ success: false, confidence: 25, achieved_purpose: false, retry_suggested: true }),
    makeReflectionJSON({ success: false, confidence: 30, achieved_purpose: false, retry_suggested: true }),
  ];

  const reflector = createToolReflector(createMockProvider(mockResponses), {
    maxRetries: 2,
  });

  const executor = (_params: Record<string, unknown>) => {
    return Promise.resolve(createMockToolResult(false, null, "Error"));
  };

  const result = await reflector.executeWithReflection(createMockToolCall(), executor);

  assertEquals(result.retryCount, 2);
  assertEquals(result.reflection.success, false);
});

Deno.test("[ToolReflector] does not retry when not suggested", async () => {
  const mockResponses = [
    makeReflectionJSON({ success: false, confidence: 20, achieved_purpose: false, retry_suggested: false }),
  ];

  const reflector = createToolReflector(createMockProvider(mockResponses));

  const executor = (_params: Record<string, unknown>) => {
    return Promise.resolve(createMockToolResult(false, null, "Error"));
  };

  const result = await reflector.executeWithReflection(createMockToolCall(), executor);

  assertEquals(result.retryCount, 0);
  assertEquals(result.reflection.retry_suggested, false);
});

Deno.test("[ToolReflector] applies alternative parameters on retry", async () => {
  const mockResponses = [
    makeReflectionJSON({
      success: false,
      confidence: 30,
      achieved_purpose: false,
      retry_suggested: true,
      retry_reason: "Try different path",
      alternative_parameters: { path: "/correct/path.txt" },
    }),
    makeReflectionJSON({ success: true, confidence: 90, achieved_purpose: true }),
  ];

  const reflector = createToolReflector(createMockProvider(mockResponses));

  let lastParams: Record<string, unknown> = {};
  const executor = (params: Record<string, unknown>) => {
    lastParams = params;
    return Promise.resolve(createMockToolResult(true, "result"));
  };

  await reflector.executeWithReflection(createMockToolCall(), executor);

  assertEquals(lastParams.path, "/correct/path.txt");
});

// ============================================================================
// Parallel Execution Tests
// ============================================================================

Deno.test("[ToolReflector] executes independent calls in parallel", async () => {
  const mockResponses = [
    makeReflectionJSON({ success: true, confidence: 90 }),
    makeReflectionJSON({ success: true, confidence: 90 }),
    makeReflectionJSON({ success: true, confidence: 90 }),
  ];

  const reflector = createToolReflector(createMockProvider(mockResponses), {
    parallelExecution: true,
  });

  const toolCalls: ToolCall[] = [
    { id: "1", name: "read_file", parameters: { path: "a.txt" }, purpose: "Read A" },
    { id: "2", name: "read_file", parameters: { path: "b.txt" }, purpose: "Read B" },
    { id: "3", name: "read_file", parameters: { path: "c.txt" }, purpose: "Read C" },
  ];

  const executor = (call: ToolCall) => {
    return Promise.resolve(createMockToolResult(true, `content of ${call.id}`));
  };

  const results = await reflector.executeMultiple(toolCalls, executor);

  assertEquals(results.length, 3);
  assert(results.every((r) => r.reflection.success));
});

Deno.test("[ToolReflector] respects dependencies in parallel execution", async () => {
  const mockResponses = [
    makeReflectionJSON({ success: true, confidence: 90 }),
    makeReflectionJSON({ success: true, confidence: 90 }),
    makeReflectionJSON({ success: true, confidence: 90 }),
  ];

  const reflector = createToolReflector(createMockProvider(mockResponses), {
    parallelExecution: true,
  });

  const executionOrder: string[] = [];

  const toolCalls: ToolCall[] = [
    { id: "1", name: "read_file", parameters: {}, purpose: "First" },
    { id: "2", name: "process", parameters: {}, purpose: "Second", dependencies: ["1"] },
    { id: "3", name: "write_file", parameters: {}, purpose: "Third", dependencies: ["2"] },
  ];

  const executor = (call: ToolCall) => {
    executionOrder.push(call.id);
    return Promise.resolve(createMockToolResult(true, call.id));
  };

  await reflector.executeMultiple(toolCalls, executor);

  const indexOf1 = executionOrder.indexOf("1");
  const indexOf2 = executionOrder.indexOf("2");
  const indexOf3 = executionOrder.indexOf("3");

  assert(indexOf1 < indexOf2, "1 should execute before 2");
  assert(indexOf2 < indexOf3, "2 should execute before 3");
});

Deno.test("[ToolReflector] executes sequentially when parallel disabled", async () => {
  const mockResponses = [
    makeReflectionJSON({ success: true, confidence: 90 }),
    makeReflectionJSON({ success: true, confidence: 90 }),
  ];

  const reflector = createToolReflector(createMockProvider(mockResponses), {
    parallelExecution: false,
  });

  const toolCalls: ToolCall[] = [
    { id: "1", name: "read_file", parameters: {}, purpose: "First" },
    { id: "2", name: "read_file", parameters: {}, purpose: "Second" },
  ];

  const executor = (call: ToolCall) => {
    return Promise.resolve(createMockToolResult(true, call.id));
  };

  const results = await reflector.executeMultiple(toolCalls, executor);

  assertEquals(results.length, 2);
});

// ============================================================================
// Metrics Tests
// ============================================================================

Deno.test("[ToolReflector] tracks metrics correctly", async () => {
  const mockResponses = [
    makeReflectionJSON({ success: true, confidence: 90 }),
    makeReflectionJSON({ success: false, confidence: 20, retry_suggested: false }),
  ];

  const reflector = createToolReflector(createMockProvider(mockResponses));

  const executor = (_params: Record<string, unknown>) => {
    return Promise.resolve(createMockToolResult(true, "result"));
  };

  await reflector.executeWithReflection(createMockToolCall({ id: "1" }), executor);
  await reflector.executeWithReflection(createMockToolCall({ id: "2" }), executor);

  const metrics = reflector.getMetrics();

  assertEquals(metrics.totalCalls, 2);
  assertEquals(metrics.successfulCalls, 1);
  assertEquals(metrics.failedCalls, 1);
});

Deno.test("[ToolReflector] tracks retry metrics", async () => {
  const mockResponses = [
    makeReflectionJSON({ success: false, confidence: 20, retry_suggested: true }),
    makeReflectionJSON({ success: true, confidence: 90 }),
  ];

  const reflector = createToolReflector(createMockProvider(mockResponses));

  let callCount = 0;
  const executor = (_params: Record<string, unknown>) => {
    callCount++;
    return Promise.resolve(createMockToolResult(callCount > 1, "result"));
  };

  await reflector.executeWithReflection(createMockToolCall(), executor);

  const metrics = reflector.getMetrics();

  assertEquals(metrics.totalRetries, 1);
  assertGreater(metrics.retryRate, 0);
});

Deno.test("[ToolReflector] tracks tool distribution", async () => {
  const mockResponses = [
    makeReflectionJSON({ success: true, confidence: 90 }),
    makeReflectionJSON({ success: true, confidence: 90 }),
  ];

  const reflector = createToolReflector(createMockProvider(mockResponses));

  const executor = (_params: Record<string, unknown>) => {
    return Promise.resolve(createMockToolResult(true, "result"));
  };

  await reflector.executeWithReflection(createMockToolCall({ name: "read_file" }), executor);
  await reflector.executeWithReflection(createMockToolCall({ name: "read_file" }), executor);

  const metrics = reflector.getMetrics();

  assertEquals(metrics.toolDistribution["read_file"], 2);
});

Deno.test("[ToolReflector] resets metrics", async () => {
  const mockResponses = [makeReflectionJSON({ success: true })];

  const reflector = createToolReflector(createMockProvider(mockResponses));

  const executor = (_params: Record<string, unknown>) => {
    return Promise.resolve(createMockToolResult(true, "result"));
  };

  await reflector.executeWithReflection(createMockToolCall(), executor);

  reflector.resetMetrics();
  const metrics = reflector.getMetrics();

  assertEquals(metrics.totalCalls, 0);
  assertEquals(metrics.successfulCalls, 0);
});

// ============================================================================
// Factory Function Tests
// ============================================================================

Deno.test("[createToolReflector] creates reflector with defaults", () => {
  const reflector = createToolReflector(createMockProvider([]));
  assertExists(reflector);
});

Deno.test("[createStrictToolReflector] creates strict reflector", async () => {
  const mockResponses = [
    makeReflectionJSON({ success: true, confidence: 80 }), // Below strict threshold of 85
    makeReflectionJSON({ success: true, confidence: 90 }), // Above threshold
  ];

  // Create reflector but we use the one with retry responses below
  createStrictToolReflector(createMockProvider(mockResponses));

  let callCount = 0;
  const executor = (_params: Record<string, unknown>) => {
    callCount++;
    return Promise.resolve(createMockToolResult(true, "result"));
  };

  // Since first reflection is below 85 threshold but doesn't suggest retry, it should fail
  const mockResponsesWithRetry = [
    makeReflectionJSON({ success: true, confidence: 80, retry_suggested: true }),
    makeReflectionJSON({ success: true, confidence: 90 }),
  ];

  const reflector2 = createStrictToolReflector(createMockProvider(mockResponsesWithRetry));

  const result = await reflector2.executeWithReflection(createMockToolCall(), executor);

  assertEquals(result.retryCount, 1);
});

Deno.test("[createFastToolReflector] creates fast reflector", async () => {
  const mockResponses = [
    makeReflectionJSON({ success: true, confidence: 55 }), // Above fast threshold of 50
  ];

  const reflector = createFastToolReflector(createMockProvider(mockResponses));

  const executor = (_params: Record<string, unknown>) => {
    return Promise.resolve(createMockToolResult(true, "result"));
  };

  const result = await reflector.executeWithReflection(createMockToolCall(), executor);

  assertEquals(result.reflection.success, true);
  assertEquals(result.retryCount, 0);
});

// ============================================================================
// Edge Case Tests
// ============================================================================

Deno.test("[ToolReflector] handles parse failure gracefully", async () => {
  const mockResponses = ["Invalid JSON response"];

  const reflector = createToolReflector(createMockProvider(mockResponses));

  const executor = (_params: Record<string, unknown>) => {
    return Promise.resolve(createMockToolResult(true, "result"));
  };

  const result = await reflector.executeWithReflection(createMockToolCall(), executor);

  // Should fall back to default reflection based on tool result
  assertEquals(result.reflection.success, true);
});

Deno.test("[ToolReflector] handles tool error", async () => {
  const mockResponses = [
    makeReflectionJSON({
      success: false,
      confidence: 20,
      issues: [{ type: "error", description: "Failed", severity: "critical" }],
    }),
  ];

  const reflector = createToolReflector(createMockProvider(mockResponses));

  const executor = (_params: Record<string, unknown>) => {
    return Promise.resolve(createMockToolResult(false, null, "Permission denied"));
  };

  const result = await reflector.executeWithReflection(createMockToolCall(), executor);

  assertEquals(result.success, false);
  assert(result.error?.includes("Permission denied"));
});

Deno.test("[ToolReflector] rejects on critical issues", async () => {
  const mockResponses = [
    makeReflectionJSON({
      success: true,
      confidence: 90,
      achieved_purpose: true,
      issues: [{ type: "error", description: "Critical error", severity: "critical" }],
      retry_suggested: false,
    }),
  ];

  const reflector = createToolReflector(createMockProvider(mockResponses));

  const executor = (_params: Record<string, unknown>) => {
    return Promise.resolve(createMockToolResult(true, "result"));
  };

  const result = await reflector.executeWithReflection(createMockToolCall(), executor);

  // Should fail because of critical issue despite high confidence
  assertEquals(result.reflection.issues.length, 1);
  const metrics = reflector.getMetrics();
  assertEquals(metrics.failedCalls, 1);
});
