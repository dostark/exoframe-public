import { assert, assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import {
  assertMCPContentIncludes,
  assertMCPError,
  assertMCPSuccess,
  createMCPRequest,
  createToolCallRequest,
  initMCPTest,
  initMCPTestWithoutPortal,
} from "./helpers/test_setup.ts";

/**
 * Tests for read_file Tool Implementation
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
  const ctx = await initMCPTest({
    createFiles: true,
    fileContent: { "test.txt": "Hello from portal!" },
  });

  try {
    const request = createToolCallRequest("read_file", {
      portal: "TestPortal",
      path: "test.txt",
    });

    const response = await ctx.server.handleRequest(request);
    const result = assertMCPSuccess<{ content: Array<{ type: string; text: string }> }>(response);

    assertEquals(result.content.length, 1);
    assertEquals(result.content[0].type, "text");
    assertEquals(result.content[0].text, "Hello from portal!");
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("read_file: logs invocation to Activity Journal", async () => {
  const ctx = await initMCPTest({
    fileContent: { "log-test.txt": "content" },
  });

  try {
    const request = createToolCallRequest("read_file", {
      portal: "TestPortal",
      path: "log-test.txt",
    });

    await ctx.server.handleRequest(request);

    // Allow time for batched logging
    await new Promise((resolve) => setTimeout(resolve, 150));

    const logs = ctx.db.instance.prepare(
      "SELECT * FROM activity WHERE action_type = ?",
    ).all("mcp.tool.read_file");

    assertEquals(logs.length, 1);
    const log = logs[0] as { target: string; payload: string };
    assertEquals(log.target, "TestPortal");
    const payload = JSON.parse(log.payload);
    assertEquals(payload.path, "log-test.txt");
    assertEquals(payload.success, true);
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("read_file: rejects non-existent portal", async () => {
  const ctx = await initMCPTestWithoutPortal();

  try {
    const request = createToolCallRequest("read_file", {
      portal: "NonExistentPortal",
      path: "test.txt",
    });

    const response = await ctx.server.handleRequest(request);
    assertMCPError(response, -32602, "Portal");
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("read_file: rejects non-existent file", async () => {
  const ctx = await initMCPTest();

  try {
    const request = createToolCallRequest("read_file", {
      portal: "TestPortal",
      path: "nonexistent.txt",
    });

    const response = await ctx.server.handleRequest(request);
    assertMCPError(response, -32602, "not found");
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("read_file: prevents path traversal attack", async () => {
  const ctx = await initMCPTest();
  try {
    // Create a file outside portal that attacker wants to read
    await Deno.writeTextFile(join(ctx.tempDir, "secret.txt"), "SECRET DATA");

    const request = createToolCallRequest("read_file", {
      portal: "TestPortal",
      path: "../secret.txt",
    });

    const response = await ctx.server.handleRequest(request);
    assertMCPError(response, -32602, "Path traversal");
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("read_file: read_file appears in tools/list", async () => {
  const ctx = await initMCPTestWithoutPortal();
  try {
    const request = createMCPRequest("tools/list", {});
    const response = await ctx.server.handleRequest(request);

    assertExists(response.result);
    const result = response.result as { tools: Array<{ name: string; description: string }> };
    assertEquals(result.tools.length, 6);
    const toolNames = result.tools.map((t) => t.name);
    assert(toolNames.includes("read_file"));
    assert(toolNames.includes("write_file"));
    assert(toolNames.includes("list_directory"));
    assert(toolNames.includes("git_create_branch"));
    assert(toolNames.includes("git_commit"));
    assert(toolNames.includes("git_status"));
    const readTool = result.tools.find((t) => t.name === "read_file")!;
    assertStringIncludes(readTool.description, "Read");
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("read_file: rejects invalid arguments schema", async () => {
  const ctx = await initMCPTestWithoutPortal();
  try {
    const response = await ctx.server.handleRequest({
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

    assertMCPError(response, -32602); // Invalid params
  } finally {
    await ctx.cleanup();
  }
});

// ============================================================================
// write_file Tool Tests
// ============================================================================

Deno.test("write_file: successfully writes file to portal", async () => {
  const ctx = await initMCPTest();
  try {
    const request = createToolCallRequest("write_file", {
      portal: "TestPortal",
      path: "output.txt",
      content: "Hello from write_file!",
    });

    const response = await ctx.server.handleRequest(request);
    assertMCPSuccess(response);
    assertMCPContentIncludes(response, "successfully");

    // Verify file was actually written
    const written = await Deno.readTextFile(join(ctx.portalPath, "output.txt"));
    assertEquals(written, "Hello from write_file!");
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("write_file: creates parent directories if needed", async () => {
  const ctx = await initMCPTest();
  try {
    const request = createToolCallRequest("write_file", {
      portal: "TestPortal",
      path: "deeply/nested/file.txt",
      content: "Nested content",
    });

    await ctx.server.handleRequest(request);

    // Verify file and directories were created
    const written = await Deno.readTextFile(join(ctx.portalPath, "deeply/nested/file.txt"));
    assertEquals(written, "Nested content");
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("write_file: overwrites existing file", async () => {
  const ctx = await initMCPTest({
    fileContent: { "existing.txt": "Old content" },
  });
  try {
    const request = createToolCallRequest("write_file", {
      portal: "TestPortal",
      path: "existing.txt",
      content: "New content",
    });

    await ctx.server.handleRequest(request);

    // Verify file was overwritten
    const written = await Deno.readTextFile(join(ctx.portalPath, "existing.txt"));
    assertEquals(written, "New content");
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("write_file: rejects non-existent portal", async () => {
  const ctx = await initMCPTestWithoutPortal();
  try {
    const request = createToolCallRequest("write_file", {
      portal: "NonExistent",
      path: "test.txt",
      content: "content",
    });

    const response = await ctx.server.handleRequest(request);
    assertMCPError(response, -32602, "Portal");
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("write_file: prevents path traversal", async () => {
  const ctx = await initMCPTest();
  try {
    const request = createToolCallRequest("write_file", {
      portal: "TestPortal",
      path: "../escape.txt",
      content: "malicious",
    });

    const response = await ctx.server.handleRequest(request);
    assertMCPError(response, -32602, "Path traversal");
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("write_file: logs invocation to Activity Journal", async () => {
  const ctx = await initMCPTest();
  try {
    const request = createToolCallRequest("write_file", {
      portal: "TestPortal",
      path: "logged.txt",
      content: "content",
    });

    await ctx.server.handleRequest(request);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const logs = ctx.db.instance.prepare(
      "SELECT * FROM activity WHERE action_type = ?",
    ).all("mcp.tool.write_file");

    assertEquals(logs.length, 1);
    const log = logs[0] as { target: string; payload: string };
    assertEquals(log.target, "TestPortal");
    const payload = JSON.parse(log.payload);
    assertEquals(payload.path, "logged.txt");
    assertEquals(payload.success, true);
  } finally {
    await ctx.cleanup();
  }
});

// ============================================================================
// list_directory Tool Tests
// ============================================================================

Deno.test("list_directory: lists files in portal root", async () => {
  const ctx = await initMCPTest({
    fileContent: {
      "file1.txt": "content1",
      "file2.txt": "content2",
      "subdir/placeholder.txt": "", // Creates subdir
    },
  });
  try {
    const request = createToolCallRequest("list_directory", {
      portal: "TestPortal",
    });

    const response = await ctx.server.handleRequest(request);
    assertMCPSuccess(response);

    const result = response.result as { content: Array<{ type: string; text: string }> };
    const listing = result.content[0].text;
    assertStringIncludes(listing, "file1.txt");
    assertStringIncludes(listing, "file2.txt");
    assertStringIncludes(listing, "subdir/");
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("list_directory: lists files in subdirectory", async () => {
  const ctx = await initMCPTest({
    fileContent: {
      "subdir/nested.txt": "nested",
    },
  });
  try {
    const request = createToolCallRequest("list_directory", {
      portal: "TestPortal",
      path: "subdir",
    });

    const response = await ctx.server.handleRequest(request);
    assertMCPSuccess(response);

    const result = response.result as { content: Array<{ type: string; text: string }> };
    assertStringIncludes(result.content[0].text, "nested.txt");
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("list_directory: handles empty directory", async () => {
  const ctx = await initMCPTest(); // Empty portal
  try {
    const request = createToolCallRequest("list_directory", {
      portal: "TestPortal",
    });

    const response = await ctx.server.handleRequest(request);
    assertMCPSuccess(response);

    const result = response.result as { content: Array<{ type: string; text: string }> };
    assertStringIncludes(result.content[0].text, "empty");
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("list_directory: rejects non-existent portal", async () => {
  const ctx = await initMCPTestWithoutPortal();
  try {
    const request = createToolCallRequest("list_directory", {
      portal: "NonExistent",
    });

    const response = await ctx.server.handleRequest(request);
    assertMCPError(response, -32602, "Portal");
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("list_directory: prevents path traversal", async () => {
  const ctx = await initMCPTest();
  try {
    const request = createToolCallRequest("list_directory", {
      portal: "TestPortal",
      path: "../",
    });

    const response = await ctx.server.handleRequest(request);
    assertMCPError(response, -32602, "Path traversal");
  } finally {
    await ctx.cleanup();
  }
});
