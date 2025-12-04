/**
 * MCP Server Resources Tests
 */

import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { createMockConfig } from "../helpers/config.ts";
import { initTestDbService } from "../helpers/db.ts";
import { MCPServer } from "../../src/mcp/server.ts";

/**
 * Creates a test server with portals
 */
async function createTestServer(tempDir: string, portals: Array<{ alias: string; files: Record<string, string> }>) {
  const { db, cleanup } = await initTestDbService();
  const portalConfigs = [];

  for (const { alias, files } of portals) {
    const portalPath = join(tempDir, alias);
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(portalPath, filePath);
      await ensureDir(join(fullPath, ".."));
      await Deno.writeTextFile(fullPath, content);
    }
    portalConfigs.push({ alias, target_path: portalPath });
  }

  const config = createMockConfig(tempDir, { portals: portalConfigs });
  const server = new MCPServer({ config, db, transport: "stdio" });
  await server.start();

  return { server, db, cleanup };
}

// ============================================================================
// Resources List Tests
// ============================================================================

Deno.test("MCP Server: handles resources/list request", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-list-" });
  try {
    const { server, cleanup } = await createTestServer(tempDir, [{
      alias: "TestPortal",
      files: { "README.md": "# Test", "src/main.ts": "console.log('test');" },
    }]);

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/list",
      params: {},
    });

    assertExists(response.result);
    const result = response.result as { resources: Array<{ uri: string; name: string }> };

    assertEquals(result.resources.length >= 2, true);
    const hasPortalUri = result.resources.some((r) => r.uri.startsWith("portal://TestPortal/"));
    assertEquals(hasPortalUri, true);

    await server.stop();
    await cleanup();
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: resources/list discovers multiple portals", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-multi-" });
  try {
    const { server, cleanup } = await createTestServer(tempDir, [
      { alias: "Portal1", files: { "file1.ts": "// portal1" } },
      { alias: "Portal2", files: { "file2.ts": "// portal2" } },
    ]);

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/list",
      params: {},
    });

    assertExists(response.result);
    const result = response.result as { resources: Array<{ uri: string }> };

    const portal1Resources = result.resources.filter((r) => r.uri.startsWith("portal://Portal1/"));
    const portal2Resources = result.resources.filter((r) => r.uri.startsWith("portal://Portal2/"));

    assertEquals(portal1Resources.length >= 1, true);
    assertEquals(portal2Resources.length >= 1, true);

    await server.stop();
    await cleanup();
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Resources Read Tests
// ============================================================================

Deno.test("MCP Server: handles resources/read request", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-read-" });
  try {
    const { server, cleanup } = await createTestServer(tempDir, [{
      alias: "TestPortal",
      files: { "test.ts": "export const x = 42;" },
    }]);

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/read",
      params: { uri: "portal://TestPortal/test.ts" },
    });

    assertExists(response.result);
    const result = response.result as { contents: Array<{ type: string; text: string }> };

    assertEquals(result.contents[0].type, "text");
    assertStringIncludes(result.contents[0].text, "export const x = 42");

    await server.stop();
    await cleanup();
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: resources/read rejects invalid URI", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-invalid-" });
  try {
    const config = createMockConfig(tempDir);
    const { db, cleanup } = await initTestDbService();
    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/read",
      params: { uri: "http://example.com/file.ts" },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32602);
    assertStringIncludes(response.error.message, "Invalid portal URI");

    await server.stop();
    await cleanup();
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: resources/read logs to Activity Journal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-log-" });
  try {
    const { server, db, cleanup } = await createTestServer(tempDir, [{
      alias: "TestPortal",
      files: { "test.ts": "export {}" },
    }]);

    await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/read",
      params: { uri: "portal://TestPortal/test.ts" },
    });
    await new Promise((resolve) => setTimeout(resolve, 150));

    const activities = db.instance.prepare("SELECT * FROM activity WHERE action_type = ?")
      .all("mcp.resources.read");
    assertEquals(activities.length, 1);

    const activity = activities[0] as { target: string };
    assertStringIncludes(activity.target, "portal://TestPortal/test.ts");

    await server.stop();
    await cleanup();
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
