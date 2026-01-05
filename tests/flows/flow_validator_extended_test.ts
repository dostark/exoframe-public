/**
 * Extended tests for FlowValidatorImpl to improve code coverage
 * These tests cover additional edge cases and branches not covered by the main tests
 */
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { FlowValidatorImpl } from "../../src/services/flow_validator.ts";
import type { Flow, FlowStep } from "../../src/schemas/flow.ts";

/**
 * Mock FlowLoader that allows controlling behavior without file system
 */
class MockFlowLoader {
  private flows: Map<string, Flow | Error | "throw-non-error"> = new Map();
  private existingFlows: Set<string> = new Set();

  setFlow(id: string, flow: Flow | Error | "throw-non-error"): void {
    this.flows.set(id, flow);
    this.existingFlows.add(id);
  }

  setFlowExists(id: string, exists: boolean): void {
    if (exists) {
      this.existingFlows.add(id);
    } else {
      this.existingFlows.delete(id);
    }
  }

  async flowExists(flowId: string): Promise<boolean> {
    return await this.existingFlows.has(flowId);
  }

  loadFlow(flowId: string): Promise<Flow> {
    const flow = this.flows.get(flowId);
    if (!flow) {
      throw new Error(`Flow '${flowId}' not found`);
    }
    if (flow === "throw-non-error") {
      // Simulate a non-Error throw
      throw "String error thrown";
    }
    if (flow instanceof Error) {
      throw flow;
    }
    return Promise.resolve(flow);
  }
}

/**
 * Helper to create minimal valid step
 */
function createStep(id: string, agent: string, dependsOn: string[] = []): FlowStep {
  return {
    id,
    name: `Step ${id}`,
    agent,
    type: "agent",
    dependsOn,
    input: { source: "request", transform: "passthrough" },
    retry: { maxAttempts: 1, backoffMs: 1000 },
  };
}

/**
 * Helper to create minimal valid flow
 */
function createFlow(
  id: string,
  steps: FlowStep[],
  output?: { from: string; format: "markdown" | "json" | "concat" },
): Flow {
  const flow: Flow = {
    id,
    name: `Flow ${id}`,
    description: `Description for ${id}`,
    version: "1.0.0",
    steps,
    output: output ?? { from: "default", format: "markdown" },
    settings: { maxParallelism: 3, failFast: true },
  };
  return flow;
}

// ===== Tests for flow.output validation =====

Deno.test("FlowValidatorImpl: validates flow without output configuration", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  // Flow without output configuration should be valid (using default from createFlow)
  const flow = createFlow("no-output", [createStep("s1", "agent1")]);
  // Override output to simulate missing configuration in a way the validator checks
  // @ts-ignore - Force undefined output for testing
  delete flow.output;
  loader.setFlow("no-output", flow);

  const result = await validator.validateFlow("no-output");
  assertEquals(result.valid, true);
  assertEquals(result.error, undefined);
});

Deno.test("FlowValidatorImpl: fails for flow with missing output.format", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  // Flow with output.from but missing output.format
  const flow = createFlow("missing-format", [createStep("s1", "agent1")]);
  // @ts-ignore - Force missing format for testing
  flow.output = { from: "s1", format: undefined };
  loader.setFlow("missing-format", flow);

  const result = await validator.validateFlow("missing-format");
  assertEquals(result.valid, false);
  assertStringIncludes(result.error ?? "", "invalid output configuration");
});

Deno.test("FlowValidatorImpl: fails for flow with missing output.from", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  // Flow with output.format but missing output.from
  const flow = createFlow("missing-from", [createStep("s1", "agent1")]);
  // @ts-ignore - Force missing from for testing
  flow.output = { from: undefined, format: "markdown" };
  loader.setFlow("missing-from", flow);

  const result = await validator.validateFlow("missing-from");
  assertEquals(result.valid, false);
  assertStringIncludes(result.error ?? "", "invalid output configuration");
});

// ===== Tests for agent field validation =====

Deno.test("FlowValidatorImpl: fails for step with non-string agent", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  // Flow with step that has non-string agent
  const step = createStep("s1", "agent1");
  // @ts-ignore - Force non-string agent for testing
  step.agent = 123;
  const flow = createFlow("non-string-agent", [step]);
  loader.setFlow("non-string-agent", flow);

  const result = await validator.validateFlow("non-string-agent");
  assertEquals(result.valid, false);
  assertStringIncludes(result.error ?? "", "invalid agent");
});

Deno.test("FlowValidatorImpl: fails for step with null agent", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  // Flow with step that has null agent
  const step = createStep("s1", "agent1");
  // @ts-ignore - Force null agent for testing
  step.agent = null;
  const flow = createFlow("null-agent", [step]);
  loader.setFlow("null-agent", flow);

  const result = await validator.validateFlow("null-agent");
  assertEquals(result.valid, false);
  assertStringIncludes(result.error ?? "", "invalid agent");
});

Deno.test("FlowValidatorImpl: fails for step with undefined agent", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  // Flow with step that has undefined agent
  const step = createStep("s1", "agent1");
  // @ts-ignore - Force undefined agent for testing
  step.agent = undefined;
  const flow = createFlow("undefined-agent", [step]);
  loader.setFlow("undefined-agent", flow);

  const result = await validator.validateFlow("undefined-agent");
  assertEquals(result.valid, false);
  assertStringIncludes(result.error ?? "", "invalid agent");
});

// ===== Tests for error handling =====

Deno.test("FlowValidatorImpl: handles loader error with Error instance", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  // Set up flow that will throw an Error
  const error = new Error("Flow parsing failed");
  loader.setFlow("error-flow", error);

  const result = await validator.validateFlow("error-flow");
  assertEquals(result.valid, false);
  assertStringIncludes(result.error ?? "", "validation failed");
  assertStringIncludes(result.error ?? "", "Flow parsing failed");
});

Deno.test("FlowValidatorImpl: handles loader error with non-Error type", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  // Set up flow that will throw a non-Error
  loader.setFlow("string-error", "throw-non-error");

  const result = await validator.validateFlow("string-error");
  assertEquals(result.valid, false);
  assertStringIncludes(result.error ?? "", "validation failed");
});

Deno.test("FlowValidatorImpl: handles loader error with 'Agent reference cannot be empty' message", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  // Set up flow that will throw the specific agent error
  const error = new Error("Agent reference cannot be empty");
  loader.setFlow("empty-agent-error", error);

  const result = await validator.validateFlow("empty-agent-error");
  assertEquals(result.valid, false);
  assertEquals(result.error, "Flow 'empty-agent-error' has invalid agent");
});

// ===== Tests for steps array edge cases =====

Deno.test("FlowValidatorImpl: fails for flow with null steps", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  // Flow with null steps
  const flow = createFlow("null-steps", [createStep("s1", "agent1")]);
  // @ts-ignore - Force null steps for testing
  flow.steps = null;
  loader.setFlow("null-steps", flow);

  const result = await validator.validateFlow("null-steps");
  assertEquals(result.valid, false);
  assertStringIncludes(result.error ?? "", "at least one step");
});

Deno.test("FlowValidatorImpl: fails for flow with undefined steps", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  // Flow with undefined steps
  const flow = createFlow("undefined-steps", [createStep("s1", "agent1")]);
  // @ts-ignore - Force undefined steps for testing
  flow.steps = undefined;
  loader.setFlow("undefined-steps", flow);

  const result = await validator.validateFlow("undefined-steps");
  assertEquals(result.valid, false);
  assertStringIncludes(result.error ?? "", "at least one step");
});

// ===== Tests for multiple steps =====

Deno.test("FlowValidatorImpl: validates flow with multiple valid steps", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  const flow = createFlow("multi-step", [
    createStep("s1", "agent1"),
    createStep("s2", "agent2", ["s1"]),
    createStep("s3", "agent3", ["s2"]),
  ], { from: "s3", format: "markdown" });
  loader.setFlow("multi-step", flow);

  const result = await validator.validateFlow("multi-step");
  assertEquals(result.valid, true);
  assertEquals(result.error, undefined);
});

Deno.test("FlowValidatorImpl: fails when second step has invalid agent", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  const step2 = createStep("s2", "agent2");
  // @ts-ignore - Force empty string agent
  step2.agent = "";
  const flow = createFlow("second-invalid", [
    createStep("s1", "agent1"),
    step2,
  ]);
  loader.setFlow("second-invalid", flow);

  const result = await validator.validateFlow("second-invalid");
  assertEquals(result.valid, false);
  assertStringIncludes(result.error ?? "", "step 's2'");
  assertStringIncludes(result.error ?? "", "invalid agent");
});

// ===== Tests for dependency validation edge cases =====

Deno.test("FlowValidatorImpl: handles dependency resolver throwing non-Error", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  // Create a flow with self-referential dependency to trigger cycle detection
  const flow = createFlow("self-ref", [
    createStep("s1", "agent1", ["s1"]),
  ]);
  loader.setFlow("self-ref", flow);

  const result = await validator.validateFlow("self-ref");
  assertEquals(result.valid, false);
  assertStringIncludes(result.error ?? "", "invalid dependencies");
});

// ===== Tests for output.from references =====

Deno.test("FlowValidatorImpl: validates flow with output.from referencing last step", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  const flow = createFlow("output-last", [
    createStep("s1", "agent1"),
    createStep("s2", "agent2", ["s1"]),
  ], { from: "s2", format: "json" });
  loader.setFlow("output-last", flow);

  const result = await validator.validateFlow("output-last");
  assertEquals(result.valid, true);
});

Deno.test("FlowValidatorImpl: validates flow with output.from referencing first step", async () => {
  const loader = new MockFlowLoader();
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(loader, "blueprints");

  const flow = createFlow("output-first", [
    createStep("s1", "agent1"),
    createStep("s2", "agent2", ["s1"]),
  ], { from: "s1", format: "markdown" });
  loader.setFlow("output-first", flow);

  const result = await validator.validateFlow("output-first");
  assertEquals(result.valid, true);
});

// ===== Test for complete error path coverage =====

Deno.test("FlowValidatorImpl: outer catch handles unexpected errors", async () => {
  // Create a mock that throws during flowExists
  const brokenLoader = {
    flowExists: () => {
      throw new Error("Unexpected flowExists error");
    },
    loadFlow: () => Promise.resolve({} as Flow),
  };
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(brokenLoader, "blueprints");

  const result = await validator.validateFlow("broken");
  assertEquals(result.valid, false);
  assertStringIncludes(result.error ?? "", "validation failed");
  assertStringIncludes(result.error ?? "", "Unexpected flowExists error");
});

Deno.test("FlowValidatorImpl: outer catch handles non-Error exceptions", async () => {
  // Create a mock that throws a string during flowExists
  const brokenLoader = {
    flowExists: () => {
      throw "String exception from flowExists";
    },
    loadFlow: () => Promise.resolve({} as Flow),
  };
  // @ts-ignore - using mock loader
  const validator = new FlowValidatorImpl(brokenLoader, "blueprints");

  const result = await validator.validateFlow("broken");
  assertEquals(result.valid, false);
  assertStringIncludes(result.error ?? "", "validation failed");
  assertStringIncludes(result.error ?? "", "String exception from flowExists");
});
