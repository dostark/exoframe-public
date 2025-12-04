import { assert, assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { MCPServer } from "../../src/mcp/server.ts";
import { createMockConfig } from "../helpers/config.ts";
import { initTestDbService } from "../helpers/db.ts";
import { join } from "@std/path";

/**
 * Tests for Step 6.2 Phase 2: read_file Tool Implementation
 *
 * Success Criteria:
 * - read_file tool executes successfully for valid inputs
 * - Returns file content as text
 * - Validates portal exists
 * - Validates file exists
 * - Prevents path traversal attacks
 * - Logs all invocations to Activity Journal
 * - Returns appropriate errors for invalid cases
 */

Deno.test("read_file: successfully reads file from portal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-read-" });
  const { db, cleanup } = await initTestDbService();

  try {
    // Create test portal and file
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });
    await Deno.writeTextFile(join(portalPath, "test.txt"), "Hello from portal!");

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
      method: "tools/call",
      params: {
        name: "read_file",
        arguments: {
          portal: "TestPortal",
          path: "test.txt",
        },
      },
    });

    assertExists(response.result);
    const result = response.result as { content: Array<{ type: string; text: string }> };
    assertEquals(result.content.length, 1);
    assertEquals(result.content[0].type, "text");
    assertEquals(result.content[0].text, "Hello from portal!");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("read_file: logs invocation to Activity Journal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-read-log-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });
    await Deno.writeTextFile(join(portalPath, "log-test.txt"), "content");

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
      method: "tools/call",
      params: {
        name: "read_file",
        arguments: {
          portal: "TestPortal",
          path: "log-test.txt",
        },
      },
    });

    // Allow time for batched logging
    await new Promise((resolve) => setTimeout(resolve, 150));

    const logs = db.instance.prepare(
      "SELECT * FROM activity WHERE action_type = ?",
    ).all("mcp.tool.read_file");

    assertEquals(logs.length, 1);
    const log = logs[0] as { target: string; payload: string };
    assertEquals(log.target, "TestPortal");
    const payload = JSON.parse(log.payload);
    assertEquals(payload.path, "log-test.txt");
    assertEquals(payload.success, true);

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("read_file: rejects non-existent portal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-read-portal-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "read_file",
        arguments: {
          portal: "NonExistentPortal",
          path: "test.txt",
        },
      },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32602); // Invalid params
    assertStringIncludes(response.error.message, "Portal");
    assertStringIncludes(response.error.message, "NonExistentPortal");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("read_file: rejects non-existent file", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-read-file-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });

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
      method: "tools/call",
      params: {
        name: "read_file",
        arguments: {
          portal: "TestPortal",
          path: "nonexistent.txt",
        },
      },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32602); // Invalid params (file not found)
    assertStringIncludes(response.error.message, "not found");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("read_file: prevents path traversal attack", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-read-traversal-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });

    // Create a file outside portal that attacker wants to read
    await Deno.writeTextFile(join(tempDir, "secret.txt"), "SECRET DATA");

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
      method: "tools/call",
      params: {
        name: "read_file",
        arguments: {
          portal: "TestPortal",
          path: "../secret.txt",
        },
      },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32602); // Invalid params
    assertStringIncludes(response.error.message, "Path traversal");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("read_file: read_file appears in tools/list", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-tools-list-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });

    assertExists(response.result);
    const result = response.result as { tools: Array<{ name: string; description: string }> };
    assertEquals(result.tools.length, 6);
    const toolNames = result.tools.map(t => t.name);
    assert(toolNames.includes("read_file"));
    assert(toolNames.includes("write_file"));
    assert(toolNames.includes("list_directory"));
    assert(toolNames.includes("git_create_branch"));
    assert(toolNames.includes("git_commit"));
    assert(toolNames.includes("git_status"));
    const readTool = result.tools.find(t => t.name === "read_file")!;
    assertStringIncludes(readTool.description, "Read");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("read_file: rejects invalid arguments schema", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-read-invalid-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "read_file",
        arguments: {
          // Missing 'path' field
          portal: "TestPortal",
        },
      },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32602); // Invalid params

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// write_file Tool Tests
// ============================================================================

Deno.test("write_file: successfully writes file to portal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-write-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });

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
      method: "tools/call",
      params: {
        name: "write_file",
        arguments: {
          portal: "TestPortal",
          path: "output.txt",
          content: "Hello from write_file!",
        },
      },
    });

    assertExists(response.result);
    const result = response.result as { content: Array<{ type: string; text: string }> };
    assertEquals(result.content[0].type, "text");
    assertStringIncludes(result.content[0].text, "successfully");

    // Verify file was actually written
    const written = await Deno.readTextFile(join(portalPath, "output.txt"));
    assertEquals(written, "Hello from write_file!");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("write_file: creates parent directories if needed", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-write-dirs-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });

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
      method: "tools/call",
      params: {
        name: "write_file",
        arguments: {
          portal: "TestPortal",
          path: "deeply/nested/file.txt",
          content: "Nested content",
        },
      },
    });

    // Verify file and directories were created
    const written = await Deno.readTextFile(join(portalPath, "deeply/nested/file.txt"));
    assertEquals(written, "Nested content");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("write_file: overwrites existing file", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-write-overwrite-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });
    await Deno.writeTextFile(join(portalPath, "existing.txt"), "Old content");

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
      method: "tools/call",
      params: {
        name: "write_file",
        arguments: {
          portal: "TestPortal",
          path: "existing.txt",
          content: "New content",
        },
      },
    });

    const written = await Deno.readTextFile(join(portalPath, "existing.txt"));
    assertEquals(written, "New content");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("write_file: rejects non-existent portal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-write-portal-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "write_file",
        arguments: {
          portal: "NonExistent",
          path: "test.txt",
          content: "content",
        },
      },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32602);
    assertStringIncludes(response.error.message, "Portal");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("write_file: prevents path traversal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-write-traversal-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });

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
      method: "tools/call",
      params: {
        name: "write_file",
        arguments: {
          portal: "TestPortal",
          path: "../escape.txt",
          content: "malicious",
        },
      },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32602);
    assertStringIncludes(response.error.message, "Path traversal");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("write_file: logs invocation to Activity Journal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-write-log-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });

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
      method: "tools/call",
      params: {
        name: "write_file",
        arguments: {
          portal: "TestPortal",
          path: "logged.txt",
          content: "content",
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    const logs = db.instance.prepare(
      "SELECT * FROM activity WHERE action_type = ?",
    ).all("mcp.tool.write_file");

    assertEquals(logs.length, 1);
    const log = logs[0] as { target: string; payload: string };
    assertEquals(log.target, "TestPortal");
    const payload = JSON.parse(log.payload);
    assertEquals(payload.path, "logged.txt");
    assertEquals(payload.success, true);

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// list_directory Tool Tests
// ============================================================================

Deno.test("list_directory: lists files in portal root", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-list-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });
    await Deno.writeTextFile(join(portalPath, "file1.txt"), "content1");
    await Deno.writeTextFile(join(portalPath, "file2.txt"), "content2");
    await Deno.mkdir(join(portalPath, "subdir"));

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
      method: "tools/call",
      params: {
        name: "list_directory",
        arguments: {
          portal: "TestPortal",
        },
      },
    });

    assertExists(response.result);
    const result = response.result as { content: Array<{ type: string; text: string }> };
    assertEquals(result.content[0].type, "text");
    
    const listing = result.content[0].text;
    assertStringIncludes(listing, "file1.txt");
    assertStringIncludes(listing, "file2.txt");
    assertStringIncludes(listing, "subdir/");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("list_directory: lists files in subdirectory", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-list-sub-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(join(portalPath, "subdir"), { recursive: true });
    await Deno.writeTextFile(join(portalPath, "subdir/nested.txt"), "nested");

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
      method: "tools/call",
      params: {
        name: "list_directory",
        arguments: {
          portal: "TestPortal",
          path: "subdir",
        },
      },
    });

    assertExists(response.result);
    const result = response.result as { content: Array<{ type: string; text: string }> };
    assertStringIncludes(result.content[0].text, "nested.txt");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("list_directory: handles empty directory", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-list-empty-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });

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
      method: "tools/call",
      params: {
        name: "list_directory",
        arguments: {
          portal: "TestPortal",
        },
      },
    });

    assertExists(response.result);
    const result = response.result as { content: Array<{ type: string; text: string }> };
    assertStringIncludes(result.content[0].text, "empty");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("list_directory: rejects non-existent portal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-list-portal-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const server = new MCPServer({ config, db, transport: "stdio" });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "list_directory",
        arguments: {
          portal: "NonExistent",
        },
      },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32602);
    assertStringIncludes(response.error.message, "Portal");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("list_directory: prevents path traversal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-list-traversal-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });

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
      method: "tools/call",
      params: {
        name: "list_directory",
        arguments: {
          portal: "TestPortal",
          path: "../",
        },
      },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32602);
    assertStringIncludes(response.error.message, "Path traversal");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

