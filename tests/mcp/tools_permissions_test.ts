/**
 * MCP Tools Permission Tests
 * 
 * Tests that MCP tools respect portal permissions and operation restrictions.
 */

import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { createMockConfig } from "../helpers/config.ts";
import { initTestDbService } from "../helpers/db.ts";
import { ReadFileTool, WriteFileTool, GitStatusTool } from "../../src/mcp/tools.ts";
import { PortalPermissionsService } from "../../src/services/portal_permissions.ts";
import type { PortalPermissions } from "../../src/schemas/portal_permissions.ts";

// ============================================================================
// Read Operation Permission Tests
// ============================================================================

Deno.test("MCP Tools: read_file requires read permission", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-perm-read-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(portalPath);
    await Deno.writeTextFile(join(portalPath, "test.txt"), "content");

    const config = createMockConfig(tempDir, {
      portals: [{
        alias: "TestPortal",
        target_path: portalPath,
      }],
    });

    const portalPerms: PortalPermissions = {
      alias: "TestPortal",
      target_path: portalPath,
      agents_allowed: ["test-agent"],
      operations: ["read"], // Only read allowed
    };

    const permissions = new PortalPermissionsService([portalPerms]);
    const tool = new ReadFileTool(config, db, permissions);

    // Should succeed with read permission
    const result = await tool.execute({
      portal: "TestPortal",
      path: "test.txt",
      agent_id: "test-agent",
    });

    assertExists(result.content);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Tools: read_file rejects when read permission denied", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-perm-no-read-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(portalPath);
    await Deno.writeTextFile(join(portalPath, "test.txt"), "content");

    const config = createMockConfig(tempDir, {
      portals: [{
        alias: "TestPortal",
        target_path: portalPath,
      }],
    });

    const portalPerms: PortalPermissions = {
      alias: "TestPortal",
      target_path: portalPath,
      agents_allowed: ["test-agent"],
      operations: ["write"], // No read permission
    };

    const permissions = new PortalPermissionsService([portalPerms]);
    const tool = new ReadFileTool(config, db, permissions);

    // Should reject without read permission
    await assertRejects(
      async () => {
        await tool.execute({
          portal: "TestPortal",
          path: "test.txt",
          agent_id: "test-agent",
        });
      },
      Error,
      "not permitted",
    );
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Write Operation Permission Tests
// ============================================================================

Deno.test("MCP Tools: write_file requires write permission", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-perm-write-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(portalPath);

    const config = createMockConfig(tempDir, {
      portals: [{
        alias: "TestPortal",
        target_path: portalPath,
      }],
    });

    const portalPerms: PortalPermissions = {
      alias: "TestPortal",
      target_path: portalPath,
      agents_allowed: ["test-agent"],
      operations: ["read", "write"], // Write allowed
    };

    const permissions = new PortalPermissionsService([portalPerms]);
    const tool = new WriteFileTool(config, db, permissions);

    // Should succeed with write permission
    const result = await tool.execute({
      portal: "TestPortal",
      path: "test.txt",
      content: "new content",
      agent_id: "test-agent",
    });

    assertExists(result.content);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Tools: write_file rejects when write permission denied", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-perm-no-write-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(portalPath);

    const config = createMockConfig(tempDir, {
      portals: [{
        alias: "TestPortal",
        target_path: portalPath,
      }],
    });

    const portalPerms: PortalPermissions = {
      alias: "TestPortal",
      target_path: portalPath,
      agents_allowed: ["test-agent"],
      operations: ["read"], // No write permission
    };

    const permissions = new PortalPermissionsService([portalPerms]);
    const tool = new WriteFileTool(config, db, permissions);

    // Should reject without write permission
    await assertRejects(
      async () => {
        await tool.execute({
          portal: "TestPortal",
          path: "test.txt",
          content: "new content",
          agent_id: "test-agent",
        });
      },
      Error,
      "not permitted",
    );
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Git Operation Permission Tests
// ============================================================================

Deno.test("MCP Tools: git_status requires git permission", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-perm-git-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(portalPath);
    
    // Initialize git repository
    await new Deno.Command("git", {
      args: ["init"],
      cwd: portalPath,
    }).output();
    
    await new Deno.Command("git", {
      args: ["config", "user.email", "test@example.com"],
      cwd: portalPath,
    }).output();
    
    await new Deno.Command("git", {
      args: ["config", "user.name", "Test User"],
      cwd: portalPath,
    }).output();

    const config = createMockConfig(tempDir, {
      portals: [{
        alias: "TestPortal",
        target_path: portalPath,
      }],
    });

    const portalPerms: PortalPermissions = {
      alias: "TestPortal",
      target_path: portalPath,
      agents_allowed: ["test-agent"],
      operations: ["read", "git"], // Git allowed
    };

    const permissions = new PortalPermissionsService([portalPerms]);
    const tool = new GitStatusTool(config, db, permissions);

    // Should succeed with git permission
    const result = await tool.execute({
      portal: "TestPortal",
      agent_id: "test-agent",
    });

    assertExists(result.content);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Tools: git_status rejects when git permission denied", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-perm-no-git-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(portalPath);

    const config = createMockConfig(tempDir, {
      portals: [{
        alias: "TestPortal",
        target_path: portalPath,
      }],
    });

    const portalPerms: PortalPermissions = {
      alias: "TestPortal",
      target_path: portalPath,
      agents_allowed: ["test-agent"],
      operations: ["read", "write"], // No git permission
    };

    const permissions = new PortalPermissionsService([portalPerms]);
    const tool = new GitStatusTool(config, db, permissions);

    // Should reject without git permission
    await assertRejects(
      async () => {
        await tool.execute({
          portal: "TestPortal",
          agent_id: "test-agent",
        });
      },
      Error,
      "not permitted",
    );
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Agent Whitelist Tests
// ============================================================================

Deno.test("MCP Tools: rejects non-whitelisted agent", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-perm-whitelist-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(portalPath);
    await Deno.writeTextFile(join(portalPath, "test.txt"), "content");

    const config = createMockConfig(tempDir, {
      portals: [{
        alias: "TestPortal",
        target_path: portalPath,
      }],
    });

    const portalPerms: PortalPermissions = {
      alias: "TestPortal",
      target_path: portalPath,
      agents_allowed: ["allowed-agent"], // Only this agent allowed
      operations: ["read", "write", "git"],
    };

    const permissions = new PortalPermissionsService([portalPerms]);
    const tool = new ReadFileTool(config, db, permissions);

    // Should reject unauthorized agent
    await assertRejects(
      async () => {
        await tool.execute({
          portal: "TestPortal",
          path: "test.txt",
          agent_id: "unauthorized-agent",
        });
      },
      Error,
      "not allowed",
    );
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MCP Tools: allows wildcard agent access", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-perm-wildcard-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(portalPath);
    await Deno.writeTextFile(join(portalPath, "test.txt"), "content");

    const config = createMockConfig(tempDir, {
      portals: [{
        alias: "TestPortal",
        target_path: portalPath,
      }],
    });

    const portalPerms: PortalPermissions = {
      alias: "TestPortal",
      target_path: portalPath,
      agents_allowed: ["*"], // All agents allowed
      operations: ["read", "write", "git"],
    };

    const permissions = new PortalPermissionsService([portalPerms]);
    const tool = new ReadFileTool(config, db, permissions);

    // Should allow any agent
    const result = await tool.execute({
      portal: "TestPortal",
      path: "test.txt",
      agent_id: "any-agent",
    });

    assertExists(result.content);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});
