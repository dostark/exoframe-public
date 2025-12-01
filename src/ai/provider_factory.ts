/**
 * ProviderFactory - LLM Provider Selection Logic
 *
 * Step 5.8: LLM Provider Selection Logic
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
 * Factory for creating LLM providers based on environment and configuration
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
  static create(config: Config): IModelProvider {
    const options = this.resolveOptions(config);
    return this.createProvider(options);
  }

  /**
   * Get information about what provider would be created
   *
   * @param config - ExoFrame configuration
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

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Resolve provider options from environment and config
   */
  private static resolveOptions(config: Config): ResolvedProviderOptions {
    // Read environment variables
    const envProvider = Deno.env.get("EXO_LLM_PROVIDER");
    const envModel = Deno.env.get("EXO_LLM_MODEL");
    const envBaseUrl = Deno.env.get("EXO_LLM_BASE_URL");
    const envTimeout = Deno.env.get("EXO_LLM_TIMEOUT_MS");

    // Get config values (with defaults)
    const aiConfig: AiConfig = config.ai ?? { provider: "mock", timeout_ms: 30000 };

    // Resolve provider type
    let providerType: ProviderType = "mock";
    if (envProvider) {
      // Validate env provider
      const normalized = envProvider.toLowerCase().trim();
      if (["mock", "ollama", "anthropic", "openai"].includes(normalized)) {
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
   * Determine the source of configuration
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
  private static createProvider(options: ResolvedProviderOptions): IModelProvider {
    switch (options.provider) {
      case "mock":
        return this.createMockProvider(options);

      case "ollama":
        return this.createOllamaProvider(options);

      case "anthropic":
        return this.createAnthropicProvider(options);

      case "openai":
        return this.createOpenAIProvider(options);

      default:
        // This shouldn't happen due to Zod validation, but just in case
        console.warn(`Unknown provider '${options.provider}', falling back to mock`);
        return this.createMockProvider(options);
    }
  }

  /**
   * Create a MockLLMProvider
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
  private static createOllamaProvider(options: ResolvedProviderOptions): OllamaProvider {
    return new OllamaProvider({
      id: this.generateProviderId(options),
      model: options.model,
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
    });
  }

  /**
   * Create an Anthropic provider (stub - throws if no API key)
   */
  private static createAnthropicProvider(options: ResolvedProviderOptions): IModelProvider {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new ProviderFactoryError(
        "ANTHROPIC_API_KEY environment variable required for Anthropic provider",
      );
    }

    // For now, return a mock provider as a placeholder
    // TODO: Implement real AnthropicProvider in Phase 9
    console.warn("AnthropicProvider not yet implemented, using MockLLMProvider as placeholder");
    return new MockLLMProvider("pattern", {
      id: this.generateProviderId(options),
      patterns: [
        {
          pattern: /.*/,
          response: `[Anthropic placeholder - model: ${options.model}]`,
        },
      ],
    });
  }

  /**
   * Create an OpenAI provider (stub - throws if no API key)
   */
  private static createOpenAIProvider(options: ResolvedProviderOptions): IModelProvider {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new ProviderFactoryError(
        "OPENAI_API_KEY environment variable required for OpenAI provider",
      );
    }

    // For now, return a mock provider as a placeholder
    // TODO: Implement real OpenAIProvider in Phase 9
    console.warn("OpenAIProvider not yet implemented, using MockLLMProvider as placeholder");
    return new MockLLMProvider("pattern", {
      id: this.generateProviderId(options),
      patterns: [
        {
          pattern: /.*/,
          response: `[OpenAI placeholder - model: ${options.model}]`,
        },
      ],
    });
  }

  /**
   * Generate a unique provider ID
   */
  private static generateProviderId(options: ResolvedProviderOptions): string {
    switch (options.provider) {
      case "mock":
        return `mock-${options.mockStrategy ?? "recorded"}`;
      case "ollama":
        return `ollama-${options.model}`;
      case "anthropic":
        return `anthropic-${options.model}`;
      case "openai":
        return `openai-${options.model}`;
      default:
        return `unknown-${options.provider}`;
    }
  }
}
