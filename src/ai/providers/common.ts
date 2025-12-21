import { ModelProviderError, ConnectionError, TimeoutError } from "../providers.ts";

export class AuthenticationError extends ModelProviderError {
  constructor(provider: string, message: string) {
    super(message, provider);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends ModelProviderError {
  constructor(provider: string, message: string) {
    super(message, provider);
    this.name = "RateLimitError";
  }
}

export class QuotaExceededError extends ModelProviderError {
  constructor(provider: string, message: string) {
    super(message, provider);
    this.name = "QuotaExceededError";
  }
}

export class ModelNotFoundError extends ModelProviderError {
  constructor(provider: string, message: string) {
    super(message, provider);
    this.name = "ModelNotFoundError";
  }
}

export class ContextLengthError extends ModelProviderError {
  constructor(provider: string, message: string) {
    super(message, provider);
    this.name = "ContextLengthError";
  }
}

export function isRetryable(error: Error): boolean {
  if (error instanceof RateLimitError) return true;
  if (error instanceof ConnectionError) return true;
  if (error instanceof TimeoutError) return true;
  if (error instanceof ModelProviderError) return false; // Other provider errors are usually not retryable
  return true; // Generic errors (like network) are retryable
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelayMs: number },
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < options.maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (!isRetryable(err)) throw error;
      lastError = err;

      if (i < options.maxRetries - 1) {
        const delay = options.baseDelayMs * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError!;
}

export interface GenerateResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
}
