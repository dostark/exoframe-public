/**
 * EventLogger - Unified Event Logging Service
 * Implements Step 5.10 of the ExoFrame Implementation Plan
 *
 * Responsibilities:
 * 1. Write events to both console and Activity Journal
 * 2. Provide consistent log levels (info, warn, error, debug)
 * 3. Format console output with icons and indentation
 * 4. Handle database failures gracefully (fallback to console-only)
 * 5. Support child loggers with inherited defaults
 * 6. Resolve user identity from git config or OS username
 *
 * Required Deno permissions:
 * - --allow-run=git: To resolve user identity from git config
 * - --allow-env=USER: Fallback for OS username
 */

import type { DatabaseService } from "./db.ts";

// ============================================================================
// Types and Interfaces
// ============================================================================

export type LogLevel = "info" | "warn" | "error" | "debug";

/**
 * Actor types:
 * - "system" - Daemon, watcher, internal services
 * - "agent:<id>" - AI agent (e.g., "agent:senior-coder", "agent:request-processor")
 * - "<user>" - Human user identity from git config or OS (e.g., "john@example.com", "jdoe")
 */
export type Actor = string;

/**
 * Structured log event
 */
export interface LogEvent {
  /** Action type in domain.action format (e.g., "daemon.started") */
  action: string;

  /** Target entity (file path, service name, etc.) */
  target: string;

  /** Additional context as key-value pairs */
  payload?: Record<string, unknown>;

  /**
   * Actor performing the action:
   * - "system" for daemon/services
   * - "agent:<id>" for AI agents (e.g., "agent:senior-coder")
   * - User identity for humans (e.g., "john@example.com" from git, or OS username)
   */
  actor?: Actor;

  /** Trace ID for correlation */
  traceId?: string;

  /** Agent ID for agent-specific events */
  agentId?: string;

  /** Log level for console output */
  level?: LogLevel;

  /** Custom emoji/icon for console output */
  icon?: string;
}

/**
 * Configuration for EventLogger
 */
export interface EventLoggerConfig {
  /** DatabaseService instance (optional - allows console-only mode) */
  db?: DatabaseService;

  /** Prefix for console messages (e.g., "[ExoFrame]") */
  prefix?: string;

  /** Minimum log level to output */
  minLevel?: LogLevel;

  /** Whether to include timestamps in console output */
  showTimestamp?: boolean;

  /**
   * Default actor identity. For CLI commands, this should be the user identity
   * obtained from git config (user.email) or OS username.
   */
  defaultActor?: Actor;
}

// ============================================================================
// Implementation
// ============================================================================

/** Log level priority for filtering */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Default icons for each log level */
const DEFAULT_ICONS: Record<LogLevel, string> = {
  info: "✅",
  warn: "⚠️",
  error: "❌",
  debug: "🔍",
};

/** Cached user identity to avoid repeated git calls */
let cachedUserIdentity: string | null = null;

/**
 * Unified logging service that writes to both console and Activity Journal.
 *
 * @example
 * ```typescript
 * const logger = new EventLogger({ db: dbService, prefix: "[ExoFrame]" });
 *
 * // Basic usage
 * logger.info("config.loaded", "exo.config.toml", { checksum: "abc123" });
 *
 * // Create child logger for a service
 * const serviceLogger = logger.child({ actor: "system", traceId });
 * serviceLogger.warn("context.truncated", "loader", { files_skipped: 3 });
 * ```
 */
export class EventLogger {
  private readonly db?: DatabaseService;
  private readonly prefix: string;
  private readonly minLevel: LogLevel;
  private readonly showTimestamp: boolean;
  private readonly defaultActor: Actor;
  private readonly defaults: Partial<LogEvent>;

  constructor(config: EventLoggerConfig, defaults: Partial<LogEvent> = {}) {
    this.db = config.db;
    this.prefix = config.prefix ?? "";
    this.minLevel = config.minLevel ?? "info";
    this.showTimestamp = config.showTimestamp ?? false;
    this.defaultActor = config.defaultActor ?? "system";
    this.defaults = defaults;
  }

  /**
   * Log an event to both console and Activity Journal
   */
  log(event: LogEvent): void {
    const level = event.level ?? "info";

    // Check if this level should be logged
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    // Merge with defaults
    const mergedEvent: LogEvent = {
      ...this.defaults,
      ...event,
      actor: event.actor ?? this.defaults.actor ?? this.defaultActor,
      traceId: event.traceId ?? this.defaults.traceId ?? crypto.randomUUID(),
    };

    // Log to console
    this.logToConsole(mergedEvent, level);

    // Log to Activity Journal
    this.logToDatabase(mergedEvent);
  }

  /**
   * Log an info-level event
   */
  info(action: string, target: string, payload?: Record<string, unknown>): void {
    this.log({ action, target, payload, level: "info" });
  }

  /**
   * Log a warning-level event
   */
  warn(action: string, target: string, payload?: Record<string, unknown>): void {
    this.log({ action, target, payload, level: "warn" });
  }

  /**
   * Log an error-level event
   */
  error(action: string, target: string, payload?: Record<string, unknown>): void {
    this.log({ action, target, payload, level: "error" });
  }

  /**
   * Log a debug-level event
   */
  debug(action: string, target: string, payload?: Record<string, unknown>): void {
    this.log({ action, target, payload, level: "debug" });
  }

  /**
   * Create a child logger with preset values (e.g., for a specific service)
   */
  child(defaults: Partial<LogEvent>): EventLogger {
    const mergedDefaults: Partial<LogEvent> = {
      ...this.defaults,
      ...defaults,
    };

    const childConfig: EventLoggerConfig = {
      db: this.db,
      prefix: this.prefix,
      minLevel: this.minLevel,
      showTimestamp: this.showTimestamp,
      defaultActor: this.defaultActor,
    };

    return new EventLogger(childConfig, mergedDefaults);
  }

  /**
   * Get user identity from git config or OS username.
   * Results are cached after first call.
   */
  static async getUserIdentity(): Promise<string> {
    if (cachedUserIdentity) {
      return cachedUserIdentity;
    }

    // Try git config user.email
    try {
      const command = new Deno.Command("git", {
        args: ["config", "user.email"],
        stdout: "piped",
        stderr: "null",
      });
      const { code, stdout } = await command.output();
      if (code === 0) {
        const email = new TextDecoder().decode(stdout).trim();
        if (email) {
          cachedUserIdentity = email;
          return email;
        }
      }
    } catch {
      // git not available, continue to fallbacks
    }

    // Try git config user.name
    try {
      const command = new Deno.Command("git", {
        args: ["config", "user.name"],
        stdout: "piped",
        stderr: "null",
      });
      const { code, stdout } = await command.output();
      if (code === 0) {
        const name = new TextDecoder().decode(stdout).trim();
        if (name) {
          cachedUserIdentity = name;
          return name;
        }
      }
    } catch {
      // git not available, continue to fallbacks
    }

    // Fallback to OS username
    const osUser = Deno.env.get("USER") ?? Deno.env.get("USERNAME") ?? "unknown";
    cachedUserIdentity = osUser;
    return osUser;
  }

  /**
   * Clear cached user identity (mainly for testing)
   */
  static clearIdentityCache(): void {
    cachedUserIdentity = null;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Format and log event to console
   */
  private logToConsole(event: LogEvent, level: LogLevel): void {
    const icon = event.icon ?? DEFAULT_ICONS[level];
    const timestamp = this.showTimestamp ? this.formatTimestamp() + " " : "";
    const prefix = this.prefix ? this.prefix + " " : "";

    // Build main message line
    const mainLine = `${timestamp}${icon} ${event.action}: ${event.target}`;

    // Select appropriate console method
    const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;

    consoleFn(prefix + mainLine);

    // Log payload values indented
    if (event.payload && Object.keys(event.payload).length > 0) {
      for (const [key, value] of Object.entries(event.payload)) {
        const valueStr = typeof value === "object" ? JSON.stringify(value) : String(value);
        consoleFn(`   ${key}: ${valueStr}`);
      }
    }
  }

  /**
   * Log event to Activity Journal database
   */
  private logToDatabase(event: LogEvent): void {
    if (!this.db) {
      return; // Console-only mode
    }

    try {
      this.db.logActivity(
        event.actor ?? this.defaultActor,
        event.action,
        event.target,
        event.payload ?? {},
        event.traceId,
        event.agentId ?? null,
      );
    } catch (error) {
      // Database write failed - log warning but don't crash
      console.warn(`[EventLogger] Failed to write to Activity Journal:`, error);
    }
  }

  /**
   * Format current timestamp for console output
   */
  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString().slice(11, 19); // HH:MM:SS
  }
}
