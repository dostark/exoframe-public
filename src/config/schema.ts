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
  agents: z.object({
    default_model: z.string().default("gpt-4o"),
    timeout_sec: z.number().default(60),
  }).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
