import { IModelProvider, ModelOptions, ModelProviderError } from "../providers.ts";
import { EventLogger } from "../../services/event_logger.ts";
import { withRetry, RateLimitError, AuthenticationError } from "./common.ts";

export class AnthropicProvider implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = "https://api.anthropic.com/v1/messages";
  private readonly logger?: EventLogger;
  private readonly retryDelayMs: number;

  constructor(options: { apiKey: string; model?: string; id?: string; logger?: EventLogger; retryDelayMs?: number }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "claude-opus-4.5";
    this.id = options.id ?? `anthropic-${this.model}`;
    this.logger = options.logger;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
  }

  async generate(prompt: string, options?: ModelOptions): Promise<string> {
    return await withRetry(
      () => this.attemptGenerate(prompt, options),
      { maxRetries: 3, baseDelayMs: this.retryDelayMs }
    );
  }

  private async attemptGenerate(prompt: string, options?: ModelOptions): Promise<string> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options?.max_tokens ?? 4096,
        messages: [{ role: "user", content: prompt }],
        temperature: options?.temperature,
        top_p: options?.top_p,
        stop_sequences: options?.stop,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      const message = error.error?.message ?? response.statusText;

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

    // Report token usage
    if (this.logger && data.usage) {
      this.logger.debug("llm.usage", this.id, {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens,
        model: this.model,
      });
    }

    return data.content[0].text;
  }
}
