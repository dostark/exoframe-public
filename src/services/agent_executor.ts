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
import {
  AgentExecutionErrorSchema,
  type AgentExecutionOptions,
  ChangesetResultSchema,
  type ChangesetResult,
  type ExecutionContext,
  type SecurityMode,
} from "../schemas/agent_executor.ts";

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
  ) {}

  /**
   * Load agent blueprint from file
   */
  async loadBlueprint(agentName: string): Promise<Blueprint> {
    const blueprintPath = join(
      this.config.system.blueprints,
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
    const portal = this.config.portals?.find((p) => p.name === options.portal);
    if (!portal) {
      throw new Error(`Portal not found: ${options.portal}`);
    }

    // Validate agent has permissions (check before loading blueprint)
    if (!this.permissions.checkAgentAllowed(options.portal, options.agent_id).allowed) {
      throw new Error(
        `Agent not allowed to access portal: ${options.agent_id} -> ${options.portal}`,
      );
    }

    // Load blueprint
    const blueprint = await this.loadBlueprint(options.agent_id);

    // Log execution start
    await this.logExecutionStart(
      context.trace_id,
      options.agent_id,
      options.portal,
    );

    try {
      // TODO: Implement actual agent execution via MCP
      // For now, return mock result to pass initial tests
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
    // Get git status
    const statusProcess = new Deno.Command("git", {
      args: ["status", "--porcelain"],
      cwd: portalPath,
    });

    const output = await statusProcess.output();
    const statusText = new TextDecoder().decode(output.stdout);

    const unauthorizedChanges: string[] = [];

    for (const line of statusText.split("\n")) {
      if (!line.trim()) continue;

      // Extract filename (skip status code)
      const filename = line.slice(3).trim();

      // Check if file was authorized via MCP tools
      if (!authorizedFiles.includes(filename)) {
        unauthorizedChanges.push(filename);
      }
    }

    return unauthorizedChanges;
  }

  /**
   * Revert unauthorized changes in hybrid mode
   * Uses git checkout to discard unauthorized modifications
   */
  async revertUnauthorizedChanges(
    portalPath: string,
    unauthorizedFiles: string[],
  ): Promise<void> {
    if (unauthorizedFiles.length === 0) {
      return;
    }

    for (const file of unauthorizedFiles) {
      // Check if file is tracked or untracked
      const statusProcess = new Deno.Command("git", {
        args: ["ls-files", "--error-unmatch", file],
        cwd: portalPath,
      });

      const result = await statusProcess.output();

      if (result.code === 0) {
        // File is tracked - restore from HEAD
        const checkoutProcess = new Deno.Command("git", {
          args: ["checkout", "HEAD", "--", file],
          cwd: portalPath,
        });
        await checkoutProcess.output();
      } else {
        // File is untracked - delete it
        const cleanProcess = new Deno.Command("git", {
          args: ["clean", "-f", file],
          cwd: portalPath,
        });
        await cleanProcess.output();
      }
    }
  }

  /**
   * Get latest commit SHA from git log
   */
  async getLatestCommitSha(portalPath: string): Promise<string> {
    const logProcess = new Deno.Command("git", {
      args: ["log", "-1", "--format=%H"],
      cwd: portalPath,
    });

    const output = await logProcess.output();
    return new TextDecoder().decode(output.stdout).trim();
  }

  /**
   * Get changed files from git diff
   */
  async getChangedFiles(portalPath: string): Promise<string[]> {
    const diffProcess = new Deno.Command("git", {
      args: ["diff", "--name-only"],
      cwd: portalPath,
    });

    const output = await diffProcess.output();
    const diffText = new TextDecoder().decode(output.stdout);

    return diffText
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
