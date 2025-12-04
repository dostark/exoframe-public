import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "../services/db.ts";
import { MCPConfigSchema, type MCPTool } from "../schemas/mcp.ts";

/**
 * MCP Server Implementation (Step 6.2)
 *
 * Walking Skeleton Phase 1: Minimal server with handshake support
 *
 * Provides Model Context Protocol interface for agent tool execution.
 * Currently supports:
 * - stdio transport
 * - initialize handshake
 * - tools/list (returns empty array initially)
 * - Activity Journal logging
 *
 * Future phases will add:
 * - Tool implementations (read_file, write_file, etc.)
 * - Resource discovery (portal:// URIs)
 * - Prompt templates (execute_plan, create_changeset)
 */

interface MCPServerOptions {
  config: Config;
  db: DatabaseService;
  transport: "stdio";
}

interface JSONRPCRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: string;
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface InitializeParams {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  clientInfo: {
    name: string;
    version: string;
  };
}

export class MCPServer {
  private config: Config;
  private db: DatabaseService;
  private transport: "stdio";
  private running = false;
  private serverName: string;
  private serverVersion: string;

  constructor(options: MCPServerOptions) {
    this.config = options.config;
    this.db = options.db;
    this.transport = options.transport;

    // Validate MCP config
    const mcpConfig = MCPConfigSchema.parse(this.config.mcp);
    this.serverName = mcpConfig.server_name;
    this.serverVersion = mcpConfig.version;
  }

  /**
   * Starts the MCP server and logs to Activity Journal
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error("MCP Server is already running");
    }

    this.running = true;

    // Log server start
    this.db.logActivity(
      "mcp.server",
      "mcp.server.started",
      null,
      {
        transport: this.transport,
        server_name: this.serverName,
        server_version: this.serverVersion,
      },
    );
  }

  /**
   * Stops the MCP server gracefully and logs to Activity Journal
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Log server stop
    this.db.logActivity(
      "mcp.server",
      "mcp.server.stopped",
      null,
      {
        server_name: this.serverName,
      },
    );
  }

  /**
   * Returns whether the server is currently running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Returns the transport type (stdio)
   */
  getTransport(): string {
    return this.transport;
  }

  /**
   * Returns the server name (exoframe)
   */
  getServerName(): string {
    return this.serverName;
  }

  /**
   * Returns the server version (from config)
   */
  getVersion(): string {
    return this.serverVersion;
  }

  /**
   * Handles incoming JSON-RPC 2.0 requests
   *
   * Currently supports:
   * - initialize: Protocol handshake
   * - tools/list: Returns available tools (empty array in Phase 1)
   *
   * Returns JSON-RPC 2.0 response with result or error
   */
  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    // Validate JSON-RPC 2.0 format
    if (!request.jsonrpc || request.jsonrpc !== "2.0") {
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: {
          code: -32600, // Invalid Request
          message: "Invalid JSON-RPC 2.0 request: missing or invalid 'jsonrpc' field",
        },
      };
    }

    // Route to method handlers
    switch (request.method) {
      case "initialize":
        return await this.handleInitialize(request);
      case "tools/list":
        return await this.handleToolsList(request);
      default:
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32601, // Method not found
            message: `Method '${request.method}' not found`,
          },
        };
    }
  }

  /**
   * Handles initialize request (MCP protocol handshake)
   */
  private async handleInitialize(
    request: JSONRPCRequest,
  ): Promise<JSONRPCResponse> {
    const params = request.params as unknown as InitializeParams;

    // Log initialization
    this.db.logActivity(
      "mcp.server",
      "mcp.initialize",
      params.clientInfo?.name || null,
      {
        client_version: params.clientInfo?.version,
        protocol_version: params.protocolVersion,
      },
    );

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: this.serverName,
          version: this.serverVersion,
        },
        capabilities: {
          tools: {},
          resources: {}, // Phase 4
          prompts: {}, // Phase 4
        },
      },
    };
  }

  /**
   * Handles tools/list request
   * Returns empty array in Phase 1 (Walking Skeleton)
   * Phase 2 will add read_file tool
   */
  private async handleToolsList(
    request: JSONRPCRequest,
  ): Promise<JSONRPCResponse> {
    // Log tools list request
    this.db.logActivity(
      "mcp.server",
      "mcp.tools.list",
      null,
      {
        tool_count: 0, // Phase 1: No tools yet
      },
    );

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        tools: [] as MCPTool[], // Empty in Phase 1
      },
    };
  }
}
