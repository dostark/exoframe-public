import { join, normalize, relative } from "@std/path";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "../services/db.ts";
import {
  ReadFileToolArgsSchema,
  type ReadFileToolArgs,
  type MCPToolResponse,
} from "../schemas/mcp.ts";

/**
 * MCP Tool Handlers (Step 6.2 Phase 2)
 *
 * Provides secure, validated tool execution for MCP server.
 * All tools log to Activity Journal and validate inputs.
 */

/**
 * Base class for all MCP tool handlers
 * Provides common validation and logging functionality
 */
export abstract class ToolHandler {
  protected config: Config;
  protected db: DatabaseService;

  constructor(config: Config, db: DatabaseService) {
    this.config = config;
    this.db = db;
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
    const validatedArgs = ReadFileToolArgsSchema.parse(args) as ReadFileToolArgs;
    const { portal, path } = validatedArgs;

    try {
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
        },
        required: ["portal", "path"],
      },
    };
  }
}
