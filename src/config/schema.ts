import { z } from "zod";
import { AiConfigSchema } from "./ai_config.ts";
import { MCPConfigSchema } from "../schemas/mcp.ts";
import * as DEFAULTS from "./constants.ts";
import { ProviderTypeSchema } from "./ai_config.ts";

export const ConfigSchema = z.object({
  system: z.object({
    root: z.string().default(Deno.cwd()),
    log_level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    version: z.string().optional(),
  }),
  paths: z.object({
    workspace: z.string().default("Workspace"),
    runtime: z.string().default(".exo"),
    memory: z.string().default("Memory"),
    portals: z.string().default("Portals"),
    blueprints: z.string().default("Blueprints"),
  }),
  database: z.object({
    batch_flush_ms: z.number().min(10).max(10000).default(DEFAULTS.DEFAULT_DATABASE_BATCH_FLUSH_MS),
    batch_max_size: z.number().min(1).max(1000).default(DEFAULTS.DEFAULT_DATABASE_BATCH_MAX_SIZE),
    path: z.string().optional(),
    sqlite: z.object({
      journal_mode: z.enum(["DELETE", "TRUNCATE", "PERSIST", "MEMORY", "WAL", "OFF"]).default(
        DEFAULTS.DEFAULT_DATABASE_JOURNAL_MODE as "WAL",
      ),
      foreign_keys: z.boolean().default(DEFAULTS.DEFAULT_DATABASE_FOREIGN_KEYS),
      busy_timeout_ms: z.number().min(0).max(30000).default(DEFAULTS.DEFAULT_DATABASE_BUSY_TIMEOUT_MS),
    }).default({
      journal_mode: DEFAULTS.DEFAULT_DATABASE_JOURNAL_MODE as "WAL",
      foreign_keys: DEFAULTS.DEFAULT_DATABASE_FOREIGN_KEYS,
      busy_timeout_ms: DEFAULTS.DEFAULT_DATABASE_BUSY_TIMEOUT_MS,
    }),
  }).default({
    batch_flush_ms: DEFAULTS.DEFAULT_DATABASE_BATCH_FLUSH_MS,
    batch_max_size: DEFAULTS.DEFAULT_DATABASE_BATCH_MAX_SIZE,
    sqlite: {
      journal_mode: DEFAULTS.DEFAULT_DATABASE_JOURNAL_MODE as "WAL",
      foreign_keys: DEFAULTS.DEFAULT_DATABASE_FOREIGN_KEYS,
      busy_timeout_ms: DEFAULTS.DEFAULT_DATABASE_BUSY_TIMEOUT_MS,
    },
  }),
  watcher: z.object({
    debounce_ms: z.number().min(50).max(5000).default(DEFAULTS.DEFAULT_WATCHER_DEBOUNCE_MS),
    stability_check: z.boolean().default(DEFAULTS.DEFAULT_WATCHER_STABILITY_CHECK),
  }).default({
    debounce_ms: DEFAULTS.DEFAULT_WATCHER_DEBOUNCE_MS,
    stability_check: DEFAULTS.DEFAULT_WATCHER_STABILITY_CHECK,
  }),
  agents: z.object({
    default_model: z.string().default(DEFAULTS.DEFAULT_AGENT_MODEL),
    timeout_sec: z.number().min(1).max(300).default(DEFAULTS.DEFAULT_AGENT_TIMEOUT_SEC),
    max_iterations: z.number().min(1).max(100).default(DEFAULTS.DEFAULT_AGENT_MAX_ITERATIONS),
  }).default({
    default_model: DEFAULTS.DEFAULT_AGENT_MODEL,
    timeout_sec: DEFAULTS.DEFAULT_AGENT_TIMEOUT_SEC,
    max_iterations: DEFAULTS.DEFAULT_AGENT_MAX_ITERATIONS,
  }),
  portals: z.array(z.object({
    alias: z.string(),
    target_path: z.string(),
    created: z.string().optional(),
  })).default([]),
  /** AI/LLM provider configuration (legacy/single) */
  ai: AiConfigSchema.optional(),
  /** Named model configurations (default, fast, local, etc.) */
  models: z.record(z.object({
    provider: ProviderTypeSchema, // Use ProviderTypeSchema directly instead of AiConfigSchema.shape.provider
    model: z.string(),
    timeout_ms: z.number().positive().optional(),
    max_tokens: z.number().positive().optional(),
    temperature: z.number().min(0).max(2).optional(),
    base_url: z.string().optional(),
  })).default({
    default: { provider: "mock", model: "mock-model", timeout_ms: DEFAULTS.DEFAULT_MODEL_TIMEOUT_MS },
    fast: { provider: "mock", model: "mock-fast", timeout_ms: DEFAULTS.DEFAULT_FAST_MODEL_TIMEOUT_MS },
    local: { provider: "ollama", model: "llama3.2", timeout_ms: DEFAULTS.DEFAULT_LOCAL_MODEL_TIMEOUT_MS },
  }),
  /** AI provider endpoints configuration */
  ai_endpoints: z.object({
    ollama: z.string().optional(),
    anthropic: z.string().optional(),
    openai: z.string().optional(),
    google: z.string().optional(),
  }).optional().default({}),
  /** AI retry configuration */
  ai_retry: z.object({
    max_attempts: z.number().min(1).max(10).default(DEFAULTS.DEFAULT_AI_RETRY_MAX_ATTEMPTS),
    backoff_base_ms: z.number().min(100).max(10000).default(DEFAULTS.DEFAULT_AI_RETRY_BACKOFF_BASE_MS),
    timeout_per_request_ms: z.number().min(1000).max(300000).default(DEFAULTS.DEFAULT_AI_RETRY_TIMEOUT_PER_REQUEST_MS),
    ollama: z.object({
      max_attempts: z.number().min(1).max(10).default(DEFAULTS.DEFAULT_OLLAMA_RETRY_MAX_ATTEMPTS),
      backoff_base_ms: z.number().min(100).max(10000).default(DEFAULTS.DEFAULT_OLLAMA_RETRY_BACKOFF_MS),
    }).optional(),
    anthropic: z.object({
      max_attempts: z.number().min(1).max(10).default(DEFAULTS.DEFAULT_ANTHROPIC_RETRY_MAX_ATTEMPTS),
      backoff_base_ms: z.number().min(100).max(10000).default(DEFAULTS.DEFAULT_ANTHROPIC_RETRY_BACKOFF_MS),
    }).optional(),
    openai: z.object({
      max_attempts: z.number().min(1).max(10).default(DEFAULTS.DEFAULT_OPENAI_RETRY_MAX_ATTEMPTS),
      backoff_base_ms: z.number().min(100).max(10000).default(DEFAULTS.DEFAULT_OPENAI_RETRY_BACKOFF_MS),
    }).optional(),
  }).optional().default({
    max_attempts: DEFAULTS.DEFAULT_AI_RETRY_MAX_ATTEMPTS,
    backoff_base_ms: DEFAULTS.DEFAULT_AI_RETRY_BACKOFF_BASE_MS,
    timeout_per_request_ms: DEFAULTS.DEFAULT_AI_RETRY_TIMEOUT_PER_REQUEST_MS,
  }),
  /** Anthropic-specific configuration */
  ai_anthropic: z.object({
    api_version: z.string().default(DEFAULTS.DEFAULT_ANTHROPIC_API_VERSION),
    default_model: z.string().default(DEFAULTS.DEFAULT_ANTHROPIC_MODEL),
    max_tokens_default: z.number().positive().default(DEFAULTS.DEFAULT_ANTHROPIC_MAX_TOKENS),
  }).optional().default({
    api_version: DEFAULTS.DEFAULT_ANTHROPIC_API_VERSION,
    default_model: DEFAULTS.DEFAULT_ANTHROPIC_MODEL,
    max_tokens_default: DEFAULTS.DEFAULT_ANTHROPIC_MAX_TOKENS,
  }),
  /** MCP (Model Context Protocol) server configuration */
  mcp: MCPConfigSchema.optional().default({
    enabled: DEFAULTS.DEFAULT_MCP_ENABLED,
    transport: DEFAULTS.DEFAULT_MCP_TRANSPORT as "stdio",
    server_name: DEFAULTS.DEFAULT_MCP_SERVER_NAME,
    version: DEFAULTS.DEFAULT_MCP_VERSION,
  }),
  /** MCP defaults */
  mcp_defaults: z.object({
    agent_id: z.string().default(DEFAULTS.DEFAULT_MCP_AGENT_ID),
  }).optional().default({
    agent_id: DEFAULTS.DEFAULT_MCP_AGENT_ID,
  }),
  /** Git operations configuration */
  git: z.object({
    branch_prefix_pattern: z.string().default(DEFAULTS.DEFAULT_GIT_BRANCH_PREFIX_PATTERN),
    allowed_prefixes: z.array(z.string()).default(DEFAULTS.DEFAULT_GIT_ALLOWED_PREFIXES),
  }).optional().default({
    branch_prefix_pattern: DEFAULTS.DEFAULT_GIT_BRANCH_PREFIX_PATTERN,
    allowed_prefixes: DEFAULTS.DEFAULT_GIT_ALLOWED_PREFIXES,
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface PortalConfig {
  alias: string;
  target_path: string;
  created?: string;
}
