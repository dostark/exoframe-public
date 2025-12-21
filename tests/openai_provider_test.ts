import { assertEquals, assertRejects } from "jsr:@std/assert@^1.0.0";
import { spy, stub } from "https://deno.land/std@0.203.0/testing/mock.ts";
import { OpenAIProvider } from "../src/ai/providers/openai_provider.ts";
import { ModelProviderError } from "../src/ai/providers.ts";

Deno.test("OpenAIProvider - initialization", () => {
  const provider = new OpenAIProvider({ apiKey: "test-key" });
  assertEquals(provider.id, "openai-gpt-5.2-pro");

  const customProvider = new OpenAIProvider({
    apiKey: "test-key",
    model: "gpt-4",
    id: "custom-id"
  });
  assertEquals(customProvider.id, "custom-id");
});

Deno.test("OpenAIProvider - generate success", async () => {
  const provider = new OpenAIProvider({ apiKey: "test-key" });

  const mockResponse = {
    choices: [{ message: { content: "Hello from OpenAI" } }],
    usage: { prompt_tokens: 10, completion_tokens: 20 }
  };

  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
  );

  try {
    const result = await provider.generate("Hi");
    assertEquals(result, "Hello from OpenAI");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("OpenAIProvider - generate headers", async () => {
  const provider = new OpenAIProvider({ apiKey: "test-key" });

  const fetchSpy = spy(() =>
    Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }))
  );

  const originalFetch = globalThis.fetch;
  // @ts-ignore: Mocking fetch
  globalThis.fetch = fetchSpy;

  try {
    await provider.generate("Hi");
    const call = fetchSpy.calls[0];
    // @ts-ignore: Mocking fetch
    const headers = call.args[1]?.headers as Record<string, string>;
    assertEquals(headers["Authorization"], "Bearer test-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("OpenAIProvider - custom baseUrl", async () => {
  const customUrl = "https://my-proxy.com/v1/chat/completions";
  const provider = new OpenAIProvider({ apiKey: "test-key", baseUrl: customUrl });

  const fetchSpy = spy(() =>
    Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }))
  );

  const originalFetch = globalThis.fetch;
  // @ts-ignore: Mocking fetch
  globalThis.fetch = fetchSpy;

  try {
    await provider.generate("Hi");
    const call = fetchSpy.calls[0];
    // @ts-ignore: Mocking fetch
    assertEquals(call.args[0], customUrl);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("OpenAIProvider - generate error handling", async () => {
  const provider = new OpenAIProvider({ apiKey: "test-key" });

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

Deno.test("OpenAIProvider - options mapping", async () => {
  const provider = new OpenAIProvider({ apiKey: "test-key" });

  const fetchSpy = spy(() =>
    Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }))
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
    assertEquals(body.stop, ["STOP"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("OpenAIProvider - token usage reporting", async () => {
  const { EventLogger } = await import("../src/services/event_logger.ts");
  const logger = new EventLogger({ prefix: "[Test]" });
  const logSpy = spy(logger, "log");

  const provider = new OpenAIProvider({ apiKey: "test-key", logger });

  const mockResponse = {
    choices: [{ message: { content: "Hello" } }],
    usage: { prompt_tokens: 10, completion_tokens: 20 }
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

Deno.test("OpenAIProvider - retry on 429", async () => {
  const provider = new OpenAIProvider({ apiKey: "test-key", retryDelayMs: 1 });

  let callCount = 0;
  const fetchStub = stub(globalThis, "fetch", () => {
    callCount++;
    if (callCount === 1) {
      return Promise.resolve(new Response(JSON.stringify({ error: { message: "Rate limit" } }), { status: 429 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "Success after retry" } }] }), { status: 200 }));
  });

  try {
    const result = await provider.generate("Hi");
    assertEquals(result, "Success after retry");
    assertEquals(callCount, 2);
  } finally {
    fetchStub.restore();
  }
});
