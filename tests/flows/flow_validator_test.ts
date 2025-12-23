import { assertEquals } from "jsr:@std/assert@1";
import { FlowLoader } from "../../src/flows/flow_loader.ts";
import { FlowValidatorImpl } from "../../src/services/flow_validator.ts";
import { copySync } from "jsr:@std/fs@1";

// Utility: create isolated temp dir for each test and helpers
async function setupTestDir() {
  const dir = await Deno.makeTempDir({ prefix: "exo-flow-" });
  // copy schemas into the temp dir
  copySync("src/schemas", `${dir}/schemas`);
  // copy define_flow but patch its import path to reference the local schemas directory
  const original = await Deno.readTextFile("src/flows/define_flow.ts");
  const patched = original.replace("../schemas/flow.ts", "./schemas/flow.ts");
  await Deno.writeTextFile(`${dir}/define_flow.ts`, patched);
  return dir;
}

function flowContent(importPath: string, body: string) {
  return `import { defineFlow } from "${importPath}";\nexport default defineFlow(${body});\n`;
}

Deno.test("FlowValidatorImpl: validates existing flow with valid structure", async () => {
  const dir = await setupTestDir();
  try {
    const validBody = `{
  id: "valid-flow",
  name: "Valid Flow",
  description: "A valid flow",
  steps: [{ id: "s1", name: "Step 1", agent: "agent1", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }],
  output: { from: "s1", format: "markdown" }
}`;
    await Deno.writeTextFile(`${dir}/valid-flow.flow.ts`, flowContent("./define_flow.ts", validBody));
    const loader = new FlowLoader(dir);
    const validator = new FlowValidatorImpl(loader, "unused-blueprints-path");
    const result = await validator.validateFlow("valid-flow");
    if (!result.valid) console.error("Flow validation debug:", result.error ?? "(no error)");
    assertEquals(result.valid, true);
    assertEquals(result.error, undefined);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("FlowValidatorImpl: fails for missing flow", async () => {
  const dir = await Deno.makeTempDir({ prefix: "exo-flow-" });
  try {
    const loader = new FlowLoader(dir);
    const validator = new FlowValidatorImpl(loader, "unused-blueprints-path");
    const result = await validator.validateFlow("nonexistent");
    assertEquals(result.valid, false);
    assertEquals(typeof result.error === "string" && (result.error ?? "").includes("not found"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("FlowValidatorImpl: fails for flow with no steps", async () => {
  const dir = await setupTestDir();
  try {
    const body =
      `{ id: "no-steps", name: "No Steps", description: "No steps flow", steps: [], output: { from: "s1", format: "markdown" } }`;
    await Deno.writeTextFile(`${dir}/no-steps.flow.ts`, flowContent("./define_flow.ts", body));
    const loader = new FlowLoader(dir);
    const validator = new FlowValidatorImpl(loader, "unused-blueprints-path");
    const result = await validator.validateFlow("no-steps");
    assertEquals(result.valid, false);
    assertEquals(typeof result.error === "string" && (result.error ?? "").includes("at least one step"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("FlowValidatorImpl: fails for flow with dependency cycle", async () => {
  const dir = await setupTestDir();
  try {
    const body = `{
    id: "cyclic-flow",
    name: "Cyclic Flow",
    description: "Cyclic flow",
    steps: [
      { id: "a", name: "A", agent: "agentA", dependsOn: ["b"], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } },
      { id: "b", name: "B", agent: "agentB", dependsOn: ["a"], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }
    ],
    output: { from: "a", format: "markdown" }
  }`;
    await Deno.writeTextFile(`${dir}/cyclic-flow.flow.ts`, flowContent("./define_flow.ts", body));
    const loader = new FlowLoader(dir);
    const validator = new FlowValidatorImpl(loader, "unused-blueprints-path");
    const result = await validator.validateFlow("cyclic-flow");
    assertEquals(result.valid, false);
    assertEquals(typeof result.error === "string" && (result.error ?? "").includes("invalid dependencies"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("FlowValidatorImpl: fails for flow with invalid agent field", async () => {
  const dir = await setupTestDir();
  try {
    const body =
      `{ id: "bad-agent", name: "Bad Agent", description: "Bad agent flow", steps: [{ id: "s1", name: "Step 1", agent: "", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }], output: { from: "s1", format: "markdown" } }`;
    await Deno.writeTextFile(`${dir}/bad-agent.flow.ts`, flowContent("./define_flow.ts", body));
    const loader = new FlowLoader(dir);
    const validator = new FlowValidatorImpl(loader, "unused-blueprints-path");
    const result = await validator.validateFlow("bad-agent");
    if (!result.valid) console.error("bad-agent debug:", result.error ?? "(no error)");
    assertEquals(result.valid, false);
    assertEquals(typeof result.error === "string" && (result.error ?? "").includes("invalid agent"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("FlowValidatorImpl: fails for flow with invalid output.from", async () => {
  const dir = await setupTestDir();
  try {
    const body =
      `{ id: "bad-output", name: "Bad Output", description: "Bad output flow", steps: [{ id: "s1", name: "Step 1", agent: "agent1", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }], output: { from: "nonexistent", format: "markdown" } }`;
    await Deno.writeTextFile(`${dir}/bad-output.flow.ts`, flowContent("./define_flow.ts", body));
    const loader = new FlowLoader(dir);
    const validator = new FlowValidatorImpl(loader, "unused-blueprints-path");
    const result = await validator.validateFlow("bad-output");
    assertEquals(result.valid, false);
    assertEquals(
      typeof result.error === "string" && (result.error ?? "").includes("output.from references non-existent step"),
      true,
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
