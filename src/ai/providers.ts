/**
 * Model Adapter - Provides a unified interface for interacting with various LLM providers.
 * Implements Step 3.1 of the ExoFrame Implementation Plan.
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Options for model generation requests.
 */
export interface ModelOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
  stream?: boolean;
}

/**
 * Standard interface that all model providers must implement.
 */
export interface IModelProvider {
  /** Unique identifier for this provider instance. */
  id: string;

  /**
   * Generate a response from the model.
   * @param prompt The input prompt to send to the model
   * @param options Optional generation parameters
   * @returns The generated text response
   */
  generate(prompt: string, options?: ModelOptions): Promise<string>;
}

// ============================================================================
// Custom Error Types
// ============================================================================

/**
 * Base error class for model provider errors.
 */
export class ModelProviderError extends Error {
  constructor(message: string, public readonly provider: string) {
    super(message);
    this.name = "ModelProviderError";
    Object.setPrototypeOf(this, ModelProviderError.prototype);
  }
}

/**
 * Error thrown when connection to the model provider fails.
 */
export class ConnectionError extends ModelProviderError {
  constructor(provider: string, message: string) {
    super(`Connection failed for provider '${provider}': ${message}`, provider);
    this.name = "ConnectionError";
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

/**
 * Error thrown when a request times out.
 */
export class TimeoutError extends ModelProviderError {
  constructor(provider: string, timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms for provider '${provider}'`, provider);
    this.name = "TimeoutError";
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

// ============================================================================
// Mock Provider (for testing)
// ============================================================================

/**
 * Mock provider that returns a predictable, configurable response.
 * Used for unit testing and development.
 */
export class MockProvider implements IModelProvider {
  public readonly id: string;

  constructor(
    private readonly response: string,
    id: string = "mock-provider",
  ) {
    this.id = id;
  }

  async generate(_prompt: string, _options?: ModelOptions): Promise<string> {
    // Simulate async behavior
    await new Promise((resolve) => setTimeout(resolve, 10));
    return this.response;
  }
}

// ============================================================================
// Ollama Provider (local inference)
// ============================================================================

/**
 * Provider for Ollama local LLM inference.
 * Communicates with Ollama API at localhost:11434.
 */
export class OllamaProvider implements IModelProvider {
  public readonly id: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;

  constructor(
    options: {
      baseUrl?: string;
      model?: string;
      timeoutMs?: number;
      id?: string;
    } = {},
  ) {
    this.baseUrl = options.baseUrl ?? "http://localhost:11434";
    this.defaultModel = options.model ?? "llama3.2";
    this.timeoutMs = options.timeoutMs ?? 30000; // 30 second default timeout
    this.id = options.id ?? `ollama-${this.defaultModel}`;
  }

  async generate(prompt: string, options?: ModelOptions): Promise<string> {
    try {
      // Import helper dynamically to avoid module cycles
      const { fetchJsonWithRetries } = await import("./provider_common_utils.ts");
      const data = await fetchJsonWithRetries(
        `${this.baseUrl}/api/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.defaultModel,
            prompt: prompt,
            stream: false,
            options: {
              temperature: options?.temperature,
              num_predict: options?.max_tokens,
              top_p: options?.top_p,
              stop: options?.stop,
            },
          }),
        },
        {
          id: this.id,
          maxAttempts: Number(safeGetEnv("EXO_OLLAMA_RETRY_MAX") ?? "3"),
          backoffBaseMs: Number(safeGetEnv("EXO_OLLAMA_RETRY_BACKOFF_MS") ?? "1000"),
          timeoutMs: this.timeoutMs,
        },
      );

      if (!data.response) {
        throw new ModelProviderError(
          "Invalid response from Ollama: missing 'response' field",
          this.id,
        );
      }

      return data.response;
    } catch (error) {
      if (error instanceof ModelProviderError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError(this.id, this.timeoutMs);
      }

      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new ConnectionError(
          this.id,
          `Failed to connect to Ollama at ${this.baseUrl}. Is Ollama running?`,
        );
      }

      throw new ModelProviderError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        this.id,
      );
    }
  }
}

// ============================================================================
// Model Factory
// ============================================================================

/**
 * Safe environment accessor that returns undefined if env access is not permitted in test environments.
 */
function safeGetEnv(key: string): string | undefined {
  try {
    return Deno.env.get(key);
  } catch {
    return undefined;
  }
}

/**
 * Minimal OpenAI-compatible shim used by the factory to create quick model-specific adapters
 * without importing the full `OpenAIProvider` implementation (avoids circular imports).
 */

class OpenAIShim implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options: { apiKey?: string; model?: string; baseUrl?: string; id?: string }) {
    this.apiKey = options.apiKey ?? "";
    this.model = options.model ?? "gpt-4.1";
    this.baseUrl = options.baseUrl ?? "https://api.openai.com";
    this.id = options.id ?? `openai-${this.model}`;
  }

  async generate(prompt: string, _options?: ModelOptions): Promise<string> {
    const url = `${this.baseUrl}/v1/chat/completions`;

    // Make retry parameters configurable via env for manual runs; defaults longer to reduce 429 frequency
    const maxAttempts = Number(safeGetEnv("EXO_OPENAI_RETRY_MAX") ?? "6");
    const backoffBaseMs = Number(safeGetEnv("EXO_OPENAI_RETRY_BACKOFF_MS") ?? "2000");
    const timeoutMs = Number(safeGetEnv("EXO_OPENAI_TIMEOUT_MS") ?? "30000");

    // Import helpers dynamically to avoid module initialization cycles
    const { fetchJsonWithRetries, extractOpenAIContent, tokenMapperOpenAI } = await import(
      "./provider_common_utils.ts"
    );

    const data = await fetchJsonWithRetries(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, messages: [{ role: "user", content: prompt }] }),
      },
      {
        id: this.id,
        maxAttempts,
        backoffBaseMs,
        timeoutMs,
        tokenMapper: tokenMapperOpenAI(this.model),
      },
    );

    const content = extractOpenAIContent(data);
    if (!content) {
      throw new ModelProviderError("Invalid response from OpenAI-compatible endpoint", this.id);
    }
    return content;
  }
}

/**
 * Factory for creating model provider instances based on configuration.
 */
export class ModelFactory {
  /**
   * Create a model provider instance.
   * @param providerType Type of provider ("mock", "ollama", etc.)
   * @param config Provider-specific configuration
   * @returns An instance implementing IModelProvider
   */
  static create(
    providerType: string,
    config?: Record<string, unknown>,
  ): IModelProvider {
    const normalizedType = providerType.toLowerCase().trim();

    switch (normalizedType) {
      case "mock":
        return new MockProvider(
          (config?.response as string) ?? "Mock response",
          (config?.id as string) ?? "mock-provider",
        );

      case "ollama":
        return new OllamaProvider({
          baseUrl: config?.baseUrl as string | undefined,
          model: config?.model as string | undefined,
          timeoutMs: config?.timeoutMs as number | undefined,
          id: config?.id as string | undefined,
        });

      // Convenience aliases for cost-friendly/open/free models that use OpenAI-compatible endpoints
      case "gpt-4.1":
      case "gpt-4o":
      case "gpt-5-mini":
        // In CI, prevent accidental calls to paid endpoints unless explicitly opted-in
        if (safeGetEnv("CI") && safeGetEnv("EXO_ENABLE_PAID_LLM") !== "1") {
          return new MockProvider("CI-protected mock", (config?.id as string) ?? "mock-provider");
        }

        return new OpenAIShim({
          apiKey: config?.apiKey as string ?? "",
          model: normalizedType,
          baseUrl: config?.baseUrl as string | undefined,
          id: (config?.id as string) ?? `openai-${normalizedType}`,
        });
    }

    // Accept arbitrary OpenAI-style model ids that start with 'gpt-'
    if (normalizedType.startsWith("gpt-")) {
      if (safeGetEnv("CI") && safeGetEnv("EXO_ENABLE_PAID_LLM") !== "1") {
        return new MockProvider("CI-protected mock", (config?.id as string) ?? "mock-provider");
      }

      return new OpenAIShim({
        apiKey: config?.apiKey as string ?? "",
        // Use the original providerType (preserve exact model id) when contacting the API
        model: providerType,
        baseUrl: config?.baseUrl as string | undefined,
        id: (config?.id as string) ?? `openai-${providerType}`,
      });
    }

    // If we reach here, the provider type is unknown
    throw new Error(
      `Unknown provider type: '${providerType}'. Supported types: mock, ollama, or any gpt-* model id`,
    );
  }
}
