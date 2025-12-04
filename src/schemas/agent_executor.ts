/**
 * Agent Executor Schema
 *
 * Zod schemas for agent execution context, options, and results.
 * Used by AgentExecutor service for type-safe agent orchestration.
 */

import { z } from "zod";

/**
 * Security mode for agent execution
 */
export const SecurityModeSchema = z.enum(["sandboxed", "hybrid"]);
export type SecurityMode = z.infer<typeof SecurityModeSchema>;

/**
 * Execution context passed to agent via MCP
 */
export const ExecutionContextSchema = z.object({
  trace_id: z.string().uuid(),
  request_id: z.string(),
  request: z.string().describe("Original user request content"),
  plan: z.string().describe("Plan to execute"),
  portal: z.string().describe("Target portal name"),
  step_number: z.number().int().positive().optional().describe(
    "Step number if executing multi-step plan",
  ),
});
export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;

/**
 * Options for agent execution
 */
export const AgentExecutionOptionsSchema = z.object({
  agent_id: z.string().describe("Agent blueprint name"),
  portal: z.string().describe("Portal name"),
  security_mode: SecurityModeSchema,
  timeout_ms: z.number().int().positive().default(300000).describe(
    "Execution timeout (default: 5 minutes)",
  ),
  max_tool_calls: z.number().int().positive().default(100).describe(
    "Maximum MCP tool calls allowed",
  ),
  audit_enabled: z.boolean().default(true).describe(
    "Enable post-execution git audit",
  ),
});
export type AgentExecutionOptions = z.infer<
  typeof AgentExecutionOptionsSchema
>;

/**
 * Result from agent execution
 */
export const ChangesetResultSchema = z.object({
  branch: z.string().describe("Git branch created"),
  commit_sha: z.string().regex(/^[0-9a-f]{7,40}$/).describe(
    "Git commit SHA",
  ),
  files_changed: z.array(z.string()).describe("List of modified files"),
  description: z.string().describe("Changeset description"),
  tool_calls: z.number().int().nonnegative().describe(
    "Number of MCP tool calls made",
  ),
  execution_time_ms: z.number().int().nonnegative().describe(
    "Execution duration in milliseconds",
  ),
  unauthorized_changes: z.array(z.string()).optional().describe(
    "Files modified outside MCP tools (hybrid mode audit)",
  ),
});
export type ChangesetResult = z.infer<typeof ChangesetResultSchema>;

/**
 * Agent execution error types
 */
export const AgentExecutionErrorTypeSchema = z.enum([
  "timeout",
  "blueprint_not_found",
  "portal_not_found",
  "permission_denied",
  "mcp_connection_failed",
  "tool_error",
  "git_error",
  "security_violation",
  "agent_error",
]);
export type AgentExecutionErrorType = z.infer<
  typeof AgentExecutionErrorTypeSchema
>;

/**
 * Agent execution error details
 */
export const AgentExecutionErrorSchema = z.object({
  type: AgentExecutionErrorTypeSchema,
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  trace_id: z.string().uuid().optional(),
});
export type AgentExecutionError = z.infer<typeof AgentExecutionErrorSchema>;
