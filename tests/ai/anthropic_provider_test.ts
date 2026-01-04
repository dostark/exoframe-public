import { AnthropicProvider } from "../../src/ai/providers/anthropic_provider.ts";
import { anthropicResponseConfig, registerProviderTests } from "./helpers/provider_test_helper.ts";

// Register all standard provider tests
registerProviderTests({
  name: "AnthropicProvider",
  createProvider: (options) => new AnthropicProvider({ apiKey: "test-key", ...options }),
  defaultId: "anthropic-claude-opus-4.5",
  responseConfig: anthropicResponseConfig,
  apiKeyHeader: "x-api-key",
  apiKeyValue: "test-key",
  additionalHeaders: { "anthropic-version": "2023-06-01" },
  stopSequenceKey: "stop_sequences",
});
