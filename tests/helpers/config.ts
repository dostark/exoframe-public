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
      workspace: "Workspace",
      runtime: ".exo",
      memory: "Memory",
      blueprints: "Blueprints",
      portals: "Portals",
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
      default_model: "default",
      timeout_sec: 60,
      ...overrides.agents,
    },
    models: overrides.models || {
      default: { provider: "mock", model: "gpt-5.2-pro", timeout_ms: 30000 },
      fast: { provider: "mock", model: "gpt-5.2-pro-mini", timeout_ms: 30000 },
      local: { provider: "ollama", model: "llama3.2", timeout_ms: 30000 },
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
memory = "Memory"
blueprints = "Blueprints"
runtime = ".exo"
portals = "Portals"
workspace = "Workspace"

[database]
batch_flush_ms = 100
batch_max_size = 100

[watcher]
debounce_ms = 200
stability_check = true

[agents]
default_model = "default"
timeout_sec = 60

[models.default]
provider = "mock"
model = "gpt-5.2-pro"

[models.fast]
provider = "mock"
model = "gpt-5.2-pro-mini"

[models.local]
provider = "ollama"
model = "llama3.2"
`;

  await Deno.writeTextFile(configPath, configContent);

  // Create service with absolute path
  const service = new ConfigService(configPath);

  return service;
}
