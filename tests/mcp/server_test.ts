import { assert, assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { MCPServer } from "../../src/mcp/server.ts";
import { createMockConfig } from "../helpers/config.ts";
import { initTestDbService } from "../helpers/db.ts";

/**
 * Tests for Step 6.2: MCP Server Implementation
 *
 * Success Criteria (Phase 1 - Foundation):
 * - MCP server starts with stdio transport
 * - Server exposes metadata (name, version)
 * - Server handles initialize handshake
 * - Server gracefully stops
 * - All operations logged to Activity Journal
 */

Deno.test("MCP Server: initializes with stdio transport", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-init-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });

    assertEquals(server.getTransport(), "stdio");
    assertEquals(server.getServerName(), "exoframe");
    assertExists(server.getVersion());
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: starts successfully", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-start-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });

    await server.start();

    assertEquals(server.isRunning(), true);

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: handles initialize request", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-initialize-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });

    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "1.0.0",
        },
      },
    });

    assertExists(response.result);
    const result = response.result as { protocolVersion: string; serverInfo: { name: string; version: string } };
    assertEquals(result.protocolVersion, "2024-11-05");
    assertExists(result.serverInfo);
    assertEquals(result.serverInfo.name, "exoframe");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: handles tools/list request", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-tools-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });

    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });

    assertExists(response.result);
    assertExists(response.result);
    const result = response.result as { tools: Array<{ name: string; description: string }> };
    assertExists(result.tools);
    assertEquals(Array.isArray(result.tools), true);

    // Phase 4: Should have 6 tools (read_file, write_file, list_directory, git_create_branch, git_commit, git_status)
    assertEquals(result.tools.length, 6);
    const toolNames = result.tools.map((t: { name: string }) => t.name);
    assert(toolNames.includes("read_file"));
    assert(toolNames.includes("write_file"));
    assert(toolNames.includes("list_directory"));
    assert(toolNames.includes("git_create_branch"));
    assert(toolNames.includes("git_commit"));
    assert(toolNames.includes("git_status"));

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: logs startup to Activity Journal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-logging-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });

    await server.start();

    // Allow time for batched logging
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Verify mcp.server.started logged
    const logs = db.instance.prepare(
      "SELECT * FROM activity WHERE action_type = ?",
    ).all("mcp.server.started");

    assertEquals(logs.length, 1);
    const log = logs[0] as { payload: string };
    const payload = JSON.parse(log.payload);
    assertEquals(payload.transport, "stdio");
    assertEquals(payload.server_name, "exoframe");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: stops gracefully", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-stop-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });

    await server.start();
    assertEquals(server.isRunning(), true);

    await server.stop();
    assertEquals(server.isRunning(), false);

    // Allow time for batched logging
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Verify mcp.server.stopped logged
    const logs = db.instance.prepare(
      "SELECT * FROM activity WHERE action_type = ?",
    ).all("mcp.server.stopped");

    assertEquals(logs.length, 1);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: rejects invalid JSON-RPC request", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-invalid-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });

    await server.start();

    const response = await server.handleRequest({
      // Missing jsonrpc field
      id: 1,
      method: "initialize",
      params: {},
    } as never);

    assertExists(response.error);
    assertEquals(response.error.code, -32600); // Invalid Request

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: rejects unknown method", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-unknown-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });

    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "unknown/method",
      params: {},
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32601); // Method not found

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});
