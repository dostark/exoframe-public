/**
 * Memory Extractor Service
 *
 * Extracts learnings from agent executions and creates memory update proposals.
 * Part of Phase 12.9: Agent Memory Updates
 *
 * Key responsibilities:
 * - Analyze execution results for learnable patterns
 * - Create proposals in Memory/Pending/
 * - Manage pending proposal lifecycle (approve/reject)
 * - Activity Journal integration
 */

import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";
import type { MemoryBankService } from "./memory_bank.ts";
import type {
  ExecutionMemory,
  Learning,
  MemoryUpdateProposal,
  Pattern,
  ProposalLearning,
} from "../schemas/memory_bank.ts";
import { MemoryUpdateProposalSchema } from "../schemas/memory_bank.ts";

/**
 * Memory Extractor Service
 *
 * Analyzes executions and manages memory update proposals.
 */
export class MemoryExtractorService {
  private pendingDir: string;

  constructor(
    private config: Config,
    private db: DatabaseService,
    private memoryBank: MemoryBankService,
  ) {
    this.pendingDir = join(config.system.root, "Memory", "Pending");
  }

  // ===== Extraction Operations =====

  /**
   * Analyze an execution and extract potential learnings
   *
   * @param execution - Completed execution memory
   * @returns Array of extracted learnings (without status, ready for proposal)
   */
  analyzeExecution(execution: ExecutionMemory): ProposalLearning[] {
    const learnings: ProposalLearning[] = [];

    // Skip trivial executions (no changes, no lessons)
    if (this.isTrivialExecution(execution)) {
      return learnings;
    }

    // Extract from lessons_learned field
    if (execution.lessons_learned && execution.lessons_learned.length > 0) {
      for (const lesson of execution.lessons_learned) {
        const learning = this.extractFromLesson(lesson, execution);
        if (learning) {
          learnings.push(learning);
        }
      }
    }

    // Extract patterns from successful executions
    if (execution.status === "completed") {
      const patternLearnings = this.extractPatternsFromSummary(execution);
      learnings.push(...patternLearnings);
    }

    // Extract troubleshooting from failed executions
    if (execution.status === "failed" && execution.error_message) {
      const troubleshootingLearning = this.extractFromFailure(execution);
      if (troubleshootingLearning) {
        learnings.push(troubleshootingLearning);
      }
    }

    // Deduplicate by title
    const seen = new Set<string>();
    return learnings.filter((l) => {
      const key = l.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Check if execution is too trivial to extract learnings from
   */
  private isTrivialExecution(execution: ExecutionMemory): boolean {
    // No changes made
    const changes = execution.changes;
    const hasChanges = (changes.files_created?.length || 0) +
        (changes.files_modified?.length || 0) +
        (changes.files_deleted?.length || 0) > 0;

    // No lessons learned
    const hasLessons = execution.lessons_learned && execution.lessons_learned.length > 0;

    // Short summary (less than 50 chars usually means trivial)
    const hasMeaningfulSummary = execution.summary.length > 50;

    // No error message for failed
    const hasError = execution.status === "failed" && execution.error_message;

    return !hasChanges && !hasLessons && !hasMeaningfulSummary && !hasError;
  }

  /**
   * Extract a learning from a lessons_learned entry
   */
  private extractFromLesson(lesson: string, execution: ExecutionMemory): ProposalLearning | null {
    // Skip very short lessons
    if (lesson.length < 10) return null;

    // Determine category from content
    const category = this.categorizeLesson(lesson);

    return {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      source: "execution",
      source_id: execution.trace_id,
      scope: "project",
      project: execution.portal,
      title: this.extractTitle(lesson),
      description: lesson,
      category,
      tags: this.extractTags(lesson, execution),
      confidence: "medium",
      references: [
        { type: "execution", path: execution.trace_id },
      ],
    };
  }

  /**
   * Categorize a lesson based on its content
   */
  private categorizeLesson(lesson: string): ProposalLearning["category"] {
    const lower = lesson.toLowerCase();

    if (lower.includes("avoid") || lower.includes("don't") || lower.includes("never")) {
      return "anti-pattern";
    }
    if (lower.includes("pattern") || lower.includes("approach") || lower.includes("structure")) {
      return "pattern";
    }
    if (lower.includes("decided") || lower.includes("choice") || lower.includes("chose")) {
      return "decision";
    }
    if (lower.includes("error") || lower.includes("fix") || lower.includes("debug")) {
      return "troubleshooting";
    }
    return "insight";
  }

  /**
   * Extract a short title from a lesson
   */
  private extractTitle(text: string): string {
    // Take first sentence or first 100 chars
    const firstSentence = text.split(/[.!?]/)[0].trim();
    if (firstSentence.length <= 100) {
      return firstSentence;
    }
    return text.substring(0, 97) + "...";
  }

  /**
   * Extract relevant tags from content and execution context
   */
  private extractTags(content: string, execution: ExecutionMemory): string[] {
    const tags: string[] = [];
    const lower = content.toLowerCase();

    // Language/framework tags
    if (lower.includes("typescript") || execution.context_files.some((f) => f.endsWith(".ts"))) {
      tags.push("typescript");
    }
    if (lower.includes("async") || lower.includes("await")) {
      tags.push("async");
    }
    if (lower.includes("error") || lower.includes("exception")) {
      tags.push("error-handling");
    }
    if (lower.includes("test")) {
      tags.push("testing");
    }
    if (lower.includes("database") || lower.includes("sql")) {
      tags.push("database");
    }
    if (lower.includes("api") || lower.includes("rest") || lower.includes("http")) {
      tags.push("api");
    }

    return tags.slice(0, 5); // Max 5 tags
  }

  /**
   * Extract pattern learnings from execution summary
   */
  private extractPatternsFromSummary(execution: ExecutionMemory): ProposalLearning[] {
    const learnings: ProposalLearning[] = [];
    const summary = execution.summary.toLowerCase();

    // Look for common pattern indicators
    const patternIndicators = [
      { keyword: "repository pattern", pattern: "Repository Pattern" },
      { keyword: "factory pattern", pattern: "Factory Pattern" },
      { keyword: "singleton", pattern: "Singleton Pattern" },
      { keyword: "dependency injection", pattern: "Dependency Injection" },
      { keyword: "error handling", pattern: "Error Handling Pattern" },
      { keyword: "validation", pattern: "Input Validation" },
    ];

    for (const indicator of patternIndicators) {
      if (summary.includes(indicator.keyword)) {
        learnings.push({
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          source: "execution",
          source_id: execution.trace_id,
          scope: "project",
          project: execution.portal,
          title: `${indicator.pattern} Implementation`,
          description: `Learned ${indicator.pattern.toLowerCase()} from execution: ${execution.summary}`,
          category: "pattern",
          tags: this.extractTags(execution.summary, execution),
          confidence: "medium",
          references: [
            { type: "execution", path: execution.trace_id },
          ],
        });
      }
    }

    return learnings;
  }

  /**

  /**
   * Extract troubleshooting learning from failed execution
   */
  private extractFromFailure(execution: ExecutionMemory): ProposalLearning | null {
    if (!execution.error_message) return null;

    // Create troubleshooting entry
    const title = this.extractTitle(`Troubleshooting: ${execution.error_message}`);

    return {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      source: "execution",
      source_id: execution.trace_id,
      scope: "project",
      project: execution.portal,
      title,
      description: `Error encountered: ${execution.error_message}\n\nContext: ${execution.summary}${
        execution.lessons_learned?.length ? "\n\nResolution: " + execution.lessons_learned.join("; ") : ""
      }`,
      category: "troubleshooting",
      tags: ["error", ...this.extractTags(execution.error_message, execution)],
      confidence: "medium",
      references: [
        { type: "execution", path: execution.trace_id },
      ],
    };
  }
  // ===== Proposal Operations =====

  /**
   * Create a proposal from a learning and write to Pending directory
   *
   * @param learning - The learning to propose
   * @param execution - Source execution
   * @param agent - Agent that created the learning
   * @returns Proposal ID
   */
  async createProposal(
    learning: ProposalLearning,
    execution: ExecutionMemory,
    agent: string,
  ): Promise<string> {
    await ensureDir(this.pendingDir);

    const proposal: MemoryUpdateProposal = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      operation: "add",
      target_scope: learning.scope,
      target_project: learning.project,
      learning,
      reason: `Extracted from execution ${execution.trace_id}`,
      agent,
      execution_id: execution.trace_id,
      status: "pending",
    };

    // Validate proposal
    MemoryUpdateProposalSchema.parse(proposal);

    // Write to Pending directory
    const proposalPath = join(this.pendingDir, `${proposal.id}.json`);
    await Deno.writeTextFile(proposalPath, JSON.stringify(proposal, null, 2));

    // Log to Activity Journal
    this.logActivity({
      event_type: "memory.proposal.created",
      target: learning.project || "global",
      metadata: {
        proposal_id: proposal.id,
        learning_title: learning.title,
        category: learning.category,
        agent,
      },
    });

    return proposal.id;
  }

  /**
   * List all pending proposals
   *
   * @returns Array of pending proposals
   */
  async listPending(): Promise<MemoryUpdateProposal[]> {
    const proposals: MemoryUpdateProposal[] = [];

    if (!await exists(this.pendingDir)) {
      return proposals;
    }

    for await (const entry of Deno.readDir(this.pendingDir)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        try {
          const content = await Deno.readTextFile(join(this.pendingDir, entry.name));
          const proposal = MemoryUpdateProposalSchema.parse(JSON.parse(content));
          if (proposal.status === "pending") {
            proposals.push(proposal);
          }
        } catch {
          // Skip invalid files
        }
      }
    }

    // Sort by created_at descending
    proposals.sort((a, b) => b.created_at.localeCompare(a.created_at));

    return proposals;
  }

  /**
   * Get a specific pending proposal
   *
   * @param proposalId - Proposal ID
   * @returns Proposal or null if not found
   */
  async getPending(proposalId: string): Promise<MemoryUpdateProposal | null> {
    const proposalPath = join(this.pendingDir, `${proposalId}.json`);

    if (!await exists(proposalPath)) {
      return null;
    }

    try {
      const content = await Deno.readTextFile(proposalPath);
      return MemoryUpdateProposalSchema.parse(JSON.parse(content));
    } catch {
      return null;
    }
  }

  /**
   * Approve a pending proposal and merge the learning
   *
   * @param proposalId - Proposal ID to approve
   */
  async approvePending(proposalId: string): Promise<void> {
    const proposal = await this.getPending(proposalId);
    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    // Convert proposal learning to full Learning
    const learning: Learning = {
      ...proposal.learning,
      status: "approved",
      approved_at: new Date().toISOString(),
    };

    // Add to appropriate scope
    if (proposal.target_scope === "global") {
      await this.memoryBank.addGlobalLearning(learning);
    } else if (proposal.target_project) {
      // Add as pattern to project
      const pattern: Pattern = {
        name: learning.title,
        description: learning.description,
        examples: learning.references?.filter((r) => r.type === "file").map((r) => r.path) || [],
        tags: learning.tags,
      };
      await this.memoryBank.addPattern(proposal.target_project, pattern);
    }

    // Remove proposal file
    const proposalPath = join(this.pendingDir, `${proposalId}.json`);
    await Deno.remove(proposalPath);

    // Log approval
    this.logActivity({
      event_type: "memory.proposal.approved",
      target: proposal.target_project || "global",
      metadata: {
        proposal_id: proposalId,
        learning_title: proposal.learning.title,
      },
    });
  }

  /**
   * Reject a pending proposal
   *
   * @param proposalId - Proposal ID to reject
   * @param reason - Rejection reason
   */
  async rejectPending(proposalId: string, reason: string): Promise<void> {
    const proposal = await this.getPending(proposalId);
    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    // Remove proposal file
    const proposalPath = join(this.pendingDir, `${proposalId}.json`);
    await Deno.remove(proposalPath);

    // Log rejection
    this.logActivity({
      event_type: "memory.proposal.rejected",
      target: proposal.target_project || "global",
      metadata: {
        proposal_id: proposalId,
        learning_title: proposal.learning.title,
        reason,
      },
    });
  }

  /**
   * Approve all pending proposals
   *
   * @returns Number of proposals approved
   */
  async approveAll(): Promise<number> {
    const pending = await this.listPending();
    let approved = 0;

    for (const proposal of pending) {
      try {
        await this.approvePending(proposal.id);
        approved++;
      } catch {
        // Skip failed approvals, continue with others
      }
    }

    return approved;
  }

  // ===== Private Helpers =====

  /**
   * Log activity to Activity Journal
   */
  private logActivity(event: {
    event_type: string;
    target: string;
    trace_id?: string;
    metadata?: Record<string, unknown>;
  }): void {
    try {
      this.db.logActivity(
        "memory-extractor",
        event.event_type,
        event.target,
        event.metadata || {},
        event.trace_id,
      );
    } catch {
      // Don't fail on logging errors
    }
  }
}
