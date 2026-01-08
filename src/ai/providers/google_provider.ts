import { IModelProvider, ModelOptions } from "../providers.ts";
import { EventLogger } from "../../services/event_logger.ts";
import { withRetry } from "./common.ts";
import { extractGoogleContent, performProviderCall, tokenMapperGoogle } from "../provider_common_utils.ts";
import type { Config } from "../../config/schema.ts";
import * as DEFAULTS from "../../config/constants.ts";

/**
 * Options for GoogleProvider
 */
export interface GoogleProviderOptions {
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
 * GoogleProvider implements IModelProvider for Google's Gemini models.
 */
export class GoogleProvider implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly logger?: EventLogger;
  private readonly retryDelayMs: number;
  private readonly maxRetries: number;

  /**
   * @param options.apiKey Google API key
   * @param options.model Model name (default: gemini-pro)
   * @param options.id Optional provider id
   * @param options.logger Optional event logger
   * @param options.retryDelayMs Optional retry delay in ms (reads from config)
   * @param options.maxRetries Optional max retries (reads from config)
   * @param options.baseUrl Optional base URL (reads from config)
   * @param options.config Optional config object for endpoints and retry settings
   */
  constructor(options: GoogleProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model || "gemini-3-pro";
    this.id = options.id || `google-${this.model}`;
    this.logger = options.logger;

    // Read base URL from config or use default
    this.baseUrl = options.baseUrl ||
      options.config?.ai_endpoints?.google ||
      DEFAULTS.DEFAULT_GOOGLE_ENDPOINT;

    // Read retry settings from config or use defaults (same as OpenAI for Google)
    this.retryDelayMs = options.retryDelayMs ||
      options.config?.ai_retry?.max_attempts ||
      DEFAULTS.DEFAULT_AI_RETRY_BACKOFF_BASE_MS;

    this.maxRetries = options.maxRetries ||
      options.config?.ai_retry?.max_attempts ||
      DEFAULTS.DEFAULT_AI_RETRY_MAX_ATTEMPTS;
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
    const endpoint = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    const data = await performProviderCall(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }],
        }],
        generationConfig: {
          maxOutputTokens: options?.max_tokens,
          temperature: options?.temperature,
          topP: options?.top_p,
          stopSequences: options?.stop,
        },
      }),
    }, {
      id: this.id,
      maxAttempts: this.maxRetries,
      backoffBaseMs: this.retryDelayMs,
      timeoutMs: undefined,
      logger: this.logger,
      tokenMapper: tokenMapperGoogle(this.model),
      extractor: extractGoogleContent,
    });
    return data;
  }
}
