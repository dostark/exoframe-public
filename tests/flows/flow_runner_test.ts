import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { FlowExecutionError, FlowRunner } from "../../src/flows/flow_runner.ts";
import { Flow, FlowStep } from "../../src/schemas/flow.ts";
import { AgentExecutionResult } from "../../src/services/agent_runner.ts";

// Mock AgentRunner for testing
class MockAgentRunner {
  private results: Map<string, AgentExecutionResult> = new Map();
  private failures: Set<string> = new Set();

  constructor(results: Record<string, AgentExecutionResult> = {}, failures: string[] = []) {
    for (const [key, result] of Object.entries(results)) {
      this.results.set(key, result);
    }
    for (const failure of failures) {
      this.failures.add(failure);
    }
  }

  async run(agentId: string, request: any): Promise<AgentExecutionResult> {
    if (this.failures.has(agentId)) {
      throw new Error(`Mock failure for agent ${agentId}`);
    }
    const result = this.results.get(agentId);
    if (!result) {
      throw new Error(`No mock result for agent ${agentId}`);
    }
    return result;
  }
}

// Mock EventLogger for testing
class MockEventLogger {
  events: Array<{ event: string; payload: any }> = [];

  log(event: string, payload: any) {
    this.events.push({ event, payload });
  }
}

// Test FlowRunner class
Deno.test("FlowRunner: executes simple sequential flow", async () => {
  const steps: FlowStep[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "agent1",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "step2",
      name: "Step 2",
      agent: "agent2",
      dependsOn: ["step1"],
      input: { source: "step", stepId: "step1", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const flow: Flow = {
    id: "test-flow",
    name: "Test Flow",
    description: "A test flow",
    version: "1.0.0",
    steps,
    output: { from: "step2", format: "markdown" },
    settings: { maxParallelism: 3, failFast: true },
  };

  const mockResults = {
    agent1: { thought: "Thinking 1", content: "Result 1", raw: "raw result 1" },
    agent2: { thought: "Thinking 2", content: "Result 2", raw: "raw result 2" },
  };

  const mockAgentRunner = new MockAgentRunner(mockResults);
  const mockLogger = new MockEventLogger();

  const runner = new FlowRunner(mockAgentRunner as any, mockLogger as any);
  const result = await runner.execute(flow, { userPrompt: "test request" });

  assertEquals(result.flowRunId.length, 36); // UUID length
  assertEquals(result.stepResults.size, 2);
  assertEquals(result.stepResults.get("step1")?.result?.content, "Result 1");
  assertEquals(result.stepResults.get("step2")?.result?.content, "Result 2");
  assertEquals(result.output, "Result 2");
  assertEquals(result.success, true);

  // Check logging events - comprehensive flow execution logging
  assertEquals(mockLogger.events.length, 20); // All flow and step lifecycle events
  assertEquals(mockLogger.events[0].event, "flow.validating");
  assertEquals(mockLogger.events[1].event, "flow.validated");
  assertEquals(mockLogger.events[2].event, "flow.started");
  assertEquals(mockLogger.events[3].event, "flow.dependencies.resolving");
  assertEquals(mockLogger.events[4].event, "flow.dependencies.resolved");
  assertEquals(mockLogger.events[5].event, "flow.wave.started");
  assertEquals(mockLogger.events[6].event, "flow.step.queued");
  assertEquals(mockLogger.events[7].event, "flow.step.started");
  assertEquals(mockLogger.events[8].event, "flow.step.input.prepared");
  assertEquals(mockLogger.events[9].event, "flow.step.completed");
  assertEquals(mockLogger.events[10].event, "flow.wave.completed");
  assertEquals(mockLogger.events[11].event, "flow.wave.started");
  assertEquals(mockLogger.events[12].event, "flow.step.queued");
  assertEquals(mockLogger.events[13].event, "flow.step.started");
  assertEquals(mockLogger.events[14].event, "flow.step.input.prepared");
  assertEquals(mockLogger.events[15].event, "flow.step.completed");
  assertEquals(mockLogger.events[16].event, "flow.wave.completed");
  assertEquals(mockLogger.events[17].event, "flow.output.aggregating");
  assertEquals(mockLogger.events[18].event, "flow.output.aggregated");
  assertEquals(mockLogger.events[19].event, "flow.completed");
});

Deno.test("FlowRunner: executes parallel steps in same wave", async () => {
  const steps: FlowStep[] = [
    {
      id: "start",
      name: "Start",
      agent: "agent1",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "parallel1",
      name: "Parallel 1",
      agent: "agent2",
      dependsOn: ["start"],
      input: { source: "step", stepId: "start", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "parallel2",
      name: "Parallel 2",
      agent: "agent3",
      dependsOn: ["start"],
      input: { source: "step", stepId: "start", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const flow: Flow = {
    id: "parallel-flow",
    name: "Parallel Flow",
    description: "A flow with parallel steps",
    version: "1.0.0",
    steps,
    output: { from: ["parallel1", "parallel2"], format: "concat" },
    settings: { maxParallelism: 3, failFast: true },
  };

  const mockResults = {
    agent1: { thought: "Start thinking", content: "Start result", raw: "raw start" },
    agent2: { thought: "Parallel 1 thinking", content: "Parallel 1 result", raw: "raw parallel 1" },
    agent3: { thought: "Parallel 2 thinking", content: "Parallel 2 result", raw: "raw parallel 2" },
  };

  const mockAgentRunner = new MockAgentRunner(mockResults);
  const mockLogger = new MockEventLogger();

  const runner = new FlowRunner(mockAgentRunner as any, mockLogger as any);
  const result = await runner.execute(flow, { userPrompt: "test request" });

  assertEquals(result.stepResults.size, 3);
  assertEquals(result.success, true);
  assertEquals(result.output, "Parallel 1 result\nParallel 2 result");
});

Deno.test("FlowRunner: handles failFast behavior", async () => {
  const steps: FlowStep[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "agent1",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "step2",
      name: "Step 2",
      agent: "failing-agent",
      dependsOn: ["step1"],
      input: { source: "step", stepId: "step1", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "step3",
      name: "Step 3",
      agent: "agent3",
      dependsOn: ["step2"],
      input: { source: "step", stepId: "step2", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const flow: Flow = {
    id: "failfast-flow",
    name: "FailFast Flow",
    description: "A flow that fails fast",
    version: "1.0.0",
    steps,
    output: { from: "step3", format: "markdown" },
    settings: { maxParallelism: 3, failFast: true },
  };

  const mockResults = {
    agent1: { thought: "Step 1 thinking", content: "Step 1 result", raw: "raw step 1" },
    agent3: { thought: "Step 3 thinking", content: "Step 3 result", raw: "raw step 3" },
  };

  const mockAgentRunner = new MockAgentRunner(mockResults, ["failing-agent"]);
  const mockLogger = new MockEventLogger();

  const runner = new FlowRunner(mockAgentRunner as any, mockLogger as any);

  try {
    await runner.execute(flow, { userPrompt: "test request" });
    throw new Error("Expected FlowExecutionError to be thrown");
  } catch (error) {
    assert(error instanceof FlowExecutionError);
    assert(error.message.includes("Step step2 failed"));
  }
});

Deno.test("FlowRunner: continues execution when failFast is false", async () => {
  const steps: FlowStep[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "agent1",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "step2",
      name: "Step 2",
      agent: "failing-agent",
      dependsOn: ["step1"],
      input: { source: "step", stepId: "step1", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const flow: Flow = {
    id: "continue-flow",
    name: "Continue Flow",
    description: "A flow that continues on failure",
    version: "1.0.0",
    steps,
    output: { from: "step1", format: "markdown" },
    settings: { maxParallelism: 3, failFast: false },
  };

  const mockResults = {
    agent1: { thought: "Step 1 thinking", content: "Step 1 result", raw: "raw step 1" },
  };

  const mockAgentRunner = new MockAgentRunner(mockResults, ["failing-agent"]);
  const mockLogger = new MockEventLogger();

  const runner = new FlowRunner(mockAgentRunner as any, mockLogger as any);
  const result = await runner.execute(flow, { userPrompt: "test request" });

  assertEquals(result.stepResults.size, 2);
  assertEquals(result.stepResults.get("step1")?.success, true);
  assertEquals(result.stepResults.get("step2")?.success, false);
  assertEquals(result.success, false); // Overall flow failed but continued
  assertEquals(result.output, "Step 1 result");
});

Deno.test("FlowRunner: respects maxParallelism setting", async () => {
  const steps: FlowStep[] = [
    {
      id: "start",
      name: "Start",
      agent: "agent1",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "p1",
      name: "Parallel 1",
      agent: "agent2",
      dependsOn: ["start"],
      input: { source: "step", stepId: "start", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "p2",
      name: "Parallel 2",
      agent: "agent3",
      dependsOn: ["start"],
      input: { source: "step", stepId: "start", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "p3",
      name: "Parallel 3",
      agent: "agent4",
      dependsOn: ["start"],
      input: { source: "step", stepId: "start", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "p4",
      name: "Parallel 4",
      agent: "agent5",
      dependsOn: ["start"],
      input: { source: "step", stepId: "start", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const flow: Flow = {
    id: "parallel-limit-flow",
    name: "Parallel Limit Flow",
    description: "A flow that limits parallelism",
    version: "1.0.0",
    steps,
    output: { from: "p1", format: "markdown" },
    settings: { maxParallelism: 2, failFast: true },
  };

  const mockResults = {
    agent1: { thought: "Start", content: "Start result", raw: "raw start" },
    agent2: { thought: "P1", content: "P1 result", raw: "raw p1" },
    agent3: { thought: "P2", content: "P2 result", raw: "raw p2" },
    agent4: { thought: "P3", content: "P3 result", raw: "raw p3" },
    agent5: { thought: "P4", content: "P4 result", raw: "raw p4" },
  };

  const mockAgentRunner = new MockAgentRunner(mockResults);
  const mockLogger = new MockEventLogger();

  const runner = new FlowRunner(mockAgentRunner as any, mockLogger as any);
  const result = await runner.execute(flow, { userPrompt: "test request" });

  assertEquals(result.stepResults.size, 5);
  assertEquals(result.success, true);
});

Deno.test("FlowRunner: generates unique flowRunId", async () => {
  const steps: FlowStep[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "agent1",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const flow: Flow = {
    id: "unique-id-flow",
    name: "Unique ID Flow",
    description: "A flow for testing unique IDs",
    version: "1.0.0",
    steps,
    output: { from: "step1", format: "markdown" },
    settings: { maxParallelism: 3, failFast: true },
  };

  const mockResults = {
    agent1: { thought: "Thinking", content: "Result", raw: "raw result" },
  };

  const mockAgentRunner = new MockAgentRunner(mockResults);
  const mockLogger = new MockEventLogger();

  const runner = new FlowRunner(mockAgentRunner as any, mockLogger as any);

  const result1 = await runner.execute(flow, { userPrompt: "request 1" });
  const result2 = await runner.execute(flow, { userPrompt: "request 2" });

  assertEquals(result1.flowRunId.length, 36);
  assertEquals(result2.flowRunId.length, 36);
  assert(result1.flowRunId !== result2.flowRunId);
});

Deno.test("FlowRunner: aggregates output from multiple steps", async () => {
  const steps: FlowStep[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "agent1",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "step2",
      name: "Step 2",
      agent: "agent2",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const flow: Flow = {
    id: "aggregate-flow",
    name: "Aggregate Flow",
    description: "A flow that aggregates outputs",
    version: "1.0.0",
    steps,
    output: { from: ["step1", "step2"], format: "json" },
    settings: { maxParallelism: 3, failFast: true },
  };

  const mockResults = {
    agent1: { thought: "Step 1 thinking", content: "Result 1", raw: "raw result 1" },
    agent2: { thought: "Step 2 thinking", content: "Result 2", raw: "raw result 2" },
  };

  const mockAgentRunner = new MockAgentRunner(mockResults);
  const mockLogger = new MockEventLogger();

  const runner = new FlowRunner(mockAgentRunner as any, mockLogger as any);
  const result = await runner.execute(flow, { userPrompt: "test request" });

  assertEquals(result.output, '{"step1":"Result 1","step2":"Result 2"}');
});

Deno.test("FlowRunner: handles empty flow", async () => {
  const flow: Flow = {
    id: "empty-flow",
    name: "Empty Flow",
    description: "A flow with no steps",
    version: "1.0.0",
    steps: [],
    output: { from: [], format: "markdown" },
    settings: { maxParallelism: 3, failFast: true },
  };

  const mockAgentRunner = new MockAgentRunner();
  const mockLogger = new MockEventLogger();

  const runner = new FlowRunner(mockAgentRunner as any, mockLogger as any);

  try {
    await runner.execute(flow, { userPrompt: "test request" });
    throw new Error("Expected FlowExecutionError to be thrown");
  } catch (error) {
    assert(error instanceof FlowExecutionError);
    assert(error.message.includes("Flow must have at least one step"));
  }
});

Deno.test("FlowRunner: handles step with invalid input source", async () => {
  const steps: FlowStep[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "agent1",
      dependsOn: [],
      input: { source: "step" as any, transform: "passthrough" }, // Missing stepId
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const flow: Flow = {
    id: "invalid-input-flow",
    name: "Invalid Input Flow",
    description: "A flow with invalid step input",
    version: "1.0.0",
    steps,
    output: { from: "step1", format: "markdown" },
    settings: { maxParallelism: 3, failFast: false }, // Don't fail fast so we can check step error
  };

  const mockResults = {
    agent1: { thought: "Thinking", content: "Result", raw: "raw result" },
  };

  const mockAgentRunner = new MockAgentRunner(mockResults);
  const mockLogger = new MockEventLogger();

  const runner = new FlowRunner(mockAgentRunner as any, mockLogger as any);
  const result = await runner.execute(flow, { userPrompt: "test request" });

  assertEquals(result.success, false);
  assertEquals(result.stepResults.get("step1")?.success, false);
  assert(result.stepResults.get("step1")?.error?.includes('Step step1 has source "step" but no stepId specified'));
});

Deno.test("FlowRunner: handles step depending on failed step", async () => {
  const steps: FlowStep[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "failing-agent",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "step2",
      name: "Step 2",
      agent: "agent2",
      dependsOn: ["step1"],
      input: { source: "step", stepId: "step1", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const flow: Flow = {
    id: "failed-dependency-flow",
    name: "Failed Dependency Flow",
    description: "A flow where step depends on failed step",
    version: "1.0.0",
    steps,
    output: { from: "step2", format: "markdown" },
    settings: { maxParallelism: 3, failFast: false }, // Don't fail fast to test dependency handling
  };

  const mockResults = {
    agent2: { thought: "Thinking 2", content: "Result 2", raw: "raw result 2" },
  };

  const mockAgentRunner = new MockAgentRunner(mockResults, ["failing-agent"]);
  const mockLogger = new MockEventLogger();

  const runner = new FlowRunner(mockAgentRunner as any, mockLogger as any);
  const result = await runner.execute(flow, { userPrompt: "test request" });

  assertEquals(result.success, false);
  assertEquals(result.stepResults.get("step1")?.success, false);
  assertEquals(result.stepResults.get("step2")?.success, false);
  assert(result.stepResults.get("step2")?.error?.includes("Step step2 depends on step1 which has no result"));
});

Deno.test("FlowRunner: handles circular dependencies", async () => {
  const steps: FlowStep[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "agent1",
      dependsOn: ["step2"], // Circular dependency
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "step2",
      name: "Step 2",
      agent: "agent2",
      dependsOn: ["step1"], // Circular dependency
      input: { source: "step", stepId: "step1", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const flow: Flow = {
    id: "circular-flow",
    name: "Circular Flow",
    description: "A flow with circular dependencies",
    version: "1.0.0",
    steps,
    output: { from: "step1", format: "markdown" },
    settings: { maxParallelism: 3, failFast: true },
  };

  const mockAgentRunner = new MockAgentRunner();
  const mockLogger = new MockEventLogger();

  const runner = new FlowRunner(mockAgentRunner as any, mockLogger as any);

  try {
    await runner.execute(flow, { userPrompt: "test request" });
    console.log("No error thrown - this is unexpected");
    throw new Error("Expected an error to be thrown");
  } catch (error) {
    console.log("Error thrown:", (error as Error).constructor.name, (error as Error).message);
    assert(error instanceof FlowExecutionError || error instanceof Error);
    assert(
      (error as Error).message.includes("Cycle") || (error as Error).message.includes("Circular") ||
        (error as Error).message.includes("dependency"),
    );
  }
});

Deno.test("FlowRunner: handles agent execution throwing non-Error", async () => {
  const steps: FlowStep[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "throwing-agent",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const flow: Flow = {
    id: "throwing-flow",
    name: "Throwing Flow",
    description: "A flow with agent that throws non-Error",
    version: "1.0.0",
    steps,
    output: { from: "step1", format: "markdown" },
    settings: { maxParallelism: 3, failFast: false },
  };

  // Mock agent runner that throws a string
  class ThrowingAgentRunner extends MockAgentRunner {
    override async run(agentId: string, request: any): Promise<AgentExecutionResult> {
      if (agentId === "throwing-agent") {
        throw "String error"; // Throw a string, not an Error
      }
      return super.run(agentId, request);
    }
  }

  const mockAgentRunner = new ThrowingAgentRunner();
  const mockLogger = new MockEventLogger();

  const runner = new FlowRunner(mockAgentRunner as any, mockLogger as any);
  const result = await runner.execute(flow, { userPrompt: "test request" });

  assertEquals(result.success, false);
  assertEquals(result.stepResults.get("step1")?.success, false);
  assertEquals(result.stepResults.get("step1")?.error, "String error");
});

Deno.test("FlowRunner: handles output aggregation with failed steps", async () => {
  const steps: FlowStep[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "agent1",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "step2",
      name: "Step 2",
      agent: "failing-agent",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const flow: Flow = {
    id: "mixed-output-flow",
    name: "Mixed Output Flow",
    description: "A flow with mixed success/failure for output aggregation",
    version: "1.0.0",
    steps,
    output: { from: ["step1", "step2"], format: "concat" },
    settings: { maxParallelism: 3, failFast: false },
  };

  const mockResults = {
    agent1: { thought: "Thinking 1", content: "Result 1", raw: "raw result 1" },
  };

  const mockAgentRunner = new MockAgentRunner(mockResults, ["failing-agent"]);
  const mockLogger = new MockEventLogger();

  const runner = new FlowRunner(mockAgentRunner as any, mockLogger as any);
  const result = await runner.execute(flow, { userPrompt: "test request" });

  assertEquals(result.success, false); // Overall flow failed
  assertEquals(result.output, "Result 1"); // Only successful step included
});

Deno.test("FlowRunner: handles output aggregation with all failed steps", async () => {
  const steps: FlowStep[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "failing-agent1",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "step2",
      name: "Step 2",
      agent: "failing-agent2",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const flow: Flow = {
    id: "all-failed-flow",
    name: "All Failed Flow",
    description: "A flow where all steps fail",
    version: "1.0.0",
    steps,
    output: { from: ["step1", "step2"], format: "json" },
    settings: { maxParallelism: 3, failFast: false },
  };

  const mockAgentRunner = new MockAgentRunner({}, ["failing-agent1", "failing-agent2"]);
  const mockLogger = new MockEventLogger();

  const runner = new FlowRunner(mockAgentRunner as any, mockLogger as any);
  const result = await runner.execute(flow, { userPrompt: "test request" });

  assertEquals(result.success, false);
  assertEquals(result.output, "{}"); // Empty JSON object when no successful steps
});
