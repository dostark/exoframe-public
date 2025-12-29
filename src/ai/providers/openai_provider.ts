import { IModelProvider, ModelOptions } from "../providers.ts";
import { EventLogger } from "../../services/event_logger.ts";
import { withRetry } from "./common.ts";
import { extractOpenAIContent, performProviderCall, tokenMapperOpenAI } from "../provider_common_utils.ts";

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
    // Use longer default backoff to help avoid 429s during manual runs
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
    }, {
      id: this.id,
      maxAttempts: 5,
      backoffBaseMs: this.retryDelayMs,
      timeoutMs: undefined,
      logger: this.logger,
      tokenMapper: tokenMapperOpenAI(this.model),
      extractor: extractOpenAIContent,
    });

    return data;
  }
}
