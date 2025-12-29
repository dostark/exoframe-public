import { IModelProvider, ModelOptions } from "../providers.ts";
import { EventLogger } from "../../services/event_logger.ts";
import { withRetry } from "./common.ts";
import { extractAnthropicContent, performProviderCall, tokenMapperAnthropic } from "../provider_common_utils.ts";

/**
 * AnthropicProvider implements IModelProvider for Anthropic's Claude models.
 */
export class AnthropicProvider implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = "https://api.anthropic.com/v1/messages";
  private readonly logger?: EventLogger;
  private readonly retryDelayMs: number;

  /**
   * @param options.apiKey Anthropic API key
   * @param options.model Model name (default: claude-opus-4.5)
   * @param options.id Optional provider id
   * @param options.logger Optional event logger
   * @param options.retryDelayMs Optional retry delay in ms
   */
  constructor(options: { apiKey: string; model?: string; id?: string; logger?: EventLogger; retryDelayMs?: number }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "claude-opus-4.5";
    this.id = options.id ?? `anthropic-${this.model}`;
    this.logger = options.logger;
    // Longer default backoff to reduce transient rate-limits
    this.retryDelayMs = options.retryDelayMs ?? 2000;
  }

  /**
   * Generate a completion from the model.
   */
  async generate(prompt: string, options?: ModelOptions): Promise<string> {
    return await withRetry(
      () => this.attemptGenerate(prompt, options),
      { maxRetries: 5, baseDelayMs: this.retryDelayMs },
    );
  }

  /**
   * Internal: attempt a single completion call.
   */
  private async attemptGenerate(prompt: string, options?: ModelOptions): Promise<string> {
    const data = await performProviderCall(this.baseUrl, {
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
    }, {
      id: this.id,
      maxAttempts: 5,
      backoffBaseMs: this.retryDelayMs,
      timeoutMs: undefined,
      logger: this.logger,
      tokenMapper: tokenMapperAnthropic(this.model),
      extractor: extractAnthropicContent,
    });

    return data;
  }
}
