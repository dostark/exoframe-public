/**
 * Git Service - Step 4.2 of Implementation Plan
 * Identity-aware git integration with automatic initialization and tracing
 */

import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";
import {
  DEFAULT_GIT_BRANCH_NAME_COLLISION_MAX_RETRIES,
  DEFAULT_GIT_BRANCH_SUFFIX_LENGTH,
  DEFAULT_GIT_COMMAND_TIMEOUT_MS,
  DEFAULT_GIT_EXIT_CODE_FATAL,
  DEFAULT_GIT_MAX_RETRIES,
  DEFAULT_GIT_RETRY_BACKOFF_BASE_MS,
  DEFAULT_GIT_TRACE_ID_SHORT_LENGTH,
} from "../config/constants.ts";

// ============================================================================
// Types
// ============================================================================

export interface GitServiceConfig {
  config: Config;
  db?: DatabaseService;
  traceId?: string;
  agentId?: string;
}

export interface BranchOptions {
  requestId: string;
  traceId: string;
}

export interface CommitOptions {
  message: string;
  description?: string;
  traceId: string;
}

export interface GitCommandOptions {
  throwOnError?: boolean;
  timeoutMs?: number;
  retryOnLock?: boolean;
}

// ============================================================================
// Git Error Classes
// ============================================================================

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

export class GitTimeoutError extends GitError {
  constructor(message: string) {
    super(message);
    this.name = "GitTimeoutError";
  }
}

export class GitLockError extends GitError {
  constructor(message: string) {
    super(message);
    this.name = "GitLockError";
  }
}

export class GitRepositoryError extends GitError {
  constructor(message: string) {
    super(message);
    this.name = "GitRepositoryError";
  }
}

export class GitCorruptionError extends GitError {
  constructor(message: string) {
    super(message);
    this.name = "GitCorruptionError";
  }
}

export class GitNothingToCommitError extends GitError {
  constructor(message: string) {
    super(message);
    this.name = "GitNothingToCommitError";
  }
}

// ============================================================================
// GitService Implementation
// ============================================================================

export class GitService {
  private config: Config;
  private db?: DatabaseService;
  private traceId?: string;
  private agentId?: string;
  private repoPath: string;

  constructor(options: GitServiceConfig) {
    this.config = options.config;
    this.db = options.db;
    this.traceId = options.traceId;
    this.agentId = options.agentId;
    this.repoPath = options.config.system.root;
  }

  /**
   * Ensure git repository is initialized
   */
  async ensureRepository(): Promise<void> {
    const startTime = Date.now();

    try {
      // Check if .git directory exists
      try {
        await Deno.stat(`${this.repoPath}/.git`);
        // Repository already exists
        this.logActivity("git.check", { status: "exists", duration_ms: Date.now() - startTime });
        return;
      } catch {
        // .git doesn't exist, need to initialize
      }

      // Initialize repository
      const initCmd = new Deno.Command("git", {
        args: ["init"],
        cwd: this.repoPath,
        stdout: "piped",
        stderr: "piped",
      });

      const { code, stderr } = await initCmd.output();

      if (code !== 0) {
        const error = new TextDecoder().decode(stderr);
        throw new Error(`Failed to initialize git repository: ${error}`);
      }

      // Create initial commit
      await this.createInitialCommit();

      this.logActivity("git.init", {
        success: true,
        duration_ms: Date.now() - startTime,
      });
    } catch (error) {
      this.logActivity("git.init", {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Create initial commit for new repository
   */
  private async createInitialCommit(): Promise<void> {
    // Create .gitignore
    await Deno.writeTextFile(
      `${this.repoPath}/.gitignore`,
      "Workspace/\n.exo/journal.db\n.exo/journal.db-*\n.exo/daemon.*\ndeno.lock\n",
    );

    // Stage .gitignore
    await this.runGitCommand(["add", ".gitignore"]);

    // Commit
    await this.runGitCommand([
      "commit",
      "-m",
      "Initial commit\n\n[ExoFrame: Repository initialized]",
    ]);
  }

  /**
   * Ensure git identity is configured
   */
  async ensureIdentity(): Promise<void> {
    const startTime = Date.now();

    try {
      // Check if local identity exists
      const nameResult = await this.runGitCommand(["config", "--local", "user.name"], { throwOnError: false });
      const emailResult = await this.runGitCommand(["config", "--local", "user.email"], { throwOnError: false });

      if (nameResult.output.trim() && emailResult.output.trim()) {
        // Identity already configured
        this.logActivity("git.identity_check", {
          status: "exists",
          duration_ms: Date.now() - startTime,
        });
        return;
      }

      // Configure default identity (local to this repo)
      await this.runGitCommand(["config", "--local", "user.name", "ExoFrame Bot"]);
      await this.runGitCommand(["config", "--local", "user.email", "bot@exoframe.local"]);

      this.logActivity("git.identity_configured", {
        success: true,
        user: "ExoFrame Bot",
        email: "bot@exoframe.local",
        duration_ms: Date.now() - startTime,
      });
    } catch (error) {
      this.logActivity("git.identity_configured", {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Create a feature branch with naming convention
   */
  async createBranch(options: BranchOptions): Promise<string> {
    const startTime = Date.now();

    try {
      // Ensure identity is configured before creating branch
      await this.ensureIdentity();

      // Extract first N chars of traceId for branch name
      const shortTrace = options.traceId.substring(0, DEFAULT_GIT_TRACE_ID_SHORT_LENGTH);
      const baseName = `feat/${options.requestId}-${shortTrace}`;
      let branchName = baseName;

      // Retry loop for branch creation
      const maxRetries = DEFAULT_GIT_BRANCH_NAME_COLLISION_MAX_RETRIES;
      let lastError: Error | null = null;

      for (let i = 0; i < maxRetries; i++) {
        try {
          if (i === 0) {
            // First try: check if base name exists
            const listResult = await this.runGitCommand(["branch", "--list", branchName], { throwOnError: false });
            if (listResult.output.trim()) {
              // Branch exists, try with timestamp first
              const timestamp = Date.now().toString(36);
              branchName = `${baseName}-${timestamp}`;
            }
          } else {
            // For retries, append random suffix
            const suffix = Math.random().toString(36).substring(2, DEFAULT_GIT_BRANCH_SUFFIX_LENGTH + 2);
            branchName = `${baseName}-${suffix}`;
          }

          // Create and checkout branch
          await this.runGitCommand(["checkout", "-b", branchName]);

          this.logActivity("git.branch_created", {
            success: true,
            branch: branchName,
            request_id: options.requestId,
            trace_id: options.traceId,
            duration_ms: Date.now() - startTime,
            attempts: i + 1,
          });

          return branchName;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const errorMessage = lastError.message;

          // Check if error is about existing reference
          if (
            errorMessage.includes("already exists") ||
            errorMessage.includes("cannot lock ref")
          ) {
            // Continue to next iteration to try new name
            continue;
          }

          // If other error, throw immediately
          throw lastError;
        }
      }

      throw lastError || new Error("Failed to create branch after retries");
    } catch (error) {
      this.logActivity("git.branch_created", {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Commit changes with trace_id in message footer
   */
  async commit(options: CommitOptions): Promise<string> {
    const startTime = Date.now();

    try {
      // Check if there are changes to commit
      const statusResult = await this.runGitCommand(["status", "--porcelain"]);

      if (!statusResult.output.trim()) {
        throw new Error("nothing to commit, working tree clean");
      }

      // Stage all changes
      await this.runGitCommand(["add", "."]);

      // Build commit message
      let message = options.message;

      if (options.description) {
        message += `\n\n${options.description}`;
      }

      message += `\n\n[ExoTrace: ${options.traceId}]`;

      // Commit
      await this.runGitCommand(["commit", "-m", message]);

      // Get commit SHA
      const shaResult = await this.runGitCommand(["rev-parse", "HEAD"]);
      const sha = shaResult.output.trim();

      this.logActivity("git.committed", {
        success: true,
        message: options.message,
        trace_id: options.traceId,
        commit_sha: sha,
        duration_ms: Date.now() - startTime,
      });

      return sha;
    } catch (error) {
      this.logActivity("git.committed", {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Checkout a branch
   */
  async checkoutBranch(branchName: string): Promise<void> {
    const startTime = Date.now();

    try {
      await this.runGitCommand(["checkout", branchName]);

      this.logActivity("git.checkout", {
        success: true,
        branch: branchName,
        duration_ms: Date.now() - startTime,
      });
    } catch (error) {
      this.logActivity("git.checkout", {
        success: false,
        branch: branchName,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Run a git command with timeout protection and error recovery
   */
  public async runGitCommand(
    args: string[],
    options: GitCommandOptions = {},
  ): Promise<{ output: string; exitCode: number }> {
    const {
      throwOnError = true,
      timeoutMs = DEFAULT_GIT_COMMAND_TIMEOUT_MS,
      retryOnLock = true,
    } = options;

    const startTime = Date.now();
    let attempt = 0;
    const maxRetries = retryOnLock ? DEFAULT_GIT_MAX_RETRIES : 0;

    while (attempt <= maxRetries) {
      let timeoutId: number | undefined;
      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const cmd = new Deno.Command("git", {
          args,
          cwd: this.repoPath,
          stdout: "piped",
          stderr: "piped",
          signal: controller.signal,
        });

        const result = await cmd.output();
        clearTimeout(timeoutId);

        const output = new TextDecoder().decode(result.stdout);
        const errorOutput = new TextDecoder().decode(result.stderr);

        // Handle specific git error conditions
        if (result.code !== 0) {
          const gitError = this.classifyGitError(result.code, errorOutput, args);

          if (throwOnError) {
            throw gitError;
          }
        }

        // Log successful command
        this.logActivity("git.command.success", {
          command: `git ${args.join(" ")}`,
          exit_code: result.code,
          duration_ms: Date.now() - startTime,
          attempt: attempt + 1,
        });

        return {
          output: output || errorOutput,
          exitCode: result.code,
        };
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);

        // Handle timeout
        if (error instanceof Error && error.name === "AbortError") {
          const timeoutError = new GitTimeoutError(
            `Git command timed out after ${timeoutMs}ms: git ${args.join(" ")}`,
          );

          if (throwOnError) {
            throw timeoutError;
          }

          this.logActivity("git.command.timeout", {
            command: `git ${args.join(" ")}`,
            timeout_ms: timeoutMs,
            attempt: attempt + 1,
          });

          return { output: "", exitCode: -1 };
        }

        // Handle lock conflicts with retry
        if (retryOnLock && attempt < maxRetries && this.isLockError(error)) {
          attempt++;
          const delay = Math.pow(2, attempt) * DEFAULT_GIT_RETRY_BACKOFF_BASE_MS; // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (throwOnError) {
          throw error;
        }

        return { output: "", exitCode: -1 };
      }
    }

    throw new GitError(`Git command failed after ${maxRetries + 1} attempts: git ${args.join(" ")}`);
  }

  /**
   * Classify git errors into specific error types
   */
  public classifyGitError(exitCode: number, stderr: string, args: string[]): GitError {
    const command = args.join(" ");

    // Repository state errors
    if (stderr.includes("not a git repository")) {
      return new GitRepositoryError(`Not a git repository: ${this.repoPath}`);
    }

    if (stderr.includes("index.lock") || stderr.includes("lock")) {
      return new GitLockError(`Repository locked: ${stderr.trim()}`);
    }

    if (stderr.includes("corrupt") || stderr.includes("loose object")) {
      return new GitCorruptionError(`Repository corruption detected: ${stderr.trim()}`);
    }

    // Common command errors
    if (command.startsWith("status") && exitCode === DEFAULT_GIT_EXIT_CODE_FATAL) {
      return new GitRepositoryError(`Invalid repository state: ${stderr.trim()}`);
    }

    if (command.startsWith("commit") && stderr.includes("nothing to commit")) {
      return new GitNothingToCommitError("Nothing to commit");
    }

    // Generic git error
    return new GitError(`Git command failed (${exitCode}): ${stderr.trim()}`);
  }

  /**
   * Check if error is related to repository locking
   */
  private isLockError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.message.includes("lock") || error.message.includes("Lock");
  }

  /**
   * Log activity to database
   */
  private logActivity(actionType: string, payload: Record<string, unknown>) {
    if (!this.db) return;

    try {
      this.db.logActivity(
        "agent",
        actionType,
        null,
        payload,
        this.traceId,
        this.agentId,
      );
    } catch (error) {
      console.error("Failed to log git activity:", error);
    }
  }
}
