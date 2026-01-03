import { z } from "zod";
import { AiConfigSchema } from "./ai_config.ts";
import { MCPConfigSchema } from "../schemas/mcp.ts";

export const ConfigSchema = z.object({
  system: z.object({
    root: z.string().default(Deno.cwd()),
    log_level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    version: z.string().optional(),
  }),
  paths: z.object({
    inbox: z.string().default("Inbox"),
    system: z.string().default("System"),
    blueprints: z.string().default("Blueprints"),
    memory: z.string().default("Memory"),
  }),
  database: z.object({
    batch_flush_ms: z.number().min(10).max(10000).default(100),
    batch_max_size: z.number().min(1).max(1000).default(100),
  }).default({
    batch_flush_ms: 100,
    batch_max_size: 100,
  }),
  watcher: z.object({
    debounce_ms: z.number().min(50).max(5000).default(200),
    stability_check: z.boolean().default(true),
  }).default({
    debounce_ms: 200,
    stability_check: true,
  }),
  agents: z.object({
    default_model: z.string().default("default"),
    timeout_sec: z.number().min(1).max(300).default(60),
  }).default({
    default_model: "default",
    timeout_sec: 60,
  }),
  portals: z.array(z.object({
    alias: z.string(),
    target_path: z.string(),
    created: z.string().optional(),
  })).default([]),
  /** AI/LLM provider configuration (legacy/single) */
  ai: AiConfigSchema.optional(),
  /** Named model configurations (default, fast, local, etc.) */
  models: z.record(AiConfigSchema).default({
    default: { provider: "mock", model: "mock-model" },
    fast: { provider: "mock", model: "mock-fast" },
    local: { provider: "ollama", model: "llama3.2" },
  }),
  /** MCP (Model Context Protocol) server configuration */
  mcp: MCPConfigSchema.optional().default({
    enabled: true,
    transport: "stdio",
    server_name: "exoframe",
    version: "1.0.0",
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface PortalConfig {
  alias: string;
  target_path: string;
  created?: string;
}
