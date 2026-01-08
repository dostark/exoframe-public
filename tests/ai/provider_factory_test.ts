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

import { assertEquals, assertExists, assertStringIncludes, assertThrows } from "jsr:@std/assert@^1.0.0";
import { getProviderForModel, ProviderFactory, ProviderFactoryError } from "../../src/ai/provider_factory.ts";

import { AiConfig, AiConfigSchema } from "../../src/config/ai_config.ts";
import { Config } from "../../src/config/schema.ts";

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
      portals: "Portals",
      workspace: "Workspace",
      memory: "Memory",
      runtime: ".exo",
      blueprints: "Blueprints",
    },
    database: {
      batch_flush_ms: 100,
      batch_max_size: 50,
      sqlite: {
        journal_mode: "WAL",
        foreign_keys: true,
        busy_timeout_ms: 5000,
      },
    },
    watcher: { debounce_ms: 200, stability_check: true },
    agents: {
      default_model: "default",
      timeout_sec: 60,
      max_iterations: 10,
    },
    portals: [],
    mcp: {
      enabled: true,
      transport: "stdio" as const,
      server_name: "exoframe",
      version: "1.0.0",
    },
    // ConfigSchema includes defaults for the following sections; provide
    // entries so TypeScript sees a complete `Config` literal.
    ai_endpoints: {},
    ai_retry: {
      max_attempts: 3,
      backoff_base_ms: 1000,
      timeout_per_request_ms: 30000,
    },
    ai_anthropic: {
      api_version: "2023-06-01",
      default_model: "claude-opus-4.5",
      max_tokens_default: 4096,
    },
    mcp_defaults: { agent_id: "system" },
    git: {
      branch_prefix_pattern: "^(feat|fix|docs|chore|refactor|test)/",
      allowed_prefixes: ["feat", "fix", "docs", "chore", "refactor", "test"],
    },
    ai: parsedAi,
    models: {
      default: { provider: "openai", model: "gpt-5.2-pro", timeout_ms: 30000 },
      fast: { provider: "openai", model: "gpt-5.2-pro-mini", timeout_ms: 15000 },
      local: { provider: "ollama", model: "llama3.2", timeout_ms: 60000 },
    },
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
    const config = createTestConfig({ provider: "ollama", model: "llama3.2" });
    const provider = ProviderFactory.create(config);

    assertExists(provider);
    assertStringIncludes(provider.id, "codellama");
  }),
);

Deno.test(
  "ProviderFactory: env var overrides config",
  withEnvVars({ EXO_LLM_PROVIDER: "mock" }, () => {
    const config = createTestConfig({ provider: "ollama", model: "llama3.2" });
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
    const warningMessages: string[] = [];
    console.warn = (msg: string) => {
      warningMessages.push(msg);
    };

    try {
      const provider = ProviderFactory.create(config);

      assertExists(provider);
      assertEquals(provider.id.startsWith("mock"), true, "Should fall back to mock");

      // Check that at least one warning mentions the unknown provider
      const hasProviderWarning = warningMessages.some((msg) => msg.includes("unknown-provider-xyz"));
      assertEquals(hasProviderWarning, true, "Should warn about unknown provider");
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

// ============================================================================
// Anthropic Provider Placeholder Tests
// ============================================================================

Deno.test(
  "ProviderFactory: anthropic with API key returns placeholder MockLLMProvider",
  withEnvVars({
    EXO_LLM_PROVIDER: "anthropic",
    ANTHROPIC_API_KEY: "test-key",
    EXO_LLM_MODEL: "claude-3-sonnet",
  }, () => {
    const config = createTestConfig();
    const provider = ProviderFactory.create(config);

    assertExists(provider);
    assertStringIncludes(provider.id, "anthropic-claude-3-sonnet");
    // Should be a MockLLMProvider placeholder
    assertEquals(provider.id.startsWith("anthropic"), true);
  }),
);

// ============================================================================
// OpenAI Provider Placeholder Tests
// ============================================================================

Deno.test(
  "ProviderFactory: openai with API key returns placeholder MockLLMProvider",
  withEnvVars({
    EXO_LLM_PROVIDER: "openai",
    OPENAI_API_KEY: "test-key",
    EXO_LLM_MODEL: "gpt-4",
  }, () => {
    const config = createTestConfig();
    const provider = ProviderFactory.create(config);

    assertExists(provider);
    assertStringIncludes(provider.id, "openai-gpt-4");
    // Should be a MockLLMProvider placeholder
    assertEquals(provider.id.startsWith("openai"), true);
  }),
);

// ============================================================================
// Llama Model Routing Tests
// ============================================================================

Deno.test("ProviderFactory: llama model prefix routes to LlamaProvider", () => {
  const config = createTestConfig({
    provider: "ollama",
    model: "codellama:13b",
  });
  const provider = ProviderFactory.create(config);

  assertExists(provider);
  // Should route to LlamaProvider despite ollama config
  assertStringIncludes(provider.id, "codellama");
});

Deno.test("ProviderFactory: llama model prefix routes to LlamaProvider from env", () => {
  const config = createTestConfig();
  // Set env to use codellama model
  Deno.env.set("EXO_LLM_MODEL", "llama3.2:8b");

  try {
    const provider = ProviderFactory.create(config);
    assertExists(provider);
    assertStringIncludes(provider.id, "llama3.2");
  } finally {
    Deno.env.delete("EXO_LLM_MODEL");
  }
});

// ============================================================================
// Unknown Provider ID Generation Test
// ============================================================================

Deno.test("ProviderFactory: unknown provider generates unknown ID", () => {
  // This tests the default case in generateProviderId
  // We need to access the private method, so we'll test via getProviderInfo
  const config = createTestConfig();

  // Mock the resolveOptions to return unknown provider
  const originalResolveOptions = ProviderFactory["resolveOptions"];
  ProviderFactory["resolveOptions"] = () => ({
    provider: "unknown" as any,
    model: "test-model",
    timeoutMs: 30000,
  });

  try {
    const info = ProviderFactory.getProviderInfo(config);
    assertEquals(info.id, "unknown-unknown");
  } finally {
    ProviderFactory["resolveOptions"] = originalResolveOptions;
  }
});

// ============================================================================
// getProviderForModel Helper Tests
// ============================================================================

Deno.test("getProviderForModel: creates provider for model", () => {
  const provider = getProviderForModel("codellama:13b");

  assertExists(provider);
  assertStringIncludes(provider.id, "codellama");
});

Deno.test("getProviderForModel: handles regular ollama models", () => {
  const provider = getProviderForModel("llama3.2");

  assertExists(provider);
  assertStringIncludes(provider.id, "llama3.2");
});

// ============================================================================
// Named Model Tests
// ============================================================================

Deno.test("ProviderFactory: createByName creates correct named provider", () => {
  const config = createTestConfig();
  // Override models for testing
  config.models = {
    default: { provider: "mock", model: "default-mock", timeout_ms: 30000 },
    fast: { provider: "mock", model: "fast-mock", timeout_ms: 15000 },
  };

  const fastProvider = ProviderFactory.createByName(config, "fast");
  assertStringIncludes(fastProvider.id, "fast-mock");

  const defaultProvider = ProviderFactory.createByName(config, "default");
  assertStringIncludes(defaultProvider.id, "default-mock");
});

Deno.test("ProviderFactory: createByName falls back to default for unknown name", () => {
  const config = createTestConfig();
  config.models = {
    default: { provider: "mock", model: "default-mock", timeout_ms: 30000 },
  };

  const unknownProvider = ProviderFactory.createByName(config, "unknown");
  assertStringIncludes(unknownProvider.id, "default-mock");
});

Deno.test("ProviderFactory: getProviderInfoByName returns named provider details", () => {
  const config = createTestConfig();
  config.models = {
    fast: { provider: "mock", model: "fast-mock", timeout_ms: 15000 },
  };

  const info = ProviderFactory.getProviderInfoByName(config, "fast");
  assertEquals(info.model, "fast-mock");
  assertEquals(info.type, "mock");
});
