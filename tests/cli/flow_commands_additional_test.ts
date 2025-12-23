import { assertStringIncludes } from "jsr:@std/assert@1";
import { FlowCommands } from "../../src/cli/flow_commands.ts";
import { join } from "@std/path";
import { copySync } from "jsr:@std/fs@1";

const mockContext = {
  config: {
    system: { root: "/tmp/test-flow-commands-2" },
    paths: { knowledge: "Knowledge", system: "System" },
  },
  db: undefined,
  provider: undefined,
};

Deno.test("FlowCommands: listFlows outputs JSON when requested", async () => {
  const flowDir = join(mockContext.config.system.root, mockContext.config.paths.knowledge, "Flows");
  await Deno.mkdir(flowDir, { recursive: true });
  try {
    // copy schema helpers so define_flow can be used by flow modules
    copySync("src/flows/define_flow.ts", `${flowDir}/define_flow.ts`);
    copySync("src/schemas", join(mockContext.config.system.root, mockContext.config.paths.knowledge, "schemas"));

    const flowModule = `
import { defineFlow } from "./define_flow.ts";
export default defineFlow({
  id: "json-flow",
  name: "JSON Flow",
  description: "Flow for JSON test",
  steps: [{ id: "s1", name: "Step 1", agent: "agent1", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }],
  output: { from: "s1", format: "markdown" },
});
`;
    await Deno.writeTextFile(`${flowDir}/json-flow.flow.ts`, flowModule);

    const commands = new FlowCommands(mockContext as any);
    let output = "";
    const origLog = console.log;
    console.log = (msg: string) => (output += msg + "\n");
    await commands.listFlows({ json: true });
    console.log = origLog;

    // should be valid JSON and include our flow id
    assertStringIncludes(output, '"id": "json-flow"');
  } finally {
    await Deno.remove(mockContext.config.system.root, { recursive: true });
  }
});

Deno.test("FlowCommands: showFlow prints JSON when requested", async () => {
  const flowDir = join(mockContext.config.system.root, mockContext.config.paths.knowledge, "Flows");
  await Deno.mkdir(flowDir, { recursive: true });
  try {
    copySync("src/flows/define_flow.ts", `${flowDir}/define_flow.ts`);
    copySync("src/schemas", join(mockContext.config.system.root, mockContext.config.paths.knowledge, "schemas"));

    const flowModule = `
import { defineFlow } from "./define_flow.ts";
export default defineFlow({
  id: "show-flow",
  name: "Show Flow",
  description: "Flow for show test",
  steps: [{ id: "s1", name: "Step 1", agent: "agentA", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }],
  output: { from: "s1", format: "markdown" },
});
`;
    await Deno.writeTextFile(`${flowDir}/show-flow.flow.ts`, flowModule);

    const commands = new FlowCommands(mockContext as any);
    let output = "";
    const origLog = console.log;
    console.log = (msg: string) => (output += msg + "\n");
    await commands.showFlow("show-flow", { json: true });
    console.log = origLog;

    assertStringIncludes(output, '"id": "show-flow"');
    assertStringIncludes(output, '"name": "Show Flow"');
  } finally {
    await Deno.remove(mockContext.config.system.root, { recursive: true });
  }
});
