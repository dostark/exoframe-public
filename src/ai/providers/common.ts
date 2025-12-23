import { ConnectionError, ModelProviderError, TimeoutError } from "../providers.ts";

/**
 * Authentication error for model providers.
 */
export class AuthenticationError extends ModelProviderError {
  constructor(provider: string, message: string) {
    super(message, provider);
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Rate limit error for model providers.
 */
export class RateLimitError extends ModelProviderError {
  constructor(provider: string, message: string) {
    super(message, provider);
    this.name = "RateLimitError";
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Quota exceeded error for model providers.
 */
export class QuotaExceededError extends ModelProviderError {
  constructor(provider: string, message: string) {
    super(message, provider);
    this.name = "QuotaExceededError";
    Object.setPrototypeOf(this, QuotaExceededError.prototype);
  }
}

/**
 * Model not found error for model providers.
 */
export class ModelNotFoundError extends ModelProviderError {
  constructor(provider: string, message: string) {
    super(message, provider);
    this.name = "ModelNotFoundError";
    Object.setPrototypeOf(this, ModelNotFoundError.prototype);
  }
}

/**
 * Context length error for model providers.
 */
export class ContextLengthError extends ModelProviderError {
  constructor(provider: string, message: string) {
    super(message, provider);
    this.name = "ContextLengthError";
    Object.setPrototypeOf(this, ContextLengthError.prototype);
  }
}

/**
 * Determines if an error is retryable for model provider operations.
 */
export function isRetryable(error: Error): boolean {
  if (error instanceof RateLimitError) return true;
  if (error instanceof ConnectionError) return true;
  if (error instanceof TimeoutError) return true;
  if (error instanceof ModelProviderError) return false; // Other provider errors are usually not retryable
  return true; // Generic errors (like network) are retryable
}

/**
 * Retry a promise-returning function with exponential backoff.
 * @param fn The async function to retry
 * @param options.maxRetries Maximum number of retries
 * @param options.baseDelayMs Initial delay in ms
 */
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
  throw lastError ?? new Error("Unknown error in withRetry");
}

/**
 * Result of a model provider generate call.
 */
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
