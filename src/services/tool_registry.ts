/**
 * Tool Registry - Step 4.1 of Implementation Plan
 * Maps LLM function calls to safe Deno operations with security validation
 */

import { join } from "@std/path";
import { expandGlob } from "@std/fs";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";
import { PathResolver } from "./path_resolver.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * JSON Schema for a tool parameter
 */
export interface ToolParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
}

/**
 * JSON Schema for tool parameters
 */
export interface ToolSchema {
  type: "object";
  properties: Record<string, ToolParameterSchema>;
  required?: string[];
}

/**
 * Tool definition with JSON schema for LLM function calling
 */
export interface Tool {
  name: string;
  description: string;
  parameters: ToolSchema;
}

/**
 * Result of tool execution
 */
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Configuration for ToolRegistry
 */
export interface ToolRegistryConfig {
  config: Config;
  db?: DatabaseService;
  traceId?: string;
  agentId?: string;
}

// ============================================================================
// Command Whitelist
// ============================================================================

const ALLOWED_COMMANDS = new Set([
  "echo",
  "cat",
  "ls",
  "pwd",
  "git",
  "deno",
  "node",
  "npm",
  "which",
  "whoami",
]);

// ============================================================================
// ToolRegistry Implementation
// ============================================================================

export class ToolRegistry {
  private config: Config;
  private db?: DatabaseService;
  private traceId?: string;
  private agentId?: string;
  private pathResolver: PathResolver;
  private tools: Map<string, Tool>;

  constructor(options?: ToolRegistryConfig) {
    this.config = options?.config || {
      system: { root: Deno.cwd(), log_level: "info" },
      paths: { inbox: "Inbox", knowledge: "Knowledge", system: "System", blueprints: "Blueprints" },
      database: { batch_flush_ms: 100, batch_max_size: 100 },
      watcher: { debounce_ms: 200, stability_check: true },
      agents: { default_model: "default", timeout_sec: 60 },
      models: {
        default: { provider: "mock", model: "gpt-5.2-pro", timeout_ms: 30000 },
        fast: { provider: "mock", model: "gpt-5.2-pro-mini", timeout_ms: 30000 },
        local: { provider: "ollama", model: "llama3.2", timeout_ms: 30000 },
      },
      portals: [],
      mcp: { enabled: true, transport: "stdio", server_name: "exoframe", version: "1.0.0" },
    };
    this.db = options?.db;
    this.traceId = options?.traceId;
    this.agentId = options?.agentId;

    this.pathResolver = new PathResolver(this.config);
    this.tools = new Map();

    this.registerCoreTools();
  }

  /**
   * Register all core tools
   */
  private registerCoreTools() {
    this.tools.set("read_file", {
      name: "read_file",
      description: "Read the contents of a file",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to read",
          },
        },
        required: ["path"],
      },
    });

    this.tools.set("write_file", {
      name: "write_file",
      description: "Write or overwrite a file with content",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to write",
          },
          content: {
            type: "string",
            description: "Content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    });

    this.tools.set("list_directory", {
      name: "list_directory",
      description: "List files and directories in a path",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the directory to list",
          },
        },
        required: ["path"],
      },
    });

    this.tools.set("search_files", {
      name: "search_files",
      description: "Search for files matching a glob pattern",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Glob pattern to match (e.g., '*.ts', '**/*.md')",
          },
          path: {
            type: "string",
            description: "Directory to search in",
          },
        },
        required: ["pattern", "path"],
      },
    });

    this.tools.set("run_command", {
      name: "run_command",
      description: "Execute a whitelisted shell command",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Command to execute (must be whitelisted)",
          },
          args: {
            type: "array",
            items: { type: "string" },
            description: "Command arguments",
          },
        },
        required: ["command"],
      },
    });
  }

  /**
   * Get all registered tools
   */
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool by name
   */
  async execute(toolName: string, params: Record<string, any>): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      if (!this.tools.has(toolName)) {
        return {
          success: false,
          error: `Tool '${toolName}' not found`,
        };
      }

      let result: ToolResult;

      switch (toolName) {
        case "read_file":
          result = await this.readFile(params.path);
          break;
        case "write_file":
          result = await this.writeFile(params.path, params.content);
          break;
        case "list_directory":
          result = await this.listDirectory(params.path);
          break;
        case "search_files":
          result = await this.searchFiles(params.pattern, params.path);
          break;
        case "run_command":
          result = await this.runCommand(params.command, params.args || []);
          break;
        default:
          result = {
            success: false,
            error: `Tool '${toolName}' not implemented`,
          };
      }

      // Log execution
      this.logActivity(`tool.${toolName}`, {
        success: result.success,
        duration_ms: Date.now() - startTime,
        params,
        error: result.error,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.logActivity(`tool.${toolName}`, {
        success: false,
        duration_ms: Date.now() - startTime,
        params,
        error: errorMsg,
      });

      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Read file tool implementation
   */
  private async readFile(path: string): Promise<ToolResult> {
    try {
      const resolvedPath = await this.resolvePath(path);
      const content = await Deno.readTextFile(resolvedPath);
      return this.formatSuccess({ content });
    } catch (error) {
      return this.formatError(error, `File: ${path}`);
    }
  }

  /**
   * Write file tool implementation
   */
  private async writeFile(path: string, content: string): Promise<ToolResult> {
    try {
      const resolvedPath = await this.resolvePath(path);

      // Ensure parent directory exists
      const parentDir = join(resolvedPath, "..");
      await Deno.mkdir(parentDir, { recursive: true });

      await Deno.writeTextFile(resolvedPath, content);
      return this.formatSuccess({ path: resolvedPath });
    } catch (error) {
      return this.formatError(error);
    }
  }

  /**
   * List directory tool implementation
   */
  private async listDirectory(path: string): Promise<ToolResult> {
    try {
      const resolvedPath = await this.resolvePath(path);
      const entries: Array<{ name: string; isDirectory: boolean }> = [];

      for await (const entry of Deno.readDir(resolvedPath)) {
        entries.push({
          name: entry.name,
          isDirectory: entry.isDirectory,
        });
      }

      return this.formatSuccess({ entries });
    } catch (error) {
      return this.formatError(error, `Directory: ${path}`);
    }
  }

  /**
   * Search files tool implementation
   */
  private async searchFiles(pattern: string, searchPath: string): Promise<ToolResult> {
    try {
      const resolvedPath = await this.resolvePath(searchPath);
      const files: string[] = [];

      // Construct glob pattern
      const globPattern = join(resolvedPath, pattern);

      for await (const entry of expandGlob(globPattern)) {
        if (entry.isFile) {
          files.push(entry.path);
        }
      }

      return this.formatSuccess({ files });
    } catch (error) {
      return this.formatError(error);
    }
  }

  /**
   * Resolve and validate a path
   * - If path starts with @, use PathResolver (for alias resolution)
   * - Otherwise, validate it's within allowed roots
   */
  private async resolvePath(path: string): Promise<string> {
    // Use PathResolver for alias paths
    if (path.startsWith("@")) {
      return await this.pathResolver.resolve(path);
    }

    // For absolute or relative paths, validate they're within allowed roots
    const absolutePath = path.startsWith("/") ? path : join(this.config.system.root, path);

    // Check if path is within allowed roots
    const allowedRoots = [
      join(this.config.system.root, this.config.paths.inbox),
      join(this.config.system.root, this.config.paths.knowledge),
      join(this.config.system.root, this.config.paths.blueprints),
      this.config.system.root, // Allow workspace root itself
    ];

    // Try to get real path, but if file doesn't exist yet (for writes), use absolute path
    let realPath: string;
    try {
      realPath = await Deno.realPath(absolutePath);
    } catch {
      // File doesn't exist yet, validate parent directory
      const parentDir = join(absolutePath, "..");
      try {
        realPath = await Deno.realPath(parentDir);
        realPath = join(realPath, absolutePath.split("/").pop() || "");
      } catch {
        // Parent doesn't exist either, just use absolute path for validation
        realPath = absolutePath;
      }
    }

    const isAllowed = allowedRoots.some((root) => {
      try {
        const realRoot = Deno.realPathSync(root);
        return realPath.startsWith(realRoot);
      } catch {
        // Root doesn't exist yet, compare absolute paths
        return realPath.startsWith(root);
      }
    });

    if (!isAllowed) {
      throw new Error(`Path ${path} resolves to ${realPath}, outside allowed roots`);
    }

    return absolutePath;
  }

  /**
   * Run command tool implementation
   */
  private async runCommand(command: string, args: string[]): Promise<ToolResult> {
    try {
      // Check if command is whitelisted
      if (!ALLOWED_COMMANDS.has(command)) {
        return {
          success: false,
          error: `Command '${command}' is not allowed. Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(", ")}`,
        };
      }

      const cmd = new Deno.Command(command, {
        args,
        stdout: "piped",
        stderr: "piped",
      });

      const { code, stdout, stderr } = await cmd.output();

      const output = new TextDecoder().decode(stdout);
      const errorOutput = new TextDecoder().decode(stderr);

      if (code !== 0) {
        return {
          success: false,
          error: `Command failed with exit code ${code}: ${errorOutput}`,
        };
      }

      return {
        success: true,
        data: {
          output,
          exitCode: code,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Log activity to database
   */
  private logActivity(actionType: string, payload: Record<string, any>) {
    if (!this.db) return;

    try {
      this.db.logActivity(
        "agent",
        actionType,
        payload.params?.path || payload.params?.command || null,
        payload,
        this.traceId,
        this.agentId,
      );
    } catch (error) {
      console.error("Failed to log tool activity:", error);
    }
  }

  /**
   * Format tool result for success
   * @private
   */
  private formatSuccess(data: any): ToolResult {
    return {
      success: true,
      data,
    };
  }

  /**
   * Format tool result for error
   * @private
   */
  private formatError(error: unknown, context?: string): ToolResult {
    // Handle path security errors
    if (error instanceof Error && error.message.includes("outside allowed roots")) {
      return {
        success: false,
        error: `Access denied: ${error.message}`,
      };
    }

    // Handle not found errors
    if (error instanceof Deno.errors.NotFound) {
      const message = context ? `${context} not found` : "Not found";
      return {
        success: false,
        error: message,
      };
    }

    // Generic error handling
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
