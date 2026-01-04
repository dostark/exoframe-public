import { assertEquals } from "jsr:@std/assert@^1.0.0";
import { OpenAIProvider } from "../../src/ai/providers/openai_provider.ts";
import { openaiResponseConfig, registerProviderTests, spyFetch } from "./helpers/provider_test_helper.ts";

// Register all standard provider tests
registerProviderTests({
  name: "OpenAIProvider",
  createProvider: (options) => new OpenAIProvider({ apiKey: "test-key", ...options }),
  defaultId: "openai-gpt-5.2-pro",
  responseConfig: openaiResponseConfig,
  apiKeyHeader: "Authorization",
  apiKeyValue: "Bearer test-key",
  stopSequenceKey: "stop",
});

// OpenAI-specific tests

Deno.test("OpenAIProvider - custom baseUrl", async () => {
  const customUrl = "https://my-proxy.com/v1/chat/completions";
  const provider = new OpenAIProvider({ apiKey: "test-key", baseUrl: customUrl });

  const { spy: fetchSpy, restore } = spyFetch(openaiResponseConfig.wrapResponse("ok"));

  try {
    await provider.generate("Hi");
    const call = fetchSpy.calls[0];
    // @ts-ignore: Accessing mock args
    assertEquals(call.args[0], customUrl);
  } finally {
    restore();
  }
});
