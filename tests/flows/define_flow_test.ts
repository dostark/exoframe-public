import { assertEquals, assertThrows } from "jsr:@std/assert";
import { defineFlow } from "../../src/flows/define_flow.ts";
import { FlowSchema } from "../../src/schemas/flow.ts";

// Test defineFlow helper function
Deno.test("defineFlow: creates valid flow definition with minimal required fields", () => {
  const flow = defineFlow({
    id: "test-flow",
    name: "Test Flow",
    description: "A simple test flow",
    steps: [
      {
        id: "step1",
        name: "First Step",
        agent: "test-agent",
        dependsOn: [],
        input: {
          source: "request" as const,
          transform: "passthrough",
        },
        retry: {
          maxAttempts: 1,
          backoffMs: 1000,
        },
      },
    ],
    output: {
      from: "step1",
    },
  });

  // Validate the flow structure
  assertEquals(flow.id, "test-flow");
  assertEquals(flow.name, "Test Flow");
  assertEquals(flow.description, "A simple test flow");
  assertEquals(flow.version, "1.0.0"); // default value
  assertEquals(flow.steps.length, 1);
  assertEquals(flow.steps[0].id, "step1");
  assertEquals(flow.output.from, "step1");
  assertEquals(flow.output.format, "markdown"); // default value
  assertEquals(flow.settings.maxParallelism, 3); // default value
  assertEquals(flow.settings.failFast, true); // default value

  // Validate against schema
  const result = FlowSchema.parse(flow);
  assertEquals(result.id, "test-flow");
});

Deno.test("defineFlow: creates complex flow with dependencies and custom settings", () => {
  const flow = defineFlow({
    id: "complex-flow",
    name: "Complex Flow",
    description: "A complex flow with dependencies",
    version: "2.1.0",
    steps: [
      {
        id: "setup",
        name: "Setup Environment",
        agent: "setup-agent",
        dependsOn: [],
        input: {
          source: "request",
          transform: "passthrough",
        },
        retry: {
          maxAttempts: 1,
          backoffMs: 1000,
        },
      },
      {
        id: "analyze",
        name: "Analyze Code",
        agent: "analyzer-agent",
        dependsOn: ["setup"],
        input: {
          source: "step",
          stepId: "setup",
          transform: "extract-code",
        },
        timeout: 60000,
        retry: {
          maxAttempts: 3,
          backoffMs: 2000,
        },
      },
      {
        id: "review",
        name: "Code Review",
        agent: "reviewer-agent",
        dependsOn: ["analyze"],
        input: {
          source: "request",
          transform: "passthrough",
        },
        condition: "result.status === 'success'",
        retry: {
          maxAttempts: 1,
          backoffMs: 1000,
        },
      },
    ],
    output: {
      from: ["analyze", "review"],
      format: "json",
    },
    settings: {
      maxParallelism: 2,
      failFast: false,
      timeout: 300000,
    },
  });

  // Validate complex structure
  assertEquals(flow.id, "complex-flow");
  assertEquals(flow.version, "2.1.0");
  assertEquals(flow.steps.length, 3);
  assertEquals(flow.steps[1].dependsOn, ["setup"]);
  assertEquals(flow.steps[1].input.source, "step");
  assertEquals(flow.steps[1].input.stepId, "setup");
  assertEquals(flow.steps[1].timeout, 60000);
  assertEquals(flow.steps[1].retry.maxAttempts, 3);
  assertEquals(flow.output.from, ["analyze", "review"]);
  assertEquals(flow.output.format, "json");
  assertEquals(flow.settings.maxParallelism, 2);
  assertEquals(flow.settings.failFast, false);
  assertEquals(flow.settings.timeout, 300000);

  // Validate against schema
  const result = FlowSchema.parse(flow);
  assertEquals(result.id, "complex-flow");
});

Deno.test("defineFlow: rejects invalid flow definitions", () => {
  // Test empty steps array - this should be caught by schema validation
  assertThrows(
    () =>
      defineFlow({
        id: "test",
        name: "Test",
        description: "Test",
        steps: [],
        output: { from: "nonexistent" },
      }),
    "Flow must have at least one step",
  );
});

Deno.test("defineFlow: applies default values correctly", () => {
  const flow = defineFlow({
    id: "minimal",
    name: "Minimal",
    description: "Minimal flow",
    steps: [
      {
        id: "step1",
        name: "Step 1",
        agent: "agent1",
        dependsOn: [],
        input: {
          source: "request",
          transform: "passthrough",
        },
        retry: {
          maxAttempts: 1,
          backoffMs: 1000,
        },
      },
    ],
    output: {
      from: "step1",
    },
  });

  // Check all default values are applied
  assertEquals(flow.version, "1.0.0");
  assertEquals(flow.output.format, "markdown");
  assertEquals(flow.settings.maxParallelism, 3);
  assertEquals(flow.settings.failFast, true);
  assertEquals(flow.steps[0].dependsOn, []);
  assertEquals(flow.steps[0].input.source, "request");
  assertEquals(flow.steps[0].input.transform, "passthrough");
  assertEquals(flow.steps[0].retry.maxAttempts, 1);
  assertEquals(flow.steps[0].retry.backoffMs, 1000);
});

Deno.test("defineFlow: allows valid dependency references", () => {
  // Dependencies are validated at the flow level, not in defineFlow
  // This should succeed - validation happens later in FlowRunner
  const flow = defineFlow({
    id: "test",
    name: "Test",
    description: "Test",
    steps: [
      {
        id: "step1",
        name: "Step 1",
        agent: "agent1",
        dependsOn: ["nonexistent"], // This is valid at defineFlow level
        input: {
          source: "request",
          transform: "passthrough",
        },
        retry: {
          maxAttempts: 1,
          backoffMs: 1000,
        },
      },
    ],
    output: { from: "step1" },
  });

  assertEquals(flow.steps[0].dependsOn, ["nonexistent"]);
});
