/**
 * Changeset Schema
 *
 * Defines the structure for changesets created by agents during plan execution.
 * Changesets represent code changes that are pending review and approval.
 */

import { z } from "zod";

/**
 * Changeset status values
 */
export const ChangesetStatusSchema = z.enum([
  "pending", // Created by agent, awaiting review
  "approved", // Approved and merged to main
  "rejected", // Rejected, branch deleted
]);

export type ChangesetStatus = z.infer<typeof ChangesetStatusSchema>;

/**
 * Changeset schema with all fields
 */
export const ChangesetSchema = z.object({
  id: z.string().uuid(), // Changeset UUID
  trace_id: z.string().uuid(), // Link to request/plan trace
  portal: z.string().min(1), // Portal name
  branch: z.string().min(1), // Git branch name (feat/<desc>-<trace>)
  status: ChangesetStatusSchema, // Current status
  description: z.string(), // Description of changes
  commit_sha: z.string().nullish(), // Latest commit SHA from agent
  files_changed: z.number().int().nonnegative().default(0), // Number of files in commit
  created: z.string().datetime(), // ISO 8601 timestamp
  created_by: z.string().min(1), // Agent blueprint name
  approved_at: z.string().datetime().nullish(), // Approval timestamp
  approved_by: z.string().nullish(), // User who approved
  rejected_at: z.string().datetime().nullish(), // Rejection timestamp
  rejected_by: z.string().nullish(), // User who rejected
  rejection_reason: z.string().nullish(), // Reason for rejection
});

export type Changeset = z.infer<typeof ChangesetSchema>;

/**
 * Input for registering a new changeset
 */
export const RegisterChangesetSchema = z.object({
  trace_id: z.string().uuid(),
  portal: z.string().min(1),
  branch: z.string().min(1),
  commit_sha: z.string().optional(),
  files_changed: z.number().int().nonnegative().default(0),
  description: z.string(),
  created_by: z.string().min(1), // Agent name
});

export type RegisterChangesetInput = z.infer<typeof RegisterChangesetSchema>;

/**
 * Filters for listing changesets
 */
export const ChangesetFiltersSchema = z.object({
  trace_id: z.string().uuid().optional(),
  portal: z.string().optional(),
  status: ChangesetStatusSchema.optional(),
  created_by: z.string().optional(),
});

export type ChangesetFilters = z.infer<typeof ChangesetFiltersSchema>;
