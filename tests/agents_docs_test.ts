import { assert } from "https://jsr.io/@std/assert/1.0.16/mod.ts";
import { validateFile } from "../scripts/validate_agents_docs.ts";

Deno.test("agent docs validate", async () => {
  // Find at least one doc and validate it
  const files = [
    "agents/copilot/exoframe.md",
    "agents/providers/openai.md",
  ];
  for (const f of files) {
    const errors = await validateFile(f);
    assert(errors.length === 0, `Validation errors for ${f}: ${errors.join(", ")}`);
  }
});
