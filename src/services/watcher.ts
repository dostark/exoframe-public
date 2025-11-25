import { join } from "@std/path";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";

/**
 * Event emitted when a stable file is detected
 */
export interface FileReadyEvent {
  path: string;
  content: string;
}

/**
 * FileWatcher - Monitors a directory for file changes with debouncing and stability verification
 *
 * Implements Step 2.1 of the Implementation Plan:
 * - Stage 1: Debounces file system events (default 200ms)
 * - Stage 2: Verifies file stability using exponential backoff
 */
export class FileWatcher {
  private watchPath: string;
  private debounceMs: number;
  private stabilityCheck: boolean;
  private debounceTimers: Map<string, number> = new Map();
  private onFileReady: (event: FileReadyEvent) => void | Promise<void>;
  private abortController: AbortController | null = null;
  private fsWatcher: Deno.FsWatcher | null = null;
  private db?: DatabaseService;

  constructor(
    config: Config,
    onFileReady: (event: FileReadyEvent) => void | Promise<void>,
    db?: DatabaseService,
  ) {
    this.watchPath = join(config.system.root, config.paths.inbox, "Requests");
    this.debounceMs = config.watcher.debounce_ms;
    this.stabilityCheck = config.watcher.stability_check;
    this.onFileReady = onFileReady;
    this.db = db;
  }

  /**
   * Start watching the directory
   */
  async start() {
    this.abortController = new AbortController();

    try {
      const watcher = Deno.watchFs(this.watchPath, {
        recursive: false,
      });
      this.fsWatcher = watcher;

      console.log(`📁 Watching directory: ${this.watchPath}`);
      console.log(`   Debounce: ${this.debounceMs}ms | Stability Check: ${this.stabilityCheck}`);

      // Log watcher started
      this.logActivity("system", "watcher.started", this.watchPath, {
        debounce_ms: this.debounceMs,
        stability_check: this.stabilityCheck,
      });

      for await (const event of watcher) {
        if (this.abortController?.signal.aborted) {
          break;
        }

        // Only process create and modify events
        if (event.kind === "create" || event.kind === "modify") {
          for (const path of event.paths) {
            // Ignore dotfiles and non-markdown files
            const filename = path.split("/").pop() || "";
            if (filename.startsWith(".") || !filename.endsWith(".md")) {
              continue;
            }

            // Log file event detected
            this.logActivity("system", `watcher.event_${event.kind}`, path, {
              event_kind: event.kind,
            });

            this.debounceFile(path);
          }
        }
      }
    } catch (error) {
      // Log watcher error
      this.logActivity("system", "watcher.error", this.watchPath, {
        error_type: error instanceof Error ? error.constructor.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Deno.errors.NotFound) {
        console.error(`❌ Watch directory not found: ${this.watchPath}`);
        console.error(`   Create it with: mkdir -p "${this.watchPath}"`);
      } else {
        console.error("❌ Watcher error:", error);
      }
      throw error;
    }
  }

  /**
   * Stop watching
   */
  stop() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }

    // Clear all pending timers
    for (const timerId of this.debounceTimers.values()) {
      clearTimeout(timerId);
    }
    this.debounceTimers.clear();

    // Log watcher stopped
    this.logActivity("system", "watcher.stopped", this.watchPath, {});

    console.log("⏹️  File watcher stopped");
  }

  /**
   * Stage 1: Debounce file events
   */
  private debounceFile(path: string) {
    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(path);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timerId = setTimeout(() => {
      this.debounceTimers.delete(path);
      this.processFile(path);
    }, this.debounceMs);

    this.debounceTimers.set(path, timerId);
  }

  /**
   * Stage 2: Process file after debounce
   */
  private async processFile(path: string) {
    try {
      let content: string;

      if (this.stabilityCheck) {
        content = await this.readFileWhenStable(path);
      } else {
        // Skip stability check, read immediately
        content = await Deno.readTextFile(path);
      }

      // Log file ready
      this.logActivity("system", "watcher.file_ready", path, {
        content_length: content.length,
        stability_check_used: this.stabilityCheck,
      });

      // Emit event
      await this.onFileReady({ path, content });
    } catch (error) {
      // Log file processing error
      this.logActivity("system", "watcher.file_error", path, {
        error_type: error instanceof Error ? error.constructor.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error) {
        console.error(`⚠️  ${error.message}`);
      } else {
        console.error("⚠️  Unknown error processing file:", error);
      }
    }
  }

  /**
   * Read file with stability verification (exponential backoff)
   */
  private async readFileWhenStable(path: string): Promise<string> {
    const maxAttempts = 5;
    const backoffMs = [50, 100, 200, 500, 1000];

    // Stage 1: Wait for file size to stabilize (metadata only, no content reading)
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Get initial size
        const stat1 = await Deno.stat(path);

        // Wait for stability
        await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));

        // Check if size changed
        const stat2 = await Deno.stat(path);

        if (stat1.size === stat2.size && stat2.size > 0) {
          // File size is stable! Now read content once
          const content = await Deno.readTextFile(path);

          // Validate it's not empty
          if (content.trim().length > 0) {
            // Log successful stability check
            this.logActivity("system", "watcher.file_stable", path, {
              attempts: attempt + 1,
              final_size: stat2.size,
            });

            return content;
          }

          // Empty file, treat as unstable
          throw new Error(`File is empty: ${path}`);
        }

        // File still changing, retry with longer wait
        continue;
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          // File deleted between stat and read
          throw new Error(`File disappeared: ${path}`);
        }

        if (attempt === maxAttempts - 1) {
          throw error;
        }

        // Retry on other errors
        continue;
      }
    }

    // Log file never stabilized
    this.logActivity("system", "watcher.file_unstable", path, {
      max_attempts: maxAttempts,
    });

    // Emit telemetry
    console.warn(`📊 watcher.file_unstable: ${path}`);
    throw new Error(`File never stabilized: ${path}`);
  }

  /**
   * Log activity to Activity Journal
   */
  private logActivity(
    actor: string,
    actionType: string,
    target: string | null,
    payload: Record<string, unknown>,
  ): void {
    if (!this.db) {
      return;
    }

    try {
      this.db.logActivity(actor, actionType, target, payload, undefined, null);
    } catch (error) {
      console.error("[FileWatcher] Failed to log activity:", error);
    }
  }
}
