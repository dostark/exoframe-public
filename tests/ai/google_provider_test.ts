import { assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { GoogleProvider } from "../../src/ai/providers/google_provider.ts";
import { googleResponseConfig, registerProviderTests, spyFetch } from "./helpers/provider_test_helper.ts";

// Register all standard provider tests with Google-specific body extractor
registerProviderTests({
  name: "GoogleProvider",
  createProvider: (options) => new GoogleProvider({ apiKey: "test-key", ...options }),
  defaultId: "google-gemini-3-pro",
  responseConfig: googleResponseConfig,
  apiKeyHeader: "Content-Type",
  apiKeyValue: "application/json",
  stopSequenceKey: "stopSequences",
});

// Google-specific tests

Deno.test("GoogleProvider - generate URL", async () => {
  const provider = new GoogleProvider({ apiKey: "test-key", model: "gemini-3-pro" });

  const { spy: fetchSpy, restore } = spyFetch(googleResponseConfig.wrapResponse("ok"));

  try {
    await provider.generate("Hi");
    const call = fetchSpy.calls[0];
    // @ts-ignore: Accessing mock args
    const url = call.args[0] as string;
    assertStringIncludes(url, "gemini-3-pro:generateContent");
    assertStringIncludes(url, "key=test-key");
  } finally {
    restore();
  }
});
