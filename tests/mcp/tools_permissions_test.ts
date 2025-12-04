/**
 * MCP Tools Permission Tests
 *
 * Tests that MCP tools respect portal permissions and operation restrictions.
 */

import { assertExists, assertRejects } from "jsr:@std/assert@^1.0.0";
import { GitStatusTool, ReadFileTool, WriteFileTool } from "../../src/mcp/tools.ts";
import { PortalPermissionsService } from "../../src/services/portal_permissions.ts";
import { initToolPermissionTest } from "./helpers/test_setup.ts";

// ============================================================================
// Read Operation Permission Tests
// ============================================================================

Deno.test("MCP Tools: read_file requires read permission", async () => {
  const ctx = await initToolPermissionTest({
    operations: ["read"],
    fileContent: { "test.txt": "content" },
  });
  try {
    const permissions = new PortalPermissionsService([ctx.permissions]);
    const tool = new ReadFileTool(ctx.config, ctx.db, permissions);

    const result = await tool.execute({
      portal: "TestPortal",
      path: "test.txt",
      agent_id: "test-agent",
    });

    assertExists(result.content);
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("MCP Tools: read_file rejects when read permission denied", async () => {
  const ctx = await initToolPermissionTest({
    operations: ["write"], // No read permission
    fileContent: { "test.txt": "content" },
  });
  try {
    const permissions = new PortalPermissionsService([ctx.permissions]);
    const tool = new ReadFileTool(ctx.config, ctx.db, permissions);

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
    await ctx.cleanup();
  }
});

// ============================================================================
// Write Operation Permission Tests
// ============================================================================

Deno.test("MCP Tools: write_file requires write permission", async () => {
  const ctx = await initToolPermissionTest({
    operations: ["read", "write"],
  });
  try {
    const permissions = new PortalPermissionsService([ctx.permissions]);
    const tool = new WriteFileTool(ctx.config, ctx.db, permissions);

    const result = await tool.execute({
      portal: "TestPortal",
      path: "test.txt",
      content: "new content",
      agent_id: "test-agent",
    });

    assertExists(result.content);
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("MCP Tools: write_file rejects when write permission denied", async () => {
  const ctx = await initToolPermissionTest({
    operations: ["read"], // No write permission
  });
  try {
    const permissions = new PortalPermissionsService([ctx.permissions]);
    const tool = new WriteFileTool(ctx.config, ctx.db, permissions);

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
    await ctx.cleanup();
  }
});

// ============================================================================
// Git Operation Permission Tests
// ============================================================================

Deno.test("MCP Tools: git_status requires git permission", async () => {
  const ctx = await initToolPermissionTest({
    operations: ["read", "git"],
    initGit: true,
  });
  try {
    const permissions = new PortalPermissionsService([ctx.permissions]);
    const tool = new GitStatusTool(ctx.config, ctx.db, permissions);

    const result = await tool.execute({
      portal: "TestPortal",
      agent_id: "test-agent",
    });

    assertExists(result.content);
  } finally {
    await ctx.cleanup();
  }
});

Deno.test("MCP Tools: git_status rejects when git permission denied", async () => {
  const ctx = await initToolPermissionTest({
    operations: ["read", "write"], // No git permission
  });
  try {
    const permissions = new PortalPermissionsService([ctx.permissions]);
    const tool = new GitStatusTool(ctx.config, ctx.db, permissions);

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
    await ctx.cleanup();
  }
});

// ============================================================================
// Agent Whitelist Tests
// ============================================================================

Deno.test("MCP Tools: rejects non-whitelisted agent", async () => {
  const ctx = await initToolPermissionTest({
    agentId: "allowed-agent",
    operations: ["read", "write", "git"],
    fileContent: { "test.txt": "content" },
  });
  try {
    const permissions = new PortalPermissionsService([ctx.permissions]);
    const tool = new ReadFileTool(ctx.config, ctx.db, permissions);

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
    await ctx.cleanup();
  }
});

Deno.test("MCP Tools: allows wildcard agent access", async () => {
  const ctx = await initToolPermissionTest({
    agentId: "*",
    operations: ["read", "write", "git"],
    fileContent: { "test.txt": "content" },
  });
  try {
    const permissions = new PortalPermissionsService([ctx.permissions]);
    const tool = new ReadFileTool(ctx.config, ctx.db, permissions);

    const result = await tool.execute({
      portal: "TestPortal",
      path: "test.txt",
      agent_id: "any-agent",
    });

    assertExists(result.content);
  } finally {
    await ctx.cleanup();
  }
});
