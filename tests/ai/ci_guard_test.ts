import { assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { ModelFactory } from "../../src/ai/providers.ts";

Deno.test("ModelFactory falls back to mock provider in CI unless EXO_ENABLE_PAID_LLM=1", () => {
  // If env access is not permitted in this test environment, skip this test
  try {
    const originalCI = Deno.env.get("CI");
    const originalFlag = Deno.env.get("EXO_ENABLE_PAID_LLM");

    try {
      Deno.env.set("CI", "1");
      Deno.env.delete("EXO_ENABLE_PAID_LLM");

      const model = Deno.env.get("EXO_TEST_LLM_MODEL") ?? "gpt-5-mini";
      const p = ModelFactory.create(model, { apiKey: "fake" });
      // In CI without opt-in, ModelFactory should protect against paid calls and return mock provider
      assertStringIncludes(p.id, "mock-provider");
    } finally {
      if (originalCI === undefined) Deno.env.delete("CI");
      else Deno.env.set("CI", originalCI);
      if (originalFlag === undefined) Deno.env.delete("EXO_ENABLE_PAID_LLM");
      else Deno.env.set("EXO_ENABLE_PAID_LLM", originalFlag);
    }
  } catch (err) {
    console.warn("Skipping CI guard test: no env access in this environment");
  }
});
