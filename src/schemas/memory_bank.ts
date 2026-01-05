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

// ===== Learning Schemas (Phase 12.8: Global Memory) =====

/**
 * Learning reference - links to supporting evidence
 */
export const LearningReferenceSchema = z.object({
  type: z.enum(["file", "execution", "url", "doc"]),
  path: z.string(),
});

/**
 * Learning schema - represents a learned insight, pattern, or decision
 *
 * Learnings can be project-scoped or global, and flow through
 * a pending → approved workflow for quality control.
 */
export const LearningSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string().datetime(),
  source: z.enum(["execution", "user", "agent"]).describe("Who/what created this learning"),
  source_id: z.string().optional().describe("trace_id or user session if applicable"),

  scope: z.enum(["global", "project"]).describe("Whether this applies globally or to a specific project"),
  project: z.string().optional().describe("Portal name if project-scoped"),

  title: z.string().max(100).describe("Short title for the learning"),
  description: z.string().max(2000).describe("Detailed description of the learning"),

  category: z.enum([
    "pattern", // Code pattern learned
    "anti-pattern", // What to avoid
    "decision", // Architectural choice
    "insight", // General observation
    "troubleshooting", // Problem + solution
  ]).describe("Type of learning"),

  tags: z.array(z.string()).max(10).describe("Searchable tags"),

  confidence: z.enum(["low", "medium", "high"]).describe("Confidence level in this learning"),

  references: z.array(LearningReferenceSchema).optional().describe("Supporting evidence"),

  status: z.enum(["pending", "approved", "rejected", "archived"]).describe("Approval status"),
  approved_at: z.string().datetime().optional(),
  archived_at: z.string().datetime().optional(),
});

export type LearningReference = z.infer<typeof LearningReferenceSchema>;
export type Learning = z.infer<typeof LearningSchema>;

/**
 * Global pattern - a code pattern that applies across projects
 */
export const GlobalPatternSchema = z.object({
  name: z.string(),
  description: z.string(),
  applies_to: z.array(z.string()).describe("Project patterns or 'all'"),
  examples: z.array(z.string()),
  tags: z.array(z.string()),
});

/**
 * Global anti-pattern - something to avoid across all projects
 */
export const GlobalAntiPatternSchema = z.object({
  name: z.string(),
  description: z.string(),
  reason: z.string().describe("Why this is an anti-pattern"),
  alternative: z.string().describe("What to do instead"),
  tags: z.array(z.string()),
});

/**
 * Global memory statistics
 */
export const GlobalMemoryStatsSchema = z.object({
  total_learnings: z.number(),
  by_category: z.record(z.number()),
  by_project: z.record(z.number()),
  last_activity: z.string().datetime(),
});

/**
 * Global memory - cross-project learnings and patterns
 *
 * Stored in Memory/Global/ and contains learnings that apply
 * across all projects in the workspace.
 */
export const GlobalMemorySchema = z.object({
  version: z.string().describe("Schema version"),
  updated_at: z.string().datetime(),

  learnings: z.array(LearningSchema),

  patterns: z.array(GlobalPatternSchema).describe("Global code patterns"),

  anti_patterns: z.array(GlobalAntiPatternSchema).describe("What to avoid"),

  statistics: GlobalMemoryStatsSchema,
});

export type GlobalPattern = z.infer<typeof GlobalPatternSchema>;
export type GlobalAntiPattern = z.infer<typeof GlobalAntiPatternSchema>;
export type GlobalMemoryStats = z.infer<typeof GlobalMemoryStatsSchema>;
export type GlobalMemory = z.infer<typeof GlobalMemorySchema>;

// ===== Memory Update Proposal Schema (Phase 12.9: Agent Memory Updates) =====

/**
 * Partial learning schema for proposals (without status/approved_at fields)
 * These fields are managed by the proposal workflow, not the learning itself.
 */
export const ProposalLearningSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string().datetime(),
  source: z.enum(["execution", "user", "agent"]),
  source_id: z.string().optional(),

  scope: z.enum(["global", "project"]),
  project: z.string().optional(),

  title: z.string().max(100),
  description: z.string().max(2000),

  category: z.enum([
    "pattern",
    "anti-pattern",
    "decision",
    "insight",
    "troubleshooting",
  ]),

  tags: z.array(z.string()).max(10).optional().default([]),

  confidence: z.enum(["low", "medium", "high"]),

  references: z.array(LearningReferenceSchema).optional(),
});

/**
 * Memory Update Proposal - represents a proposed memory change
 *
 * Proposals are written to Memory/Pending/ and flow through
 * a review workflow: pending → approved/rejected
 */
export const MemoryUpdateProposalSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string().datetime(),

  operation: z.enum(["add", "update", "promote", "demote", "archive"])
    .describe("Type of memory operation"),
  target_scope: z.enum(["global", "project"])
    .describe("Where the learning should be stored"),
  target_project: z.string().optional()
    .describe("Portal name if target_scope is 'project'"),

  learning: ProposalLearningSchema.describe("The proposed learning content"),

  reason: z.string().describe("Why this update is proposed"),
  agent: z.string().describe("Agent that proposed the update"),
  execution_id: z.string().optional().describe("Related execution trace_id"),

  status: z.enum(["pending", "approved", "rejected"])
    .describe("Current proposal status"),
  reviewed_at: z.string().datetime().optional(),
  reviewed_by: z.enum(["user", "auto"]).optional(),
});

export type ProposalLearning = z.infer<typeof ProposalLearningSchema>;
export type MemoryUpdateProposal = z.infer<typeof MemoryUpdateProposalSchema>;

// ===== Skill Schemas (Phase 17: Skills Architecture) =====

/**
 * Skill trigger conditions - determines when a skill should be activated
 */
export const SkillTriggersSchema = z.object({
  /** Keywords that trigger this skill (e.g., "implement", "security", "test") */
  keywords: z.array(z.string()).optional(),
  /** Task types this skill applies to (e.g., "feature", "bugfix", "refactor") */
  task_types: z.array(z.string()).optional(),
  /** File patterns that trigger this skill (glob patterns) */
  file_patterns: z.array(z.string()).optional(),
  /** Tags for matching (e.g., "testing", "security") */
  tags: z.array(z.string()).optional(),
});

/**
 * Quality criterion for skill evaluation
 */
export const SkillQualityCriterionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  weight: z.number().min(0).max(100).default(50),
});

/**
 * Skill compatibility constraints
 */
export const SkillCompatibilitySchema = z.object({
  /** Agent IDs this skill is compatible with ("*" for all) */
  agents: z.array(z.string()).default(["*"]),
  /** Flow IDs this skill can be used in */
  flows: z.array(z.string()).optional(),
});

/**
 * Skill - Procedural memory for how to accomplish tasks
 *
 * Unlike Learnings (observations) or Patterns (structures),
 * Skills are actionable instructions that agents apply.
 *
 * Skills encode domain expertise, procedures, and best practices
 * as reusable instruction modules.
 */
export const SkillSchema = z.object({
  // === Memory Bank Standard Fields ===
  id: z.string().uuid(),
  created_at: z.string().datetime(),
  source: z.enum(["user", "agent", "learned"]).describe("Origin of the skill"),
  source_id: z.string().optional().describe("Learning IDs if derived"),

  scope: z.enum(["global", "project"]).describe("Applicability scope"),
  project: z.string().optional().describe("Portal name if project-scoped"),

  status: z.enum(["draft", "active", "deprecated"]).describe("Skill lifecycle status"),

  // === Skill Identity ===
  skill_id: z.string().regex(/^[a-z0-9-]+$/).describe("Unique skill identifier (kebab-case)"),
  name: z.string().min(1).max(100).describe("Human-readable skill name"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).describe("Semantic version"),
  description: z.string().describe("Brief description of what the skill does"),

  // === Trigger Conditions ===
  triggers: SkillTriggersSchema.describe("Conditions for automatic activation"),

  // === Procedural Knowledge ===
  instructions: z.string().min(10).describe("The procedural instructions (markdown)"),

  // === Constraints and Quality ===
  constraints: z.array(z.string()).optional().describe("Rules that must be followed"),
  output_requirements: z.array(z.string()).optional().describe("Expected output format/content"),
  quality_criteria: z.array(SkillQualityCriterionSchema).optional().describe("Evaluation criteria"),

  // === Compatibility ===
  compatible_with: SkillCompatibilitySchema.optional().describe("Compatibility constraints"),

  // === Evolution Tracking ===
  derived_from: z.array(z.string()).optional().describe("Learning IDs this skill was derived from"),
  effectiveness_score: z.number().min(0).max(100).optional().describe("Measured effectiveness"),
  usage_count: z.number().default(0).describe("Number of times skill has been used"),
});

export type SkillTriggers = z.infer<typeof SkillTriggersSchema>;
export type SkillQualityCriterion = z.infer<typeof SkillQualityCriterionSchema>;
export type SkillCompatibility = z.infer<typeof SkillCompatibilitySchema>;
export type Skill = z.infer<typeof SkillSchema>;

/**
 * Skill match result from trigger matching
 */
export interface SkillMatch {
  skillId: string;
  confidence: number;
  matchedTriggers: {
    keywords?: string[];
    task_types?: string[];
    file_patterns?: string[];
    tags?: string[];
  };
}

/**
 * Skill index entry for fast lookup
 */
export const SkillIndexEntrySchema = z.object({
  skill_id: z.string(),
  name: z.string(),
  version: z.string(),
  status: z.enum(["draft", "active", "deprecated"]),
  scope: z.enum(["global", "project"]),
  project: z.string().optional(),
  triggers: SkillTriggersSchema,
  path: z.string().describe("Relative path to skill file"),
});

/**
 * Skill index for the Memory/Skills/ directory
 */
export const SkillIndexSchema = z.object({
  version: z.string().default("1.0.0"),
  updated_at: z.string().datetime(),
  skills: z.array(SkillIndexEntrySchema),
});

export type SkillIndexEntry = z.infer<typeof SkillIndexEntrySchema>;
export type SkillIndex = z.infer<typeof SkillIndexSchema>;

// ===== Helper Types =====

/**
 * Search result from memory bank queries
 */
export interface MemorySearchResult {
  type: "project" | "execution" | "pattern" | "decision" | "learning";
  portal?: string;
  trace_id?: string;
  title: string;
  summary: string;
  relevance_score?: number;
  tags?: string[];
  id?: string;
}

/**
 * Advanced search options for searchMemoryAdvanced
 */
export interface AdvancedSearchOptions {
  tags?: string[];
  keyword?: string;
  portal?: string;
  limit?: number;
  useEmbeddings?: boolean;
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
