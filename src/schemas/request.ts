import { z } from "zod";

/**
 * Schema for ExoFrame request frontmatter
 *
 * Validates the YAML frontmatter structure in request markdown files
 * located in /Inbox/Requests
 */
export const RequestSchema = z.object({
  trace_id: z.string().uuid("Invalid trace_id: must be a valid UUID"),
  agent_id: z.string().min(1, "agent_id cannot be empty"),
  status: z.enum(["pending", "in_progress", "completed", "failed"], {
    errorMap: () => ({ message: "status must be one of: pending, in_progress, completed, failed" }),
  }),
  priority: z.number().int().min(0).max(10).default(5),
  created_at: z.string().datetime().optional(),
  tags: z.array(z.string()).default([]),
});

export type Request = z.infer<typeof RequestSchema>;
