import { join, normalize, relative } from "@std/path";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "../services/db.ts";
import { type MCPToolResponse, ReadFileToolArgsSchema } from "../schemas/mcp.ts";
import { PortalPermissionsService } from "../services/portal_permissions.ts";
import type { PortalOperation } from "../schemas/portal_permissions.ts";

/**
 * MCP Tool Handlers
 *
 * Provides secure, validated tool execution for MCP server.
 * All tools log to Activity Journal and validate inputs.
 * All tools make permission checking for portal operations.
 */

/**
 * Base class for all MCP tool handlers
 * Provides common validation and logging functionality
 */
export abstract class ToolHandler {
  protected config: Config;
  protected db: DatabaseService;
  protected permissions: PortalPermissionsService | null;

  constructor(config: Config, db: DatabaseService, permissions?: PortalPermissionsService) {
    this.config = config;
    this.db = db;
    this.permissions = permissions || null;
  }

  /**
   * Validates that a portal exists in configuration
   * @throws Error if portal not found
   */
  protected validatePortalExists(portalName: string): string {
    const portal = this.config.portals.find((p) => p.alias === portalName);
    if (!portal) {
      throw new Error(`Portal '${portalName}' not found in configuration`);
    }
    return portal.target_path;
  }

  /**
   * Validates that an agent has permission for an operation on a portal
   * @throws Error if permission denied
   */
  protected validatePermission(
    portalName: string,
    agentId: string,
    operation: PortalOperation,
  ): void {
    if (!this.permissions) {
      // No permissions service configured, allow all operations
      return;
    }

    const result = this.permissions.checkOperationAllowed(portalName, agentId, operation);
    if (!result.allowed) {
      throw new Error(
        result.reason || `Permission denied for ${operation} on portal ${portalName}`,
      );
    }
  }

  /**
   * Validates path doesn't contain traversal attempts (../)
   * @throws Error if path traversal detected
   */
  protected validatePathSafety(path: string): void {
    const normalized = normalize(path);
    if (normalized.includes("..") || normalized.startsWith("/")) {
      throw new Error("Path traversal not allowed. Use relative paths within portal.");
    }
  }

  /**
   * Resolves a portal-relative path to absolute filesystem path
   * Validates the resolved path stays within portal bounds
   */
  protected resolvePortalPath(portalPath: string, relativePath: string): string {
    this.validatePathSafety(relativePath);
    const absolutePath = join(portalPath, relativePath);
    const relativeFromPortal = relative(portalPath, absolutePath);

    // Ensure resolved path is still within portal
    if (relativeFromPortal.startsWith("..")) {
      throw new Error("Path traversal not allowed. Resolved path escapes portal.");
    }

    return absolutePath;
  }

  /**
   * Logs tool execution to Activity Journal
   */
  protected logToolExecution(
    toolName: string,
    portal: string,
    metadata: Record<string, unknown>,
  ): void {
    this.db.logActivity(
      "mcp.tool",
      `mcp.tool.${toolName}`,
      portal,
      metadata,
    );
  }

  /**
   * Formats a successful tool response with logging
   */
  protected formatSuccess(
    toolName: string,
    portal: string,
    message: string,
    metadata: Record<string, unknown>,
  ): MCPToolResponse {
    this.logToolExecution(toolName, portal, { ...metadata, success: true });
    return {
      content: [{ type: "text", text: message }],
    };
  }

  /**
   * Formats an error response with logging and re-throws
   */
  protected formatError(
    toolName: string,
    portal: string,
    error: unknown,
    metadata: Record<string, unknown>,
  ): never {
    this.logToolExecution(toolName, portal, {
      ...metadata,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  /**
   * Validates that a portal has a git repository
   * @throws Error if .git directory doesn't exist
   */
  protected async validateGitRepository(portalPath: string, portalName: string): Promise<void> {
    try {
      await Deno.stat(join(portalPath, ".git"));
    } catch {
      throw new Error(`Not a git repository: ${portalName}`);
    }
  }

  /**
   * Execute the tool with validated arguments
   * Implemented by subclasses
   */
  abstract execute(args: unknown): Promise<MCPToolResponse>;

  /**
   * Returns the tool's JSON schema definition
   */
  abstract getToolDefinition(): {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  };
}

/**
 * ReadFileTool - Reads file content from a portal
 *
 * Security:
 * - Validates portal exists
 * - Prevents path traversal
 * - Validates file exists
 * - Logs all reads to Activity Journal
 */
export class ReadFileTool extends ToolHandler {
  async execute(args: unknown): Promise<MCPToolResponse> {
    // Validate arguments with Zod schema
    const validatedArgs = ReadFileToolArgsSchema.parse(args);
    const { portal, path, agent_id } = validatedArgs;

    try {
      // All tools make permission checking for portal operations
      this.validatePermission(portal, agent_id, "read");

      // Validate portal exists
      const portalPath = this.validatePortalExists(portal);

      // Resolve and validate path
      const absolutePath = this.resolvePortalPath(portalPath, path);

      // Read file
      let content: string;
      try {
        content = await Deno.readTextFile(absolutePath);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          throw new Error(`File not found: ${path}`);
        }
        throw error;
      }

      // Log successful execution
      this.logToolExecution("read_file", portal, {
        path,
        agent_id,
        success: true,
        bytes: content.length,
      });

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    } catch (error) {
      // Log failed execution
      this.logToolExecution("read_file", portal, {
        path,
        agent_id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  getToolDefinition() {
    return {
      name: "read_file",
      description: "Read a file from a portal (scoped to allowed portals)",
      inputSchema: {
        type: "object",
        properties: {
          portal: {
            type: "string",
            description: "Portal name",
          },
          path: {
            type: "string",
            description: "Relative path within portal",
          },
          agent_id: {
            type: "string",
            description: "Agent identifier for permission checks",
          },
        },
        required: ["portal", "path", "agent_id"],
      },
    };
  }
}

/**
 * WriteFileTool - Writes file content to a portal
 *
 * Security:
 * - Validates portal exists
 * - Prevents path traversal
 * - Creates parent directories if needed
 * - Logs all writes to Activity Journal
 */
export class WriteFileTool extends ToolHandler {
  async execute(args: unknown): Promise<MCPToolResponse> {
    // Import WriteFile schema and types
    const { WriteFileToolArgsSchema } = await import("../schemas/mcp.ts");
    const validatedArgs = WriteFileToolArgsSchema.parse(args) as {
      portal: string;
      path: string;
      content: string;
      agent_id: string;
    };
    const { portal, path, content, agent_id } = validatedArgs;

    try {
      // All tools make permission checking for portal operations
      this.validatePermission(portal, agent_id, "write");

      // Validate portal exists
      const portalPath = this.validatePortalExists(portal);

      // Resolve and validate path
      const absolutePath = this.resolvePortalPath(portalPath, path);

      // Create parent directories if needed
      const dirname = await import("@std/path");
      const parentDir = dirname.dirname(absolutePath);
      await Deno.mkdir(parentDir, { recursive: true });

      // Write file
      await Deno.writeTextFile(absolutePath, content);

      // Log successful execution
      this.logToolExecution("write_file", portal, {
        path,
        agent_id,
        success: true,
        bytes: content.length,
      });

      return {
        content: [
          {
            type: "text",
            text: `File written successfully: ${path} (${content.length} bytes)`,
          },
        ],
      };
    } catch (error) {
      // Log failed execution
      this.logToolExecution("write_file", portal, {
        path,
        agent_id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  getToolDefinition() {
    return {
      name: "write_file",
      description: "Write a file to a portal (validated and logged)",
      inputSchema: {
        type: "object",
        properties: {
          portal: {
            type: "string",
            description: "Portal name",
          },
          path: {
            type: "string",
            description: "Relative path within portal",
          },
          content: {
            type: "string",
            description: "File content to write",
          },
          agent_id: {
            type: "string",
            description: "Agent identifier for permission checks",
          },
        },
        required: ["portal", "path", "content", "agent_id"],
      },
    };
  }
}

/**
 * ListDirectoryTool - Lists files and directories in a portal path
 *
 * Security:
 * - Validates portal exists
 * - Prevents path traversal
 * - Returns structured directory listing
 * - Logs all operations to Activity Journal
 */
export class ListDirectoryTool extends ToolHandler {
  async execute(args: unknown): Promise<MCPToolResponse> {
    // Import ListDirectory schema and types
    const { ListDirectoryToolArgsSchema } = await import("../schemas/mcp.ts");
    const validatedArgs = ListDirectoryToolArgsSchema.parse(args) as {
      portal: string;
      path?: string;
      agent_id: string;
    };
    const { portal, path, agent_id } = validatedArgs;

    try {
      // All tools make permission checking for portal operations
      this.validatePermission(portal, agent_id, "read");

      // Validate portal exists
      const portalPath = this.validatePortalExists(portal);

      // Resolve and validate path (defaults to portal root)
      const listPath = path || "";
      const absolutePath = this.resolvePortalPath(portalPath, listPath);

      // Read directory
      const entries: string[] = [];
      for await (const entry of Deno.readDir(absolutePath)) {
        const displayName = entry.isDirectory ? `${entry.name}/` : entry.name;
        entries.push(displayName);
      }

      // Sort entries (directories first, then files)
      entries.sort((a, b) => {
        const aIsDir = a.endsWith("/");
        const bIsDir = b.endsWith("/");
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });

      // Format listing
      const listing = entries.length > 0 ? entries.join("\n") : "(Directory is empty)";

      // Log successful execution
      this.logToolExecution("list_directory", portal, {
        path: listPath || "/",
        agent_id,
        success: true,
        entry_count: entries.length,
      });

      return {
        content: [
          {
            type: "text",
            text: listing,
          },
        ],
      };
    } catch (error) {
      // Log failed execution
      this.logToolExecution("list_directory", portal, {
        path: path || "/",
        agent_id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  getToolDefinition() {
    return {
      name: "list_directory",
      description: "List files and directories in a portal path",
      inputSchema: {
        type: "object",
        properties: {
          portal: {
            type: "string",
            description: "Portal name",
          },
          path: {
            type: "string",
            description: "Relative path within portal (optional, defaults to root)",
          },
          agent_id: {
            type: "string",
            description: "Agent identifier for permission checks",
          },
        },
        required: ["portal", "agent_id"],
      },
    };
  }
}

/**
 * GitCreateBranchTool - Creates feature branches in portal git repositories
 *
 * Security:
 * - Validates portal exists
 * - Validates branch name format (feat/, fix/, docs/, chore/, refactor/, test/)
 * - Checks if git repository exists
 * - Logs all operations to Activity Journal
 */
export class GitCreateBranchTool extends ToolHandler {
  async execute(args: unknown): Promise<MCPToolResponse> {
    const { GitCreateBranchToolArgsSchema } = await import("../schemas/mcp.ts");
    const validatedArgs = GitCreateBranchToolArgsSchema.parse(args) as {
      portal: string;
      branch: string;
      agent_id: string;
    };
    const { portal, branch, agent_id } = validatedArgs;

    try {
      // All tools make permission checking for portal operations
      this.validatePermission(portal, agent_id, "git");

      // Validate portal exists
      const portalPath = this.validatePortalExists(portal);

      // Check if git repository exists
      await this.validateGitRepository(portalPath, portal);

      // Create branch using git command
      const cmd = new Deno.Command("git", {
        args: ["checkout", "-b", branch],
        cwd: portalPath,
        stdout: "piped",
        stderr: "piped",
      });

      const { code, stderr } = await cmd.output();

      if (code !== 0) {
        const error = new TextDecoder().decode(stderr);
        throw new Error(`Failed to create branch: ${error}`);
      }

      return this.formatSuccess(
        "git_create_branch",
        portal,
        `Branch '${branch}' created and checked out successfully in portal '${portal}'`,
        { branch, agent_id },
      );
    } catch (error) {
      this.formatError("git_create_branch", portal, error, { branch, agent_id });
    }
  }

  getToolDefinition() {
    return {
      name: "git_create_branch",
      description: "Create a new git branch in a portal repository",
      inputSchema: {
        type: "object",
        properties: {
          portal: {
            type: "string",
            description: "Portal name",
          },
          branch: {
            type: "string",
            description: "Branch name (must start with feat/, fix/, docs/, chore/, refactor/, or test/)",
          },
          agent_id: {
            type: "string",
            description: "Agent identifier for permission checks",
          },
        },
        required: ["portal", "branch", "agent_id"],
      },
    };
  }
}

/**
 * GitCommitTool - Commits changes in portal git repositories
 *
 * Security:
 * - Validates portal exists
 * - Validates commit message not empty
 * - Optionally commits specific files
 * - Checks if git repository exists
 * - Logs all operations to Activity Journal
 */
export class GitCommitTool extends ToolHandler {
  async execute(args: unknown): Promise<MCPToolResponse> {
    const { GitCommitToolArgsSchema } = await import("../schemas/mcp.ts");
    const validatedArgs = GitCommitToolArgsSchema.parse(args) as {
      portal: string;
      message: string;
      files?: string[];
      agent_id: string;
    };
    const { portal, message, files, agent_id } = validatedArgs;

    try {
      // All tools make permission checking for portal operations
      this.validatePermission(portal, agent_id, "git");

      // Validate portal exists
      const portalPath = this.validatePortalExists(portal);

      // Check if git repository exists
      await this.validateGitRepository(portalPath, portal);

      // Stage files
      let stageArgs: string[];
      if (files && files.length > 0) {
        stageArgs = ["add", ...files];
      } else {
        stageArgs = ["add", "."];
      }

      const stageCmd = new Deno.Command("git", {
        args: stageArgs,
        cwd: portalPath,
        stdout: "piped",
        stderr: "piped",
      });

      await stageCmd.output();

      // Commit changes
      const commitCmd = new Deno.Command("git", {
        args: ["commit", "-m", message],
        cwd: portalPath,
        stdout: "piped",
        stderr: "piped",
      });

      const { code, stderr } = await commitCmd.output();

      if (code !== 0) {
        const error = new TextDecoder().decode(stderr);
        throw new Error(`Failed to commit: ${error}`);
      }

      return this.formatSuccess(
        "git_commit",
        portal,
        `Changes committed successfully in portal '${portal}': ${message}`,
        { message, files: files?.length || "all", agent_id },
      );
    } catch (error) {
      this.formatError("git_commit", portal, error, {
        message,
        files: files?.length || "all",
        agent_id,
      });
    }
  }

  getToolDefinition() {
    return {
      name: "git_commit",
      description: "Commit changes in a portal git repository",
      inputSchema: {
        type: "object",
        properties: {
          portal: {
            type: "string",
            description: "Portal name",
          },
          message: {
            type: "string",
            description: "Commit message",
          },
          files: {
            type: "array",
            items: { type: "string" },
            description: "Optional: specific files to commit (defaults to all changes)",
          },
          agent_id: {
            type: "string",
            description: "Agent identifier for permission checks",
          },
        },
        required: ["portal", "message", "agent_id"],
      },
    };
  }
}

/**
 * GitStatusTool - Queries git repository status in portals
 *
 * Security:
 * - Validates portal exists
 * - Checks if git repository exists
 * - Returns formatted status output
 * - Logs all operations to Activity Journal
 */
export class GitStatusTool extends ToolHandler {
  async execute(args: unknown): Promise<MCPToolResponse> {
    const { GitStatusToolArgsSchema } = await import("../schemas/mcp.ts");
    const validatedArgs = GitStatusToolArgsSchema.parse(args) as {
      portal: string;
      agent_id: string;
    };
    const { portal, agent_id } = validatedArgs;

    try {
      // All tools make permission checking for portal operations
      this.validatePermission(portal, agent_id, "git");

      // Validate portal exists
      const portalPath = this.validatePortalExists(portal);

      // Check if git repository exists
      await this.validateGitRepository(portalPath, portal);

      // Get git status
      const cmd = new Deno.Command("git", {
        args: ["status", "--porcelain"],
        cwd: portalPath,
        stdout: "piped",
        stderr: "piped",
      });

      const { code, stdout, stderr } = await cmd.output();

      if (code !== 0) {
        const error = new TextDecoder().decode(stderr);
        throw new Error(`Failed to get status: ${error}`);
      }

      const output = new TextDecoder().decode(stdout);
      const statusText = output.trim() ? output : "Working tree clean - no changes detected";

      return this.formatSuccess(
        "git_status",
        portal,
        statusText,
        { agent_id, has_changes: output.trim().length > 0 },
      );
    } catch (error) {
      this.formatError("git_status", portal, error, { agent_id });
    }
  }

  getToolDefinition() {
    return {
      name: "git_status",
      description: "Query git repository status in a portal",
      inputSchema: {
        type: "object",
        properties: {
          portal: {
            type: "string",
            description: "Portal name",
          },
          agent_id: {
            type: "string",
            description: "Agent identifier for permission checks",
          },
        },
        required: ["portal", "agent_id"],
      },
    };
  }
}
