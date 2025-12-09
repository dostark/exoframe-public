/**
 * Model Adapter - Provides a unified interface for interacting with various LLM providers
 * Implements Step 3.1 of the ExoFrame Implementation Plan
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Options for model generation requests
 */
export interface ModelOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
  stream?: boolean;
}

/**
 * Standard interface that all model providers must implement
 */
export interface IModelProvider {
  /** Unique identifier for this provider instance */
  id: string;

  /**
   * Generate a response from the model
   * @param prompt - The input prompt to send to the model
   * @param options - Optional generation parameters
   * @returns The generated text response
   */
  generate(prompt: string, options?: ModelOptions): Promise<string>;
}

// ============================================================================
// Custom Error Types
// ============================================================================

/**
 * Base error class for model provider errors
 */
export class ModelProviderError extends Error {
  constructor(message: string, public readonly provider: string) {
    super(message);
    this.name = "ModelProviderError";
  }
}

/**
 * Error thrown when connection to the model provider fails
 */
export class ConnectionError extends ModelProviderError {
  constructor(provider: string, message: string) {
    super(`Connection failed for provider '${provider}': ${message}`, provider);
    this.name = "ConnectionError";
  }
}

/**
 * Error thrown when a request times out
 */
export class TimeoutError extends ModelProviderError {
  constructor(provider: string, timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms for provider '${provider}'`, provider);
    this.name = "TimeoutError";
  }
}

// ============================================================================
// Mock Provider (for testing)
// ============================================================================

/**
 * Mock provider that returns a predictable, configurable response
 * Used for unit testing and development
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
 * Provider for Ollama local LLM inference
 * Communicates with Ollama API at localhost:11434
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
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
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new ConnectionError(
          this.id,
          `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (!data.response) {
        throw new ModelProviderError(
          "Invalid response from Ollama: missing 'response' field",
          this.id,
        );
      }

      return data.response;
    } catch (error) {
      clearTimeout(timeoutId);

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
 * Factory for creating model provider instances based on configuration
 */
export class ModelFactory {
  /**
   * Create a model provider instance
   * @param providerType - Type of provider ("mock", "ollama", etc.)
   * @param config - Provider-specific configuration
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

      default:
        throw new Error(
          `Unknown provider type: '${providerType}'. Supported types: mock, ollama`,
        );
    }
  }
}
