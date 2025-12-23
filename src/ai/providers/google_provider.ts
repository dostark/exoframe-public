import { IModelProvider, ModelOptions } from "../providers.ts";
import { EventLogger } from "../../services/event_logger.ts";
import { withRetry } from "./common.ts";
import { extractGoogleContent, handleProviderResponse, tokenMapperGoogle } from "../provider_common_utils.ts";

/**
 * GoogleProvider implements IModelProvider for Gemini and other Google models.
 */
export class GoogleProvider implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
  private readonly logger?: EventLogger;
  private readonly retryDelayMs: number;

  /**
   * @param options.apiKey Google API key
   * @param options.model Model name (default: gemini-3-pro)
   * @param options.id Optional provider id
   * @param options.logger Optional event logger
   * @param options.retryDelayMs Optional retry delay in ms
   */
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
    const data = await handleProviderResponse(response, this.id, this.logger, tokenMapperGoogle(this.model));

    return extractGoogleContent(data);
  }
}
