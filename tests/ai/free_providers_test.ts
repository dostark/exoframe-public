import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { ModelFactory } from "../../src/ai/providers.ts";
import { OpenAIProvider } from "../../src/ai/providers/openai_provider.ts";

Deno.test("ModelFactory creates OpenAIProvider for 'gpt-4.1' type", () => {
  const provider = ModelFactory.create("gpt-4.1", { apiKey: "test-key", baseUrl: "https://api.test" });

  assertExists(provider);
  // The provider should be an OpenAIProvider with model gpt-4.1 reflected in id
  assertStringIncludes(provider.id, "openai-gpt-4.1");
  assertExists(provider.generate);
});

Deno.test("OpenAIProvider (gpt-4.1) sends correct payload and returns content", async () => {
  // Capture request
  let capturedUrl = "";
  let capturedBody: unknown = null;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    capturedUrl = input.toString();
    capturedBody = init?.body ? JSON.parse(init.body as string) : null;

    const body = JSON.stringify({
      choices: [{ message: { content: "Hello from GPT-4.1" } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    });

    return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;

  try {
    const provider = new OpenAIProvider({ apiKey: "test-key", model: "gpt-4.1", baseUrl: "https://api.test" });
    const res = await provider.generate("Test prompt", { temperature: 0.1, max_tokens: 50 });

    assertEquals(res, "Hello from GPT-4.1");
    // OpenAIProvider uses the provided baseUrl verbatim (caller may provide full endpoint)
    assertEquals(capturedUrl, "https://api.test");

    assertExists(capturedBody);
    const bodyObj = capturedBody as Record<string, unknown>;
    assertEquals(bodyObj.model, "gpt-4.1");
    assertExists(bodyObj.messages);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ModelFactory creates provider for 'gpt-5mini' and 'gpt-4o' types", () => {
  const p1 = ModelFactory.create("gpt-5mini", { apiKey: "k" });
  const p2 = ModelFactory.create("gpt-4o", { apiKey: "k" });

  assertStringIncludes(p1.id, "openai-gpt-5mini");
  assertStringIncludes(p2.id, "openai-gpt-4o");
});
