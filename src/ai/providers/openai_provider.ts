import { IModelProvider, ModelOptions } from "../providers.ts";
import { EventLogger } from "../../services/event_logger.ts";
import { withRetry } from "./common.ts";
import { performProviderCall, tokenMapperOpenAI } from "../provider_common_utils.ts";
import type { Config } from "../../config/schema.ts";
import * as DEFAULTS from "../../config/constants.ts";

/**
 * Options for OpenAIProvider
 */
export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  id?: string;
  logger?: EventLogger;
  retryDelayMs?: number;
  maxRetries?: number;
  baseUrl?: string;
  config?: Config;
}

/**
 * OpenAIProvider implements IModelProvider for OpenAI's GPT models.
 */
export class OpenAIProvider implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly logger?: EventLogger;
  private readonly retryDelayMs: number;
  private readonly maxRetries: number;

  /**
   * @param options.apiKey OpenAI API key
   * @param options.model Model name (default: gpt-4)
   * @param options.id Optional provider id
   * @param options.logger Optional event logger
   * @param options.retryDelayMs Optional retry delay in ms (reads from config)
   * @param options.maxRetries Optional max retries (reads from config)
   * @param options.baseUrl Optional base URL (reads from config)
   * @param options.config Optional config object for endpoints and retry settings
   */
  constructor(options: OpenAIProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model || "gpt-5.2-pro";
    this.id = options.id || `openai-${this.model}`;
    this.logger = options.logger;

    // Read base URL from config or use default
    this.baseUrl = options.baseUrl ||
      options.config?.ai_endpoints?.openai ||
      DEFAULTS.DEFAULT_OPENAI_ENDPOINT;

    // Read retry settings from config or use defaults
    this.retryDelayMs = options.retryDelayMs ||
      options.config?.ai_retry?.openai?.backoff_base_ms ||
      DEFAULTS.DEFAULT_OPENAI_RETRY_BACKOFF_MS;

    this.maxRetries = options.maxRetries ||
      options.config?.ai_retry?.openai?.max_attempts ||
      DEFAULTS.DEFAULT_OPENAI_RETRY_MAX_ATTEMPTS;
  }

  /**
   * Generate a completion from the model.
   */
  async generate(prompt: string, options?: ModelOptions): Promise<string> {
    return await withRetry(
      () => this.attemptGenerate(prompt, options),
      { maxRetries: this.maxRetries, baseDelayMs: this.retryDelayMs },
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
      maxAttempts: this.maxRetries,
      backoffBaseMs: this.retryDelayMs,
      timeoutMs: undefined,
      logger: this.logger,
      tokenMapper: tokenMapperOpenAI(this.model),
      extractor: (d: any) => d.choices?.[0]?.message?.content ?? "",
    });
    return data;
  }
}
