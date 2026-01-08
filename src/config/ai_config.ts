/**
 * AI Configuration Schema
 *
 * Step 5.8: LLM Provider Selection Logic
 *
 * Defines the Zod schema for the [ai] section of exo.config.toml
 */

import { z } from "zod";

/**
 * Supported LLM provider types
 */
export const ProviderTypeSchema = z.enum([
  "mock",
  "ollama",
  "anthropic",
  "openai",
  "google",
]);

export type ProviderType = z.infer<typeof ProviderTypeSchema>;

/**
 * Mock strategy types
 */
export const MockStrategySchema = z.enum([
  "recorded",
  "scripted",
  "pattern",
  "failing",
  "slow",
]);

export type MockStrategyType = z.infer<typeof MockStrategySchema>;

/**
 * Mock-specific configuration
 */
export const MockConfigSchema = z.object({
  /** Mock strategy: recorded, scripted, pattern, failing, slow */
  strategy: MockStrategySchema.default("recorded"),
  /** Directory for recorded response fixtures */
  fixtures_dir: z.string().optional(),
  /** Error message for failing strategy */
  error_message: z.string().optional(),
  /** Delay in ms for slow strategy */
  delay_ms: z.number().positive().optional(),
}).default({
  strategy: "recorded",
});

export type MockConfig = z.infer<typeof MockConfigSchema>;

/**
 * AI configuration schema for [ai] section in exo.config.toml
 */
export const AiConfigSchema = z.object({
  /** Provider type: mock, ollama, anthropic, openai */
  provider: ProviderTypeSchema.default("mock"),

  /** Model name (provider-specific) */
  model: z.string().default("mock-model"),

  /** API endpoint URL (for ollama, custom endpoints) */
  base_url: z.string().url().optional(),

  /** Request timeout in milliseconds */
  timeout_ms: z.number().positive().default(30000),

  /** Max output tokens */
  max_tokens: z.number().positive().optional(),

  /** Sampling temperature (0.0 - 2.0) */
  temperature: z.number().min(0).max(2).optional(),

  /** Mock-specific configuration */
  mock: MockConfigSchema.optional(),
}).default({
  provider: "mock",
  timeout_ms: 30000,
});

export type AiConfig = z.infer<typeof AiConfigSchema>;

/**
 * Default AI configuration
 */
export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: "mock",
  model: "mock-model",
  timeout_ms: 30000,
};

/**
 * Default models for each provider
 */
export const DEFAULT_MODELS: Record<ProviderType, string> = {
  mock: "mock-model",
  ollama: "llama3.2",
  anthropic: "claude-opus-4.5",
  openai: "gpt-5.2-pro",
  google: "gemini-3-pro",
};
/**
 * Default API endpoints for each provider
 */
export const DEFAULT_ENDPOINTS: Record<ProviderType, string> = {
  mock: "",
  ollama: "http://localhost:11434/api/generate",
  anthropic: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1/chat/completions",
  google: "https://generativelanguage.googleapis.com/v1/models",
};

/**
 * Default retry configuration per provider
 */
export const DEFAULT_RETRY_CONFIG: Record<ProviderType, { maxAttempts: number; backoffBaseMs: number }> = {
  mock: { maxAttempts: 1, backoffBaseMs: 0 },
  ollama: { maxAttempts: 3, backoffBaseMs: 1000 },
  anthropic: { maxAttempts: 5, backoffBaseMs: 2000 },
  openai: { maxAttempts: 3, backoffBaseMs: 1000 },
  google: { maxAttempts: 3, backoffBaseMs: 1000 },
};

/**
 * Anthropic API version header default
 */
export const ANTHROPIC_API_VERSION = "2023-06-01";
