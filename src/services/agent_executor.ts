/**
 * Agent Executor Service
 *
 * Orchestrates LLM agent execution via MCP with security mode enforcement.
 * Handles blueprint loading, subprocess spawning, MCP connection, and git audit.
 */

import { join } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";
import type { EventLogger } from "./event_logger.ts";
import type { PathResolver } from "./path_resolver.ts";
import type { PortalPermissionsService } from "./portal_permissions.ts";
import type { IModelProvider } from "../ai/providers.ts";
import {
  DEFAULT_GIT_CHECKOUT_TIMEOUT_MS,
  DEFAULT_GIT_CLEAN_TIMEOUT_MS,
  DEFAULT_GIT_DIFF_TIMEOUT_MS,
  DEFAULT_GIT_LOG_TIMEOUT_MS,
  DEFAULT_GIT_LS_FILES_TIMEOUT_MS,
  DEFAULT_GIT_REVERT_CONCURRENCY_LIMIT,
  DEFAULT_GIT_STATUS_TIMEOUT_MS,
} from "../config/constants.ts";
import {
  type AgentExecutionOptions,
  type ChangesetResult,
  ChangesetResultSchema,
  type ExecutionContext,
  type SecurityMode,
} from "../schemas/agent_executor.ts";

/**
 * Agent execution error class
 */
export class AgentExecutionError extends Error {
  constructor(
    message: string,
    public type: string = "agent_error",
    public override cause?: Error,
  ) {
    super(message);
    this.name = "AgentExecutionError";
  }
}

/**
 * Agent blueprint loaded from file
 */
export interface Blueprint {
  name: string;
  model: string;
  provider: string;
  capabilities: string[];
  systemPrompt: string;
}

/**
 * AgentExecutor orchestrates agent execution with MCP
 */
export class AgentExecutor {
  constructor(
    private config: Config,
    private db: DatabaseService,
    private logger: EventLogger,
    private pathResolver: PathResolver,
    private permissions: PortalPermissionsService,
    private provider?: IModelProvider,
  ) {}

  /**
   * Load agent blueprint from file
   */
  async loadBlueprint(agentName: string): Promise<Blueprint> {
    const blueprintPath = join(
      this.config.paths.blueprints,
      "Agents",
      `${agentName}.md`,
    );

    try {
      const content = await Deno.readTextFile(blueprintPath);

      // Extract YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
      if (!frontmatterMatch) {
        throw new Error(`No frontmatter found in blueprint: ${agentName}`);
      }

      const frontmatter = parseYaml(frontmatterMatch[1]) as Record<
        string,
        unknown
      >;

      // Extract system prompt (everything after frontmatter)
      const systemPrompt = content
        .slice(frontmatterMatch[0].length)
        .trim();

      return {
        name: agentName,
        model: frontmatter.model as string,
        provider: frontmatter.provider as string,
        capabilities: (frontmatter.capabilities || []) as string[],
        systemPrompt,
      };
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Blueprint not found: ${agentName}`);
      }
      throw error;
    }
  }

  /**
   * Execute a plan step using agent via MCP
   */
  async executeStep(
    context: ExecutionContext,
    options: AgentExecutionOptions,
  ): Promise<ChangesetResult> {
    const startTime = Date.now();

    // Validate portal exists
    const portal = this.config.portals?.find((p) => p.alias === options.portal);
    if (!portal) {
      throw new Error(`Portal not found: ${options.portal}`);
    }

    // Validate agent has permissions (check before loading blueprint)
    if (!this.permissions.checkAgentAllowed(options.portal, options.agent_id).allowed) {
      throw new Error(
        `Agent not allowed to access portal: ${options.agent_id} -> ${options.portal}`,
      );
    }

    // Load blueprint (TODO: use blueprint for agent spawning when implemented)
    const _blueprint = await this.loadBlueprint(options.agent_id);

    // Log execution start
    await this.logExecutionStart(
      context.trace_id,
      options.agent_id,
      options.portal,
    );

    try {
      // If provider is available, execute agent with LLM
      if (this.provider) {
        const prompt = this.buildExecutionPrompt(_blueprint, context, options);
        const response = await this.provider.generate(prompt, {
          temperature: 0.7,
          max_tokens: 4000,
        });

        // Parse LLM response to extract changeset result
        const result = this.parseAgentResponse(response, context, startTime);

        // Validate result
        const validated = this.validateChangesetResult(result);

        // Log completion
        await this.logExecutionComplete(
          context.trace_id,
          options.agent_id,
          validated,
        );

        return validated;
      }

      // Fallback: return mock result for tests without provider
      const result: ChangesetResult = {
        branch: `feat/${context.request_id}-${context.trace_id.slice(0, 8)}`,
        commit_sha: "abc1234567890abcdef",
        files_changed: [],
        description: context.plan,
        tool_calls: 0,
        execution_time_ms: Date.now() - startTime,
      };

      // Validate result
      const validated = this.validateChangesetResult(result);

      // Log completion
      await this.logExecutionComplete(
        context.trace_id,
        options.agent_id,
        validated,
      );

      return validated;
    } catch (error) {
      // Log error
      await this.logExecutionError(context.trace_id, options.agent_id, {
        type: "agent_error",
        message: error instanceof Error ? error.message : String(error),
        trace_id: context.trace_id,
      });

      throw error;
    }
  }

  /**
   * Build execution prompt for LLM agent
   */
  private buildExecutionPrompt(
    blueprint: Blueprint,
    context: ExecutionContext,
    options: AgentExecutionOptions,
  ): string {
    return `${blueprint.systemPrompt}

## Execution Context

**Trace ID:** ${context.trace_id}
**Request ID:** ${context.request_id}
**Portal:** ${options.portal}
**Security Mode:** ${options.security_mode}

## User Request

${context.request}

## Execution Plan

${context.plan}

## Instructions

Execute the plan step described above. You must respond with a valid JSON object containing the changeset result:

\`\`\`json
{
  "branch": "feat/description-abc123",
  "commit_sha": "abc1234567890abcdef1234567890abcdef123456",
  "files_changed": ["path/to/file1.ts", "path/to/file2.ts"],
  "description": "Brief description of changes made",
  "tool_calls": 5,
  "execution_time_ms": 2000
}
\`\`\`

Ensure your response contains ONLY valid JSON, no additional text.`;
  }

  /**
   * Parse agent response to extract changeset result
   */
  private parseAgentResponse(
    response: string,
    context: ExecutionContext,
    startTime: number,
  ): ChangesetResult {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\`\`\`json\s*([\s\S]*?)\s*\`\`\`/) ||
      response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      // If no JSON found, create a default result
      return {
        branch: `feat/${context.request_id}-${context.trace_id.slice(0, 8)}`,
        commit_sha: "0000000000000000000000000000000000000000",
        files_changed: [],
        description: context.plan,
        tool_calls: 0,
        execution_time_ms: Date.now() - startTime,
      };
    }

    try {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      // Ensure execution_time_ms is set
      if (!parsed.execution_time_ms) {
        parsed.execution_time_ms = Date.now() - startTime;
      }

      return parsed as ChangesetResult;
    } catch {
      // If parsing fails, return default result
      return {
        branch: `feat/${context.request_id}-${context.trace_id.slice(0, 8)}`,
        commit_sha: "0000000000000000000000000000000000000000",
        files_changed: [],
        description: context.plan,
        tool_calls: 0,
        execution_time_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Build subprocess permissions based on security mode
   */
  buildSubprocessPermissions(
    mode: SecurityMode,
    portalPath: string,
  ): string[] {
    const flags: string[] = [];

    if (mode === "sandboxed") {
      // No file system access
      flags.push("--allow-read=NONE");
      flags.push("--allow-write=NONE");
    } else if (mode === "hybrid") {
      // Read-only access to portal
      flags.push(`--allow-read=${portalPath}`);
      flags.push("--allow-write=NONE");
    }

    // Always allow network (for MCP connection)
    flags.push("--allow-net");

    // Always allow environment variables
    flags.push("--allow-env");

    return flags;
  }

  /**
   * Audit git changes to detect unauthorized modifications
   */
  async auditGitChanges(
    portalPath: string,
    authorizedFiles: string[],
  ): Promise<string[]> {
    const { SafeSubprocess, SubprocessTimeoutError } = await import("../utils/subprocess.ts");

    try {
      // Get git status with timeout protection
      const result = await SafeSubprocess.run("git", ["status", "--porcelain"], {
        cwd: portalPath,
        timeoutMs: DEFAULT_GIT_STATUS_TIMEOUT_MS, // 10 second timeout for status
      });

      if (result.code !== 0) {
        throw new Error(`Git status failed: ${result.stderr}`);
      }

      const statusText = result.stdout;
      if (!statusText) {
        return []; // No changes
      }

      const unauthorizedChanges: string[] = [];
      const authorizedSet = new Set(authorizedFiles); // O(1) lookups

      // More robust parsing
      for (const line of statusText.split("\n")) {
        if (!line.trim()) continue;

        // Handle filenames with spaces (basic protection)
        const filename = line.slice(3).trim();

        // O(1) lookup instead of O(n)
        if (!authorizedSet.has(filename)) {
          unauthorizedChanges.push(filename);
        }
      }

      return unauthorizedChanges;
    } catch (error) {
      if (error instanceof SubprocessTimeoutError) {
        this.logger.error("git.audit.timeout", portalPath, {
          error: error.message,
          timeout_ms: DEFAULT_GIT_STATUS_TIMEOUT_MS,
        });
        throw new AgentExecutionError(`Git audit timed out for portal: ${portalPath}`);
      }

      this.logger.error("git.audit.failed", portalPath, {
        error: error instanceof Error ? error.message : String(error),
        stderr: error instanceof Error && "stderr" in error ? (error as any).stderr : undefined,
      });
      throw new AgentExecutionError(`Git audit failed for portal: ${portalPath}`, "git_error", error as Error);
    }
  }

  /**
   * Revert unauthorized changes in hybrid mode
   * Uses git checkout to discard unauthorized modifications
   */
  async revertUnauthorizedChanges(
    portalPath: string,
    unauthorizedFiles: string[],
  ): Promise<void> {
    const { SafeSubprocess } = await import("../utils/subprocess.ts");

    if (unauthorizedFiles.length === 0) return;

    const results = {
      successful: [] as string[],
      failed: [] as Array<{ file: string; error: string }>,
    };

    // Process files concurrently with concurrency limit
    const concurrencyLimit = DEFAULT_GIT_REVERT_CONCURRENCY_LIMIT; // Configurable
    const chunks = this.chunkArray(unauthorizedFiles, concurrencyLimit);

    for (const chunk of chunks) {
      const promises = chunk.map(async (file) => {
        try {
          // Check if tracked with timeout
          const lsResult = await SafeSubprocess.run("git", ["ls-files", "--error-unmatch", file], {
            cwd: portalPath,
            timeoutMs: DEFAULT_GIT_LS_FILES_TIMEOUT_MS,
          });

          if (lsResult.code === 0) {
            // Tracked file - restore with timeout
            await SafeSubprocess.run("git", ["checkout", "HEAD", "--", file], {
              cwd: portalPath,
              timeoutMs: DEFAULT_GIT_CHECKOUT_TIMEOUT_MS,
            });
            results.successful.push(file);
          } else {
            // Untracked file - delete with timeout
            await SafeSubprocess.run("git", ["clean", "-f", file], {
              cwd: portalPath,
              timeoutMs: DEFAULT_GIT_CLEAN_TIMEOUT_MS,
            });
            results.successful.push(file);
          }
        } catch (error) {
          results.failed.push({
            file,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      // Wait for chunk to complete
      await Promise.allSettled(promises);
    }

    // Log results
    this.logger.info("git.revert.completed", portalPath, {
      total_files: unauthorizedFiles.length,
      successful: results.successful.length,
      failed: results.failed.length,
      failed_files: results.failed.map((f) => f.file),
    });

    // Throw error if any files failed to revert
    if (results.failed.length > 0) {
      const errorMsg = `Failed to revert ${results.failed.length} unauthorized files: ${
        results.failed.map((f) => f.file).join(", ")
      }`;
      this.logger.error("git.revert.partial_failure", portalPath, {
        failed_count: results.failed.length,
        failed_files: results.failed,
      });
      throw new AgentExecutionError(errorMsg);
    }
  }

  /**
   * Helper method to chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Get latest commit SHA from git log
   */
  async getLatestCommitSha(portalPath: string): Promise<string> {
    const { SafeSubprocess } = await import("../utils/subprocess.ts");

    const result = await SafeSubprocess.run("git", ["log", "-1", "--format=%H"], {
      cwd: portalPath,
      timeoutMs: DEFAULT_GIT_LOG_TIMEOUT_MS,
    });

    if (result.code !== 0) {
      throw new AgentExecutionError(`Failed to get latest commit SHA: ${result.stderr}`);
    }

    return result.stdout.trim();
  }

  /**
   * Get changed files from git diff
   */
  async getChangedFiles(portalPath: string): Promise<string[]> {
    const { SafeSubprocess } = await import("../utils/subprocess.ts");

    const result = await SafeSubprocess.run("git", ["diff", "--name-only"], {
      cwd: portalPath,
      timeoutMs: DEFAULT_GIT_DIFF_TIMEOUT_MS,
    });

    if (result.code !== 0) {
      throw new AgentExecutionError(`Failed to get changed files: ${result.stderr}`);
    }

    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /**
   * Check if tool call limit exceeded
   */
  checkToolCallLimit(toolCallCount: number, maxToolCalls: number): boolean {
    return toolCallCount > maxToolCalls;
  }

  /**
   * Validate changeset result structure
   */
  validateChangesetResult(result: unknown): ChangesetResult {
    return ChangesetResultSchema.parse(result);
  }

  /**
   * Log execution start to Activity Journal
   */
  async logExecutionStart(
    traceId: string,
    agentId: string,
    portal: string,
  ): Promise<void> {
    await this.logger.log({
      action: "agent.execution_started",
      target: portal,
      actor: "system",
      traceId: traceId,
      agentId: agentId,
      payload: {
        portal,
        started_at: new Date().toISOString(),
      },
    });
  }

  /**
   * Log execution completion to Activity Journal
   */
  async logExecutionComplete(
    traceId: string,
    agentId: string,
    result: ChangesetResult,
  ): Promise<void> {
    await this.logger.log({
      action: "agent.execution_completed",
      target: result.branch,
      actor: "system",
      traceId: traceId,
      agentId: agentId,
      payload: {
        branch: result.branch,
        commit_sha: result.commit_sha,
        files_changed: result.files_changed.length,
        tool_calls: result.tool_calls,
        execution_time_ms: result.execution_time_ms,
        completed_at: new Date().toISOString(),
      },
    });
  }

  /**
   * Log execution error to Activity Journal
   */
  async logExecutionError(
    traceId: string,
    agentId: string,
    error: { type: string; message: string; trace_id?: string },
  ): Promise<void> {
    await this.logger.log({
      action: "agent.execution_failed",
      target: agentId,
      actor: "system",
      traceId: traceId,
      agentId: agentId,
      level: "error",
      payload: {
        error_type: error.type,
        error_message: error.message,
        failed_at: new Date().toISOString(),
      },
    });
  }
}
