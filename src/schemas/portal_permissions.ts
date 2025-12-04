/**
 * Portal Permissions Schema
 *
 * Defines security modes and permission controls for portal access.
 */

import { z } from "zod";

// ============================================================================
// Security Modes
// ============================================================================

/**
 * Security mode for agent execution:
 * - sandboxed: No file system access, all operations via MCP tools
 * - hybrid: Read-only portal access, writes via MCP tools with audit
 */
export const SecurityModeSchema = z.enum(["sandboxed", "hybrid"]);
export type SecurityMode = z.infer<typeof SecurityModeSchema>;

/**
 * Operations that can be permitted on a portal
 */
export const PortalOperationSchema = z.enum(["read", "write", "git"]);
export type PortalOperation = z.infer<typeof PortalOperationSchema>;

// ============================================================================
// Portal Security Configuration
// ============================================================================

/**
 * Security settings for a portal
 */
export const PortalSecurityConfigSchema = z.object({
  mode: SecurityModeSchema.default("sandboxed"),
  audit_enabled: z.boolean().default(true),
  log_all_actions: z.boolean().default(true),
});

export type PortalSecurityConfig = z.infer<typeof PortalSecurityConfigSchema>;

/**
 * Extended portal configuration with permissions
 */
export const PortalPermissionsSchema = z.object({
  alias: z.string(),
  target_path: z.string(),
  created: z.string().optional(),

  // Permission controls
  agents_allowed: z.array(z.string()).default(["*"]), // "*" = all agents
  operations: z.array(PortalOperationSchema).default(["read", "write", "git"]),

  // Security settings
  security: PortalSecurityConfigSchema.optional(),
});

export type PortalPermissions = z.infer<typeof PortalPermissionsSchema>;

// ============================================================================
// Permission Check Results
// ============================================================================

/**
 * Result of a permission check
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  portal: string;
  agent_id: string;
  operation: PortalOperation;
}

/**
 * Result of agent whitelist check
 */
export interface AgentWhitelistResult {
  allowed: boolean;
  reason?: string;
  portal: string;
  agent_id: string;
}
