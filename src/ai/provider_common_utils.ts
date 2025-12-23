import { EventLogger } from "../services/event_logger.ts";
import { AuthenticationError, RateLimitError } from "./providers/common.ts";
import { ModelProviderError } from "./providers.ts";

export type TokenMap = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  model?: string;
};

export async function handleProviderResponse(
  response: Response,
  id: string,
  logger?: EventLogger,
  tokenMapper?: (data: any) => TokenMap | undefined,
): Promise<any> {
  if (!response.ok) {
    let message = response.statusText;
    try {
      const error = await response.json();
      message = error.error?.message ?? message;
    } catch {
      // ignore JSON parse errors and fallback to statusText
    }
    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(id, message);
    }
    if (response.status === 429) {
      throw new RateLimitError(id, message);
    }
    if (response.status >= 500) {
      throw new ModelProviderError(`Server error: ${message}`, id);
    }
    throw new ModelProviderError(message, id);
  }

  const data = await response.json();

  if (logger && tokenMapper) {
    try {
      const tokens = tokenMapper(data);
      if (tokens) {
        logger.debug("llm.usage", id, tokens);
      }
    } catch {
      // never fail the provider call because token logging failed
    }
  }

  return data;
}

/** Token mapper for OpenAI response shape */
export function tokenMapperOpenAI(model: string) {
  return (d: any): TokenMap | undefined =>
    d.usage
      ? {
        prompt_tokens: d.usage.prompt_tokens,
        completion_tokens: d.usage.completion_tokens,
        total_tokens: d.usage.total_tokens ?? (d.usage.prompt_tokens + d.usage.completion_tokens),
        model,
      }
      : undefined;
}

/** Extract textual content from OpenAI response */
export function extractOpenAIContent(d: any): string {
  return d.choices?.[0]?.message?.content ?? "";
}

/** Token mapper for Google response shape */
export function tokenMapperGoogle(model: string) {
  return (d: any): TokenMap | undefined =>
    d.usageMetadata
      ? {
        prompt_tokens: d.usageMetadata.promptTokenCount,
        completion_tokens: d.usageMetadata.candidatesTokenCount,
        total_tokens: d.usageMetadata.totalTokenCount ??
          (d.usageMetadata.promptTokenCount + d.usageMetadata.candidatesTokenCount),
        model,
      }
      : undefined;
}

/** Extract textual content from Google response */
export function extractGoogleContent(d: any): string {
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/** Token mapper for Anthropic response shape */
export function tokenMapperAnthropic(model: string) {
  return (d: any): TokenMap | undefined =>
    d.usage
      ? {
        prompt_tokens: d.usage.input_tokens,
        completion_tokens: d.usage.output_tokens,
        total_tokens: (d.usage.input_tokens ?? 0) + (d.usage.output_tokens ?? 0),
        model,
      }
      : undefined;
}

/** Extract textual content from Anthropic response */
export function extractAnthropicContent(d: any): string {
  return d.content?.[0]?.text ?? "";
}
