/**
 * MCP Test Helpers
 *
 * Consolidated test utilities to reduce duplication across MCP test files.
 * Provides standardized setup, request creation, and assertion helpers.
 */

import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { MCPServer } from "../../../src/mcp/server.ts";
import type { PortalPermissions } from "../../../src/schemas/portal_permissions.ts";
import { initTestDbService } from "../../helpers/db.ts";
import { createMockConfig } from "../../helpers/config.ts";

export interface MCPTestContext {
  tempDir: string;
  portalPath: string;
  server: MCPServer;
  db: Awaited<ReturnType<typeof initTestDbService>>["db"];
  cleanup: () => Promise<void>;
}

export interface PortalTestOptions {
  portalAlias?: string;
  createFiles?: boolean;
  fileContent?: Record<string, string>;
  permissions?: {
    agents_allowed?: string[];
    operations?: string[];
  };
  initGit?: boolean;
}

/**
 * Initialize MCP server test environment with portal
 *
 * @example
 * const ctx = await initMCPTest({ createFiles: true });
 * try {
 *   // Run tests with ctx.server
 * } finally {
 *   await ctx.cleanup();
 * }
 */
export async function initMCPTest(
  options: PortalTestOptions = {},
): Promise<MCPTestContext> {
  const {
    portalAlias = "TestPortal",
    createFiles = false,
    fileContent = {},
    permissions = {},
    initGit = false,
  } = options;

  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-" });
  const portalPath = join(tempDir, portalAlias);
  await ensureDir(portalPath);

  // Initialize git repository if requested
  if (initGit) {
    await new Deno.Command("git", {
      args: ["init"],
      cwd: portalPath,
      stdout: "null",
      stderr: "null",
    }).output();

    await new Deno.Command("git", {
      args: ["config", "user.name", "Test User"],
      cwd: portalPath,
      stdout: "null",
      stderr: "null",
    }).output();

    await new Deno.Command("git", {
      args: ["config", "user.email", "test@example.com"],
      cwd: portalPath,
      stdout: "null",
      stderr: "null",
    }).output();
  }

  // Create default test file if requested
  if (createFiles) {
    await Deno.writeTextFile(join(portalPath, "test.txt"), "content");
  }

  // Create additional files from fileContent map
  for (const [filename, content] of Object.entries(fileContent)) {
    const filePath = join(portalPath, filename);
    const dir = join(filePath, "..");
    await ensureDir(dir);
    await Deno.writeTextFile(filePath, content);
  }

  const { db, cleanup: dbCleanup } = await initTestDbService();

  const portalConfig = {
    alias: portalAlias,
    target_path: portalPath,
    agents_allowed: permissions.agents_allowed,
    operations: permissions.operations,
  };

  const config = createMockConfig(tempDir, {
    portals: [portalConfig],
  });

  const server = new MCPServer({ config, db, transport: "stdio" });
  await server.start();

  const cleanup = async () => {
    await server.stop();
    await dbCleanup();
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  };

  return { tempDir, portalPath, server, db, cleanup };
}

/**
 * Initialize MCP server without any portals (for testing portal errors)
 */
export async function initMCPTestWithoutPortal(): Promise<
  Omit<MCPTestContext, "portalPath">
> {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-test-" });
  const { db, cleanup: dbCleanup } = await initTestDbService();

  const config = createMockConfig(tempDir);
  const server = new MCPServer({ config, db, transport: "stdio" });
  await server.start();

  const cleanup = async () => {
    await server.stop();
    await dbCleanup();
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  };

  return { tempDir, server, db, cleanup };
}

/**
 * Create MCP tool call request
 *
 * @example
 * const request = createToolCallRequest("read_file", {
 *   portal: "TestPortal",
 *   path: "test.txt"
 * });
 */
export function createToolCallRequest(
  toolName: string,
  args: Record<string, unknown>,
  id: number | string = 1,
) {
  return {
    jsonrpc: "2.0" as const,
    id,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args,
    },
  };
}

/**
 * Create MCP request for any method
 *
 * @example
 * const request = createMCPRequest("initialize", {
 *   protocolVersion: "2024-11-05",
 *   clientInfo: { name: "test", version: "1.0.0" }
 * });
 */
export function createMCPRequest(
  method: string,
  params?: Record<string, unknown>,
  id: number | string = 1,
) {
  return {
    jsonrpc: "2.0" as const,
    id,
    method,
    params: params || {},
  };
}

/**
 * Assert MCP error response with specific code
 *
 * @throws AssertionError if response is not an error or code doesn't match
 */
export function assertMCPError(
  response: any,
  expectedCode: number,
  messageContains?: string,
): void {
  assertExists(response.error, "Expected error in response");
  assertEquals(
    response.error.code,
    expectedCode,
    `Expected error code ${expectedCode}, got ${response.error.code}: ${response.error.message}`,
  );

  if (messageContains) {
    const message = response.error.message as string;
    if (!message.includes(messageContains)) {
      throw new Error(
        `Expected error message to contain "${messageContains}", got: "${message}"`,
      );
    }
  }
}

/**
 * Assert MCP success response and return result
 *
 * @throws AssertionError if response contains an error
 * @returns The result object from the response
 */
export function assertMCPSuccess<T = any>(response: any): T {
  if (response.error) {
    throw new Error(
      `Expected success, got error ${response.error.code}: ${response.error.message}`,
    );
  }

  assertExists(response.result, "Expected result in response");
  return response.result as T;
}

/**
 * Assert that response result has content array with text
 */
export function assertMCPContentIncludes(response: any, text: string): void {
  const result = assertMCPSuccess(response);
  assertExists(result.content, "Expected content array in result");

  const content = result.content as Array<{ type: string; text: string }>;
  const hasText = content.some((item) => item.text?.includes(text));

  if (!hasText) {
    throw new Error(
      `Expected content to include "${text}", got: ${JSON.stringify(content)}`,
    );
  }
}

/**
 * Create a test portal with git initialization
 */
export async function createGitPortal(
  tempDir: string,
  portalName: string = "TestPortal",
): Promise<string> {
  const portalPath = join(tempDir, portalName);
  await ensureDir(portalPath);

  // Initialize git repo
  await new Deno.Command("git", {
    args: ["init"],
    cwd: portalPath,
    stdout: "null",
    stderr: "null",
  }).output();

  // Configure git
  await new Deno.Command("git", {
    args: ["config", "user.email", "test@example.com"],
    cwd: portalPath,
    stdout: "null",
    stderr: "null",
  }).output();

  await new Deno.Command("git", {
    args: ["config", "user.name", "Test User"],
    cwd: portalPath,
    stdout: "null",
    stderr: "null",
  }).output();

  return portalPath;
}

/**
 * Initialize test environment for tool permission tests
 * Creates portal with specific permissions for testing tool authorization
 *
 * @example
 * const ctx = await initToolPermissionTest({
 *   operations: ["read"],
 *   agentId: "test-agent"
 * });
 * const tool = new ReadFileTool(ctx.config, ctx.db, ctx.permissions);
 */
export interface ToolPermissionTestContext {
  tempDir: string;
  portalPath: string;
  config: ReturnType<typeof createMockConfig>;
  db: Awaited<ReturnType<typeof initTestDbService>>["db"];
  permissions: PortalPermissions;
  cleanup: () => Promise<void>;
}

export interface ToolPermissionOptions {
  portalAlias?: string;
  operations?: ("read" | "write" | "git")[];
  agentId?: string;
  fileContent?: Record<string, string>;
  initGit?: boolean;
}

export async function initToolPermissionTest(
  options: ToolPermissionOptions = {},
): Promise<ToolPermissionTestContext> {
  const {
    portalAlias = "TestPortal",
    operations = ["read"],
    agentId = "test-agent",
    fileContent = {},
    initGit = false,
  } = options;

  const tempDir = await Deno.makeTempDir({ prefix: "mcp-perm-test-" });
  const portalPath = join(tempDir, portalAlias);
  await ensureDir(portalPath);

  // Create files
  for (const [path, content] of Object.entries(fileContent)) {
    const fullPath = join(portalPath, path);
    await ensureDir(join(fullPath, ".."));
    await Deno.writeTextFile(fullPath, content);
  }

  // Initialize git if requested
  if (initGit) {
    await createGitPortal(tempDir, portalAlias);
  }

  const { db, cleanup: dbCleanup } = await initTestDbService();

  const config = createMockConfig(tempDir, {
    portals: [{
      alias: portalAlias,
      target_path: portalPath,
    }],
  });

  const permissions: PortalPermissions = {
    alias: portalAlias,
    target_path: portalPath,
    agents_allowed: [agentId],
    operations,
  };

  return {
    tempDir,
    portalPath,
    config,
    db,
    permissions,
    cleanup: async () => {
      await dbCleanup();
      await Deno.remove(tempDir, { recursive: true }).catch(() => {});
    },
  };
}

/**
 * Initialize simple MCP server for prompts/resources tests without portals
 */
export async function initSimpleMCPServer() {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-simple-" });
  const { db, cleanup: dbCleanup } = await initTestDbService();

  const config = createMockConfig(tempDir);
  const server = new MCPServer({ config, db, transport: "stdio" });
  await server.start();

  return {
    tempDir,
    server,
    db,
    cleanup: async () => {
      await server.stop();
      await dbCleanup();
      await Deno.remove(tempDir, { recursive: true }).catch(() => {});
    },
  };
}
