/**
 * Tests for FeedbackLoop
 * Phase 15.4: Feedback Loop (Reflexion Pattern)
 */

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import {
  createFeedbackLoop,
  FeedbackLoop,
  FeedbackLoopConfig,
  FeedbackLoopResult as _FeedbackLoopResult,
  ImprovementAgent,
  runSelfCorrectingAgent,
  SimpleImprovementAgent,
} from "../../src/flows/feedback_loop.ts";
import {
  GateConfig as _GateConfig,
  GateEvaluator,
  GateResult as _GateResult,
  MockJudgeInvoker,
} from "../../src/flows/gate_evaluator.ts";
import { CRITERIA, EvaluationResult as _EvaluationResult } from "../../src/flows/evaluation_criteria.ts";

/**
 * Mock improvement agent for testing
 */
class MockImprovementAgent implements ImprovementAgent {
  improvementHistory: Array<{
    originalRequest: string;
    currentContent: string;
    feedback: string;
    iteration: number;
  }> = [];

  improvedContent: string = "Improved content";
  shouldThrow: boolean = false;

  improve(
    originalRequest: string,
    currentContent: string,
    feedback: string,
    iteration: number,
  ): Promise<string> {
    this.improvementHistory.push({
      originalRequest,
      currentContent,
      feedback,
      iteration,
    });

    if (this.shouldThrow) {
      return Promise.reject(new Error("Improvement failed"));
    }

    return Promise.resolve(this.improvedContent);
  }

  setImprovedContent(content: string): void {
    this.improvedContent = content;
  }

  setThrows(shouldThrow: boolean): void {
    this.shouldThrow = shouldThrow;
  }
}

/**
 * Mock AgentRunner for SimpleImprovementAgent tests
 */
class MockAgentRunner {
  responses: Map<string, string> = new Map();
  lastRequest: { agentId: string; prompt: string; context?: Record<string, unknown> } | null = null;

  setResponse(agentId: string, response: string): void {
    this.responses.set(agentId, response);
  }

  run(
    agentId: string,
    request: { userPrompt: string; context?: Record<string, unknown> },
  ): Promise<{ content: string }> {
    this.lastRequest = {
      agentId,
      prompt: request.userPrompt,
      context: request.context,
    };

    const response = this.responses.get(agentId);
    if (!response) {
      return Promise.resolve({ content: "Default improved content" });
    }

    return Promise.resolve({ content: response });
  }
}

// ============================================================
// FeedbackLoop Basic Tests
// ============================================================

Deno.test("FeedbackLoop: stops when target score reached", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.95); // Above target

  const gateEvaluator = new GateEvaluator(mockJudge);
  const improvementAgent = new MockImprovementAgent();

  const feedbackLoop = new FeedbackLoop(gateEvaluator, improvementAgent);

  const config: FeedbackLoopConfig = {
    maxIterations: 5,
    targetScore: 0.9,
    evaluator: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    minImprovement: 0.05,
    includePreviousAttempts: true,
  };

  const result = await feedbackLoop.run(config, "Initial content", "Original request");

  assertEquals(result.success, true);
  assertEquals(result.stopReason, "target-reached");
  assertEquals(result.totalIterations, 1);
  assertEquals(result.finalScore >= 0.9, true);
});

Deno.test("FeedbackLoop: stops at max iterations", async () => {
  const mockJudge = new MockJudgeInvoker();
  // Always returns low score
  mockJudge.setDefaultScore(0.5);

  const gateEvaluator = new GateEvaluator(mockJudge);
  const improvementAgent = new MockImprovementAgent();

  const feedbackLoop = new FeedbackLoop(gateEvaluator, improvementAgent);

  const config: FeedbackLoopConfig = {
    maxIterations: 3,
    targetScore: 0.9,
    evaluator: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    minImprovement: 0.0, // Don't stop for no improvement
    includePreviousAttempts: true,
  };

  const result = await feedbackLoop.run(config, "Initial content", "Original request");

  assertEquals(result.success, false);
  assertEquals(result.stopReason, "max-iterations");
  assertEquals(result.totalIterations, 3);
});

Deno.test("FeedbackLoop: tracks iterations correctly", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.6);

  const gateEvaluator = new GateEvaluator(mockJudge);
  const improvementAgent = new MockImprovementAgent();
  improvementAgent.setImprovedContent("Attempt 2 content");

  const feedbackLoop = new FeedbackLoop(gateEvaluator, improvementAgent);

  const config: FeedbackLoopConfig = {
    maxIterations: 2,
    targetScore: 0.9,
    evaluator: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    minImprovement: 0.0,
    includePreviousAttempts: true,
  };

  const result = await feedbackLoop.run(config, "Initial content", "Original request");

  assertEquals(result.iterations.length, 2);
  assertEquals(result.iterations[0].iteration, 1);
  assertEquals(result.iterations[1].iteration, 2);
  assertExists(result.iterations[0].gateResult);
  assertExists(result.iterations[0].durationMs);
});

// ============================================================
// Stop Condition Tests
// ============================================================

Deno.test("FeedbackLoop: stops on no improvement", async () => {
  const mockJudge = new MockJudgeInvoker();
  let callCount = 0;

  // First call: 0.7, subsequent calls: 0.71 (less than minImprovement of 0.05)
  const originalEvaluate = mockJudge.evaluate.bind(mockJudge);
  mockJudge.evaluate = async (...args) => {
    callCount++;
    if (callCount === 1) {
      mockJudge.setDefaultScore(0.7);
    } else {
      mockJudge.setDefaultScore(0.71);
    }
    return await originalEvaluate(...args);
  };

  const gateEvaluator = new GateEvaluator(mockJudge);
  const improvementAgent = new MockImprovementAgent();

  const feedbackLoop = new FeedbackLoop(gateEvaluator, improvementAgent);

  const config: FeedbackLoopConfig = {
    maxIterations: 5,
    targetScore: 0.9,
    evaluator: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    minImprovement: 0.05, // 0.01 improvement is below threshold
    includePreviousAttempts: true,
  };

  const result = await feedbackLoop.run(config, "Initial content", "Original request");

  assertEquals(result.success, false);
  assertEquals(result.stopReason, "no-improvement");
  assertEquals(result.totalIterations <= 5, true);
});

Deno.test("FeedbackLoop: stops on score degradation", async () => {
  const mockJudge = new MockJudgeInvoker();
  let callCount = 0;

  // First call: 0.75, second call: 0.65 (degradation)
  const originalEvaluate = mockJudge.evaluate.bind(mockJudge);
  mockJudge.evaluate = async (...args) => {
    callCount++;
    if (callCount === 1) {
      mockJudge.setDefaultScore(0.75);
    } else {
      mockJudge.setDefaultScore(0.65); // Score went down
    }
    return await originalEvaluate(...args);
  };

  const gateEvaluator = new GateEvaluator(mockJudge);
  const improvementAgent = new MockImprovementAgent();

  const feedbackLoop = new FeedbackLoop(gateEvaluator, improvementAgent);

  const config: FeedbackLoopConfig = {
    maxIterations: 5,
    targetScore: 0.9,
    evaluator: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    minImprovement: 0.05,
    includePreviousAttempts: true,
  };

  const result = await feedbackLoop.run(config, "Initial content", "Original request");

  assertEquals(result.success, false);
  assertEquals(result.stopReason, "score-degraded");
  // Should return previous (better) content
  assertEquals(result.finalScore, 0.75);
});

Deno.test("FeedbackLoop: stops on improvement agent error", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.6);

  const gateEvaluator = new GateEvaluator(mockJudge);
  const improvementAgent = new MockImprovementAgent();
  improvementAgent.setThrows(true); // Will throw on improve

  const feedbackLoop = new FeedbackLoop(gateEvaluator, improvementAgent);

  const config: FeedbackLoopConfig = {
    maxIterations: 3,
    targetScore: 0.9,
    evaluator: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    minImprovement: 0.05,
    includePreviousAttempts: true,
  };

  const result = await feedbackLoop.run(config, "Initial content", "Original request");

  assertEquals(result.success, false);
  assertEquals(result.stopReason, "error");
});

// ============================================================
// Improvement Agent Tests
// ============================================================

Deno.test("FeedbackLoop: calls improvement agent with correct parameters", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.6);

  const gateEvaluator = new GateEvaluator(mockJudge);
  const improvementAgent = new MockImprovementAgent();

  const feedbackLoop = new FeedbackLoop(gateEvaluator, improvementAgent);

  const config: FeedbackLoopConfig = {
    maxIterations: 2,
    targetScore: 0.9,
    evaluator: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    minImprovement: 0.0,
    includePreviousAttempts: true,
  };

  await feedbackLoop.run(config, "Initial content", "Original request");

  // Should have called improve once (after first evaluation)
  assertEquals(improvementAgent.improvementHistory.length >= 1, true);

  const firstCall = improvementAgent.improvementHistory[0];
  assertEquals(firstCall.originalRequest, "Original request");
  assertEquals(firstCall.currentContent, "Initial content");
  assertEquals(firstCall.iteration, 1);
  assertExists(firstCall.feedback);
});

Deno.test("FeedbackLoop: uses improved content in subsequent iterations", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.6);

  const gateEvaluator = new GateEvaluator(mockJudge);
  const improvementAgent = new MockImprovementAgent();
  improvementAgent.setImprovedContent("Much better content");

  const feedbackLoop = new FeedbackLoop(gateEvaluator, improvementAgent);

  const config: FeedbackLoopConfig = {
    maxIterations: 3,
    targetScore: 0.9,
    evaluator: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    minImprovement: 0.0,
    includePreviousAttempts: true,
  };

  const result = await feedbackLoop.run(config, "Initial content", "Original request");

  // Second iteration should use improved content
  if (improvementAgent.improvementHistory.length >= 2) {
    assertEquals(
      improvementAgent.improvementHistory[1].currentContent,
      "Much better content",
    );
  }

  assertEquals(result.finalContent, "Much better content");
});

// ============================================================
// SimpleImprovementAgent Tests
// ============================================================

Deno.test("SimpleImprovementAgent: formats prompt correctly", async () => {
  const mockRunner = new MockAgentRunner();
  mockRunner.setResponse("improver-agent", "Improved version of the code");

  const agent = new SimpleImprovementAgent(mockRunner, "improver-agent");

  await agent.improve(
    "Write a function",
    "function foo() {}",
    "Score: 60%\nNeeds better naming",
    1,
  );

  assertExists(mockRunner.lastRequest);
  assertEquals(mockRunner.lastRequest.agentId, "improver-agent");
  assertEquals(mockRunner.lastRequest.prompt.includes("Write a function"), true);
  assertEquals(mockRunner.lastRequest.prompt.includes("function foo() {}"), true);
  assertEquals(mockRunner.lastRequest.prompt.includes("Iteration 1"), true);
  assertEquals(mockRunner.lastRequest.context?.improvementMode, true);
  assertEquals(mockRunner.lastRequest.context?.iteration, 1);
});

Deno.test("SimpleImprovementAgent: returns improved content", async () => {
  const mockRunner = new MockAgentRunner();
  mockRunner.setResponse("improver-agent", "Beautifully refactored code");

  const agent = new SimpleImprovementAgent(mockRunner, "improver-agent");

  const result = await agent.improve(
    "Refactor this",
    "messy code",
    "Needs cleanup",
    2,
  );

  assertEquals(result, "Beautifully refactored code");
});

// ============================================================
// createFeedbackLoop Factory Tests
// ============================================================

Deno.test("createFeedbackLoop: creates functional feedback loop", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.95);

  const gateEvaluator = new GateEvaluator(mockJudge);
  const mockRunner = new MockAgentRunner();
  mockRunner.setResponse("improver", "Better content");

  const feedbackLoop = createFeedbackLoop(gateEvaluator, mockRunner, "improver");

  const config: FeedbackLoopConfig = {
    maxIterations: 3,
    targetScore: 0.9,
    evaluator: "judge",
    criteria: ["CODE_CORRECTNESS"],
    minImprovement: 0.05,
    includePreviousAttempts: true,
  };

  const result = await feedbackLoop.run(config, "Content", "Request");

  assertEquals(result.success, true);
  assertExists(result.finalContent);
});

// ============================================================
// runSelfCorrectingAgent Tests
// ============================================================

Deno.test("runSelfCorrectingAgent: runs complete self-correcting flow", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.95); // Pass on first evaluation

  const gateEvaluator = new GateEvaluator(mockJudge);
  const mockRunner = new MockAgentRunner();
  mockRunner.setResponse("generator", "Initial generated content");
  mockRunner.setResponse("improver", "Improved content");

  const result = await runSelfCorrectingAgent(
    {
      generatorAgent: "generator",
      evaluatorAgent: "evaluator",
      improverAgent: "improver",
      criteria: ["CODE_CORRECTNESS"],
      targetScore: 0.9,
      maxIterations: 3,
    },
    mockRunner,
    gateEvaluator,
    "Generate a function",
  );

  assertEquals(result.success, true);
  assertEquals(result.initialContent, "Initial generated content");
  assertExists(result.finalContent);
});

Deno.test("runSelfCorrectingAgent: improves through iterations", async () => {
  const mockJudge = new MockJudgeInvoker();
  let callCount = 0;

  // First: 0.7, second: 0.95 (passes)
  const originalEvaluate = mockJudge.evaluate.bind(mockJudge);
  mockJudge.evaluate = async (...args) => {
    callCount++;
    if (callCount === 1) {
      mockJudge.setDefaultScore(0.7);
    } else {
      mockJudge.setDefaultScore(0.95);
    }
    return await originalEvaluate(...args);
  };

  const gateEvaluator = new GateEvaluator(mockJudge);
  const mockRunner = new MockAgentRunner();
  mockRunner.setResponse("generator", "First attempt");
  mockRunner.setResponse("improver", "Polished result");

  const result = await runSelfCorrectingAgent(
    {
      generatorAgent: "generator",
      evaluatorAgent: "evaluator",
      improverAgent: "improver",
      criteria: ["CODE_CORRECTNESS"],
      targetScore: 0.9,
      maxIterations: 3,
    },
    mockRunner,
    gateEvaluator,
    "Generate code",
  );

  assertEquals(result.success, true);
  assertEquals(result.totalIterations, 2);
  assertEquals(result.initialContent, "First attempt");
});

// ============================================================
// Duration Tracking Tests
// ============================================================

Deno.test("FeedbackLoop: tracks total duration", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.95);

  const gateEvaluator = new GateEvaluator(mockJudge);
  const improvementAgent = new MockImprovementAgent();

  const feedbackLoop = new FeedbackLoop(gateEvaluator, improvementAgent);

  const config: FeedbackLoopConfig = {
    maxIterations: 3,
    targetScore: 0.9,
    evaluator: "judge",
    criteria: ["CODE_CORRECTNESS"],
    minImprovement: 0.05,
    includePreviousAttempts: true,
  };

  const result = await feedbackLoop.run(config, "Content", "Request");

  assertEquals(result.totalDurationMs >= 0, true);
  assertEquals(result.iterations[0].durationMs >= 0, true);
});

// ============================================================
// Multiple Criteria Tests
// ============================================================

Deno.test("FeedbackLoop: handles multiple criteria", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.95);

  const gateEvaluator = new GateEvaluator(mockJudge);
  const improvementAgent = new MockImprovementAgent();

  const feedbackLoop = new FeedbackLoop(gateEvaluator, improvementAgent);

  const config: FeedbackLoopConfig = {
    maxIterations: 3,
    targetScore: 0.9,
    evaluator: "judge",
    criteria: [
      "CODE_CORRECTNESS",
      "HAS_TESTS",
      CRITERIA.DOCUMENTATION_QUALITY,
    ],
    minImprovement: 0.05,
    includePreviousAttempts: true,
  };

  const result = await feedbackLoop.run(config, "Content", "Request");

  assertEquals(result.success, true);
  assertExists(result.iterations[0].gateResult);
});
