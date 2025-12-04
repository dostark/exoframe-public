import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { MCPServer } from "../../src/mcp/server.ts";
import { createMockConfig } from "../helpers/config.ts";
import { initTestDbService } from "../helpers/db.ts";
import { join } from "@std/path";

/**
 * Tests for Git Tool Implementations
 *
 * Success Criteria:
 * - git_create_branch creates feature branches with validation
 * - git_commit commits changes with proper message validation
 * - git_status queries repository status
 * - All tools validate portal and git repository existence
 * - All tools log to Activity Journal
 */

// ============================================================================
// git_create_branch Tool Tests
// ============================================================================

Deno.test("git_create_branch: successfully creates feature branch", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-git-branch-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });
    
    // Initialize git repo
    await new Deno.Command("git", {
      args: ["init"],
      cwd: portalPath,
      stdout: "piped",
      stderr: "piped",
    }).output();
    
    await new Deno.Command("git", {
      args: ["config", "user.name", "Test User"],
      cwd: portalPath,
    }).output();
    
    await new Deno.Command("git", {
      args: ["config", "user.email", "test@example.com"],
      cwd: portalPath,
    }).output();

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
        name: "git_create_branch",
        arguments: {
          portal: "TestPortal",
          branch: "feat/new-feature",
        },
      },
    });

    assertExists(response.result);
    const result = response.result as { content: Array<{ type: string; text: string }> };
    assertStringIncludes(result.content[0].text, "feat/new-feature");
    assertStringIncludes(result.content[0].text, "created");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("git_create_branch: validates branch name format", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-git-branch-format-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });
    
    await new Deno.Command("git", {
      args: ["init"],
      cwd: portalPath,
      stdout: "piped",
    }).output();

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
        name: "git_create_branch",
        arguments: {
          portal: "TestPortal",
          branch: "invalid-branch-name",
        },
      },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32602);

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("git_create_branch: rejects non-existent portal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-git-branch-portal-" });
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
        name: "git_create_branch",
        arguments: {
          portal: "NonExistent",
          branch: "feat/test",
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

Deno.test("git_create_branch: rejects non-git repository", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-git-branch-norepo-" });
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
        name: "git_create_branch",
        arguments: {
          portal: "TestPortal",
          branch: "feat/test",
        },
      },
    });

    assertExists(response.error);
    // Error message contains "Portal" so server maps it to -32602 (Invalid params)
    assertEquals(response.error.code, -32602);

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// git_commit Tool Tests
// ============================================================================

Deno.test("git_commit: successfully commits changes", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-git-commit-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });
    
    await new Deno.Command("git", {
      args: ["init"],
      cwd: portalPath,
      stdout: "piped",
    }).output();
    
    await new Deno.Command("git", {
      args: ["config", "user.name", "Test User"],
      cwd: portalPath,
    }).output();
    
    await new Deno.Command("git", {
      args: ["config", "user.email", "test@example.com"],
      cwd: portalPath,
    }).output();
    
    // Create a file to commit
    await Deno.writeTextFile(join(portalPath, "test.txt"), "content");

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
        name: "git_commit",
        arguments: {
          portal: "TestPortal",
          message: "feat: Add test file",
        },
      },
    });

    assertExists(response.result);
    const result = response.result as { content: Array<{ type: string; text: string }> };
    assertStringIncludes(result.content[0].text, "committed");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("git_commit: commits specific files when provided", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-git-commit-files-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });
    
    await new Deno.Command("git", {
      args: ["init"],
      cwd: portalPath,
      stdout: "piped",
    }).output();
    
    await new Deno.Command("git", {
      args: ["config", "user.name", "Test User"],
      cwd: portalPath,
    }).output();
    
    await new Deno.Command("git", {
      args: ["config", "user.email", "test@example.com"],
      cwd: portalPath,
    }).output();
    
    await Deno.writeTextFile(join(portalPath, "file1.txt"), "content1");
    await Deno.writeTextFile(join(portalPath, "file2.txt"), "content2");

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
        name: "git_commit",
        arguments: {
          portal: "TestPortal",
          message: "feat: Add file1 only",
          files: ["file1.txt"],
        },
      },
    });

    assertExists(response.result);

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("git_commit: rejects empty commit message", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-git-commit-empty-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });
    
    await new Deno.Command("git", {
      args: ["init"],
      cwd: portalPath,
      stdout: "piped",
    }).output();

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
        name: "git_commit",
        arguments: {
          portal: "TestPortal",
          message: "",
        },
      },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32602);

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("git_commit: rejects when nothing to commit", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-git-commit-nothing-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });
    
    await new Deno.Command("git", {
      args: ["init"],
      cwd: portalPath,
      stdout: "piped",
    }).output();
    
    await new Deno.Command("git", {
      args: ["config", "user.name", "Test User"],
      cwd: portalPath,
    }).output();
    
    await new Deno.Command("git", {
      args: ["config", "user.email", "test@example.com"],
      cwd: portalPath,
    }).output();

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
        name: "git_commit",
        arguments: {
          portal: "TestPortal",
          message: "test commit",
        },
      },
    });

    assertExists(response.error);
    assertEquals(response.error.code, -32603);

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// git_status Tool Tests
// ============================================================================

Deno.test("git_status: shows clean repository status", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-git-status-clean-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });
    
    await new Deno.Command("git", {
      args: ["init"],
      cwd: portalPath,
      stdout: "piped",
    }).output();
    
    await new Deno.Command("git", {
      args: ["config", "user.name", "Test User"],
      cwd: portalPath,
    }).output();
    
    await new Deno.Command("git", {
      args: ["config", "user.email", "test@example.com"],
      cwd: portalPath,
    }).output();

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
        name: "git_status",
        arguments: {
          portal: "TestPortal",
        },
      },
    });

    assertExists(response.result);
    const result = response.result as { content: Array<{ type: string; text: string }> };
    assertStringIncludes(result.content[0].text, "clean");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("git_status: shows uncommitted changes", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-git-status-changes-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await Deno.mkdir(portalPath, { recursive: true });
    
    await new Deno.Command("git", {
      args: ["init"],
      cwd: portalPath,
      stdout: "piped",
    }).output();
    
    await new Deno.Command("git", {
      args: ["config", "user.name", "Test User"],
      cwd: portalPath,
    }).output();
    
    await new Deno.Command("git", {
      args: ["config", "user.email", "test@example.com"],
      cwd: portalPath,
    }).output();
    
    // Create uncommitted file
    await Deno.writeTextFile(join(portalPath, "new-file.txt"), "content");

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
        name: "git_status",
        arguments: {
          portal: "TestPortal",
        },
      },
    });

    assertExists(response.result);
    const result = response.result as { content: Array<{ type: string; text: string }> };
    assertStringIncludes(result.content[0].text, "new-file.txt");

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("git_status: rejects non-git repository", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-git-status-norepo-" });
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
        name: "git_status",
        arguments: {
          portal: "TestPortal",
        },
      },
    });

    assertExists(response.error);
    // Error message contains "Portal" so server maps it to -32602 (Invalid params)
    assertEquals(response.error.code, -32602);

    await server.stop();
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});
