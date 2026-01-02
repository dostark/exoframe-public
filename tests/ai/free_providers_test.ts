import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { ModelFactory } from "../../src/ai/providers.ts";
import { OpenAIProvider } from "../../src/ai/providers/openai_provider.ts";
import { getTestModel, getTestModelDisplay } from "./helpers/test_model.ts";

function isCiGuardActive(): boolean {
  // In CI, the code intentionally prevents accidental paid calls unless
  // explicitly opted-in.
  return Deno.env.get("CI") === "1" && Deno.env.get("EXO_ENABLE_PAID_LLM") !== "1";
}

Deno.test("ModelFactory creates OpenAIProvider for default test model", () => {
  const model = getTestModel();
  const provider = ModelFactory.create(model, { apiKey: "test-key", baseUrl: "https://api.test" });

  assertExists(provider);

  if (isCiGuardActive()) {
    // In CI without opt-in, ModelFactory returns a mock provider.
    assertStringIncludes(provider.id, "mock-provider");
    return;
  }

  // The provider should be an OpenAIProvider with model reflected in id
  assertStringIncludes(provider.id, `openai-${model}`);
  assertExists(provider.generate);
});

Deno.test("OpenAIProvider sends correct payload and returns content for default test model", async () => {
  const model = getTestModel();
  const modelDisplay = getTestModelDisplay();

  // Capture request
  let capturedUrl = "";
  let capturedBody: unknown = null;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    capturedUrl = input.toString();
    capturedBody = init?.body ? JSON.parse(init.body as string) : null;

    const body = JSON.stringify({
      choices: [{ message: { content: `Hello from ${modelDisplay}` } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    });

    return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;

  try {
    const provider = new OpenAIProvider({ apiKey: "test-key", model, baseUrl: "https://api.test" });
    const res = await provider.generate("Test prompt", { temperature: 0.1, max_tokens: 50 });

    assertEquals(res, `Hello from ${modelDisplay}`);
    // OpenAIProvider uses the provided baseUrl verbatim (caller may provide full endpoint)
    assertEquals(capturedUrl, "https://api.test");

    assertExists(capturedBody);
    const bodyObj = capturedBody as Record<string, unknown>;
    assertEquals(bodyObj.model, model);
    assertExists(bodyObj.messages);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ModelFactory creates provider for 'gpt-5-mini' and 'gpt-4o' types", () => {
  const p1 = ModelFactory.create("gpt-5-mini", { apiKey: "k" });
  const p2 = ModelFactory.create("gpt-4o", { apiKey: "k" });

  if (isCiGuardActive()) {
    assertStringIncludes(p1.id, "mock-provider");
    assertStringIncludes(p2.id, "mock-provider");
    return;
  }

  assertStringIncludes(p1.id, "openai-gpt-5-mini");
  assertStringIncludes(p2.id, "openai-gpt-4o");
});
