/**
 * ProviderFactory - LLM Provider Selection Logic
 *
 * Creates the appropriate LLM provider based on:
 * 1. Environment variables (highest priority)
 * 2. Config file [ai] section (medium priority)
 * 3. Defaults (lowest priority) - MockLLMProvider for safety
 */

import { IModelProvider, OllamaProvider } from "./providers.ts";
import { MockLLMProvider, MockStrategy } from "./providers/mock_llm_provider.ts";
import { Config } from "../config/schema.ts";
import { AiConfig, DEFAULT_MODELS, ProviderType } from "../config/ai_config.ts";
import { LlamaProvider } from "./providers/llama_provider.ts";
import { AnthropicProvider } from "./providers/anthropic_provider.ts";
import { OpenAIProvider } from "./providers/openai_provider.ts";
import { GoogleProvider } from "./providers/google_provider.ts";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Resolved provider options after merging env vars and config
 */
export interface ResolvedProviderOptions {
  /** Provider type */
  provider: ProviderType;
  /** Model name */
  model: string;
  /** API base URL */
  baseUrl?: string;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** API key (for cloud providers) */
  apiKey?: string;
  /** Mock strategy */
  mockStrategy?: MockStrategy;
  /** Mock fixtures directory */
  mockFixturesDir?: string;
}

/**
 * Provider information for logging/debugging
 */
export interface ProviderInfo {
  /** Provider type */
  type: ProviderType;
  /** Provider ID */
  id: string;
  /** Model name */
  model: string;
  /** Source of configuration */
  source: "env" | "config" | "default";
}

// ============================================================================
// Custom Error Type
// ============================================================================

/**
 * Error thrown by ProviderFactory
 */
export class ProviderFactoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderFactoryError";
  }
}

// ============================================================================
// ProviderFactory Implementation
// ============================================================================

/**
 * Factory for creating LLM providers based on environment and configuration.
 * Provides static methods for provider instantiation and info.
 */
export class ProviderFactory {
  /**
   * Create an LLM provider based on environment and configuration.
   *
   * Priority order:
   * 1. Environment variables (EXO_LLM_PROVIDER, EXO_LLM_MODEL, etc.)
   * 2. Config file [ai] section
   * 3. Defaults (MockLLMProvider)
   *
   * @param config - ExoFrame configuration
   * @returns An IModelProvider instance
   */
  /**
   * Create an LLM provider based on environment and configuration.
   * @param config ExoFrame configuration
   * @returns An IModelProvider instance
   */
  static create(config: Config): IModelProvider {
    const options = this.resolveOptions(config);
    return this.createProvider(options);
  }

  /**
   * Create an LLM provider by name from the models configuration.
   *
   * @param config - ExoFrame configuration
   * @param name - Name of the model configuration (e.g., "default", "fast")
   * @returns An IModelProvider instance
   */
  /**
   * Create an LLM provider by name from the models configuration.
   * @param config ExoFrame configuration
   * @param name Name of the model configuration (e.g., "default", "fast")
   * @returns An IModelProvider instance
   */
  static createByName(config: Config, name: string): IModelProvider {
    const options = this.resolveOptionsByName(config, name);
    return this.createProvider(options);
  }

  /**
   * Get information about what provider would be created
   *
   * @param config - ExoFrame configuration
   * @returns Provider information for logging
   */
  /**
   * Get information about what provider would be created.
   * @param config ExoFrame configuration
   * @returns Provider information for logging
   */
  static getProviderInfo(config: Config): ProviderInfo {
    const options = this.resolveOptions(config);
    const source = this.determineSource();
    return {
      type: options.provider,
      id: this.generateProviderId(options),
      model: options.model,
      source,
    };
  }

  /**
   * Get information about what provider would be created by name
   *
   * @param config - ExoFrame configuration
   * @param name - Name of the model configuration
   * @returns Provider information for logging
   */
  /**
   * Get information about what provider would be created by name.
   * @param config ExoFrame configuration
   * @param name Name of the model configuration
   * @returns Provider information for logging
   */
  static getProviderInfoByName(config: Config, name: string): ProviderInfo {
    const options = this.resolveOptionsByName(config, name);
    const source = this.determineSource();
    return {
      type: options.provider,
      id: this.generateProviderId(options),
      model: options.model,
      source,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Resolve provider options from environment and config
   */
  /**
   * Resolve provider options from environment and config.
   */
  private static resolveOptions(config: Config, overrideAiConfig?: AiConfig): ResolvedProviderOptions {
    // Read environment variables
    const envProvider = Deno.env.get("EXO_LLM_PROVIDER");
    const envModel = Deno.env.get("EXO_LLM_MODEL");
    const envBaseUrl = Deno.env.get("EXO_LLM_BASE_URL");
    const envTimeout = Deno.env.get("EXO_LLM_TIMEOUT_MS");

    // Get config values (with defaults)
    const aiConfig: AiConfig = overrideAiConfig ?? config.ai ?? { provider: "mock", timeout_ms: 30000 };

    // Resolve provider type
    let providerType: ProviderType = "mock";
    if (envProvider) {
      // Validate env provider
      const normalized = envProvider.toLowerCase().trim();
      if (["mock", "ollama", "anthropic", "openai", "google"].includes(normalized)) {
        providerType = normalized as ProviderType;
      } else {
        console.warn(
          `Unknown provider '${envProvider}' from EXO_LLM_PROVIDER, falling back to mock`,
        );
        providerType = "mock";
      }
    } else if (aiConfig.provider) {
      providerType = aiConfig.provider;
    }

    // Resolve model
    const model = envModel ?? aiConfig.model ?? DEFAULT_MODELS[providerType];

    // Resolve other options
    const baseUrl = envBaseUrl ?? aiConfig.base_url;
    const timeoutMs = envTimeout ? parseInt(envTimeout, 10) : (aiConfig.timeout_ms ?? 30000);

    // Mock-specific options
    const mockStrategy = aiConfig.mock?.strategy ?? "recorded";
    const mockFixturesDir = aiConfig.mock?.fixtures_dir;

    return {
      provider: providerType,
      model,
      baseUrl,
      timeoutMs,
      mockStrategy: mockStrategy as MockStrategy,
      mockFixturesDir,
    };
  }

  /**
   * Resolve provider options by name
   */
  /**
   * Resolve provider options by name.
   */
  private static resolveOptionsByName(config: Config, name: string): ResolvedProviderOptions {
    const modelConfig = config.models?.[name] ?? config.models?.["default"] ?? config.ai;
    return this.resolveOptions(config, modelConfig);
  }

  /**
   * Determine the source of configuration
   */
  /**
   * Determine the source of configuration.
   */
  private static determineSource(): "env" | "config" | "default" {
    if (Deno.env.get("EXO_LLM_PROVIDER")) {
      return "env";
    }
    // Note: We can't easily tell if config was set, so default to "config" if not env
    return "config";
  }

  /**
   * Create the appropriate provider based on resolved options
   */
  /**
   * Create the appropriate provider based on resolved options.
   */
  private static createProvider(options: ResolvedProviderOptions): IModelProvider {
    // Llama/Ollama model routing
    if (/^(codellama:|llama[0-9.]*:)/.test(options.model)) {
      return new LlamaProvider({ model: options.model, endpoint: options.baseUrl });
    }
    switch (options.provider) {
      case "mock":
        return this.createMockProvider(options);

      case "ollama":
        return this.createOllamaProvider(options);

      case "anthropic":
        return this.createAnthropicProvider(options);

      case "openai":
        return this.createOpenAIProvider(options);
      case "google":
        return this.createGoogleProvider(options);

      default:
        // This shouldn't happen due to Zod validation, but just in case
        console.warn(`Unknown provider '${options.provider}', falling back to mock`);
        return this.createMockProvider(options);
    }
  }

  /**
   * Create a MockLLMProvider
   */
  /**
   * Create a MockLLMProvider.
   */
  private static createMockProvider(options: ResolvedProviderOptions): MockLLMProvider {
    const strategy = options.mockStrategy ?? "recorded";

    return new MockLLMProvider(strategy, {
      id: this.generateProviderId(options),
      fixtureDir: options.mockFixturesDir,
    });
  }

  /**
   * Create an OllamaProvider
   */
  /**
   * Create an OllamaProvider.
   */
  private static createOllamaProvider(options: ResolvedProviderOptions): OllamaProvider {
    return new OllamaProvider({
      id: this.generateProviderId(options),
      model: options.model,
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
    });
  }

  /**
   * Create an Anthropic provider
   */
  /**
   * Create an Anthropic provider.
   */
  private static createAnthropicProvider(options: ResolvedProviderOptions): IModelProvider {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new ProviderFactoryError(
        "ANTHROPIC_API_KEY environment variable required for Anthropic provider",
      );
    }

    return new AnthropicProvider({
      apiKey,
      model: options.model,
      id: this.generateProviderId(options),
      // In a real scenario, we might pass a logger here if available
    });
  }

  /**
   * Create an OpenAI provider (stub - throws if no API key)
   */
  /**
   * Create an OpenAI provider (throws if no API key).
   */
  private static createOpenAIProvider(options: ResolvedProviderOptions): IModelProvider {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new ProviderFactoryError(
        "OPENAI_API_KEY environment variable required for OpenAI provider",
      );
    }

    return new OpenAIProvider({
      apiKey,
      model: options.model,
      baseUrl: options.baseUrl,
      id: this.generateProviderId(options),
    });
  }

  /**
   * Generate a unique provider ID
   */
  /**
   * Generate a unique provider ID.
   */
  private static generateProviderId(options: ResolvedProviderOptions): string {
    switch (options.provider) {
      case "mock":
        return `mock-${options.mockStrategy ?? "recorded"}-${options.model}`;
      case "ollama":
        return `ollama-${options.model}`;
      case "anthropic":
        return `anthropic-${options.model}`;
      case "openai":
        return `openai-${options.model}`;
      case "google":
        return `google-${options.model}`;
      default:
        return `unknown-${options.provider}`;
    }
  }

  /**
   * Create a Google provider
   */
  /**
   * Create a Google provider.
   */
  private static createGoogleProvider(options: ResolvedProviderOptions): IModelProvider {
    const apiKey = Deno.env.get("GOOGLE_API_KEY");
    if (!apiKey) {
      throw new ProviderFactoryError(
        "GOOGLE_API_KEY environment variable required for Google provider",
      );
    }

    return new GoogleProvider({
      apiKey,
      model: options.model,
      id: this.generateProviderId(options),
    });
  }
}

// Helper for tests: get provider by model name
/**
 * Helper for tests: get provider by model name.
 */
export function getProviderForModel(model: string) {
  // Minimal mock config for test
  const config = {
    ai: { provider: "ollama", model },
  } as any;
  return ProviderFactory.create(config);
}
