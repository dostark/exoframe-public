/**
 * Tests for GateEvaluator
 * Phase 15.2: Quality Gate Steps
 */

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { GateConfig, GateEvaluator, MockJudgeInvoker } from "../../src/flows/gate_evaluator.ts";
import { EvaluationResult } from "../../src/flows/evaluation_criteria.ts";

Deno.test("GateEvaluator: passes gate when score above threshold", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.85);

  const evaluator = new GateEvaluator(mockJudge);

  const config: GateConfig = {
    agent: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    threshold: 0.8,
    onFail: "halt",
    maxRetries: 3,
  };

  const result = await evaluator.evaluate(config, "Test code content");

  assertEquals(result.passed, true);
  assertEquals(result.score >= 0.8, true);
  assertEquals(result.action, "passed");
  assertExists(result.evaluation);
});

Deno.test("GateEvaluator: fails gate when score below threshold", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.65);

  const evaluator = new GateEvaluator(mockJudge);

  const config: GateConfig = {
    agent: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    threshold: 0.8,
    onFail: "halt",
    maxRetries: 3,
  };

  const result = await evaluator.evaluate(config, "Poor quality code");

  assertEquals(result.passed, false);
  assertEquals(result.score < 0.8, true);
});

Deno.test("GateEvaluator: returns retry action when configured", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.6);

  const evaluator = new GateEvaluator(mockJudge);

  const config: GateConfig = {
    agent: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    threshold: 0.8,
    onFail: "retry",
    maxRetries: 3,
  };

  // First attempt - should return retry
  const result = await evaluator.evaluate(config, "Content", undefined, 0);

  assertEquals(result.passed, false);
  assertEquals(result.action, "retry");
  assertEquals(result.attempts, 1);
});

Deno.test("GateEvaluator: halts after max retries exceeded", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.6);

  const evaluator = new GateEvaluator(mockJudge);

  const config: GateConfig = {
    agent: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    threshold: 0.8,
    onFail: "retry",
    maxRetries: 3,
  };

  // Last attempt (attempt 2 = third try with 0-indexing)
  const result = await evaluator.evaluate(config, "Content", undefined, 2);

  assertEquals(result.passed, false);
  assertEquals(result.action, "halted");
  assertEquals(result.attempts, 3);
});

Deno.test("GateEvaluator: continues with warning when configured", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.5);

  const evaluator = new GateEvaluator(mockJudge);

  const config: GateConfig = {
    agent: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    threshold: 0.8,
    onFail: "continue-with-warning",
    maxRetries: 1,
  };

  const result = await evaluator.evaluate(config, "Content");

  assertEquals(result.passed, false);
  assertEquals(result.action, "continued-with-warning");
});

Deno.test("GateEvaluator: uses specific mock result", async () => {
  const mockJudge = new MockJudgeInvoker();
  const customResult: EvaluationResult = {
    overallScore: 0.95,
    pass: true,
    feedback: "Excellent!",
    criteriaScores: {
      // The criterion name is lowercase (as defined in CRITERIA.CODE_CORRECTNESS.name)
      "code_correctness": {
        name: "code_correctness",
        score: 0.95,
        reasoning: "Perfect",
        issues: [],
        passed: true,
      },
    },
    suggestions: [],
    metadata: {
      evaluatedAt: new Date().toISOString(),
      evaluatorAgent: "judge-agent",
    },
  };
  mockJudge.setMockResult("judge-agent", customResult);

  const evaluator = new GateEvaluator(mockJudge);

  const config: GateConfig = {
    agent: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    threshold: 0.8,
    onFail: "halt",
    maxRetries: 1,
  };

  const result = await evaluator.evaluate(config, "Content");

  assertEquals(result.passed, true);
  assertEquals(result.score, 0.95);
  assertEquals(result.evaluation.feedback, "Excellent!");
});

Deno.test("GateEvaluator: handles edge case scores", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.8); // Exactly at threshold

  const evaluator = new GateEvaluator(mockJudge);

  const config: GateConfig = {
    agent: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    threshold: 0.8, // Exactly matches score
    onFail: "halt",
    maxRetries: 1,
  };

  const result = await evaluator.evaluate(config, "Content");

  // Score equal to threshold should pass
  assertEquals(result.passed, true);
});

Deno.test("GateEvaluator: tracks evaluation duration", async () => {
  const mockJudge = new MockJudgeInvoker();
  mockJudge.setDefaultScore(0.85);

  const evaluator = new GateEvaluator(mockJudge);

  const config: GateConfig = {
    agent: "judge-agent",
    criteria: ["CODE_CORRECTNESS"],
    threshold: 0.8,
    onFail: "halt",
    maxRetries: 1,
  };

  const result = await evaluator.evaluate(config, "Content");

  assertExists(result.evaluationDurationMs);
  assertEquals(result.evaluationDurationMs >= 0, true);
});
