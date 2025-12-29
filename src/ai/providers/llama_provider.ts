import { IModelProvider, ModelOptions } from "../providers.ts";

/**
 * Options for LlamaProvider.
 */
export interface LlamaProviderOptions {
  model: string;
  endpoint?: string;
  id?: string;
}

/**
 * LlamaProvider implements IModelProvider for Llama and CodeLlama models (Ollama API).
 */
export class LlamaProvider implements IModelProvider {
  readonly id: string;
  readonly model: string;
  readonly endpoint: string;

  /**
   * @param options.model Model name (must start with codellama: or llamaX:)
   * @param options.endpoint Ollama API endpoint (default: http://localhost:11434/api/generate)
   * @param options.id Optional provider id
   */
  constructor(options: LlamaProviderOptions) {
    if (!/^codellama:|^llama[0-9.]*:/.test(options.model)) {
      throw new Error("Unsupported model");
    }
    this.model = options.model;
    this.endpoint = options.endpoint || "http://localhost:11434/api/generate";
    this.id = options.id || `llama-${this.model}`;
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
