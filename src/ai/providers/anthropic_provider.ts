import { IModelProvider, ModelOptions } from "../providers.ts";
import { EventLogger } from "../../services/event_logger.ts";
import { withRetry } from "./common.ts";
import { extractAnthropicContent, performProviderCall, tokenMapperAnthropic } from "../provider_common_utils.ts";
import type { Config } from "../../config/schema.ts";
import * as DEFAULTS from "../../config/constants.ts";

/**
 * Options for AnthropicProvider
 */
export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  id?: string;
  logger?: EventLogger;
  retryDelayMs?: number;
  maxRetries?: number;
  baseUrl?: string;
  apiVersion?: string;
  config?: Config;
}

/**
 * AnthropicProvider implements IModelProvider for Anthropic's Claude models.
 */
export class AnthropicProvider implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly logger?: EventLogger;
  private readonly retryDelayMs: number;
  private readonly maxRetries: number;

  /**
   * @param options.apiKey Anthropic API key
   * @param options.model Model name (default from config or constant)
   * @param options.id Optional provider id
   * @param options.logger Optional event logger
   * @param options.retryDelayMs Optional retry delay in ms (reads from config)
   * @param options.maxRetries Optional max retries (reads from config)
   * @param options.baseUrl Optional base URL (reads from config)
   * @param options.apiVersion Optional API version (reads from config)
   * @param options.config Optional config object for endpoints and retry settings
   */
  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey;

    // Read model from options, config, or default
    this.model = options.model ||
      options.config?.ai_anthropic?.default_model ||
      DEFAULTS.DEFAULT_ANTHROPIC_MODEL;

    this.id = options.id || `anthropic-${this.model}`;
    this.logger = options.logger;

    // Read base URL from config or use default
    this.baseUrl = options.baseUrl ||
      options.config?.ai_endpoints?.anthropic ||
      DEFAULTS.DEFAULT_ANTHROPIC_ENDPOINT;

    // Read API version from config or use default
    this.apiVersion = options.apiVersion ||
      options.config?.ai_anthropic?.api_version ||
      DEFAULTS.DEFAULT_ANTHROPIC_API_VERSION;

    // Read retry settings from config or use defaults
    this.retryDelayMs = options.retryDelayMs ||
      options.config?.ai_retry?.anthropic?.backoff_base_ms ||
      DEFAULTS.DEFAULT_ANTHROPIC_RETRY_BACKOFF_MS;

    this.maxRetries = options.maxRetries ||
      options.config?.ai_retry?.anthropic?.max_attempts ||
      DEFAULTS.DEFAULT_ANTHROPIC_RETRY_MAX_ATTEMPTS;
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
        "x-api-key": this.apiKey,
        "anthropic-version": this.apiVersion,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options?.max_tokens ?? DEFAULTS.DEFAULT_ANTHROPIC_MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
        temperature: options?.temperature,
        top_p: options?.top_p,
        stop_sequences: options?.stop,
      }),
    }, {
      id: this.id,
      maxAttempts: this.maxRetries,
      backoffBaseMs: this.retryDelayMs,
      timeoutMs: undefined,
      logger: this.logger,
      tokenMapper: tokenMapperAnthropic(this.model),
      extractor: extractAnthropicContent,
    });
    return data;
  }
}
