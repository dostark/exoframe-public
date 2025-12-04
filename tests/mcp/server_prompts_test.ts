/**
 * MCP Server Prompts Tests
 */

import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { createMockConfig } from "../helpers/config.ts";
import { initTestDbService } from "../helpers/db.ts";
import { MCPServer } from "../../src/mcp/server.ts";

// ============================================================================
// Prompts List Tests
// ============================================================================

Deno.test("MCP Server: handles prompts/list request", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-prompts-list-" });
  const { db, cleanup } = await initTestDbService();
  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "prompts/list",
      params: {},
    });

    assertExists(response.result);
    const result = response.result as { prompts: Array<{ name: string; description: string }> };

    assertEquals(result.prompts.length, 2);

    const promptNames = result.prompts.map((p) => p.name);
    assertEquals(promptNames.includes("execute_plan"), true);
    assertEquals(promptNames.includes("create_changeset"), true);

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: prompts/list includes descriptions and arguments", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-prompts-meta-" });
  const { db, cleanup } = await initTestDbService();
  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "prompts/list",
      params: {},
    });

    assertExists(response.result);
    const result = response.result as {
      prompts: Array<{
        name: string;
        description: string;
        arguments?: Array<{ name: string; description: string; required: boolean }>;
      }>;
    };

    const executePlan = result.prompts.find((p) => p.name === "execute_plan");
    assertExists(executePlan);
    assertExists(executePlan.description);
    assertExists(executePlan.arguments);
    assertEquals(executePlan.arguments!.length, 2);

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Prompts Get Tests
// ============================================================================

Deno.test("MCP Server: handles prompts/get for execute_plan", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-prompts-get-" });
  const { db, cleanup } = await initTestDbService();
  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "prompts/get",
      params: {
        name: "execute_plan",
        arguments: { plan_id: "test-plan-123", portal: "MyApp" },
      },
    });

    assertExists(response.result);
    const result = response.result as {
      description: string;
      messages: Array<{ role: string; content: { type: string; text: string } }>;
    };

    assertExists(result.description);
    assertStringIncludes(result.description, "test-plan-123");
    assertStringIncludes(result.description, "MyApp");
    assertEquals(result.messages.length, 1);
    assertEquals(result.messages[0].role, "user");
    assertStringIncludes(result.messages[0].content.text, "test-plan-123");
    assertStringIncludes(result.messages[0].content.text, "MyApp");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: handles prompts/get for create_changeset", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-prompts-changeset-" });
  const { db, cleanup } = await initTestDbService();
  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "prompts/get",
      params: {
        name: "create_changeset",
        arguments: { portal: "MyApp", description: "Add authentication", trace_id: "trace-789" },
      },
    });

    assertExists(response.result);
    const result = response.result as {
      description: string;
      messages: Array<{ role: string; content: { type: string; text: string } }>;
    };

    assertStringIncludes(result.description, "Add authentication");
    assertStringIncludes(result.messages[0].content.text, "MyApp");
    assertStringIncludes(result.messages[0].content.text, "Add authentication");
    assertStringIncludes(result.messages[0].content.text, "trace-789");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: prompts/get rejects unknown prompt", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-prompts-unknown-" });
  const { db, cleanup } = await initTestDbService();
  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "prompts/get",
      params: { name: "unknown_prompt", arguments: {} },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32602);
    assertStringIncludes(response.error.message, "not found");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: prompts/get logs to Activity Journal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-prompts-log-" });
  const { db, cleanup } = await initTestDbService();
  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "prompts/get",
      params: {
        name: "execute_plan",
        arguments: { plan_id: "log-test-plan", portal: "TestPortal" },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 150));

    const logs = db.instance.prepare("SELECT * FROM activity WHERE action_type = ?")
      .all("mcp.prompts.execute_plan");
    assertEquals(logs.length, 1);

    const log = logs[0] as { target: string };
    assertEquals(log.target, "log-test-plan");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});
