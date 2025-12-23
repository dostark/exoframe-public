import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { FlowCommands } from "../../src/cli/flow_commands.ts";
import { FlowLoader } from "../../src/flows/flow_loader.ts";
import { FlowValidatorImpl } from "../../src/services/flow_validator.ts";
import { join } from "@std/path";
import { copySync } from "jsr:@std/fs@1";

// Minimal CLIContext mock
const mockContext = {
  config: {
    system: { root: "/tmp/test-flow-commands" },
    paths: { knowledge: "Knowledge", system: "System" },
  },
  db: undefined,
  provider: undefined,
};

Deno.test("FlowCommands: listFlows returns empty when no flows", async () => {
  const flowDir = join(mockContext.config.system.root, mockContext.config.paths.knowledge, "Flows");
  await Deno.mkdir(flowDir, { recursive: true });
  try {
    const commands = new FlowCommands(mockContext as any);
    let output = "";
    const origLog = console.log;
    console.log = (msg: string) => {
      output += msg + "\n";
    };
    await commands.listFlows();
    console.log = origLog;
    assertStringIncludes(output, "No flows found");
  } finally {
    await Deno.remove(flowDir, { recursive: true });
  }
});

Deno.test("FlowCommands: listFlows outputs table for valid flows", async () => {
  const flowDir = join(mockContext.config.system.root, mockContext.config.paths.knowledge, "Flows");
  await Deno.mkdir(flowDir, { recursive: true });
  try {
    // Copy define_flow.ts and schemas to knowledge dir
    copySync("src/flows/define_flow.ts", `${flowDir}/define_flow.ts`);
    copySync(
      "src/schemas",
      join(mockContext.config.system.root, mockContext.config.paths.knowledge, "schemas"),
    );
    // Create a valid flow file
    const validFlow = `
import { defineFlow } from "./define_flow.ts";
export default defineFlow({
  id: "cli-flow",
  name: "CLI Flow",
  description: "Flow for CLI test",
  steps: [{ id: "s1", name: "Step 1", agent: "agent1", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }],
  output: { from: "s1", format: "markdown" },
});
`;
    await Deno.writeTextFile(`${flowDir}/cli-flow.flow.ts`, validFlow);
    const commands = new FlowCommands(mockContext as any);
    let output = "";
    const origLog = console.log;
    console.log = (msg: string) => {
      output += msg + "\n";
    };
    await commands.listFlows();
    console.log = origLog;
    assertStringIncludes(output, "CLI Flow");
    assertStringIncludes(output, "Flow for CLI test");
  } finally {
    await Deno.remove(mockContext.config.system.root, { recursive: true });
  }
});

Deno.test("FlowCommands: validateFlow returns valid for correct flow", async () => {
  const flowDir = join(mockContext.config.system.root, mockContext.config.paths.knowledge, "Flows");
  await Deno.mkdir(flowDir, { recursive: true });
  try {
    // Copy define_flow.ts and schemas to knowledge dir
    copySync("src/flows/define_flow.ts", `${flowDir}/define_flow.ts`);
    copySync(
      "src/schemas",
      join(mockContext.config.system.root, mockContext.config.paths.knowledge, "schemas"),
    );
    const validFlow = `
import { defineFlow } from "./define_flow.ts";
export default defineFlow({
  id: "valid-cli-flow",
  name: "Valid CLI Flow",
  description: "Valid flow for CLI test",
  steps: [{ id: "s1", name: "Step 1", agent: "agent1", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }],
  output: { from: "s1", format: "markdown" },
});
`;
    await Deno.writeTextFile(`${flowDir}/valid-cli-flow.flow.ts`, validFlow);
    const loader = new FlowLoader(flowDir);
    const validator = new FlowValidatorImpl(loader, "unused-blueprints-path");
    const result = await validator.validateFlow("valid-cli-flow");
    assertEquals(result.valid, true);
  } finally {
    await Deno.remove(mockContext.config.system.root, { recursive: true });
  }
});
