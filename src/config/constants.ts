/**
 * Configuration constants and defaults
 * Central location for all magic numbers used throughout ExoFrame
 */

// ============================================================================
// Database Defaults
// ============================================================================
export const DEFAULT_DATABASE_BATCH_FLUSH_MS = 100;
export const DEFAULT_DATABASE_BATCH_MAX_SIZE = 100;
export const DEFAULT_DATABASE_BUSY_TIMEOUT_MS = 5000;
export const DEFAULT_DATABASE_JOURNAL_MODE = "WAL";
export const DEFAULT_DATABASE_FOREIGN_KEYS = true;

// ============================================================================
// File Watcher Defaults
// ============================================================================
export const DEFAULT_WATCHER_DEBOUNCE_MS = 200;
export const DEFAULT_WATCHER_STABILITY_CHECK = true;

// ============================================================================
// Agent Defaults
// ============================================================================
export const DEFAULT_AGENT_TIMEOUT_SEC = 60;
export const DEFAULT_AGENT_MAX_ITERATIONS = 10;
export const DEFAULT_AGENT_MODEL = "default";

// ============================================================================
// AI/LLM Provider Defaults
// ============================================================================
export const DEFAULT_AI_TIMEOUT_MS = 30000;
export const DEFAULT_AI_RETRY_MAX_ATTEMPTS = 3;
export const DEFAULT_AI_RETRY_BACKOFF_BASE_MS = 1000;
export const DEFAULT_AI_RETRY_TIMEOUT_PER_REQUEST_MS = 30000;

// Model-specific timeout defaults
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

// ============================================================================
// Anthropic-Specific Defaults
// ============================================================================
export const DEFAULT_ANTHROPIC_API_VERSION = "2023-06-01";
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4.5";
export const DEFAULT_ANTHROPIC_MAX_TOKENS = 4096;

// ============================================================================
// MCP Defaults
// ============================================================================
export const DEFAULT_MCP_ENABLED = true;
export const DEFAULT_MCP_TRANSPORT = "stdio";
export const DEFAULT_MCP_SERVER_NAME = "exoframe";
export const DEFAULT_MCP_VERSION = "1.0.0";
export const DEFAULT_MCP_AGENT_ID = "system";

// ============================================================================
// Git Defaults
// ============================================================================
export const DEFAULT_GIT_BRANCH_PREFIX_PATTERN = "^(feat|fix|docs|chore|refactor|test)/";
export const DEFAULT_GIT_ALLOWED_PREFIXES = ["feat", "fix", "docs", "chore", "refactor", "test"];

// ============================================================================
// Subprocess/Git Operation Defaults
// ============================================================================
export const DEFAULT_SUBPROCESS_TIMEOUT_MS = 30000;
export const DEFAULT_GIT_STATUS_TIMEOUT_MS = 10000;
export const DEFAULT_GIT_REVERT_CONCURRENCY_LIMIT = 5;
export const DEFAULT_GIT_LS_FILES_TIMEOUT_MS = 5000;
export const DEFAULT_GIT_CHECKOUT_TIMEOUT_MS = 10000;
export const DEFAULT_GIT_CLEAN_TIMEOUT_MS = 5000;
export const DEFAULT_GIT_LOG_TIMEOUT_MS = 5000;
export const DEFAULT_GIT_DIFF_TIMEOUT_MS = 10000;

// ============================================================================
// API Endpoint Defaults
// ============================================================================
export const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434/api/generate";
export const DEFAULT_ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
export const DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
export const DEFAULT_GOOGLE_ENDPOINT = "https://generativelanguage.googleapis.com/v1/models";
