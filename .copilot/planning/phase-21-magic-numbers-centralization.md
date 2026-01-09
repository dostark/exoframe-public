Based on the commit `a5f3190` - "config: centralize magic numbers and make runtime settings configurable", here's the ready-to-copy planning document:

```markdown
# Phase 2.1: Configuration Refactoring - Magic Numbers Centralization

## Document Information
- **Date**: January 9, 2026
- **Status**: ✅ Completed
- **Priority**: High
- **Related Commits**: `a5f3190`
- **Files Changed**: 40 files (+676, -170 lines)

## Overview
Centralized all hardcoded runtime "magic numbers" (debounce times, retry/backoff values, default timeouts, database tuning parameters, etc.) into a single source of truth, making the system more configurable, discoverable, and easier to tune for different deployment environments.

---

## Motivation

Previously, important runtime configuration values were scattered as inline magic numbers across the codebase:
- Debounce times (200ms)
- Retry/backoff values (2000ms, 1000ms)
- Default timeouts (30000ms, 60000ms)
- Database tuning parameters (batch sizes: 100, flush intervals: 100ms)
- AI provider endpoints
- Model presets and retry strategies

This made behavior:
- **Harder to tune** - required code changes instead of config updates
- **Less discoverable** - no central place to see available tunables
- **Brittle for tests** - hardcoded values made test setup inflexible
- **Difficult to deploy** - different environments needed code modifications

---

## Changes Implemented

### ✅ 1. Created Central Constants File
**File**: `src/config/constants.ts` (NEW, +77 lines)

Created single source of truth for all default values organized by category:

#### Database Defaults
```typescript
export const DEFAULT_DATABASE_BATCH_FLUSH_MS = 100;
export const DEFAULT_DATABASE_BATCH_MAX_SIZE = 100;
export const DEFAULT_DATABASE_BUSY_TIMEOUT_MS = 5000;
export const DEFAULT_DATABASE_JOURNAL_MODE = "WAL";
export const DEFAULT_DATABASE_FOREIGN_KEYS = true;
```

#### File Watcher Defaults
```typescript
export const DEFAULT_WATCHER_DEBOUNCE_MS = 200;
export const DEFAULT_WATCHER_STABILITY_CHECK = true;
```

#### Agent Defaults
```typescript
export const DEFAULT_AGENT_TIMEOUT_SEC = 60;
export const DEFAULT_AGENT_MAX_ITERATIONS = 10;
export const DEFAULT_AGENT_MODEL = "default";
```

#### AI/LLM Provider Defaults
```typescript
export const DEFAULT_AI_TIMEOUT_MS = 30000;
export const DEFAULT_AI_RETRY_MAX_ATTEMPTS = 3;
export const DEFAULT_AI_RETRY_BACKOFF_BASE_MS = 1000;
export const DEFAULT_AI_RETRY_TIMEOUT_PER_REQUEST_MS = 30000;

// Model-specific timeouts
export const DEFAULT_MODEL_TIMEOUT_MS = 30000;
export const DEFAULT_FAST_MODEL_TIMEOUT_MS = 15000;
export const DEFAULT_LOCAL_MODEL_TIMEOUT_MS = 60000;

// Provider-specific retry defaults
export const DEFAULT_OLLAMA_RETRY_MAX_ATTEMPTS = 3;
export const DEFAULT_OLLAMA_RETRY_BACKOFF_MS = 1000;
export const DEFAULT_ANTHROPIC_RETRY_MAX_ATTEMPTS = 5;
export const DEFAULT_ANTHROPIC_RETRY_BACKOFF_MS = 2000;
export const DEFAULT_OPENAI_RETRY_MAX_ATTEMPTS = 3;
export const DEFAULT_OPENAI_RETRY_BACKOFF_MS = 1000;
```

#### Anthropic-Specific Defaults
```typescript
export const DEFAULT_ANTHROPIC_API_VERSION = "2023-06-01";
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4.5";
export const DEFAULT_ANTHROPIC_MAX_TOKENS = 4096;
```

#### MCP Defaults
```typescript
export const DEFAULT_MCP_ENABLED = true;
export const DEFAULT_MCP_TRANSPORT = "stdio";
export const DEFAULT_MCP_SERVER_NAME = "exoframe";
export const DEFAULT_MCP_VERSION = "1.0.0";
export const DEFAULT_MCP_AGENT_ID = "system";
```

#### Git Defaults
```typescript
export const DEFAULT_GIT_BRANCH_PREFIX_PATTERN = "^(feat|fix|docs|chore|refactor|test)/";
export const DEFAULT_GIT_ALLOWED_PREFIXES = ["feat", "fix", "docs", "chore", "refactor", "test"];
```

#### API Endpoint Defaults
```typescript
export const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434/api/generate";
export const DEFAULT_ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
export const DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
export const DEFAULT_GOOGLE_ENDPOINT = "https://generativelanguage.googleapis.com/v1/models";
```

**Status**: ✅ Completed

---

### ✅ 2. Extended Configuration Schema
**File**: `src/config/schema.ts` (+101, -20 lines)

Added extensive configuration sections to expose previously hardcoded values:

#### Database Configuration
- Added `database.sqlite` section with journal_mode, foreign_keys, busy_timeout_ms
- All database parameters now use constants as defaults

#### Watcher Configuration
- Exposed debounce_ms and stability_check with constant defaults

#### Agent Configuration
- Added max_iterations field (default: 10)
- Timeout and model settings now use constants

#### AI Endpoints Configuration
```typescript
ai_endpoints: z.object({
  ollama: z.string().optional(),
  anthropic: z.string().optional(),
  openai: z.string().optional(),
  google: z.string().optional(),
})
```

#### AI Retry Configuration
```typescript
ai_retry: z.object({
  max_attempts: z.number().min(1).max(10).default(DEFAULT_AI_RETRY_MAX_ATTEMPTS),
  backoff_base_ms: z.number().min(100).max(10000).default(DEFAULT_AI_RETRY_BACKOFF_BASE_MS),
  timeout_per_request_ms: z.number().min(1000).max(300000).default(...),
  ollama: z.object({ max_attempts, backoff_base_ms }),
  anthropic: z.object({ max_attempts, backoff_base_ms }),
  openai: z.object({ max_attempts, backoff_base_ms }),
})
```

#### Anthropic-Specific Configuration
```typescript
ai_anthropic: z.object({
  api_version: z.string().default(DEFAULT_ANTHROPIC_API_VERSION),
  default_model: z.string().default(DEFAULT_ANTHROPIC_MODEL),
  max_tokens_default: z.number().positive().default(DEFAULT_ANTHROPIC_MAX_TOKENS),
})
```

#### MCP Defaults
```typescript
mcp_defaults: z.object({
  agent_id: z.string().default(DEFAULT_MCP_AGENT_ID),
})
```

#### Git Configuration
```typescript
git: z.object({
  branch_prefix_pattern: z.string().default(DEFAULT_GIT_BRANCH_PREFIX_PATTERN),
  allowed_prefixes: z.array(z.string()).default(DEFAULT_GIT_ALLOWED_PREFIXES),
})
```

#### Model Presets
- Enhanced model configurations with timeout_ms, max_tokens, temperature, base_url
- All model presets now use appropriate timeout constants

**Status**: ✅ Completed

---

### ✅ 3. Updated AI Provider Implementations
**Files**: `src/ai/providers/*.ts` (4 files updated)

All provider implementations now:
- Accept richer option objects including config parameter
- Read endpoint URLs from config or constants
- Read retry settings (max_attempts, backoff_base_ms) from config or constants
- Use configurable model defaults
- Support per-provider configuration overrides

#### OpenAI Provider (`openai_provider.ts`, +44, -22 lines)
```typescript
export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  id?: string;
  logger?: EventLogger;
  retryDelayMs?: number;
  maxRetries?: number;
  baseUrl?: string;
  config?: Config;  // NEW: accepts config for defaults
}

constructor(options: OpenAIProviderOptions) {
  // Read base URL from config or use default
  this.baseUrl = options.baseUrl ||
    options.config?.ai_endpoints?.openai ||
    DEFAULTS.DEFAULT_OPENAI_ENDPOINT;

  // Read retry settings from config or use defaults
  this.retryDelayMs = options.retryDelayMs ||
    options.config?.ai_retry?.openai?.backoff_base_ms ||
    DEFAULTS.DEFAULT_OPENAI_RETRY_BACKOFF_MS;

  this.maxRetries = options.maxRetries ||
    options.config?.ai_retry?.openai?.max_attempts ||
    DEFAULTS.DEFAULT_OPENAI_RETRY_MAX_ATTEMPTS;
}
```

#### Anthropic Provider (`anthropic_provider.ts`, +57, -13 lines)
- Added AnthropicProviderOptions interface
- Reads model, base URL, API version, retry settings from config
- Uses DEFAULTS constants as fallbacks
- Supports api_version configuration

#### Google Provider (`google_provider.ts`, +52, -22 lines)
- Added GoogleProviderOptions interface
- Reads endpoint and retry settings from config
- Uses Google-specific or general retry defaults

#### Llama Provider (`llama_provider.ts`, +26, -2 lines)
- Added config support for Ollama endpoint
- Reads retry settings from config or environment
- Uses Ollama-specific defaults

**Status**: ✅ Completed

---

### ✅ 4. Updated Provider Factory
**File**: `src/ai/provider_factory.ts` (+35, -27 lines)

Enhanced `resolveOptions` method to:
- Accept model-level config parameter (from config.models[name])
- Merge model config with global AI config
- Use constants for all default values
- Provide fully resolved provider options with guaranteed timeoutMs

```typescript
private static resolveOptions(
  config: Config,
  modelConfig?: Record<string, any> | Partial<AiConfig>,
): ResolvedProviderOptions {
  // Merge model-level config with base AI config
  const baseAi: AiConfig = (config.ai as AiConfig) ?? {
    provider: "mock",
    timeout_ms: DEFAULTS.DEFAULT_AI_TIMEOUT_MS,
  };

  const merged: Partial<AiConfig> = {
    ...baseAi,
    ...(modelConfig ?? {}),
  };

  // Resolve with constants as final fallback
  const timeoutMs = envTimeout ? parseInt(envTimeout, 10) :
    (merged.timeout_ms ?? DEFAULTS.DEFAULT_AI_TIMEOUT_MS);
}
```

**Status**: ✅ Completed

---

### ✅ 5. Updated Config Parsing
**File**: `src/services/tool_registry.ts` (+12, -20 lines)

Simplified tool registry initialization to use ConfigSchema defaults:

```typescript
constructor(options?: ToolRegistryConfig) {
  // Use ConfigSchema to parse and apply all defaults automatically
  this.config = options?.config || ConfigSchema.parse({
    system: { root: Deno.cwd(), log_level: "info" },
    paths: {},       // Will use schema defaults
    database: {},    // Will use schema defaults
    watcher: {},     // Will use schema defaults
    agents: {},      // Will use schema defaults including max_iterations
    models: {},      // Will use schema defaults
    portals: [],
    mcp: {},         // Will use schema defaults
  });
}
```

**Status**: ✅ Completed

---

### ✅ 6. Enhanced Sample Configuration
**File**: `templates/exo.config.sample.toml` (+92, -6 lines)

Enriched sample configuration with:
- Comprehensive documentation header with configurable magic numbers reference
- All timing values clearly documented in milliseconds
- Explicit sections for:
  - Database SQLite tuning (journal_mode, foreign_keys, busy_timeout_ms)
  - Agent max_iterations
  - AI endpoint overrides for all providers
  - Per-provider retry configuration (ollama, anthropic, openai)
  - Anthropic-specific settings (api_version, default_model, max_tokens_default)
  - Per-model preset configuration (timeout_ms, max_tokens, temperature)
  - MCP defaults (agent_id)
  - Git constraints (branch_prefix_pattern, allowed_prefixes)

**Status**: ✅ Completed

---

### ✅ 7. Updated Test Helpers and Fixtures
**Files**:
- `tests/helpers/config.ts` (+57, -5 lines)
- `tests/ai/provider_factory_test.ts` (+33, -12 lines)

Updated test helpers to:
- Use constants for all default values
- Supply all required config fields (ai_endpoints, ai_retry, ai_anthropic, mcp_defaults, git)
- Include proper defaults in mock configurations
- Update assertions to match new configurable defaults

**Status**: ✅ Completed

---

### ✅ 8. Added Developer Utilities
**File**: `scripts/debug_watcher.ts` (NEW, +26 lines)

Created developer debug script to reproduce FileWatcher behavior locally:
- Uses watcher test helpers
- Demonstrates file change detection
- Useful for debugging debounce and stability check behavior

**Status**: ✅ Completed

---

### ✅ 9. Added Re-export Shims for Blueprint Flows
**Files**: `Blueprints/Flows/*/define_flow.ts` (5 new files, 22 flow files updated)

Added local re-export shims so Blueprint example flows can import relative paths:
- `Blueprints/Flows/define_flow.ts`
- `Blueprints/Flows/examples/analysis/define_flow.ts`
- `Blueprints/Flows/examples/content/define_flow.ts`
- `Blueprints/Flows/examples/development/define_flow.ts`
- `Blueprints/Flows/examples/operations/define_flow.ts`
- `Blueprints/Flows/templates/define_flow.ts`
- `Blueprints/src/flows/define_flow.ts`

Changed all flow imports from:
```typescript
import { defineFlow } from "../../src/flows/define_flow.ts";
```

To:
```typescript
import { defineFlow } from "./define_flow.ts";
```

This makes example flows portable and easier to copy without breaking imports.

**Status**: ✅ Completed

---

## Testing

✅ **Test Suite Status**: All tests passed in local runs
- Updated provider-focused tests with new defaults
- Updated watcher-focused tests with configurable debounce
- Corrected test helpers to supply required config fields
- Repository test suite success confirmed

---

## Migration Notes / Backwards Compatibility

✅ **Fully Backwards Compatible**

Existing installations that rely on hard-coded behavior continue to work because:
- Code uses the previous sensible defaults (now centralized) when config values are not set
- All constants match previous inline values
- Config schema provides defaults for all new fields
- No breaking API changes

### To Customize Behavior
Users can now add new configuration keys to `exo.config.toml` or use environment overrides (where applicable) without modifying code.

---

