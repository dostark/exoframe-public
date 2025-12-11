// src/ai/providers/llama_provider.ts
import { IModelProvider, ModelOptions } from "../providers.ts";

export interface LlamaProviderOptions {
  model: string;
  endpoint?: string;
  id?: string;
}

export class LlamaProvider implements IModelProvider {
  readonly id: string;
  readonly model: string;
  readonly endpoint: string;

  constructor(options: LlamaProviderOptions) {
    if (!/^codellama:|^llama[0-9.]*:/.test(options.model)) {
      throw new Error("Unsupported model");
    }
    this.model = options.model;
    this.endpoint = options.endpoint || "http://localhost:11434/api/generate";
    this.id = options.id || `llama-${this.model}`;
  }

  async generate(prompt: string, _options?: ModelOptions): Promise<string> {
    const body = {
      model: this.model,
      prompt,
      stream: false,
    };
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (_err) {
      throw new Error("Connection error");
    }
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }
    const data = await response.json();
    if (!data || typeof data.response !== "string") {
      throw new Error("Invalid Ollama response");
    }
    // Assume the LLM returns JSON directly as required by PlanSchema
    return data.response;
  }
}
