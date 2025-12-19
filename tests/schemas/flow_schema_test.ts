import { assertEquals, assertThrows } from "jsr:@std/assert";
import { z, ZodError } from "zod";
import { FlowSchema, FlowStepSchema } from "../../src/schemas/flow.ts";

// Test FlowStep schema validation
Deno.test("FlowStepSchema: validates valid step definition", () => {
  const validStep = {
    id: "analyze-code",
    name: "Analyze Codebase",
    agent: "senior-coder",
    dependsOn: ["setup"],
    input: {
      source: "request" as const,
      transform: "passthrough",
    },
    timeout: 30000,
    retry: {
      maxAttempts: 2,
      backoffMs: 1000,
    },
  };

  const result = FlowStepSchema.parse(validStep);
  assertEquals(result.id, "analyze-code");
  assertEquals(result.name, "Analyze Codebase");
  assertEquals(result.agent, "senior-coder");
  assertEquals(result.dependsOn, ["setup"]);
  assertEquals(result.input.source, "request");
  assertEquals(result.timeout, 30000);
  assertEquals(result.retry.maxAttempts, 2);
});

Deno.test("FlowStepSchema: requires id, name, and agent fields", () => {
  // Test missing all required fields
  assertThrows(
    () => FlowStepSchema.parse({}),
    ZodError,
  );

  // Test missing id
  assertThrows(
    () => FlowStepSchema.parse({ name: "Test", agent: "test-agent" }),
    ZodError,
  );

  // Test missing name
  assertThrows(
    () => FlowStepSchema.parse({ id: "test", agent: "test-agent" }),
    ZodError,
  );

  // Test missing agent
  assertThrows(
    () => FlowStepSchema.parse({ id: "test", name: "Test" }),
    ZodError,
  );
});

Deno.test("FlowStepSchema: validates input source enum values", () => {
  const validSources = ["request", "step", "aggregate"];

  for (const source of validSources) {
    const step = {
      id: "test",
      name: "Test",
      agent: "test-agent",
      input: { source },
    };
    assertEquals(FlowStepSchema.parse(step).input.source, source);
  }

  // Invalid source
  assertThrows(
    () =>
      FlowStepSchema.parse({
        id: "test",
        name: "Test",
        agent: "test-agent",
        input: { source: "invalid" },
      }),
    ZodError,
  );
});

Deno.test("FlowStepSchema: applies default values for optional fields", () => {
  const minimalStep = {
    id: "test",
    name: "Test Step",
    agent: "test-agent",
  };

  const result = FlowStepSchema.parse(minimalStep);
  assertEquals(result.dependsOn, []);
  assertEquals(result.input.source, "request");
  assertEquals(result.input.transform, "passthrough");
  assertEquals(result.retry.maxAttempts, 1);
  assertEquals(result.retry.backoffMs, 1000);
});

Deno.test("FlowStepSchema: validates dependsOn as array of strings", () => {
  // Valid array
  const validStep = {
    id: "test",
    name: "Test",
    agent: "test-agent",
    dependsOn: ["step1", "step2"],
  };

  assertEquals(FlowStepSchema.parse(validStep).dependsOn, ["step1", "step2"]);

  // Invalid: not an array
  assertThrows(
    () =>
      FlowStepSchema.parse({
        id: "test",
        name: "Test",
        agent: "test-agent",
        dependsOn: "invalid",
      }),
    ZodError,
  );

  // Invalid: array of non-strings
  assertThrows(
    () =>
      FlowStepSchema.parse({
        id: "test",
        name: "Test",
        agent: "test-agent",
        dependsOn: [123, 456],
      }),
    ZodError,
  );
});

Deno.test("FlowStepSchema: validates timeout as number", () => {
  const validStep = {
    id: "test",
    name: "Test",
    agent: "test-agent",
    timeout: 5000,
  };
  assertEquals(FlowStepSchema.parse(validStep).timeout, 5000);

  // Invalid timeout
  assertThrows(
    () =>
      FlowStepSchema.parse({
        id: "test",
        name: "Test",
        agent: "test-agent",
        timeout: "invalid",
      }),
    ZodError,
  );
});

Deno.test("FlowStepSchema: validates retry configuration", () => {
  const validStep = {
    id: "test",
    name: "Test",
    agent: "test-agent",
    retry: {
      maxAttempts: 3,
      backoffMs: 2000,
    },
  };

  const result = FlowStepSchema.parse(validStep);
  assertEquals(result.retry.maxAttempts, 3);
  assertEquals(result.retry.backoffMs, 2000);

  // Invalid maxAttempts
  assertThrows(
    () =>
      FlowStepSchema.parse({
        id: "test",
        name: "Test",
        agent: "test-agent",
        retry: {
          maxAttempts: "invalid",
          backoffMs: 1000,
        },
      }),
    ZodError,
  );
});

// Test Flow schema validation
Deno.test("FlowSchema: validates complete flow definition", () => {
  const validFlow = {
    id: "code-review",
    name: "Code Review Flow",
    description: "Automated code review process",
    version: "1.0.0",
    steps: [
      {
        id: "lint",
        name: "Lint Code",
        agent: "linter-agent",
      },
      {
        id: "review",
        name: "Review Code",
        agent: "reviewer-agent",
        dependsOn: ["lint"],
      },
    ],
    output: {
      from: ["review"],
      format: "markdown",
    },
    settings: {
      maxParallelism: 2,
      failFast: true,
      timeout: 60000,
    },
  };

  const result = FlowSchema.parse(validFlow);
  assertEquals(result.id, "code-review");
  assertEquals(result.name, "Code Review Flow");
  assertEquals(result.steps.length, 2);
  assertEquals(result.output.from, ["review"]);
  assertEquals(result.settings.maxParallelism, 2);
});

Deno.test("FlowSchema: requires id, name, description, steps, and output", () => {
  assertThrows(
    () => FlowSchema.parse({}),
    ZodError,
  );

  assertThrows(
    () => FlowSchema.parse({ id: "test", name: "Test" }),
    ZodError,
  );
});

Deno.test("FlowSchema: validates steps array", () => {
  const flowWithSteps = {
    id: "test",
    name: "Test Flow",
    description: "Test description",
    steps: [
      {
        id: "step1",
        name: "Step 1",
        agent: "agent1",
      },
    ],
    output: {
      from: ["step1"],
      format: "markdown",
    },
  };

  const result = FlowSchema.parse(flowWithSteps);
  assertEquals(result.steps.length, 1);

  // Invalid: empty steps array
  assertThrows(
    () =>
      FlowSchema.parse({
        id: "test",
        name: "Test",
        description: "Test",
        steps: [],
        output: { from: [], format: "markdown" },
      }),
    ZodError,
  );

  // Invalid: steps not array
  assertThrows(
    () =>
      FlowSchema.parse({
        id: "test",
        name: "Test",
        description: "Test",
        steps: "invalid",
        output: { from: [], format: "markdown" },
      }),
    ZodError,
  );
});

Deno.test("FlowSchema: validates output configuration", () => {
  const validOutputs = ["markdown", "json", "concat"];

  for (const format of validOutputs) {
    const flow = {
      id: "test",
      name: "Test",
      description: "Test",
      steps: [{ id: "step1", name: "Step 1", agent: "agent1" }],
      output: {
        from: ["step1"],
        format,
      },
    };
    assertEquals(FlowSchema.parse(flow).output.format, format);
  }

  // Invalid format
  assertThrows(
    () =>
      FlowSchema.parse({
        id: "test",
        name: "Test",
        description: "Test",
        steps: [{ id: "step1", name: "Step 1", agent: "agent1" }],
        output: {
          from: ["step1"],
          format: "invalid",
        },
      }),
    ZodError,
  );
});

Deno.test("FlowSchema: applies default values for optional fields", () => {
  const minimalFlow = {
    id: "test",
    name: "Test Flow",
    description: "Test description",
    steps: [
      {
        id: "step1",
        name: "Step 1",
        agent: "agent1",
      },
    ],
    output: {
      from: ["step1"],
      format: "markdown",
    },
  };

  const result = FlowSchema.parse(minimalFlow);
  assertEquals(result.version, "1.0.0");
  assertEquals(result.settings.maxParallelism, 3);
  assertEquals(result.settings.failFast, true);
  assertEquals(result.settings.timeout, undefined); // No default
});

Deno.test("FlowSchema: validates settings configuration", () => {
  const flow = {
    id: "test",
    name: "Test",
    description: "Test",
    steps: [{ id: "step1", name: "Step 1", agent: "agent1" }],
    output: { from: ["step1"], format: "markdown" },
    settings: {
      maxParallelism: 5,
      failFast: false,
      timeout: 120000,
    },
  };

  const result = FlowSchema.parse(flow);
  assertEquals(result.settings.maxParallelism, 5);
  assertEquals(result.settings.failFast, false);
  assertEquals(result.settings.timeout, 120000);

  // Invalid maxParallelism
  assertThrows(
    () =>
      FlowSchema.parse({
        ...flow,
        settings: {
          maxParallelism: "invalid",
          failFast: true,
        },
      }),
    ZodError,
  );
});

// Integration test for schema importability
Deno.test("Flow schemas: can be imported and used by other modules", () => {
  // This test ensures the schemas are properly exported
  // and can be used in type annotations and runtime validation

  // Test that we can use the schemas in type definitions
  type FlowStep = z.infer<typeof FlowStepSchema>;
  type Flow = z.infer<typeof FlowSchema>;

  const testStep: FlowStep = {
    id: "test-step",
    name: "Test Step",
    agent: "test-agent",
    dependsOn: [],
    input: {
      source: "request",
      transform: "passthrough",
    },
    retry: {
      maxAttempts: 1,
      backoffMs: 1000,
    },
  };

  const testFlow: Flow = {
    id: "test-flow",
    name: "Test Flow",
    description: "Test flow description",
    version: "1.0.0",
    steps: [testStep],
    output: {
      from: ["test-step"],
      format: "markdown",
    },
    settings: {
      maxParallelism: 3,
      failFast: true,
    },
  };

  // Verify the types work at runtime
  assertEquals(FlowStepSchema.parse(testStep).id, "test-step");
  assertEquals(FlowSchema.parse(testFlow).id, "test-flow");
});
