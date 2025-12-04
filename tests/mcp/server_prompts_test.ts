/**
 * MCP Server Prompts Tests
 */

import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { initSimpleMCPServer } from "./helpers/test_setup.ts";

// ============================================================================
// Prompts List Tests
// ============================================================================

Deno.test("MCP Server: handles prompts/list request", async () => {
  const { server, cleanup } = await initSimpleMCPServer();
  try {
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
  } finally {
    await cleanup();
  }
});

Deno.test("MCP Server: prompts/list includes descriptions and arguments", async () => {
  const { server, cleanup } = await initSimpleMCPServer();
  try {
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
  } finally {
    await cleanup();
  }
});

// ============================================================================
// Prompts Get Tests
// ============================================================================

Deno.test("MCP Server: handles prompts/get for execute_plan", async () => {
  const { server, cleanup } = await initSimpleMCPServer();
  try {
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
  } finally {
    await cleanup();
  }
});

Deno.test("MCP Server: handles prompts/get for create_changeset", async () => {
  const { server, cleanup } = await initSimpleMCPServer();
  try {
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
  } finally {
    await cleanup();
  }
});

Deno.test("MCP Server: prompts/get rejects unknown prompt", async () => {
  const { server, cleanup } = await initSimpleMCPServer();
  try {
    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "prompts/get",
      params: { name: "unknown_prompt", arguments: {} },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32602);
    assertStringIncludes(response.error.message, "not found");
  } finally {
    await cleanup();
  }
});

Deno.test("MCP Server: prompts/get logs to Activity Journal", async () => {
  const { server, db, cleanup } = await initSimpleMCPServer();
  try {
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
  } finally {
    await cleanup();
  }
});
