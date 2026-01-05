import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { DependencyResolver, FlowValidationError } from "../../src/flows/dependency_resolver.ts";
import { FlowStep, FlowStepInput } from "../../src/schemas/flow.ts";

// Test DependencyResolver class
Deno.test("DependencyResolver: handles empty flow", () => {
  const resolver = new DependencyResolver([]);
  assertEquals(resolver.topologicalSort(), []);
  assertEquals(resolver.groupIntoWaves(), []);
});

Deno.test("DependencyResolver: handles single step with no dependencies", () => {
  const steps: FlowStepInput[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "agent1",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const resolver = new DependencyResolver(steps as FlowStep[]);
  assertEquals(resolver.topologicalSort(), ["step1"]);
  assertEquals(resolver.groupIntoWaves(), [["step1"]]);
});

Deno.test("DependencyResolver: handles linear chain", () => {
  const steps: FlowStepInput[] = [
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
    {
      id: "step3",
      name: "Step 3",
      agent: "agent3",
      dependsOn: ["step2"],
      input: { source: "step", stepId: "step2", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const resolver = new DependencyResolver(steps as FlowStep[]);
  assertEquals(resolver.topologicalSort(), ["step1", "step2", "step3"]);
  assertEquals(resolver.groupIntoWaves(), [["step1"], ["step2"], ["step3"]]);
});

Deno.test("DependencyResolver: handles parallel steps", () => {
  const steps: FlowStepInput[] = [
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
    {
      id: "end",
      name: "End",
      agent: "agent4",
      dependsOn: ["parallel1", "parallel2"],
      input: { source: "aggregate", transform: "combine" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const resolver = new DependencyResolver(steps as FlowStep[]);
  const topoOrder = resolver.topologicalSort();
  // Should start with "start", end with "end", and have parallel steps in some order
  assertEquals(topoOrder[0], "start");
  assertEquals(topoOrder[topoOrder.length - 1], "end");
  assertEquals(topoOrder.includes("parallel1"), true);
  assertEquals(topoOrder.includes("parallel2"), true);

  const waves = resolver.groupIntoWaves();
  assertEquals(waves.length, 3);
  assertEquals(waves[0], ["start"]);
  assertEquals(waves[1].includes("parallel1"), true);
  assertEquals(waves[1].includes("parallel2"), true);
  assertEquals(waves[2], ["end"]);
});

Deno.test("DependencyResolver: detects self-referencing cycle", () => {
  const steps: FlowStepInput[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "agent1",
      dependsOn: ["step1"], // Self-reference
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const resolver = new DependencyResolver(steps as FlowStep[]);
  assertThrows(
    () => resolver.topologicalSort(),
    FlowValidationError,
    "Cycle detected in dependency graph: step1 -> step1",
  );
});

Deno.test("DependencyResolver: detects simple cycle", () => {
  const steps: FlowStepInput[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "agent1",
      dependsOn: ["step2"],
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

  const resolver = new DependencyResolver(steps as FlowStep[]);
  assertThrows(
    () => resolver.topologicalSort(),
    FlowValidationError,
    "Cycle detected in dependency graph: step1 -> step2 -> step1",
  );
});

Deno.test("DependencyResolver: detects complex cycle", () => {
  const steps: FlowStepInput[] = [
    {
      id: "a",
      name: "A",
      agent: "agent1",
      dependsOn: ["c"],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "b",
      name: "B",
      agent: "agent2",
      dependsOn: ["a"],
      input: { source: "step", stepId: "a", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "c",
      name: "C",
      agent: "agent3",
      dependsOn: ["b"],
      input: { source: "step", stepId: "b", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const resolver = new DependencyResolver(steps as FlowStep[]);
  assertThrows(
    () => resolver.topologicalSort(),
    FlowValidationError,
    "Cycle detected in dependency graph: a -> b -> c -> a",
  );
});

Deno.test("DependencyResolver: handles diamond pattern", () => {
  const steps: FlowStepInput[] = [
    {
      id: "start",
      name: "Start",
      agent: "agent1",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "branch1",
      name: "Branch 1",
      agent: "agent2",
      dependsOn: ["start"],
      input: { source: "step", stepId: "start", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "branch2",
      name: "Branch 2",
      agent: "agent3",
      dependsOn: ["start"],
      input: { source: "step", stepId: "start", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "merge",
      name: "Merge",
      agent: "agent4",
      dependsOn: ["branch1", "branch2"],
      input: { source: "aggregate", transform: "combine" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const resolver = new DependencyResolver(steps as FlowStep[]);
  const topoOrder = resolver.topologicalSort();
  assertEquals(topoOrder[0], "start");
  assertEquals(topoOrder[topoOrder.length - 1], "merge");

  const waves = resolver.groupIntoWaves();
  assertEquals(waves.length, 3);
  assertEquals(waves[0], ["start"]);
  assertEquals(waves[1].includes("branch1"), true);
  assertEquals(waves[1].includes("branch2"), true);
  assertEquals(waves[2], ["merge"]);
});

Deno.test("DependencyResolver: throws error for invalid dependency", () => {
  const steps: FlowStepInput[] = [
    {
      id: "step1",
      name: "Step 1",
      agent: "agent1",
      dependsOn: ["nonexistent"],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  assertThrows(
    () => new DependencyResolver(steps as FlowStep[]),
    FlowValidationError,
    "Dependency 'nonexistent' not found in step definitions",
  );
});

Deno.test("DependencyResolver: handles all parallel steps", () => {
  const steps: FlowStepInput[] = [
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
    {
      id: "step3",
      name: "Step 3",
      agent: "agent3",
      dependsOn: [],
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ];

  const resolver = new DependencyResolver(steps as FlowStep[]);
  const waves = resolver.groupIntoWaves();
  assertEquals(waves.length, 1);
  assertEquals(waves[0].includes("step1"), true);
  assertEquals(waves[0].includes("step2"), true);
  assertEquals(waves[0].includes("step3"), true);
});
