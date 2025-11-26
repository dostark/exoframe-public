import { assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { ToolRegistry } from "../src/services/tool_registry.ts";
import { createMockConfig } from "./helpers/config.ts";
import { initTestDbService } from "./helpers/db.ts";

/**
 * Tests for Step 4.1: The Tool Registry
 *
 * Success Criteria:
 * - Tool registration with JSON schemas
 * - Tool execution with security validation
 * - Path traversal attempts rejected
 * - Tool execution logged to Activity Journal
 * - Restricted commands blocked
 * - Structured error handling
 */

Deno.test("ToolRegistry: registers tools with JSON schemas", () => {
  const registry = new ToolRegistry();

  const tools = registry.getTools();

  // Should have all core tools
  assertEquals(tools.length >= 5, true, "Should have at least 5 core tools");

  // Check read_file tool schema
  const readFile = tools.find((t: { name: string }) => t.name === "read_file");
  assertExists(readFile, "read_file tool should be registered");
  assertEquals(readFile.description.includes("Read"), true);
  assertExists(readFile.parameters);
  assertExists(readFile.parameters.properties);
  assertExists(readFile.parameters.properties.path);
});

Deno.test("ToolRegistry: read_file - successful read", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "tool-test-read-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    // Create file inside Knowledge directory (within allowed roots)
    const knowledgeDir = join(tempDir, "Knowledge");
    await Deno.mkdir(knowledgeDir, { recursive: true });
    const testFile = join(knowledgeDir, "test.txt");
    await Deno.writeTextFile(testFile, "Hello, World!");

    const registry = new ToolRegistry({ config, db });

    const result = await registry.execute("read_file", {
      path: testFile,
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.content, "Hello, World!");
    assertEquals(result.error, undefined);

    // Allow time for batched logging
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Verify activity logged
    const logs = db.instance.prepare(
      "SELECT * FROM activity WHERE action_type = ?",
    ).all("tool.read_file");
    assertEquals(logs.length, 1);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ToolRegistry: read_file - rejects path traversal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "tool-test-traversal-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const registry = new ToolRegistry({ config, db });

    const result = await registry.execute("read_file", {
      path: "../../etc/passwd",
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.includes("denied") || result.error?.includes("outside"), true);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ToolRegistry: read_file - file not found", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "tool-test-notfound-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const registry = new ToolRegistry({ config, db });

    const result = await registry.execute("read_file", {
      path: join(tempDir, "nonexistent.txt"),
    });

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.includes("not found") || result.error.includes("NotFound"), true);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ToolRegistry: write_file - create new file", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "tool-test-write-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const registry = new ToolRegistry({ config, db });
    const testFile = join(tempDir, "new.txt");

    const result = await registry.execute("write_file", {
      path: testFile,
      content: "New content",
    });

    assertEquals(result.success, true);
    const content = await Deno.readTextFile(testFile);
    assertEquals(content, "New content");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ToolRegistry: write_file - overwrites existing file", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "tool-test-overwrite-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const testFile = join(tempDir, "existing.txt");
    await Deno.writeTextFile(testFile, "Old content");

    const registry = new ToolRegistry({ config, db });

    const result = await registry.execute("write_file", {
      path: testFile,
      content: "New content",
    });

    assertEquals(result.success, true);
    const content = await Deno.readTextFile(testFile);
    assertEquals(content, "New content");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ToolRegistry: write_file - rejects path traversal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "tool-test-write-sec-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const registry = new ToolRegistry({ config, db });

    const result = await registry.execute("write_file", {
      path: "../../tmp/malicious.txt",
      content: "Bad",
    });

    assertEquals(result.success, false);
    assertExists(result.error);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ToolRegistry: list_directory - lists files and folders", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "tool-test-list-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    await Deno.writeTextFile(join(tempDir, "file1.txt"), "content");
    await Deno.writeTextFile(join(tempDir, "file2.md"), "content");
    await Deno.mkdir(join(tempDir, "subfolder"));

    const registry = new ToolRegistry({ config, db });

    const result = await registry.execute("list_directory", {
      path: tempDir,
    });

    assertEquals(result.success, true);
    assertExists(result.data?.entries);
    assertEquals(Array.isArray(result.data.entries), true);
    assertEquals(result.data.entries.length >= 3, true);

    // Check entries have name and isDirectory
    const entry = result.data.entries[0];
    assertExists(entry.name);
    assertEquals(typeof entry.isDirectory, "boolean");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ToolRegistry: list_directory - rejects path traversal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "tool-test-list-sec-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const registry = new ToolRegistry({ config, db });

    const result = await registry.execute("list_directory", {
      path: "../../etc",
    });

    assertEquals(result.success, false);
    assertExists(result.error);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ToolRegistry: run_command - executes whitelisted command", async () => {
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(Deno.cwd());
    const registry = new ToolRegistry({ config, db });

    const result = await registry.execute("run_command", {
      command: "echo",
      args: ["Hello"],
    });

    assertEquals(result.success, true);
    assertExists(result.data?.output);
    assertEquals(result.data.output.includes("Hello"), true);
  } finally {
    await cleanup();
  }
});

Deno.test("ToolRegistry: run_command - blocks dangerous commands", async () => {
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(Deno.cwd());
    const registry = new ToolRegistry({ config, db });

    const result = await registry.execute("run_command", {
      command: "rm",
      args: ["-rf", "/"],
    });

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.includes("blocked") || result.error.includes("not allowed"), true);
  } finally {
    await cleanup();
  }
});

Deno.test("ToolRegistry: search_files - finds files by pattern", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "tool-test-search-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    await Deno.writeTextFile(join(tempDir, "test1.ts"), "content");
    await Deno.writeTextFile(join(tempDir, "test2.ts"), "content");
    await Deno.writeTextFile(join(tempDir, "readme.md"), "content");

    const registry = new ToolRegistry({ config, db });

    const result = await registry.execute("search_files", {
      pattern: "*.ts",
      path: tempDir,
    });

    assertEquals(result.success, true);
    assertExists(result.data?.files);
    assertEquals(Array.isArray(result.data.files), true);
    assertEquals(result.data.files.length >= 2, true);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ToolRegistry: execute - returns error for unknown tool", async () => {
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(Deno.cwd());
    const registry = new ToolRegistry({ config, db });

    const result = await registry.execute("nonexistent_tool", {});

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.includes("not found") || result.error.includes("unknown"), true);
  } finally {
    await cleanup();
  }
});

Deno.test("ToolRegistry: all tool executions are logged", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "tool-test-log-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const testFile = join(tempDir, "log-test.txt");
    await Deno.writeTextFile(testFile, "test");

    const registry = new ToolRegistry({ config, db, traceId: "test-trace-123" });

    // Execute multiple tools
    await registry.execute("read_file", { path: testFile });
    await registry.execute("list_directory", { path: tempDir });

    // Allow time for batched logging
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Verify all executions logged
    const logs = db.getActivitiesByTrace("test-trace-123");
    const toolLogs = logs.filter((log) => log.action_type.startsWith("tool."));

    assertEquals(toolLogs.length >= 2, true);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ToolRegistry: execute - handles tool execution exceptions", async () => {
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig("/nonexistent-path-12345");
    const registry = new ToolRegistry({ config, db });

    // Try to read from invalid path - should catch exception and return error
    const result = await registry.execute("read_file", { path: "some-file.txt" });

    assertEquals(result.success, false);
    assertExists(result.error);
  } finally {
    await cleanup();
  }
});

Deno.test("ToolRegistry: write_file - handles permission denied", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "tool-test-perm-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const registry = new ToolRegistry({ config, db });

    // Try to write to root (should fail with permission)
    const result = await registry.execute("write_file", {
      path: "/root/forbidden.txt",
      content: "test",
    });

    assertEquals(result.success, false);
    assertExists(result.error);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ToolRegistry: run_command - handles command execution failure", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "tool-test-cmd-fail-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const registry = new ToolRegistry({ config, db });

    // Execute a command that will fail
    const result = await registry.execute("run_command", {
      command: "ls",
      args: ["/nonexistent-directory-99999"],
    });

    // Should return success false due to non-zero exit code
    assertEquals(result.success, false);
    assertExists(result.error);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ToolRegistry: search_files - handles invalid glob patterns", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "tool-test-glob-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const registry = new ToolRegistry({ config, db });

    // Search with pattern in non-existent directory
    const result = await registry.execute("search_files", {
      pattern: "*.txt",
      path: "/nonexistent-search-path",
    });

    // Should handle error gracefully
    assertEquals(result.success, false);
    assertExists(result.error);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ToolRegistry: list_directory - handles non-existent directory", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "tool-test-dir-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const registry = new ToolRegistry({ config, db });

    const result = await registry.execute("list_directory", {
      path: join(tempDir, "does-not-exist"),
    });

    assertEquals(result.success, false);
    assertExists(result.error);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ToolRegistry: getTools - returns all registered tools", () => {
  const config = createMockConfig(Deno.cwd());
  const registry = new ToolRegistry({ config });

  const tools = registry.getTools();

  assertEquals(tools.length, 5);
  const toolNames = tools.map((t) => t.name);
  assertEquals(toolNames.includes("read_file"), true);
  assertEquals(toolNames.includes("write_file"), true);
  assertEquals(toolNames.includes("list_directory"), true);
  assertEquals(toolNames.includes("search_files"), true);
  assertEquals(toolNames.includes("run_command"), true);
});

Deno.test("ToolRegistry: execute - validates required parameters", async () => {
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(Deno.cwd());
    const registry = new ToolRegistry({ config, db });

    // Try to execute read_file without path parameter
    const result = await registry.execute("read_file", {});

    assertEquals(result.success, false);
    assertExists(result.error);
  } finally {
    await cleanup();
  }
});
