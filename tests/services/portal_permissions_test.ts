/**
 * Portal Permissions Tests
 *
 * Tests permission validation, agent whitelist, operation restrictions,
 * and security mode enforcement.
 */

import { assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { PortalPermissionsService } from "../../src/services/portal_permissions.ts";
import type { PortalPermissions } from "../../src/schemas/portal_permissions.ts";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestPortal(overrides: Partial<PortalPermissions> = {}): PortalPermissions {
  return {
    alias: "TestPortal",
    target_path: "/tmp/test-portal",
    agents_allowed: ["agent-1", "agent-2"],
    operations: ["read", "write", "git"],
    security: {
      mode: "sandboxed",
      audit_enabled: true,
      log_all_actions: true,
    },
    ...overrides,
  };
}

// ============================================================================
// Agent Whitelist Tests
// ============================================================================

Deno.test("PortalPermissions: allows whitelisted agent", () => {
  const portal = createTestPortal();
  const service = new PortalPermissionsService([portal]);

  const result = service.checkAgentAllowed("TestPortal", "agent-1");

  assertEquals(result.allowed, true);
  assertEquals(result.portal, "TestPortal");
  assertEquals(result.agent_id, "agent-1");
});

Deno.test("PortalPermissions: rejects non-whitelisted agent", () => {
  const portal = createTestPortal();
  const service = new PortalPermissionsService([portal]);

  const result = service.checkAgentAllowed("TestPortal", "unauthorized-agent");

  assertEquals(result.allowed, false);
  assertExists(result.reason);
  assertEquals(result.reason?.includes("not allowed"), true);
});

Deno.test("PortalPermissions: allows all agents with wildcard", () => {
  const portal = createTestPortal({
    agents_allowed: ["*"],
  });
  const service = new PortalPermissionsService([portal]);

  const result = service.checkAgentAllowed("TestPortal", "any-agent");

  assertEquals(result.allowed, true);
});

Deno.test("PortalPermissions: rejects unknown portal", () => {
  const portal = createTestPortal();
  const service = new PortalPermissionsService([portal]);

  const result = service.checkAgentAllowed("UnknownPortal", "agent-1");

  assertEquals(result.allowed, false);
  assertEquals(result.reason?.includes("not found"), true);
});

// ============================================================================
// Operation Permission Tests
// ============================================================================

Deno.test("PortalPermissions: allows permitted read operation", () => {
  const portal = createTestPortal({
    operations: ["read", "write"],
  });
  const service = new PortalPermissionsService([portal]);

  const result = service.checkOperationAllowed("TestPortal", "agent-1", "read");

  assertEquals(result.allowed, true);
  assertEquals(result.operation, "read");
});

Deno.test("PortalPermissions: allows permitted write operation", () => {
  const portal = createTestPortal({
    operations: ["read", "write"],
  });
  const service = new PortalPermissionsService([portal]);

  const result = service.checkOperationAllowed("TestPortal", "agent-1", "write");

  assertEquals(result.allowed, true);
  assertEquals(result.operation, "write");
});

Deno.test("PortalPermissions: allows permitted git operation", () => {
  const portal = createTestPortal({
    operations: ["read", "git"],
  });
  const service = new PortalPermissionsService([portal]);

  const result = service.checkOperationAllowed("TestPortal", "agent-1", "git");

  assertEquals(result.allowed, true);
  assertEquals(result.operation, "git");
});

Deno.test("PortalPermissions: rejects unpermitted operation", () => {
  const portal = createTestPortal({
    operations: ["read"], // No write or git
  });
  const service = new PortalPermissionsService([portal]);

  const result = service.checkOperationAllowed("TestPortal", "agent-1", "write");

  assertEquals(result.allowed, false);
  assertEquals(result.reason?.includes("not permitted"), true);
});

Deno.test("PortalPermissions: rejects operation for non-whitelisted agent", () => {
  const portal = createTestPortal();
  const service = new PortalPermissionsService([portal]);

  const result = service.checkOperationAllowed("TestPortal", "unauthorized-agent", "read");

  assertEquals(result.allowed, false);
  assertEquals(result.reason?.includes("not allowed"), true);
});

// ============================================================================
// Security Mode Tests
// ============================================================================

Deno.test("PortalPermissions: returns sandboxed security mode", () => {
  const portal = createTestPortal({
    security: {
      mode: "sandboxed",
      audit_enabled: true,
      log_all_actions: true,
    },
  });
  const service = new PortalPermissionsService([portal]);

  const mode = service.getSecurityMode("TestPortal");

  assertEquals(mode, "sandboxed");
});

Deno.test("PortalPermissions: returns hybrid security mode", () => {
  const portal = createTestPortal({
    security: {
      mode: "hybrid",
      audit_enabled: true,
      log_all_actions: true,
    },
  });
  const service = new PortalPermissionsService([portal]);

  const mode = service.getSecurityMode("TestPortal");

  assertEquals(mode, "hybrid");
});

Deno.test("PortalPermissions: defaults to sandboxed if no security config", () => {
  const portal = createTestPortal({
    security: undefined,
  });
  const service = new PortalPermissionsService([portal]);

  const mode = service.getSecurityMode("TestPortal");

  assertEquals(mode, "sandboxed");
});

// ============================================================================
// Multiple Portals Tests
// ============================================================================

Deno.test("PortalPermissions: handles multiple portals independently", () => {
  const portal1 = createTestPortal({
    alias: "Portal1",
    agents_allowed: ["agent-1"],
    operations: ["read"],
  });
  const portal2 = createTestPortal({
    alias: "Portal2",
    agents_allowed: ["agent-2"],
    operations: ["read", "write"],
  });
  const service = new PortalPermissionsService([portal1, portal2]);

  // Agent-1 allowed on Portal1, not Portal2
  const result1 = service.checkAgentAllowed("Portal1", "agent-1");
  assertEquals(result1.allowed, true);

  const result2 = service.checkAgentAllowed("Portal2", "agent-1");
  assertEquals(result2.allowed, false);

  // Agent-2 allowed on Portal2, not Portal1
  const result3 = service.checkAgentAllowed("Portal1", "agent-2");
  assertEquals(result3.allowed, false);

  const result4 = service.checkAgentAllowed("Portal2", "agent-2");
  assertEquals(result4.allowed, true);
});

Deno.test("PortalPermissions: validates operations per portal", () => {
  const portal1 = createTestPortal({
    alias: "Portal1",
    operations: ["read"],
  });
  const portal2 = createTestPortal({
    alias: "Portal2",
    operations: ["read", "write", "git"],
  });
  const service = new PortalPermissionsService([portal1, portal2]);

  // Portal1: only read allowed
  const read1 = service.checkOperationAllowed("Portal1", "agent-1", "read");
  assertEquals(read1.allowed, true);

  const write1 = service.checkOperationAllowed("Portal1", "agent-1", "write");
  assertEquals(write1.allowed, false);

  // Portal2: all operations allowed
  const read2 = service.checkOperationAllowed("Portal2", "agent-2", "read");
  assertEquals(read2.allowed, true);

  const write2 = service.checkOperationAllowed("Portal2", "agent-2", "write");
  assertEquals(write2.allowed, true);

  const git2 = service.checkOperationAllowed("Portal2", "agent-2", "git");
  assertEquals(git2.allowed, true);
});

// ============================================================================
// Audit Configuration Tests
// ============================================================================

Deno.test("PortalPermissions: returns audit configuration", () => {
  const portal = createTestPortal({
    security: {
      mode: "hybrid",
      audit_enabled: true,
      log_all_actions: false,
    },
  });
  const service = new PortalPermissionsService([portal]);

  const config = service.getSecurityConfig("TestPortal");

  assertExists(config);
  assertEquals(config?.mode, "hybrid");
  assertEquals(config?.audit_enabled, true);
  assertEquals(config?.log_all_actions, false);
});

Deno.test("PortalPermissions: returns default audit config if not specified", () => {
  const portal = createTestPortal({
    security: undefined,
  });
  const service = new PortalPermissionsService([portal]);

  const config = service.getSecurityConfig("TestPortal");

  assertExists(config);
  assertEquals(config?.mode, "sandboxed");
  assertEquals(config?.audit_enabled, true);
  assertEquals(config?.log_all_actions, true);
});
