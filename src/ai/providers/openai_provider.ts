import { IModelProvider, ModelOptions, ModelProviderError } from "../providers.ts";
import { EventLogger } from "../../services/event_logger.ts";
import { AuthenticationError, RateLimitError, withRetry } from "./common.ts";

/**
 * OpenAIProvider implements IModelProvider for OpenAI's chat models.
 */
export class OpenAIProvider implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly logger?: EventLogger;
  private readonly retryDelayMs: number;

  /**
   * @param options.apiKey OpenAI API key
   * @param options.model Model name (default: gpt-5.2-pro)
   * @param options.baseUrl API endpoint (default: OpenAI v1 completions)
   * @param options.id Optional provider id
   * @param options.logger Optional event logger
   * @param options.retryDelayMs Optional retry delay in ms
   */
  constructor(options: {
    apiKey: string;
    model?: string;
    baseUrl?: string;
    id?: string;
    logger?: EventLogger;
    retryDelayMs?: number;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-5.2-pro";
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1/chat/completions";
    this.id = options.id ?? `openai-${this.model}`;
    this.logger = options.logger;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
  }

  /**
   * Generate a completion from the model.
   */
  async generate(prompt: string, options?: ModelOptions): Promise<string> {
    return await withRetry(
      () => this.attemptGenerate(prompt, options),
      { maxRetries: 3, baseDelayMs: this.retryDelayMs },
    );
  }

  /**
   * Internal: attempt a single completion call.
   */
  private async attemptGenerate(prompt: string, options?: ModelOptions): Promise<string> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: options?.max_tokens,
        temperature: options?.temperature,
        top_p: options?.top_p,
        stop: options?.stop,
      }),
    });

    if (!response.ok) {
      let message = response.statusText;
      try {
        const error = await response.json();
        message = error.error?.message ?? message;
      } catch {}
      if (response.status === 401) {
        throw new AuthenticationError(this.id, message);
      }
      if (response.status === 429) {
        throw new RateLimitError(this.id, message);
      }
      if (response.status >= 500) {
        throw new ModelProviderError(`Server error: ${message}`, this.id);
      }
      throw new ModelProviderError(message, this.id);
    }

    const data = await response.json();

    // Report token usage if logger is present
    if (this.logger && data.usage) {
      this.logger.debug("llm.usage", this.id, {
        prompt_tokens: data.usage.prompt_tokens,
        completion_tokens: data.usage.completion_tokens,
        total_tokens: data.usage.total_tokens,
        model: this.model,
      });
    }

    return data.choices?.[0]?.message?.content ?? "";
  }
}
