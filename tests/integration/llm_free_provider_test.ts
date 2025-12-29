// Integration test for free LLM providers (manual/ignored)
// This test is ignored by default to avoid calling external endpoints in CI.

import { assertExists } from "jsr:@std/assert@^1.0.0";
import { ModelFactory } from "../../src/ai/providers.ts";

Deno.test({ name: "LLM free provider integration (manual)", ignore: true }, async () => {
  // Requires network access and a configured API key in EXO_OPENAI_API_KEY
  const apiKey = Deno.env.get("EXO_OPENAI_API_KEY");
  if (!apiKey) {
    console.warn("Skipping manual integration test: EXO_OPENAI_API_KEY not set");
    return;
  }

  const provider = ModelFactory.create("gpt-4.1", { apiKey, baseUrl: "https://api.openai.com" });
  const res = await provider.generate("Hello world");
  assertExists(res);
});
