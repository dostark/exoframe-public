import { assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { spy, stub } from "https://deno.land/std@0.203.0/testing/mock.ts";
import { GoogleProvider } from "../src/ai/providers/google_provider.ts";
import { ModelProviderError } from "../src/ai/providers.ts";

Deno.test("GoogleProvider - initialization", () => {
  const provider = new GoogleProvider({ apiKey: "test-key" });
  assertEquals(provider.id, "google-gemini-3-pro");

  const customProvider = new GoogleProvider({
    apiKey: "test-key",
    model: "gemini-3-flash",
    id: "custom-id"
  });
  assertEquals(customProvider.id, "custom-id");
});

Deno.test("GoogleProvider - generate success", async () => {
  const provider = new GoogleProvider({ apiKey: "test-key" });

  const mockResponse = {
    candidates: [{ content: { parts: [{ text: "Hello from Gemini" }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 }
  };

  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
  );

  try {
    const result = await provider.generate("Hi");
    assertEquals(result, "Hello from Gemini");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GoogleProvider - generate URL", async () => {
  const provider = new GoogleProvider({ apiKey: "test-key", model: "gemini-3-pro" });

  const fetchSpy = spy(() =>
    Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 }))
  );

  const originalFetch = globalThis.fetch;
  // @ts-ignore: Mocking fetch
  globalThis.fetch = fetchSpy;

  try {
    await provider.generate("Hi");
    const call = fetchSpy.calls[0];
    // @ts-ignore: Mocking fetch
    const url = call.args[0] as string;
    assertStringIncludes(url, "gemini-3-pro:generateContent");
    assertStringIncludes(url, "key=test-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("GoogleProvider - generate error handling", async () => {
  const provider = new GoogleProvider({ apiKey: "test-key" });

  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 400 }))
  );

  try {
    await assertRejects(
      () => provider.generate("Hi"),
      ModelProviderError,
      "Invalid API key"
    );
  } finally {
    fetchStub.restore();
  }
});

Deno.test("GoogleProvider - options mapping", async () => {
  const provider = new GoogleProvider({ apiKey: "test-key" });

  const fetchSpy = spy(() =>
    Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 }))
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
    assertEquals(body.generationConfig.temperature, 0.5);
    assertEquals(body.generationConfig.maxOutputTokens, 100);
    assertEquals(body.generationConfig.topP, 0.9);
    assertEquals(body.generationConfig.stopSequences, ["STOP"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("GoogleProvider - token usage reporting", async () => {
  const { EventLogger } = await import("../src/services/event_logger.ts");
  const logger = new EventLogger({ prefix: "[Test]" });
  const logSpy = spy(logger, "log");

  const provider = new GoogleProvider({ apiKey: "test-key", logger });

  const mockResponse = {
    candidates: [{ content: { parts: [{ text: "Hello" }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 }
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

Deno.test("GoogleProvider - retry on 429", async () => {
  const provider = new GoogleProvider({ apiKey: "test-key", retryDelayMs: 1 });

  let callCount = 0;
  const fetchStub = stub(globalThis, "fetch", () => {
    callCount++;
    if (callCount === 1) {
      return Promise.resolve(new Response(JSON.stringify({ error: { message: "Rate limit" } }), { status: 429 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Success after retry" }] } }] }), { status: 200 }));
  });

  try {
    const result = await provider.generate("Hi");
    assertEquals(result, "Success after retry");
    assertEquals(callCount, 2);
  } finally {
    fetchStub.restore();
  }
});
