/**
 * MCP Server Resources Tests
 */

import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { createMockConfig } from "../helpers/config.ts";
import { initTestDbService } from "../helpers/db.ts";
import { MCPServer } from "../../src/mcp/server.ts";

// ============================================================================
// Resources List Tests
// ============================================================================

Deno.test("MCP Server: handles resources/list request", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-list-" });
  const { db, cleanup } = await initTestDbService();

  try {
    // Create test portal with files
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(join(portalPath, "src"));
    await Deno.writeTextFile(join(portalPath, "README.md"), "# Test");
    await Deno.writeTextFile(join(portalPath, "src", "main.ts"), "console.log('test');");

    const config = createMockConfig(tempDir, {
      portals: [{
        alias: "TestPortal",
        target_path: portalPath,
      }],
    });

    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/list",
      params: {},
    });

    assertExists(response.result);
    const result = response.result as { resources: Array<{ uri: string; name: string }> };
    
    // Should find at least the README and main.ts
    assertEquals(result.resources.length >= 2, true);
    
    // Check URIs are in portal:// format
    const hasPortalUri = result.resources.some(r => 
      r.uri.startsWith("portal://TestPortal/")
    );
    assertEquals(hasPortalUri, true);

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: resources/list discovers multiple portals", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-multi-" });
  const { db, cleanup } = await initTestDbService();

  try {
    // Create two test portals
    const portal1Path = join(tempDir, "Portal1");
    const portal2Path = join(tempDir, "Portal2");
    
    await ensureDir(portal1Path);
    await ensureDir(portal2Path);
    
    await Deno.writeTextFile(join(portal1Path, "file1.ts"), "// portal1");
    await Deno.writeTextFile(join(portal2Path, "file2.ts"), "// portal2");

    const config = createMockConfig(tempDir, {
      portals: [
        { alias: "Portal1", target_path: portal1Path },
        { alias: "Portal2", target_path: portal2Path },
      ],
    });

    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/list",
      params: {},
    });

    assertExists(response.result);
    const result = response.result as { resources: Array<{ uri: string }> };
    
    // Should have resources from both portals
    const portal1Resources = result.resources.filter(r => 
      r.uri.startsWith("portal://Portal1/")
    );
    const portal2Resources = result.resources.filter(r => 
      r.uri.startsWith("portal://Portal2/")
    );
    
    assertEquals(portal1Resources.length >= 1, true);
    assertEquals(portal2Resources.length >= 1, true);

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Resources Read Tests
// ============================================================================

Deno.test("MCP Server: handles resources/read request", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-read-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(portalPath);
    await Deno.writeTextFile(join(portalPath, "test.ts"), "export const x = 42;");

    const config = createMockConfig(tempDir, {
      portals: [{
        alias: "TestPortal",
        target_path: portalPath,
      }],
    });

    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/read",
      params: {
        uri: "portal://TestPortal/test.ts",
      },
    });

    assertExists(response.result);
    const result = response.result as { contents: Array<{ type: string; text: string }> };
    
    assertEquals(result.contents[0].type, "text");
    assertStringIncludes(result.contents[0].text, "export const x = 42");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: resources/read rejects invalid URI", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-invalid-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/read",
      params: {
        uri: "http://example.com/file.ts",
      },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32602);
    assertStringIncludes(response.error.message, "Invalid portal URI");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Server: resources/read logs to Activity Journal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-log-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(portalPath);
    await Deno.writeTextFile(join(portalPath, "test.ts"), "export {}");

    const config = createMockConfig(tempDir, {
      portals: [{
        alias: "TestPortal",
        target_path: portalPath,
      }],
    });

    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/read",
      params: {
        uri: "portal://TestPortal/test.ts",
      },
    });

    // Allow time for batched logging
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Check Activity Journal for resource read
    const activities = db.instance.prepare(
      "SELECT * FROM activity WHERE action_type = ?",
    ).all("mcp.resources.read");
    
    assertEquals(activities.length, 1);
    const activity = activities[0] as { target: string };
    assertStringIncludes(activity.target, "portal://TestPortal/test.ts");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});
