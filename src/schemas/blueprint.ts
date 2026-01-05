/**
 * Blueprint Schema
 * Implements Step 5.11 - Blueprint Creation and Management
 *
 * Defines Zod validation schemas for agent blueprint files.
 */

import { z } from "zod";

// ============================================================================
// Blueprint Frontmatter Schema
// ============================================================================

/**
 * Zod schema for blueprint frontmatter validation
 */
export const BlueprintFrontmatterSchema = z.object({
  /** Unique agent identifier (lowercase alphanumeric + hyphens) */
  agent_id: z.string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "agent_id must be lowercase alphanumeric with hyphens only"),

  /** Human-readable agent name */
  name: z.string().min(1).max(100),

  /** Model in provider:model format */
  model: z.string()
    .min(1)
    .regex(/^[a-z]+:[a-z0-9-.:]+$/, "model must be in provider:model format"),

  /** Agent capabilities */
  capabilities: z.array(z.string()).optional().default([]),

  /** ISO 8601 timestamp */
  created: z.string().datetime(),

  /** User who created the blueprint */
  created_by: z.string(),

  /** Semantic version */
  version: z.string().regex(/^\d+\.\d+\.\d+$/).default("1.0.0"),

  /** Optional description */
  description: z.string().optional(),

  /** Default skills to apply to all requests for this agent (Phase 17) */
  default_skills: z.array(z.string()).optional(),
});

export type BlueprintFrontmatter = z.infer<typeof BlueprintFrontmatterSchema>;

// ============================================================================
// Blueprint Result Types
// ============================================================================

/**
 * Result from blueprint creation
 */
export interface BlueprintCreateResult {
  agent_id: string;
  name: string;
  model: string;
  capabilities?: string[];
  created: string;
  created_by: string;
  version: string;
  path: string;
}

/**
 * Metadata for blueprint listing
 */
export interface BlueprintMetadata {
  agent_id: string;
  name: string;
  model: string;
  capabilities?: string[];
  created: string;
  created_by: string;
  version: string;
}

/**
 * Full blueprint details for show command
 */
export interface BlueprintDetails extends BlueprintMetadata {
  content: string; // Full markdown content including frontmatter
}

/**
 * Validation result
 */
export interface BlueprintValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// ============================================================================
// Reserved Agent IDs
// ============================================================================

/**
 * Agent IDs that cannot be used for custom blueprints
 */
export const RESERVED_AGENT_IDS = new Set([
  "system",
  "test",
]);

/**
 * Check if agent_id is reserved
 */
export function isReservedAgentId(agentId: string): boolean {
  return RESERVED_AGENT_IDS.has(agentId);
}
