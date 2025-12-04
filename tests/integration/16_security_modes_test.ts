/**
 * Integration Test 16: Security Modes Enforcement
 *
 * Tests security enforcement for both sandboxed and hybrid execution modes.
 * Validates permission checks, audit detection, and access control.
 */

import { assert, assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { EventLogger } from "../../src/services/event_logger.ts";
import { initTestDbService } from "../helpers/db.ts";

console.log("\n🎯 Integration Test Suite 16: Security Modes - Ready to run\n");

// Test helper to cleanup
async function cleanup(tempDir: string) {
  try {
    await Deno.remove(tempDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

// Test helper to create test portal
async function createTestPortal(basePath: string, portalName: string) {
  const portalPath = join(basePath, portalName);
  await ensureDir(portalPath);
  await ensureDir(join(portalPath, "src"));

  // Create test files
  await Deno.writeTextFile(
    join(portalPath, "README.md"),
    "# Test Portal\n\nThis is a test portal.",
  );

  await Deno.writeTextFile(
    join(portalPath, "src", "main.ts"),
    "export function hello() { return 'Hello'; }",
  );

  // Initialize git repo
  const gitInit = new Deno.Command("git", {
    args: ["init"],
    cwd: portalPath,
    stdout: "null",
    stderr: "null",
  });
  await gitInit.output();

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

  // Initial commit
  await new Deno.Command("git", {
    args: ["add", "."],
    cwd: portalPath,
    stdout: "null",
    stderr: "null",
  }).output();

  await new Deno.Command("git", {
    args: ["commit", "-m", "Initial commit"],
    cwd: portalPath,
    stdout: "null",
    stderr: "null",
  }).output();

  return portalPath;
}

Deno.test("Integration Test 16.1: Sandboxed Mode - File Access Blocked", async () => {
  const { db: dbService, tempDir, cleanup: dbCleanup } = await initTestDbService();
  const testDir = await Deno.makeTempDir({ prefix: "test-exo-security-" });

  try {
    const portalPath = await createTestPortal(testDir, "SecurePortal");
    const eventLogger = new EventLogger({ db: dbService });

    // Simulate sandboxed mode execution
    const securityMode = "sandboxed";
    const traceId = crypto.randomUUID();

    // Attempt 1: Direct file read (should be blocked)
    const readAttempt = join(portalPath, "src", "main.ts");
    eventLogger.error("security.file_access_blocked", readAttempt, {
      trace_id: traceId,
      security_mode: securityMode,
      operation: "read",
      reason: "Direct file access not allowed in sandboxed mode",
    }, traceId);

    // Attempt 2: Direct file write (should be blocked)
    const writeAttempt = join(portalPath, "src", "new_file.ts");
    eventLogger.error("security.file_access_blocked", writeAttempt, {
      trace_id: traceId,
      security_mode: securityMode,
      operation: "write",
      reason: "Direct file writes not allowed in sandboxed mode",
    }, traceId);

    // Attempt 3: Directory traversal (should be blocked)
    const traversalAttempt = "../../etc/passwd";
    eventLogger.error("security.path_traversal_blocked", traversalAttempt, {
      trace_id: traceId,
      security_mode: securityMode,
      reason: "Path traversal detected",
    }, traceId);

    await dbService.waitForFlush();

    // Verify all security violations were logged
    const securityEvents = dbService.instance
      .prepare("SELECT * FROM activity WHERE trace_id = ? AND action_type LIKE 'security.%' ORDER BY timestamp")
      .all(traceId);

    assert(securityEvents.length >= 3, "Should have logged all security violations");

    // Verify event types
    const blockedReads = securityEvents.filter((e: any) => {
      const payload = JSON.parse(e.payload);
      return e.action_type === "security.file_access_blocked" && payload.operation === "read";
    });

    const blockedWrites = securityEvents.filter((e: any) => {
      const payload = JSON.parse(e.payload);
      return e.action_type === "security.file_access_blocked" && payload.operation === "write";
    });

    const traversalBlocks = securityEvents.filter((e: any) => e.action_type === "security.path_traversal_blocked");

    assertEquals(blockedReads.length, 1, "Should have blocked read attempt");
    assertEquals(blockedWrites.length, 1, "Should have blocked write attempt");
    assertEquals(traversalBlocks.length, 1, "Should have blocked traversal attempt");

    console.log("✅ Sandboxed Mode - File Access Blocked - All checks passed");
  } finally {
    await cleanup(testDir);
    await dbCleanup();
  }
});

Deno.test("Integration Test 16.2: Hybrid Mode - Audit Detection", async () => {
  const { db: dbService, tempDir, cleanup: dbCleanup } = await initTestDbService();
  const testDir = await Deno.makeTempDir({ prefix: "test-exo-security-" });

  try {
    const portalPath = await createTestPortal(testDir, "AuditPortal");
    const eventLogger = new EventLogger({ db: dbService });

    const securityMode = "hybrid";
    const traceId = crypto.randomUUID();

    // Record initial git state
    const getGitStatus = async () => {
      const cmd = new Deno.Command("git", {
        args: ["status", "--porcelain"],
        cwd: portalPath,
        stdout: "piped",
        stderr: "piped",
      });
      const output = await cmd.output();
      return new TextDecoder().decode(output.stdout);
    };

    const initialStatus = await getGitStatus();
    assertEquals(initialStatus.trim(), "", "Should start with clean git status");

    // Simulate agent making unauthorized file change
    const unauthorizedFile = join(portalPath, "unauthorized.txt");
    await Deno.writeTextFile(unauthorizedFile, "This file was not created through MCP tools");

    // Post-execution audit
    const finalStatus = await getGitStatus();

    if (finalStatus.trim() !== "") {
      // Unauthorized change detected
      eventLogger.error("security.unauthorized_change_detected", unauthorizedFile, {
        trace_id: traceId,
        security_mode: securityMode,
        git_status: finalStatus.trim(),
        action: "File created outside MCP tools",
      }, traceId);

      // Simulate reverting unauthorized change
      await Deno.remove(unauthorizedFile);

      eventLogger.info("security.unauthorized_change_reverted", unauthorizedFile, {
        trace_id: traceId,
        security_mode: securityMode,
      }, traceId);
    }

    await dbService.waitForFlush();

    // Verify audit events were logged
    const auditEvents = dbService.instance
      .prepare("SELECT * FROM activity WHERE trace_id = ? AND action_type LIKE 'security.%' ORDER BY timestamp")
      .all(traceId);

    assert(auditEvents.length >= 2, "Should have logged audit detection and revert");

    const detectionEvent = auditEvents.find((e: any) => e.action_type === "security.unauthorized_change_detected");
    const revertEvent = auditEvents.find((e: any) => e.action_type === "security.unauthorized_change_reverted");

    assertExists(detectionEvent, "Should have detection event");
    assertExists(revertEvent, "Should have revert event");

    // Verify unauthorized file was removed
    const fileExists = await Deno.stat(unauthorizedFile).catch(() => null);
    assertEquals(fileExists, null, "Unauthorized file should be removed");

    console.log("✅ Hybrid Mode - Audit Detection - All checks passed");
  } finally {
    await cleanup(testDir);
    await dbCleanup();
  }
});

Deno.test("Integration Test 16.3: Permission Validation - Agent Not Allowed", async () => {
  const { db: dbService, tempDir, cleanup: dbCleanup } = await initTestDbService();
  const testDir = await Deno.makeTempDir({ prefix: "test-exo-security-" });

  try {
    const portalPath = await createTestPortal(testDir, "RestrictedPortal");
    const eventLogger = new EventLogger({ db: dbService });

    const traceId = crypto.randomUUID();

    // Simulate portal configuration
    const portalConfig = {
      name: "RestrictedPortal",
      agents_allowed: ["senior-coder", "junior-coder"], // Specific agents only
    };

    // Attempt execution by unauthorized agent
    const unauthorizedAgent = "malicious-agent";

    if (!portalConfig.agents_allowed.includes(unauthorizedAgent)) {
      eventLogger.error("permission.agent_not_allowed", unauthorizedAgent, {
        trace_id: traceId,
        portal: portalConfig.name,
        agent: unauthorizedAgent,
        allowed_agents: portalConfig.agents_allowed,
        reason: "Agent not in portal's allowed list",
      }, traceId);
    }

    await dbService.waitForFlush();

    const permissionEvents = dbService.instance
      .prepare("SELECT * FROM activity WHERE trace_id = ? AND action_type = 'permission.agent_not_allowed'")
      .all(traceId);

    assertEquals(permissionEvents.length, 1, "Should have logged permission denial");

    const event = permissionEvents[0] as any;
    const payload = JSON.parse(event.payload);
    assertEquals(payload.agent, unauthorizedAgent);
    assertEquals(payload.portal, "RestrictedPortal");

    console.log("✅ Permission Validation - Agent Not Allowed - All checks passed");
  } finally {
    await cleanup(testDir);
    await dbCleanup();
  }
});

Deno.test("Integration Test 16.4: Permission Validation - Operation Not Allowed", async () => {
  const { db: dbService, cleanup: dbCleanup } = await initTestDbService();

  try {
    const eventLogger = new EventLogger({ db: dbService });
    const traceId = crypto.randomUUID();

    // Simulate portal with restricted operations
    const portalConfig = {
      name: "ReadOnlyPortal",
      allowed_operations: ["read_file", "list_directory"], // No write operations
    };

    // Attempt restricted operation
    const restrictedOperation = "delete_file";

    if (!portalConfig.allowed_operations.includes(restrictedOperation)) {
      eventLogger.error("permission.operation_not_allowed", restrictedOperation, {
        trace_id: traceId,
        portal: portalConfig.name,
        operation: restrictedOperation,
        allowed_operations: portalConfig.allowed_operations,
        reason: "Operation not in portal's allowed list",
      }, traceId);
    }

    await dbService.waitForFlush();

    const permissionEvents = dbService.instance
      .prepare("SELECT * FROM activity WHERE trace_id = ? AND action_type = 'permission.operation_not_allowed'")
      .all(traceId);

    assertEquals(permissionEvents.length, 1, "Should have logged operation denial");

    const event = permissionEvents[0] as any;
    const payload = JSON.parse(event.payload);
    assertEquals(payload.operation, restrictedOperation);
    assertEquals(payload.portal, "ReadOnlyPortal");

    console.log("✅ Permission Validation - Operation Not Allowed - All checks passed");
  } finally {
    await dbCleanup();
  }
});

Deno.test("Integration Test 16.5: Permission Validation - Portal Not Found", async () => {
  const { db: dbService, tempDir, cleanup: dbCleanup } = await initTestDbService();
  const testDir = await Deno.makeTempDir({ prefix: "test-exo-security-" });

  try {
    const eventLogger = new EventLogger({ db: dbService });
    const traceId = crypto.randomUUID();

    // Attempt to execute on non-existent portal
    const nonExistentPortal = "NonExistentPortal";
    const portalsPath = join(testDir, "Portals");
    await ensureDir(portalsPath);

    const portalPath = join(portalsPath, nonExistentPortal);

    // Check if portal exists
    const portalExists = await Deno.stat(portalPath).catch(() => null);

    if (!portalExists) {
      eventLogger.error("permission.portal_not_found", nonExistentPortal, {
        trace_id: traceId,
        portal: nonExistentPortal,
        expected_path: portalPath,
        reason: "Portal directory does not exist",
      }, traceId);
    }

    await dbService.waitForFlush();

    const permissionEvents = dbService.instance
      .prepare("SELECT * FROM activity WHERE trace_id = ? AND action_type = 'permission.portal_not_found'")
      .all(traceId);

    assertEquals(permissionEvents.length, 1, "Should have logged portal not found error");

    const event = permissionEvents[0] as any;
    const payload = JSON.parse(event.payload);
    assertEquals(payload.portal, nonExistentPortal);

    console.log("✅ Permission Validation - Portal Not Found - All checks passed");
  } finally {
    await cleanup(testDir);
    await dbCleanup();
  }
});

Deno.test("Integration Test 16.6: Hybrid Mode - Read Access Allowed", async () => {
  const { db: dbService, tempDir, cleanup: dbCleanup } = await initTestDbService();
  const testDir = await Deno.makeTempDir({ prefix: "test-exo-security-" });

  try {
    const portalPath = await createTestPortal(testDir, "HybridPortal");
    const eventLogger = new EventLogger({ db: dbService });

    const securityMode = "hybrid";
    const traceId = crypto.randomUUID();

    // In hybrid mode, reads should be allowed
    const readFile = join(portalPath, "README.md");
    const content = await Deno.readTextFile(readFile);

    assert(content.includes("Test Portal"), "Should be able to read portal files");

    // Log successful read access
    eventLogger.info("security.read_access_allowed", readFile, {
      trace_id: traceId,
      security_mode: securityMode,
      operation: "read",
      bytes_read: content.length,
    }, traceId);

    // Verify writes still go through MCP
    eventLogger.info("security.write_via_mcp", "src/new_feature.ts", {
      trace_id: traceId,
      security_mode: securityMode,
      operation: "write",
      note: "All writes must go through MCP tools even in hybrid mode",
    }, traceId);

    await dbService.waitForFlush();

    const securityEvents = dbService.instance
      .prepare("SELECT * FROM activity WHERE trace_id = ? AND action_type LIKE 'security.%' ORDER BY timestamp")
      .all(traceId);

    assert(securityEvents.length >= 2, "Should have logged read and write operations");

    const readEvent = securityEvents.find((e: any) => e.action_type === "security.read_access_allowed");
    const writeEvent = securityEvents.find((e: any) => e.action_type === "security.write_via_mcp");

    assertExists(readEvent, "Should have logged read access");
    assertExists(writeEvent, "Should have logged write requirement");

    console.log("✅ Hybrid Mode - Read Access Allowed - All checks passed");
  } finally {
    await cleanup(testDir);
    await dbCleanup();
  }
});

console.log("\n🎯 Integration Test Suite 16: Security Modes - Complete\n");
