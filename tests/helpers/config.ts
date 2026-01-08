import type { Config } from "../../src/config/schema.ts";
import { ConfigService } from "../../src/config/service.ts";
import { join } from "@std/path";
import * as DEFAULTS from "../../src/config/constants.ts";

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
      sqlite: {
        journal_mode: "WAL",
        foreign_keys: true,
        busy_timeout_ms: 5000,
      },
    },
    watcher: {
      debounce_ms: overrides.watcher?.debounce_ms ?? 200,
      stability_check: overrides.watcher?.stability_check ?? true,
    },
    agents: {
      default_model: "default",
      timeout_sec: 60,
      max_iterations: 10,
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
    // Added fields required by Config schema
    ai_endpoints: overrides.ai_endpoints || {},
    ai_retry: overrides.ai_retry || {
      max_attempts: DEFAULTS.DEFAULT_AI_RETRY_MAX_ATTEMPTS,
      backoff_base_ms: DEFAULTS.DEFAULT_AI_RETRY_BACKOFF_BASE_MS,
      timeout_per_request_ms: DEFAULTS.DEFAULT_AI_RETRY_TIMEOUT_PER_REQUEST_MS,
    },
    ai_anthropic: overrides.ai_anthropic || {
      api_version: DEFAULTS.DEFAULT_ANTHROPIC_API_VERSION,
      default_model: DEFAULTS.DEFAULT_ANTHROPIC_MODEL,
      max_tokens_default: DEFAULTS.DEFAULT_ANTHROPIC_MAX_TOKENS,
    },
    mcp_defaults: overrides.mcp_defaults || {
      agent_id: DEFAULTS.DEFAULT_MCP_AGENT_ID,
    },
    git: overrides.git || {
      branch_prefix_pattern: DEFAULTS.DEFAULT_GIT_BRANCH_PREFIX_PATTERN,
      allowed_prefixes: DEFAULTS.DEFAULT_GIT_ALLOWED_PREFIXES,
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

[database.sqlite]
journal_mode = "WAL"
foreign_keys = true
busy_timeout_ms = 5000

[watcher]
debounce_ms = 200
stability_check = true

[agents]
default_model = "default"
timeout_sec = 60
  max_iterations = 10

[models.default]
provider = "mock"
model = "gpt-5.2-pro"

[models.fast]
provider = "mock"
model = "gpt-5.2-pro-mini"

[models.local]
provider = "ollama"
model = "llama3.2"

  [ai_endpoints]
  ollama = ""
  anthropic = ""
  openai = ""
  google = ""

  [ai_retry]
  max_attempts = 3
  backoff_base_ms = 1000
  timeout_per_request_ms = 30000

  [ai_anthropic]
  api_version = "2023-06-01"
  default_model = "claude-opus-4.5"
  max_tokens_default = 4096

  [mcp_defaults]
  agent_id = "system"

  [git]
  branch_prefix_pattern = "^(feat|fix|docs|chore|refactor|test)/"
  allowed_prefixes = ["feat", "fix", "docs", "chore", "refactor", "test"]
`;

  await Deno.writeTextFile(configPath, configContent);

  // Create service with absolute path
  const service = new ConfigService(configPath);

  return service;
}
