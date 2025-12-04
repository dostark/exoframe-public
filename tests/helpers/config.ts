import type { Config } from "../../src/config/schema.ts";
import { ConfigService } from "../../src/config/service.ts";
import { join } from "@std/path";

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
    database: {
      batch_flush_ms: 100,
      batch_max_size: 100,
      ...overrides.database,
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
    portals: overrides.portals || [],
    mcp: overrides.mcp || {
      enabled: true,
      transport: "stdio",
      server_name: "exoframe",
      version: "1.0.0",
    },
  };
}

/**
 * Creates a test config file and ConfigService for testing
 */
export async function createTestConfigService(root: string): Promise<ConfigService> {
  const configPath = join(root, "exo.config.toml");

  const configContent = `[system]
version = "1.0.0"
log_level = "info"
root = "${root}"

[paths]
knowledge = "Knowledge"
blueprints = "Blueprints"
system = "System"

[database]
batch_flush_ms = 100
batch_max_size = 100

[watcher]
debounce_ms = 200
stability_check = true

[agents]
default_model = "gpt-4o"
timeout_sec = 60
`;

  await Deno.writeTextFile(configPath, configContent);

  // Create service with absolute path
  const service = new ConfigService(configPath);

  return service;
}
