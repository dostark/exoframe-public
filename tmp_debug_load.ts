import { copySync } from "https://deno.land/std/fs/mod.ts";
import { FlowLoader } from "./src/flows/flow_loader.ts";
import { FlowValidatorImpl } from "./src/services/flow_validator.ts";

async function run() {
  const dir = await Deno.makeTempDir({ prefix: "exo-flow-" });
  copySync("src/schemas", `${dir}/schemas`);
  const original = await Deno.readTextFile("src/flows/define_flow.ts");
  const patched = original.replace('../schemas/flow.ts', './schemas/flow.ts');
  await Deno.writeTextFile(`${dir}/define_flow.ts`, patched);
  const body = `{ id: "bad-agent", name: "Bad Agent", description: "Bad agent flow", steps: [{ id: "s1", name: "Step 1", agent: "", dependsOn: [], input: { source: "request", transform: "passthrough" }, retry: { maxAttempts: 1, backoffMs: 1000 } }], output: { from: "s1", format: "markdown" } }`;
  await Deno.writeTextFile(`${dir}/bad-agent.flow.ts`, `import { defineFlow } from "./define_flow.ts";\nexport default defineFlow(${body});\n`);
  const loader = new FlowLoader(dir);
  try {
    const flow = await loader.loadFlow('bad-agent');
    console.log('Loaded flow:', JSON.stringify(flow, null, 2));
  } catch (e) {
    console.error('Load error:', e);
  }
  const validator = new FlowValidatorImpl(loader, 'unused');
  const res = await validator.validateFlow('bad-agent');
  console.log('Validator result:', res);
}

run();
