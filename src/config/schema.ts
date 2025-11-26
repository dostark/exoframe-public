import { z } from "zod";

export const ConfigSchema = z.object({
  system: z.object({
    root: z.string().default(Deno.cwd()),
    log_level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    version: z.string().optional(),
  }),
  paths: z.object({
    inbox: z.string().default("Inbox"),
    knowledge: z.string().default("Knowledge"),
    system: z.string().default("System"),
    blueprints: z.string().default("Blueprints"),
  }),
  database: z.object({
    batch_flush_ms: z.number().min(10).max(10000).default(100),
    batch_max_size: z.number().min(1).max(1000).default(100),
  }).default({}),
  watcher: z.object({
    debounce_ms: z.number().min(50).max(5000).default(200),
    stability_check: z.boolean().default(true),
  }).default({}),
  agents: z.object({
    default_model: z.string().default("gpt-4o"),
    timeout_sec: z.number().min(1).max(300).default(60),
  }).default({}),
  portals: z.array(z.object({
    alias: z.string(),
    target_path: z.string(),
    created: z.string().optional(),
  })).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface PortalConfig {
  alias: string;
  target_path: string;
  created?: string;
}
