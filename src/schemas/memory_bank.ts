/**
 * Memory Banks Schemas
 *
 * Data structures for ExoFrame's Memory Banks system.
 * Memory Banks provide programmatic storage for:
 * - Project-specific memory (patterns, decisions, references)
 * - Execution history (what was done, when, by whom)
 * - Lessons learned and architectural decisions
 *
 * Directory structure:
 * Memory/
 *   Projects/{portal}/      - Project-specific knowledge
 *   Execution/{trace-id}/   - Execution history
 *   Tasks/                  - Active and completed tasks
 *   Index/                  - Searchable indices
 */

import { z } from "zod";

// ===== Project Memory Schemas =====

export const PatternSchema = z.object({
  name: z.string().describe("Pattern name (e.g., 'Repository Pattern')"),
  description: z.string().describe("What the pattern does and why it's used"),
  examples: z.array(z.string()).describe("File paths demonstrating this pattern"),
  tags: z.array(z.string()).optional().describe("Searchable tags (e.g., 'architecture', 'database')"),
});

export const DecisionSchema = z.object({
  date: z.string().describe("ISO date when decision was made (YYYY-MM-DD)"),
  decision: z.string().describe("What was decided"),
  rationale: z.string().describe("Why this decision was made"),
  alternatives: z.array(z.string()).optional().describe("Other options considered"),
  tags: z.array(z.string()).optional().describe("Searchable tags"),
});

export const ReferenceSchema = z.object({
  type: z.enum(["file", "api", "doc", "url"]).describe("Type of reference"),
  path: z.string().describe("Path or URL to the reference"),
  description: z.string().describe("What this reference is about"),
});

export const ProjectMemorySchema = z.object({
  portal: z.string().describe("Portal name this memory belongs to"),
  overview: z.string().describe("High-level project summary and context"),
  patterns: z.array(PatternSchema).describe("Code patterns and conventions learned"),
  decisions: z.array(DecisionSchema).describe("Architectural decisions and their rationale"),
  references: z.array(ReferenceSchema).describe("Key references (files, docs, APIs)"),
});

export type Pattern = z.infer<typeof PatternSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type Reference = z.infer<typeof ReferenceSchema>;
export type ProjectMemory = z.infer<typeof ProjectMemorySchema>;

// ===== Execution Memory Schemas =====

export const ChangesSchema = z.object({
  files_created: z.array(z.string()).describe("Files created during execution"),
  files_modified: z.array(z.string()).describe("Files modified during execution"),
  files_deleted: z.array(z.string()).describe("Files deleted during execution"),
});

export const ExecutionMemorySchema = z.object({
  trace_id: z.string().uuid().describe("Unique execution trace ID"),
  request_id: z.string().describe("Request ID that triggered this execution"),
  started_at: z.string().describe("ISO timestamp when execution started"),
  completed_at: z.string().optional().describe("ISO timestamp when execution completed (if finished)"),
  status: z.enum(["running", "completed", "failed"]).describe("Current execution status"),

  portal: z.string().describe("Portal this execution ran against"),
  agent: z.string().describe("Agent that performed the execution"),
  summary: z.string().describe("Human-readable summary of what was done"),

  context_files: z.array(z.string()).describe("Files provided as context"),
  context_portals: z.array(z.string()).describe("Portals used for context"),

  changes: ChangesSchema.describe("Files created/modified/deleted"),

  lessons_learned: z.array(z.string()).optional().describe("Insights and learnings from this execution"),
  error_message: z.string().optional().describe("Error message if execution failed"),
});

export type Changes = z.infer<typeof ChangesSchema>;
export type ExecutionMemory = z.infer<typeof ExecutionMemorySchema>;

// ===== Helper Types =====

/**
 * Search result from memory bank queries
 */
export interface MemorySearchResult {
  type: "project" | "execution" | "pattern" | "decision";
  portal?: string;
  trace_id?: string;
  title: string;
  summary: string;
  relevance_score?: number;
}

/**
 * Activity summary combining execution history and task activity
 */
export interface ActivitySummary {
  timestamp: string;
  type: "execution" | "task" | "decision";
  portal: string;
  summary: string;
  trace_id?: string;
}
