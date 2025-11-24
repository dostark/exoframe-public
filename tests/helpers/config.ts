import type { Config } from "../../src/config/schema.ts";

/**
 * Creates a mock configuration for testing.
 * @param root The root directory for the mock system.
 * @param overrides Optional overrides for specific config sections.
 */
export function createMockConfig(root: string, overrides: Partial<Config> = {}): Config {
  return {
    system: {
      root,
      log_level: "info",
      version: "1.0.0",
      ...overrides.system,
    },
    paths: {
      inbox: "Inbox",
      knowledge: "Knowledge",
      system: "System",
      blueprints: "Blueprints",
      ...overrides.paths,
    },
    watcher: {
      debounce_ms: 200,
      stability_check: true,
      ...overrides.watcher,
    },
    agents: {
      default_model: "gpt-4o",
      timeout_sec: 60,
      ...overrides.agents,
    },
    ...overrides,
  };
}
