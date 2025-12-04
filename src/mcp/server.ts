import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "../services/db.ts";
import { MCPConfigSchema, type MCPTool } from "../schemas/mcp.ts";
import { 
  ToolHandler, 
  ReadFileTool, 
  WriteFileTool, 
  ListDirectoryTool,
  GitCreateBranchTool,
  GitCommitTool,
  GitStatusTool,
} from "./tools.ts";
import { 
  discoverAllResources, 
  parsePortalURI, 
  type MCPResource 
} from "./resources.ts";
import { getPrompts, generatePrompt, type MCPPrompt } from "./prompts.ts";

/**
 * MCP Server Implementation (Step 6.2)
 *
 * Phase 2: First tool implementation (read_file)
 *
 * Provides Model Context Protocol interface for agent tool execution.
 * Currently supports:
 * - stdio transport
 * - initialize handshake
 * - tools/list with registered tools
 * - tools/call for read_file
 * - Activity Journal logging
 *
 * Future phases will add:
 * - Additional tools (write_file, list_directory, git_*)
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
  private tools: Map<string, ToolHandler> = new Map();

  constructor(options: MCPServerOptions) {
    this.config = options.config;
    this.db = options.db;
    this.transport = options.transport;

    // Validate MCP config
    const mcpConfig = MCPConfigSchema.parse(this.config.mcp);
    this.serverName = mcpConfig.server_name;
    this.serverVersion = mcpConfig.version;

    // Register tools
    this.registerTool(new ReadFileTool(this.config, this.db));
    this.registerTool(new WriteFileTool(this.config, this.db));
    this.registerTool(new ListDirectoryTool(this.config, this.db));
    this.registerTool(new GitCreateBranchTool(this.config, this.db));
    this.registerTool(new GitCommitTool(this.config, this.db));
    this.registerTool(new GitStatusTool(this.config, this.db));
  }

  /**
   * Registers a tool handler with the server
   */
  private registerTool(tool: ToolHandler): void {
    const definition = tool.getToolDefinition();
    this.tools.set(definition.name, tool);
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
        return this.handleInitialize(request);
      case "tools/list":
        return this.handleToolsList(request);
      case "tools/call":
        return await this.handleToolsCall(request);
      case "resources/list":
        return await this.handleResourcesList(request);
      case "resources/read":
        return await this.handleResourcesRead(request);
      case "prompts/list":
        return this.handlePromptsList(request);
      case "prompts/get":
        return this.handlePromptsGet(request);
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
  private handleInitialize(
    request: JSONRPCRequest,
  ): JSONRPCResponse {
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
   * Returns all registered tools with their definitions
   */
  private handleToolsList(
    request: JSONRPCRequest,
  ): JSONRPCResponse {
    const toolDefinitions = Array.from(this.tools.values()).map((tool) =>
      tool.getToolDefinition()
    );

    // Log tools list request
    this.db.logActivity(
      "mcp.server",
      "mcp.tools.list",
      null,
      {
        tool_count: toolDefinitions.length,
      },
    );

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        tools: toolDefinitions as MCPTool[],
      },
    };
  }

  /**
   * Handles tools/call request
   * Executes the specified tool with provided arguments
   */
  private async handleToolsCall(
    request: JSONRPCRequest,
  ): Promise<JSONRPCResponse> {
    const params = request.params as {
      name: string;
      arguments: unknown;
    };

    // Validate tool exists
    const tool = this.tools.get(params.name);
    if (!tool) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32602, // Invalid params
          message: `Tool '${params.name}' not found`,
        },
      };
    }

    try {
      // Execute tool
      const result = await tool.execute(params.arguments);

      return {
        jsonrpc: "2.0",
        id: request.id,
        result,
      };
    } catch (error) {
      // Handle tool execution errors
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Determine error code based on error type
      let errorCode = -32603; // Internal error (default)
      
      // Validation errors (Zod or parameter validation)
      if (errorMessage.includes("validation") || errorMessage.includes("Required") || 
          errorMessage.includes("expected") || (error && typeof error === "object" && "constructor" in error && error.constructor?.name === "ZodError")) {
        errorCode = -32602; // Invalid params
      }
      // Portal/file not found errors
      if (errorMessage.includes("not found") || errorMessage.includes("Portal")) {
        errorCode = -32602; // Invalid params
      }
      // Path traversal attempts
      if (errorMessage.includes("Path traversal")) {
        errorCode = -32602; // Invalid params
      }

      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: errorCode,
          message: errorMessage,
        },
      };
    }
  }

  /**
   * Handles resources/list request
   * Returns all portal resources as URIs
   */
  private async handleResourcesList(
    request: JSONRPCRequest,
  ): Promise<JSONRPCResponse> {
    try {
      // Discover resources from all portals
      const resources = await discoverAllResources(this.config, this.db, {
        maxDepth: 3,
        includeHidden: false,
        extensions: ["ts", "tsx", "js", "jsx", "py", "rs", "go", "md", "json", "toml"],
      });

      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          resources,
        },
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Handles resources/read request
   * Reads a resource by portal:// URI
   */
  private async handleResourcesRead(
    request: JSONRPCRequest,
  ): Promise<JSONRPCResponse> {
    const params = request.params as { uri: string };

    try {
      // Parse portal:// URI
      const parsed = parsePortalURI(params.uri);
      if (!parsed) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32602,
            message: `Invalid portal URI: ${params.uri}`,
          },
        };
      }

      // Use read_file tool to fetch content
      const readTool = this.tools.get("read_file");
      if (!readTool) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32603,
            message: "read_file tool not available",
          },
        };
      }

      const result = await readTool.execute({
        portal: parsed.portal,
        path: parsed.path,
      });

      // Log resource read
      this.db.logActivity(
        "mcp.resources",
        "mcp.resources.read",
        params.uri,
        {
          portal: parsed.portal,
          path: parsed.path,
        },
      );

      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          contents: result.content,
        },
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Handles prompts/list request
   * Returns all available prompt templates
   */
  private handlePromptsList(
    request: JSONRPCRequest,
  ): JSONRPCResponse {
    const prompts = getPrompts();

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        prompts,
      },
    };
  }

  /**
   * Handles prompts/get request
   * Generates a specific prompt with provided arguments
   */
  private handlePromptsGet(
    request: JSONRPCRequest,
  ): JSONRPCResponse {
    const params = request.params as {
      name: string;
      arguments: Record<string, unknown>;
    };

    try {
      const result = generatePrompt(
        params.name,
        params.arguments,
        this.config,
        this.db,
      );

      if (!result) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32602,
            message: `Prompt '${params.name}' not found`,
          },
        };
      }

      return {
        jsonrpc: "2.0",
        id: request.id,
        result,
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
