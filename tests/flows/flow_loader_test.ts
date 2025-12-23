import { assert, assertEquals } from "jsr:@std/assert@1";
import { FlowLoader } from "../../src/flows/flow_loader.ts";
import { FlowSchema } from "../../src/schemas/flow.ts";

// Mock flow files for testing
const mockFlowsDir = "/tmp/test-flows";

// Test FlowLoader class
Deno.test("FlowLoader: loads flow files from directory", async () => {
  // Create temporary directory structure
  await Deno.mkdir(mockFlowsDir, { recursive: true });

  try {
    // Create a mock flow file
    const mockFlowContent = `
  import { defineFlow } from "file:///home/dkasymov/git/ExoFrame/src/flows/define_flow.ts";

export default defineFlow({
  id: "test-flow",
  name: "Test Flow",
  description: "A test flow",
  steps: [
    {
      id: "step1",
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
    },
  ],
  output: {
    from: "step1",
  },
});
`;

    const flowFilePath = `${mockFlowsDir}/test-flow.flow.ts`;
    await Deno.writeTextFile(flowFilePath, mockFlowContent);

    const loader = new FlowLoader(mockFlowsDir);

    // Test loading all flows
    const flows = await loader.loadAllFlows();
    assertEquals(flows.length, 1);
    assertEquals(flows[0].id, "test-flow");
    assertEquals(flows[0].name, "Test Flow");

    // Validate loaded flow against schema
    const result = FlowSchema.parse(flows[0]);
    assertEquals(result.id, "test-flow");
  } finally {
    // Cleanup
    await Deno.remove(mockFlowsDir, { recursive: true });
  }
});

Deno.test("FlowLoader: loads specific flow by ID", async () => {
  await Deno.mkdir(mockFlowsDir, { recursive: true });

  try {
    // Create multiple mock flow files
    const flow1Content = `
  import { defineFlow } from "file:///home/dkasymov/git/ExoFrame/src/flows/define_flow.ts";

export default defineFlow({
  id: "flow1",
  name: "Flow 1",
  description: "First flow",
  steps: [{ id: "s1", name: "Step 1", agent: "agent1", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }],
  output: { from: "s1" },
});
`;

    const flow2Content = `
  import { defineFlow } from "file:///home/dkasymov/git/ExoFrame/src/flows/define_flow.ts";

export default defineFlow({
  id: "flow2",
  name: "Flow 2",
  description: "Second flow",
  steps: [{ id: "s2", name: "Step 2", agent: "agent2", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }],
  output: { from: "s2" },
});
`;

    await Deno.writeTextFile(`${mockFlowsDir}/flow1.flow.ts`, flow1Content);
    await Deno.writeTextFile(`${mockFlowsDir}/flow2.flow.ts`, flow2Content);

    const loader = new FlowLoader(mockFlowsDir);

    // Test loading specific flow
    const flow = await loader.loadFlow("flow1");
    assertEquals(flow.id, "flow1");
    assertEquals(flow.name, "Flow 1");

    const flow2 = await loader.loadFlow("flow2");
    assertEquals(flow2.id, "flow2");
    assertEquals(flow2.name, "Flow 2");
  } finally {
    await Deno.remove(mockFlowsDir, { recursive: true });
  }
});

Deno.test("FlowLoader: throws error for non-existent flow", async () => {
  const loader = new FlowLoader(mockFlowsDir);

  try {
    await loader.loadFlow("nonexistent");
    throw new Error("Expected error but none was thrown");
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes("Failed to load flow 'nonexistent'"));
  }
});

Deno.test("FlowLoader: ignores non-flow files and invalid files", async () => {
  await Deno.mkdir(mockFlowsDir, { recursive: true });

  try {
    // Create valid flow file
    const _validFlow = `
  import { defineFlow } from "file:///home/dkasymov/git/ExoFrame/src/flows/define_flow.ts";

export default defineFlow({
  id: "valid-flow",
  name: "Valid Flow",
  description: "Valid flow",
  steps: [{ id: "s1", name: "Step 1", agent: "agent1", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }],
  output: { from: "s1" },
});
`;

    // Create invalid files
    const invalidFlow = `
export default { invalid: "flow" };
`;

    const nonFlowFile = `
console.log("not a flow");
`;

    await Deno.writeTextFile(`${mockFlowsDir}/valid-flow.flow.ts`, _validFlow);
    await Deno.writeTextFile(`${mockFlowsDir}/invalid-flow.flow.ts`, invalidFlow);
    await Deno.writeTextFile(`${mockFlowsDir}/not-a-flow.ts`, nonFlowFile);
    await Deno.writeTextFile(`${mockFlowsDir}/readme.txt`, "not a flow file");

    const loader = new FlowLoader(mockFlowsDir);
    const flows = await loader.loadAllFlows();

    // Should only load the valid flow file
    assertEquals(flows.length, 1);
    assertEquals(flows[0].id, "valid-flow");
  } finally {
    await Deno.remove(mockFlowsDir, { recursive: true });
  }
});

Deno.test("FlowLoader: validates flow file naming convention", async () => {
  await Deno.mkdir(mockFlowsDir, { recursive: true });

  try {
    const loader = new FlowLoader(mockFlowsDir);

    // Test that flow files must end with .flow.ts
    const _validFlow = `
import { defineFlow } from "../src/flows/define_flow.ts";

export default defineFlow({
  id: "test-flow",
  name: "Test Flow",
  description: "Test flow",
  steps: [{ id: "s1", name: "Step 1", agent: "agent1" }],
  output: { from: "s1" },
});
`;

    // Valid naming
    const namingTestFlow = `
  import { defineFlow } from "file:///home/dkasymov/git/ExoFrame/src/flows/define_flow.ts";

export default defineFlow({
  id: "my-flow",
  name: "Test Flow",
  description: "Test flow",
  steps: [{ id: "s1", name: "Step 1", agent: "agent1", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }],
  output: { from: "s1" },
});
`;

    await Deno.writeTextFile(`${mockFlowsDir}/my-flow.flow.ts`, namingTestFlow);
    const flows = await loader.loadAllFlows();
    assertEquals(flows.length, 1);
    assertEquals(flows[0].id, "my-flow");

    // Test loading by ID matches filename
    const flow = await loader.loadFlow("my-flow");
    assertEquals(flow.id, "my-flow");
  } finally {
    await Deno.remove(mockFlowsDir, { recursive: true });
  }
});

Deno.test("FlowLoader: handles import errors gracefully", async () => {
  await Deno.mkdir(mockFlowsDir, { recursive: true });

  try {
    // Create a flow file with import error
    const brokenFlow = `
import { nonexistent } from "nonexistent-module";

export default defineFlow({
  id: "broken",
  name: "Broken Flow",
  description: "Broken flow",
  steps: [{ id: "s1", name: "Step 1", agent: "agent1" }],
  output: { from: "s1" },
});
`;

    await Deno.writeTextFile(`${mockFlowsDir}/broken.flow.ts`, brokenFlow);

    const loader = new FlowLoader(mockFlowsDir);

    // Should handle import errors gracefully - returns empty array when no valid flows
    const flows = await loader.loadAllFlows();
    assertEquals(flows.length, 0); // No valid flows loaded
  } finally {
    await Deno.remove(mockFlowsDir, { recursive: true });
  }
});

Deno.test("FlowLoader: checks if flow exists", async () => {
  await Deno.mkdir(mockFlowsDir, { recursive: true });

  try {
    const loader = new FlowLoader(mockFlowsDir);

    // Test non-existent flow
    const exists = await loader.flowExists("nonexistent");
    assertEquals(exists, false);

    // Create a flow file
    const flowContent = `
  import { defineFlow } from "../../src/flows/define_flow.ts";

export default defineFlow({
  id: "existing-flow",
  name: "Existing Flow",
  description: "A flow that exists",
  steps: [{ id: "s1", name: "Step 1", agent: "agent1", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }],
  output: { from: "s1" },
});
`;

    await Deno.writeTextFile(`${mockFlowsDir}/existing-flow.flow.ts`, flowContent);

    // Test existing flow
    const existsNow = await loader.flowExists("existing-flow");
    assertEquals(existsNow, true);

    // Test with non-.flow.ts file (should return false)
    await Deno.writeTextFile(`${mockFlowsDir}/not-a-flow.ts`, "not a flow");
    const notFlowExists = await loader.flowExists("not-a-flow");
    assertEquals(notFlowExists, false);
  } finally {
    await Deno.remove(mockFlowsDir, { recursive: true });
  }
});

Deno.test("FlowLoader: lists available flow IDs", async () => {
  await Deno.mkdir(mockFlowsDir, { recursive: true });

  try {
    const loader = new FlowLoader(mockFlowsDir);

    // Test empty directory
    let flowIds = await loader.listFlowIds();
    assertEquals(flowIds.length, 0);

    // Create flow files
    const flow1Content = `
  import { defineFlow } from "../../src/flows/define_flow.ts";

export default defineFlow({
  id: "flow-one",
  name: "Flow One",
  description: "First flow",
  steps: [{ id: "s1", name: "Step 1", agent: "agent1", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }],
  output: { from: "s1" },
});
`;

    const flow2Content = `
import { defineFlow } from "../../src/flows/define_flow.ts";

export default defineFlow({
  id: "flow-two",
  name: "Flow Two",
  description: "Second flow",
  steps: [{ id: "s2", name: "Step 2", agent: "agent2", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }],
  output: { from: "s2" },
});
`;

    await Deno.writeTextFile(`${mockFlowsDir}/flow-one.flow.ts`, flow1Content);
    await Deno.writeTextFile(`${mockFlowsDir}/flow-two.flow.ts`, flow2Content);
    await Deno.writeTextFile(`${mockFlowsDir}/not-a-flow.ts`, "not a flow file");

    // Test listing flow IDs
    flowIds = await loader.listFlowIds();
    assertEquals(flowIds.length, 2);
    assert(flowIds.includes("flow-one"));
    assert(flowIds.includes("flow-two"));
    assert(!flowIds.includes("not-a-flow"));
  } finally {
    await Deno.remove(mockFlowsDir, { recursive: true });
  }
});

Deno.test("FlowLoader: handles non-existent directory gracefully", async () => {
  const nonExistentDir = "/tmp/non-existent-flows-dir";
  const loader = new FlowLoader(nonExistentDir);

  // Should return empty arrays for all methods
  const flows = await loader.loadAllFlows();
  assertEquals(flows.length, 0);

  const flowIds = await loader.listFlowIds();
  assertEquals(flowIds.length, 0);

  const exists = await loader.flowExists("any-flow");
  assertEquals(exists, false);
});
