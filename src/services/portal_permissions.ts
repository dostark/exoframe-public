/**
 * Portal Permissions Service (Step 6.3)
 * 
 * Validates agent access to portals based on whitelist, operations,
 * and security modes.
 */

import type {
  AgentWhitelistResult,
  PermissionCheckResult,
  PortalOperation,
  PortalPermissions,
  PortalSecurityConfig,
  SecurityMode,
} from "../schemas/portal_permissions.ts";

/**
 * Service for validating portal permissions
 */
export class PortalPermissionsService {
  private portals: Map<string, PortalPermissions>;

  constructor(portals: PortalPermissions[]) {
    this.portals = new Map();
    for (const portal of portals) {
      this.portals.set(portal.alias, portal);
    }
  }

  /**
   * Check if an agent is allowed to access a portal
   */
  checkAgentAllowed(portalAlias: string, agentId: string): AgentWhitelistResult {
    const portal = this.portals.get(portalAlias);

    if (!portal) {
      return {
        allowed: false,
        reason: `Portal '${portalAlias}' not found`,
        portal: portalAlias,
        agent_id: agentId,
      };
    }

    // Check if agent is in whitelist
    const agentsAllowed = portal.agents_allowed || ["*"];

    // Wildcard allows all agents
    if (agentsAllowed.includes("*")) {
      return {
        allowed: true,
        portal: portalAlias,
        agent_id: agentId,
      };
    }

    // Check explicit whitelist
    if (agentsAllowed.includes(agentId)) {
      return {
        allowed: true,
        portal: portalAlias,
        agent_id: agentId,
      };
    }

    return {
      allowed: false,
      reason: `Agent '${agentId}' is not allowed to access portal '${portalAlias}'`,
      portal: portalAlias,
      agent_id: agentId,
    };
  }

  /**
   * Check if an operation is allowed for an agent on a portal
   */
  checkOperationAllowed(
    portalAlias: string,
    agentId: string,
    operation: PortalOperation,
  ): PermissionCheckResult {
    // First check if agent is allowed
    const agentCheck = this.checkAgentAllowed(portalAlias, agentId);
    if (!agentCheck.allowed) {
      return {
        allowed: false,
        reason: agentCheck.reason,
        portal: portalAlias,
        agent_id: agentId,
        operation,
      };
    }

    const portal = this.portals.get(portalAlias)!;

    // Check if operation is permitted
    const operations = portal.operations || ["read", "write", "git"];
    if (!operations.includes(operation)) {
      return {
        allowed: false,
        reason: `Operation '${operation}' is not permitted on portal '${portalAlias}'`,
        portal: portalAlias,
        agent_id: agentId,
        operation,
      };
    }

    return {
      allowed: true,
      portal: portalAlias,
      agent_id: agentId,
      operation,
    };
  }

  /**
   * Get security mode for a portal
   */
  getSecurityMode(portalAlias: string): SecurityMode {
    const portal = this.portals.get(portalAlias);
    if (!portal || !portal.security) {
      return "sandboxed"; // Default to most secure mode
    }

    return portal.security.mode;
  }

  /**
   * Get security configuration for a portal
   */
  getSecurityConfig(portalAlias: string): PortalSecurityConfig | null {
    const portal = this.portals.get(portalAlias);
    if (!portal) {
      return null;
    }

    // Return security config or default
    return portal.security || {
      mode: "sandboxed",
      audit_enabled: true,
      log_all_actions: true,
    };
  }

  /**
   * Get portal configuration by alias
   */
  getPortal(portalAlias: string): PortalPermissions | null {
    return this.portals.get(portalAlias) || null;
  }

  /**
   * List all portals accessible by an agent
   */
  listAccessiblePortals(agentId: string): PortalPermissions[] {
    const accessible: PortalPermissions[] = [];

    for (const portal of this.portals.values()) {
      const check = this.checkAgentAllowed(portal.alias, agentId);
      if (check.allowed) {
        accessible.push(portal);
      }
    }

    return accessible;
  }

  /**
   * Get all portal aliases
   */
  listPortalAliases(): string[] {
    return Array.from(this.portals.keys());
  }
}
