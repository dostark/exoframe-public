
## Phase 13: Model Context Protocol (MCP) Server

**Duration:** 1-2 weeks\
**Prerequisites:** Phases 1–12 (All core features complete, Obsidian retired)\
**Goal:** Add Model Context Protocol (MCP) server interface for programmatic ExoFrame interaction

### Overview

Implement an MCP server that exposes ExoFrame operations as standardized tools, enabling external AI assistants (Claude Desktop, Cline, IDE agents) to interact with ExoFrame programmatically while preserving the file-based core architecture.

### Step 13.1: MCP Server Foundation ✅ COMPLETED

**Implementation:**

```typescript
// src/mcp/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export class ExoFrameMCPServer {
  private server: Server;
  private config: Config;
  private db: DatabaseService;

  constructor(config: Config, db: DatabaseService) {
    this.config = config;
    this.db = db;
    this.server = new Server(
      {
        name: "exoframe",
        version: "1.7.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "exoframe_create_request",
          description: "Create a new request for ExoFrame agents",
          inputSchema: {
            type: "object",
            properties: {
              description: { type: "string" },
              agent: { type: "string", default: "default" },
              context: { type: "array", items: { type: "string" } },
            },
            required: ["description"],
          },
        },
        {
          name: "exoframe_list_plans",
          description: "List pending plans awaiting approval",
          inputSchema: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["pending", "approved", "rejected"] },
            },
          },
        },
        {
          name: "exoframe_approve_plan",
          description: "Approve a pending plan",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string" },
            },
            required: ["plan_id"],
          },
        },
        {
          name: "exoframe_query_journal",
          description: "Query the Activity Journal for recent events",
          inputSchema: {
            type: "object",
            properties: {
              trace_id: { type: "string" },
              limit: { type: "number", default: 50 },
            },
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "exoframe_create_request":
          return await this.createRequest(args);
        case "exoframe_list_plans":
          return await this.listPlans(args);
        case "exoframe_approve_plan":
          return await this.approvePlan(args);
        case "exoframe_query_journal":
          return await this.queryJournal(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
```

**Success Criteria:**

1. [ ] MCP server starts via `exoctl mcp start`
2. [ ] Server exposes standard MCP capabilities
3. [ ] Stdio transport for local connections
4. [ ] Server metadata includes name and version
5. [ ] Graceful shutdown on SIGTERM

### Step 13.2: Tool Implementations

**Request Creation Tool:**

```typescript
private async createRequest(args: any) {
  const requestCmd = new RequestCommands(
    { config: this.config, db: this.db },
    this.config.system.root
  );

  const result = await requestCmd.create(
    args.description,
    args.agent || "default",
    args.context || []
  );

  return {
    content: [
      {
        type: "text",
        text: `Request created: ${result.path}\nTrace ID: ${result.trace_id}`,
      },
    ],
  };
}
```

**Plan Listing Tool:**

```typescript
private async listPlans(args: any) {
  const planCmd = new PlanCommands(
    { config: this.config, db: this.db },
    this.config.system.root
  );

  const plans = await planCmd.list(args.status);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(plans, null, 2),
      },
    ],
  };
}
```

**Journal Query Tool:**

```typescript
private async queryJournal(args: any) {
  const activities = args.trace_id
    ? await this.db.getActivitiesByTraceId(args.trace_id)
    : await this.db.getRecentActivities(args.limit || 50);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(activities, null, 2),
      },
    ],
  };
}
```

**Success Criteria:**

1. [ ] `exoframe_create_request` creates request files
2. [ ] `exoframe_list_plans` returns pending plans
3. [ ] `exoframe_approve_plan` approves plans
4. [ ] `exoframe_query_journal` queries Activity Journal
5. [ ] All operations logged to Activity Journal
6. [ ] Error responses follow MCP error schema

### Step 13.3: Client Integration Examples

**Claude Desktop Configuration:**

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "exoframe": {
      "command": "exoctl",
      "args": ["mcp", "start"],
      "env": {
        "EXOFRAME_ROOT": "/Users/alice/ExoFrame"
      }
    }
  }
}
```

**Cline Integration:**

```json
// .vscode/settings.json
{
  "cline.mcpServers": {
    "exoframe": {
      "command": "exoctl",
      "args": ["mcp", "start"]
    }
  }
}
```

**Success Criteria:**

1. [ ] Documentation for Claude Desktop setup
2. [ ] Documentation for Cline/IDE integration
3. [ ] Example prompts for using MCP tools
4. [ ] Troubleshooting guide for MCP connections

### Step 13.4: Testing & Documentation

**Test Coverage:**

```typescript
// tests/mcp/server_test.ts
Deno.test("MCP Server - create request tool", async () => {
  const server = new ExoFrameMCPServer(config, db);
  const result = await server.createRequest({
    description: "Test request",
    agent: "default",
  });

  assert(result.content[0].text.includes("Request created"));
});

Deno.test("MCP Server - list plans tool", async () => {
  const server = new ExoFrameMCPServer(config, db);
  const result = await server.listPlans({ status: "pending" });

  const plans = JSON.parse(result.content[0].text);
  assert(Array.isArray(plans));
});
```

**Documentation Updates:**

- User Guide: New "MCP Integration" section
- Technical Spec: MCP architecture diagram
- Examples: Common MCP workflows

**Success Criteria:**

1. [ ] Unit tests for all MCP tools
2. [ ] Integration test with MCP client
3. [ ] Documentation in User Guide
4. [ ] Architecture diagram updated
5. [ ] Example repository with MCP configurations

### Phase 13 Benefits

**For Users:**

- Automate ExoFrame workflows from AI assistants
- Integrate with existing IDE agents
- Programmatic access without learning CLI

**For Developers:**

- Standard MCP protocol (no custom API)
- Local-first (no cloud dependencies)
- Full audit trail in Activity Journal
- Complements file-based architecture

**For Ecosystem:**

- ExoFrame becomes MCP-compatible tool
- Works with any MCP client (Claude, Cline, etc.)
- Positions ExoFrame as infrastructure layer

### Phase 13 Exit Criteria

[ ] MCP server implemented with stdio transport
[ ] All core tools implemented (create, list, approve, query)
[ ] Activity Journal logging for all MCP operations
[ ] Integration tests with MCP client
[ ] Documentation for Claude Desktop setup
[ ] Documentation for IDE integration
[ ] Example configurations repository
[ ] User Guide updated with MCP section

---
