import { IModelProvider, ModelOptions } from "../providers.ts";
import type { Config } from "../../config/schema.ts";
import * as DEFAULTS from "../../config/constants.ts";

/**
 * Options for LlamaProvider.
 */
export interface LlamaProviderOptions {
  model: string;
  endpoint?: string;
  id?: string;
  config?: Config;
  maxAttempts?: number;
  backoffBaseMs?: number;
}

/**
 * LlamaProvider implements IModelProvider for Llama and CodeLlama models (Ollama API).
 */
export class LlamaProvider implements IModelProvider {
  readonly id: string;
  readonly model: string;
  readonly endpoint: string;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;

  /**
   * @param options.model Model name (must start with codellama: or llamaX:)
   * @param options.endpoint Ollama API endpoint (reads from config or defaults)
   * @param options.id Optional provider id
   * @param options.config Optional config for endpoint and retry settings
   */
  constructor(options: LlamaProviderOptions) {
    if (!/^codellama:|^llama[0-9.]*:/.test(options.model)) {
      throw new Error("Unsupported model");
    }
    this.model = options.model;

    // Read endpoint from config or use default
    this.endpoint = options.endpoint ||
      options.config?.ai_endpoints?.ollama ||
      DEFAULTS.DEFAULT_OLLAMA_ENDPOINT;

    this.id = options.id || `llama-${this.model}`;

    // Read retry settings from config or environment or use defaults
    this.maxAttempts = options.maxAttempts ||
      options.config?.ai_retry?.ollama?.max_attempts ||
      Number(Deno.env.get("EXO_OLLAMA_RETRY_MAX")) ||
      DEFAULTS.DEFAULT_OLLAMA_RETRY_MAX_ATTEMPTS;

    this.backoffBaseMs = options.backoffBaseMs ||
      options.config?.ai_retry?.ollama?.backoff_base_ms ||
      Number(Deno.env.get("EXO_OLLAMA_RETRY_BACKOFF_MS")) ||
      DEFAULTS.DEFAULT_OLLAMA_RETRY_BACKOFF_MS;
  }

  /**
   * Generate a completion from the model.
   */
  async generate(prompt: string, _options?: ModelOptions): Promise<string> {
    const body = {
      model: this.model,
      prompt,
      stream: false,
    };

    const { fetchJsonWithRetries } = await import("../provider_common_utils.ts");
    const data = await fetchJsonWithRetries(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, {
      id: this.id,
      maxAttempts: Number(Deno.env.get("EXO_OLLAMA_RETRY_MAX") ?? "3"),
      backoffBaseMs: Number(Deno.env.get("EXO_OLLAMA_RETRY_BACKOFF_MS") ?? "1000"),
      timeoutMs: undefined,
    });

    if (!data || typeof data.response !== "string") {
      throw new Error("Invalid Ollama response");
    }

    // Extract JSON from response, handling markdown formatting
    let jsonText = data.response.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else {
      // Try to find JSON object directly
      const jsonStart = jsonText.indexOf("{");
      const jsonEnd = jsonText.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonText = jsonText.slice(jsonStart, jsonEnd + 1);
      }
    }

    // Try to parse as JSON
    try {
      JSON.parse(jsonText);
      return jsonText;
    } catch (_parseError) {
      // If not valid JSON, return the raw response and let caller handle it
      return data.response;
    }
  }
}
