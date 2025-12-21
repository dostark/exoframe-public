import { assertEquals, assertRejects } from "jsr:@std/assert@^1.0.0";
import { spy, stub } from "https://deno.land/std@0.203.0/testing/mock.ts";
import { AnthropicProvider } from "../src/ai/providers/anthropic_provider.ts";
import { ModelProviderError } from "../src/ai/providers.ts";

Deno.test("AnthropicProvider - initialization", () => {
  const provider = new AnthropicProvider({ apiKey: "test-key" });
  assertEquals(provider.id, "anthropic-claude-opus-4.5");

  const customProvider = new AnthropicProvider({
    apiKey: "test-key",
    model: "claude-3-5-sonnet",
    id: "custom-id"
  });
  assertEquals(customProvider.id, "custom-id");
});

Deno.test("AnthropicProvider - generate success", async () => {
  const provider = new AnthropicProvider({ apiKey: "test-key" });

  const mockResponse = {
    content: [{ text: "Hello from Claude" }],
    usage: { input_tokens: 10, output_tokens: 20 }
  };

  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
  );

  try {
    const result = await provider.generate("Hi");
    assertEquals(result, "Hello from Claude");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("AnthropicProvider - generate headers", async () => {
  const provider = new AnthropicProvider({ apiKey: "test-key" });

  const fetchSpy = spy(() =>
    Promise.resolve(new Response(JSON.stringify({ content: [{ text: "ok" }] }), { status: 200 }))
  );

  const originalFetch = globalThis.fetch;
  // @ts-ignore: Mocking fetch
  globalThis.fetch = fetchSpy;

  try {
    await provider.generate("Hi");
    const call = fetchSpy.calls[0];
    // @ts-ignore: Mocking fetch
    const headers = call.args[1]?.headers as Record<string, string>;
    assertEquals(headers["x-api-key"], "test-key");
    assertEquals(headers["anthropic-version"], "2023-06-01");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("AnthropicProvider - generate error handling", async () => {
  const provider = new AnthropicProvider({ apiKey: "test-key" });

  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(new Response(JSON.stringify({ error: { message: "Invalid key" } }), { status: 401 }))
  );

  try {
    await assertRejects(
      () => provider.generate("Hi"),
      ModelProviderError,
      "Invalid key"
    );
  } finally {
    fetchStub.restore();
  }
});

Deno.test("AnthropicProvider - options mapping", async () => {
  const provider = new AnthropicProvider({ apiKey: "test-key" });

  const fetchSpy = spy(() =>
    Promise.resolve(new Response(JSON.stringify({ content: [{ text: "ok" }] }), { status: 200 }))
  );

  const originalFetch = globalThis.fetch;
  // @ts-ignore: Mocking fetch
  globalThis.fetch = fetchSpy;

  try {
    await provider.generate("Hi", {
      temperature: 0.5,
      max_tokens: 100,
      top_p: 0.9,
      stop: ["STOP"]
    });

    const call = fetchSpy.calls[0];
    // @ts-ignore: Mocking fetch
    const body = JSON.parse(call.args[1]?.body as string);
    assertEquals(body.temperature, 0.5);
    assertEquals(body.max_tokens, 100);
    assertEquals(body.top_p, 0.9);
    assertEquals(body.stop_sequences, ["STOP"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("AnthropicProvider - token usage reporting", async () => {
  const { EventLogger } = await import("../src/services/event_logger.ts");
  const logger = new EventLogger({ prefix: "[Test]" });
  const logSpy = spy(logger, "log");

  const provider = new AnthropicProvider({ apiKey: "test-key", logger });

  const mockResponse = {
    content: [{ text: "Hello" }],
    usage: { input_tokens: 10, output_tokens: 20 }
  };

  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
  );

  try {
    await provider.generate("Hi");
    const call = logSpy.calls[0];
    assertEquals(call.args[0].action, "llm.usage");
    assertEquals(call.args[0].payload?.prompt_tokens, 10);
    assertEquals(call.args[0].payload?.completion_tokens, 20);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("AnthropicProvider - retry on 429", async () => {
  const provider = new AnthropicProvider({ apiKey: "test-key", retryDelayMs: 1 });

  let callCount = 0;
  const fetchStub = stub(globalThis, "fetch", () => {
    callCount++;
    if (callCount === 1) {
      return Promise.resolve(new Response(JSON.stringify({ error: { message: "Rate limit" } }), { status: 429 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ content: [{ text: "Success after retry" }] }), { status: 200 }));
  });

  try {
    const result = await provider.generate("Hi");
    assertEquals(result, "Success after retry");
    assertEquals(callCount, 2);
  } finally {
    fetchStub.restore();
  }
});
