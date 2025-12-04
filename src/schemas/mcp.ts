/**
 * MCP (Model Context Protocol) Schema
 * Zod schemas for MCP server types and validation
 */

import { z } from "zod";

// ============================================================================
// MCP Configuration Schema
// ============================================================================

export const MCPConfigSchema = z.object({
  enabled: z.boolean().default(true),
  transport: z.enum(["stdio", "sse"]).default("stdio"),
  server_name: z.string().default("exoframe"),
  version: z.string().default("1.0.0"),
});

export type MCPConfig = z.infer<typeof MCPConfigSchema>;

// ============================================================================
// MCP Tool Schemas
// ============================================================================

export const ReadFileToolArgsSchema = z.object({
  portal: z.string().min(1, "Portal name required"),
  path: z.string().min(1, "File path required"),
  agent_id: z.string().min(1, "Agent ID required").default("system"), // Step 6.3: Default to "system" for backwards compat
});

export const WriteFileToolArgsSchema = z.object({
  portal: z.string().min(1, "Portal name required"),
  path: z.string().min(1, "File path required"),
  content: z.string(),
  agent_id: z.string().min(1, "Agent ID required").default("system"), // Step 6.3: Default to "system" for backwards compat
});

export const ListDirectoryToolArgsSchema = z.object({
  portal: z.string().min(1, "Portal name required"),
  path: z.string().optional().default(""),
  agent_id: z.string().min(1, "Agent ID required").default("system"), // Step 6.3: Default to "system" for backwards compat
});

export const GitCreateBranchToolArgsSchema = z.object({
  portal: z.string().min(1, "Portal name required"),
  branch: z.string().min(1, "Branch name required")
    .regex(/^(feat|fix|docs|chore|refactor|test)\//, "Branch must start with feat/, fix/, docs/, etc."),
  agent_id: z.string().min(1, "Agent ID required").default("system"), // Step 6.3: Default to "system" for backwards compat
});

export const GitCommitToolArgsSchema = z.object({
  portal: z.string().min(1, "Portal name required"),
  message: z.string().min(1, "Commit message required"),
  files: z.array(z.string()).optional(),
  agent_id: z.string().min(1, "Agent ID required").default("system"), // Step 6.3: Default to "system" for backwards compat
});

export const GitStatusToolArgsSchema = z.object({
  portal: z.string().min(1, "Portal name required"),
  agent_id: z.string().min(1, "Agent ID required").default("system"), // Step 6.3: Default to "system" for backwards compat
});

// Union type for all tool arguments
export type MCPToolArgs =
  | z.infer<typeof ReadFileToolArgsSchema>
  | z.infer<typeof WriteFileToolArgsSchema>
  | z.infer<typeof ListDirectoryToolArgsSchema>
  | z.infer<typeof GitCreateBranchToolArgsSchema>
  | z.infer<typeof GitCommitToolArgsSchema>
  | z.infer<typeof GitStatusToolArgsSchema>;

// ============================================================================
// MCP Response Schemas
// ============================================================================

export const MCPContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const MCPToolResponseSchema = z.object({
  content: z.array(MCPContentSchema),
});

export const MCPErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});

export type MCPToolResponse = z.infer<typeof MCPToolResponseSchema>;
export type MCPError = z.infer<typeof MCPErrorSchema>;

// ============================================================================
// MCP Resource Schemas
// ============================================================================

export const MCPResourceSchema = z.object({
  uri: z.string().startsWith("portal://", "URI must start with portal://"),
  name: z.string(),
  mimeType: z.string().optional(),
  description: z.string().optional(),
});

export type MCPResource = z.infer<typeof MCPResourceSchema>;

// ============================================================================
// MCP Prompt Schemas
// ============================================================================

export const MCPPromptArgumentSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
});

export const MCPPromptSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  arguments: z.array(MCPPromptArgumentSchema).optional(),
});

export type MCPPrompt = z.infer<typeof MCPPromptSchema>;

// ============================================================================
// MCP Tool Definition Schema
// ============================================================================

export const MCPToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.object({
    type: z.literal("object"),
    properties: z.record(z.unknown()),
    required: z.array(z.string()).optional(),
  }),
});

export type MCPTool = z.infer<typeof MCPToolSchema>;
