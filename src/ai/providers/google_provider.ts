import { IModelProvider, ModelOptions, ModelProviderError } from "../providers.ts";
import { EventLogger } from "../../services/event_logger.ts";
import { withRetry, RateLimitError, AuthenticationError } from "./common.ts";

export class GoogleProvider implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
  private readonly logger?: EventLogger;
  private readonly retryDelayMs: number;

  constructor(options: {
    apiKey: string;
    model?: string;
    id?: string;
    logger?: EventLogger;
    retryDelayMs?: number;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gemini-3-pro";
    this.id = options.id ?? `google-${this.model}`;
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
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: options?.max_tokens,
          temperature: options?.temperature,
          topP: options?.top_p,
          stopSequences: options?.stop,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      const message = error.error?.message ?? response.statusText;

      // Google API uses 400 for invalid keys sometimes, or 403
      if (response.status === 401 || response.status === 403) {
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
    if (this.logger && data.usageMetadata) {
      this.logger.debug("llm.usage", this.id, {
        prompt_tokens: data.usageMetadata.promptTokenCount,
        completion_tokens: data.usageMetadata.candidatesTokenCount,
        total_tokens: data.usageMetadata.totalTokenCount ??
          (data.usageMetadata.promptTokenCount + data.usageMetadata.candidatesTokenCount),
        model: this.model,
      });
    }

    return data.candidates[0].content.parts[0].text;
  }
}
