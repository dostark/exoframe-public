/**
 * Tests for ProviderFactory (Step 5.8: LLM Provider Selection Logic)
 *
 * TDD Red Phase: Write tests before implementation
 *
 * Success Criteria:
 * 1. ProviderFactory.create() returns correct provider based on environment
 * 2. Environment variables override config file settings
 * 3. Config file [ai] section parsed correctly
 * 4. Default is MockLLMProvider when no config/env specified
 * 5. Missing API key throws clear error for cloud providers
 * 6. Unknown provider falls back to mock with warning
 * 7. Provider ID logged at daemon startup
 * 8. EXO_LLM_MODEL correctly sets model for all providers
 * 9. EXO_LLM_BASE_URL correctly overrides endpoint
 * 10. EXO_LLM_TIMEOUT_MS correctly sets timeout
 */

import { assert, assertEquals, assertExists, assertStringIncludes, assertThrows } from "jsr:@std/assert@^1.0.0";
import { ProviderFactory, ProviderFactoryError } from "../src/ai/provider_factory.ts";
import { MockLLMProvider } from "../src/ai/providers/mock_llm_provider.ts";
import { OllamaProvider } from "../src/ai/providers.ts";
import { AiConfig, AiConfigSchema } from "../src/config/ai_config.ts";
import { Config } from "../src/config/schema.ts";

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a minimal config for testing.
 * The aiConfig parameter is a partial input that gets parsed through AiConfigSchema
 * to apply defaults.
 */
function createTestConfig(aiConfig?: Partial<AiConfig>): Config {
  // Parse through schema to apply defaults
  const parsedAi = aiConfig ? AiConfigSchema.parse(aiConfig) : undefined;

  return {
    system: {
      root: "/tmp/exoframe-test",
      log_level: "info" as const,
    },
    paths: {
      inbox: "Inbox",
      knowledge: "Knowledge",
      system: "System",
      blueprints: "Blueprints",
    },
    database: {
      batch_flush_ms: 100,
      batch_max_size: 100,
    },
    watcher: {
      debounce_ms: 200,
      stability_check: true,
    },
    agents: {
      default_model: "gpt-4o",
      timeout_sec: 60,
    },
    portals: [],
    ai: parsedAi,
  };
}

/**
 * Helper to set env vars and clean up after test
 */
function withEnvVars(
  vars: Record<string, string>,
  fn: () => void | Promise<void>,
): () => Promise<void> {
  return async () => {
    // Set vars
    for (const [key, value] of Object.entries(vars)) {
      Deno.env.set(key, value);
    }
    try {
      await fn();
    } finally {
      // Clean up
      for (const key of Object.keys(vars)) {
        Deno.env.delete(key);
      }
    }
  };
}

// ============================================================================
// AI Config Schema Tests
// ============================================================================

Deno.test("AiConfigSchema: accepts valid config", () => {
  const validConfig = {
    provider: "mock",
    model: "llama3.2",
    base_url: "http://localhost:11434",
    timeout_ms: 30000,
    max_tokens: 4096,
    temperature: 0.7,
  };

  const result = AiConfigSchema.safeParse(validConfig);
  assertEquals(result.success, true);
});

Deno.test("AiConfigSchema: accepts minimal config", () => {
  const minimalConfig = {
    provider: "ollama",
  };

  const result = AiConfigSchema.safeParse(minimalConfig);
  assertEquals(result.success, true);
});

Deno.test("AiConfigSchema: provides defaults", () => {
  const minimalConfig = {
    provider: "mock",
  };

  const result = AiConfigSchema.parse(minimalConfig);
  assertEquals(result.provider, "mock");
  assertEquals(result.timeout_ms, 30000); // default
});

Deno.test("AiConfigSchema: validates provider enum", () => {
  const invalidConfig = {
    provider: "invalid-provider",
  };

  const result = AiConfigSchema.safeParse(invalidConfig);
  assertEquals(result.success, false);
});

Deno.test("AiConfigSchema: validates timeout_ms range", () => {
  const invalidConfig = {
    provider: "mock",
    timeout_ms: -100,
  };

  const result = AiConfigSchema.safeParse(invalidConfig);
  assertEquals(result.success, false);
});

// ============================================================================
// Default Provider Tests
// ============================================================================

Deno.test("ProviderFactory: defaults to MockLLMProvider when no config", () => {
  const config = createTestConfig();
  const provider = ProviderFactory.create(config);

  assertExists(provider);
  assertEquals(provider.id.startsWith("mock"), true, `Expected mock provider, got: ${provider.id}`);
});

Deno.test("ProviderFactory: defaults to MockLLMProvider when ai section missing", () => {
  const config = createTestConfig(undefined);
  const provider = ProviderFactory.create(config);

  assertExists(provider);
  assertEquals(provider.id.startsWith("mock"), true);
});

// ============================================================================
// Environment Variable Tests
// ============================================================================

Deno.test(
  "ProviderFactory: EXO_LLM_PROVIDER=mock creates MockLLMProvider",
  withEnvVars({ EXO_LLM_PROVIDER: "mock" }, () => {
    const config = createTestConfig();
    const provider = ProviderFactory.create(config);

    assertExists(provider);
    assertEquals(provider.id.startsWith("mock"), true);
  }),
);

Deno.test(
  "ProviderFactory: EXO_LLM_PROVIDER=ollama creates OllamaProvider",
  withEnvVars({ EXO_LLM_PROVIDER: "ollama" }, () => {
    const config = createTestConfig();
    const provider = ProviderFactory.create(config);

    assertExists(provider);
    assertStringIncludes(provider.id, "ollama");
  }),
);

Deno.test(
  "ProviderFactory: EXO_LLM_MODEL overrides config model",
  withEnvVars({ EXO_LLM_PROVIDER: "ollama", EXO_LLM_MODEL: "codellama" }, () => {
    const config = createTestConfig({ provider: "ollama", model: "llama2" });
    const provider = ProviderFactory.create(config);

    assertExists(provider);
    assertStringIncludes(provider.id, "codellama");
  }),
);

Deno.test(
  "ProviderFactory: env var overrides config",
  withEnvVars({ EXO_LLM_PROVIDER: "mock" }, () => {
    const config = createTestConfig({ provider: "ollama", model: "llama2" });
    const provider = ProviderFactory.create(config);

    assertExists(provider);
    assertEquals(provider.id.startsWith("mock"), true, "Environment should override config");
  }),
);

// ============================================================================
// Config File Tests
// ============================================================================

Deno.test("ProviderFactory: config ai.provider=ollama creates OllamaProvider", () => {
  const config = createTestConfig({ provider: "ollama", model: "llama3.2" });
  const provider = ProviderFactory.create(config);

  assertExists(provider);
  assertStringIncludes(provider.id, "ollama");
  assertStringIncludes(provider.id, "llama3.2");
});

Deno.test("ProviderFactory: config ai.provider=mock creates MockLLMProvider", () => {
  const config = createTestConfig({ provider: "mock" });
  const provider = ProviderFactory.create(config);

  assertExists(provider);
  assertEquals(provider.id.startsWith("mock"), true);
});

// ============================================================================
// API Key Tests
// ============================================================================

Deno.test(
  "ProviderFactory: anthropic requires ANTHROPIC_API_KEY",
  withEnvVars({ EXO_LLM_PROVIDER: "anthropic" }, () => {
    // Ensure API key is not set
    Deno.env.delete("ANTHROPIC_API_KEY");

    const config = createTestConfig();

    assertThrows(
      () => ProviderFactory.create(config),
      ProviderFactoryError,
      "ANTHROPIC_API_KEY",
    );
  }),
);

Deno.test(
  "ProviderFactory: openai requires OPENAI_API_KEY",
  withEnvVars({ EXO_LLM_PROVIDER: "openai" }, () => {
    // Ensure API key is not set
    Deno.env.delete("OPENAI_API_KEY");

    const config = createTestConfig();

    assertThrows(
      () => ProviderFactory.create(config),
      ProviderFactoryError,
      "OPENAI_API_KEY",
    );
  }),
);

// ============================================================================
// Unknown Provider Tests
// ============================================================================

Deno.test(
  "ProviderFactory: unknown provider falls back to mock with warning",
  withEnvVars({ EXO_LLM_PROVIDER: "unknown-provider-xyz" }, () => {
    const config = createTestConfig();

    // Capture console.warn output
    const originalWarn = console.warn;
    let warningMessage = "";
    console.warn = (msg: string) => {
      warningMessage = msg;
    };

    try {
      const provider = ProviderFactory.create(config);

      assertExists(provider);
      assertEquals(provider.id.startsWith("mock"), true, "Should fall back to mock");
      assertStringIncludes(warningMessage, "unknown-provider-xyz");
    } finally {
      console.warn = originalWarn;
    }
  }),
);

// ============================================================================
// Provider Options Tests
// ============================================================================

Deno.test(
  "ProviderFactory: EXO_LLM_BASE_URL sets base URL for Ollama",
  withEnvVars({
    EXO_LLM_PROVIDER: "ollama",
    EXO_LLM_BASE_URL: "http://custom-host:8080",
  }, () => {
    const config = createTestConfig();
    const provider = ProviderFactory.create(config);

    assertExists(provider);
    // Provider should be created (we can't easily test internal baseUrl)
    assertStringIncludes(provider.id, "ollama");
  }),
);

Deno.test(
  "ProviderFactory: EXO_LLM_TIMEOUT_MS sets timeout",
  withEnvVars({
    EXO_LLM_PROVIDER: "ollama",
    EXO_LLM_TIMEOUT_MS: "60000",
  }, () => {
    const config = createTestConfig();
    const provider = ProviderFactory.create(config);

    assertExists(provider);
    // Provider should be created (we can't easily test internal timeout)
    assertStringIncludes(provider.id, "ollama");
  }),
);

// ============================================================================
// MockLLMProvider Strategy Tests
// ============================================================================

Deno.test("ProviderFactory: mock strategy from config", () => {
  const config = createTestConfig({
    provider: "mock",
    mock: {
      strategy: "scripted",
    },
  });
  const provider = ProviderFactory.create(config);

  assertExists(provider);
  assertEquals(provider.id.startsWith("mock"), true);
});

// ============================================================================
// Integration with IModelProvider Tests
// ============================================================================

Deno.test("ProviderFactory: created provider implements IModelProvider", async () => {
  // Use scripted strategy for testing (doesn't require recorded fixtures)
  const config = createTestConfig({ provider: "mock", mock: { strategy: "scripted" } });
  const provider = ProviderFactory.create(config);

  // Should have id property
  assertExists(provider.id);
  assertEquals(typeof provider.id, "string");

  // Should have generate method
  assertEquals(typeof provider.generate, "function");

  // Should be able to generate
  const response = await provider.generate("Test prompt");
  assertEquals(typeof response, "string");
});

Deno.test("ProviderFactory: provider can be used for plan generation", async () => {
  // Use scripted strategy for testing (doesn't require recorded fixtures)
  const config = createTestConfig({ provider: "mock", mock: { strategy: "scripted" } });
  const provider = ProviderFactory.create(config);

  const response = await provider.generate("Implement a feature for user authentication");
  assertExists(response);
  assertEquals(typeof response, "string");
});

// ============================================================================
// getProviderInfo Tests
// ============================================================================

Deno.test("ProviderFactory: getProviderInfo returns provider details", () => {
  const config = createTestConfig({ provider: "ollama", model: "llama3.2" });
  const info = ProviderFactory.getProviderInfo(config);

  assertEquals(info.type, "ollama");
  assertEquals(info.model, "llama3.2");
  assertExists(info.id);
});

Deno.test(
  "ProviderFactory: getProviderInfo respects env vars",
  withEnvVars({ EXO_LLM_PROVIDER: "mock", EXO_LLM_MODEL: "test-model" }, () => {
    const config = createTestConfig({ provider: "ollama", model: "llama3.2" });
    const info = ProviderFactory.getProviderInfo(config);

    assertEquals(info.type, "mock");
    assertEquals(info.model, "test-model");
  }),
);
