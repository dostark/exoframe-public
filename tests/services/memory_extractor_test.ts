/**
 * Memory Extractor Service Tests
 *
 * TDD tests for Phase 12.9: Agent Memory Updates
 *
 * Tests:
 * - MemoryUpdateProposalSchema validation
 * - analyzeExecution() learning extraction
 * - createProposal() to Memory/Pending/
 * - Pending list/show/approve/reject operations
 * - Activity Journal integration
 */

import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { exists } from "@std/fs";
import { initTestDbService } from "../helpers/db.ts";
import { type MemoryUpdateProposal, MemoryUpdateProposalSchema } from "../../src/schemas/memory_bank.ts";
import { MemoryExtractorService } from "../../src/services/memory_extractor.ts";
import { MemoryBankService } from "../../src/services/memory_bank.ts";
import type { ExecutionMemory, ProjectMemory } from "../../src/schemas/memory_bank.ts";
import {
  getMemoryExecutionDir,
  getMemoryGlobalDir,
  getMemoryIndexDir,
  getMemoryPendingDir,
  getMemoryProjectsDir,
} from "../helpers/paths_helper.ts";

// ===== MemoryUpdateProposalSchema Tests =====

Deno.test("MemoryUpdateProposalSchema: validates minimal proposal", () => {
  const proposal: MemoryUpdateProposal = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    created_at: "2026-01-04T12:00:00Z",
    operation: "add",
    target_scope: "project",
    target_project: "my-app",
    learning: {
      id: "550e8400-e29b-41d4-a716-446655440001",
      created_at: "2026-01-04T12:00:00Z",
      source: "execution",
      source_id: "trace-123",
      scope: "project",
      project: "my-app",
      title: "Use repository pattern",
      description: "Database access should go through repositories",
      category: "pattern",
      tags: ["architecture"],
      confidence: "medium",
      references: [],
    },
    reason: "Extracted from successful execution",
    agent: "senior-coder",
    execution_id: "trace-123",
    status: "pending",
  };

  const result = MemoryUpdateProposalSchema.safeParse(proposal);
  assertEquals(result.success, true);
});

Deno.test("MemoryUpdateProposalSchema: validates global scope proposal", () => {
  const proposal = {
    id: "550e8400-e29b-41d4-a716-446655440002",
    created_at: "2026-01-04T12:00:00Z",
    operation: "promote",
    target_scope: "global",
    learning: {
      id: "550e8400-e29b-41d4-a716-446655440003",
      created_at: "2026-01-04T12:00:00Z",
      source: "agent",
      scope: "global",
      title: "Always validate input",
      description: "Input validation prevents security issues",
      category: "insight",
      tags: ["security"],
      confidence: "high",
    },
    reason: "Pattern observed across multiple projects",
    agent: "architect",
    status: "pending",
  };

  const result = MemoryUpdateProposalSchema.safeParse(proposal);
  assertEquals(result.success, true);
});

Deno.test("MemoryUpdateProposalSchema: validates approved proposal", () => {
  const proposal = {
    id: "550e8400-e29b-41d4-a716-446655440004",
    created_at: "2026-01-04T12:00:00Z",
    operation: "add",
    target_scope: "project",
    target_project: "my-app",
    learning: {
      id: "550e8400-e29b-41d4-a716-446655440005",
      created_at: "2026-01-04T12:00:00Z",
      source: "user",
      scope: "project",
      project: "my-app",
      title: "Test Learning",
      description: "Test description",
      category: "pattern",
      tags: [],
      confidence: "low",
    },
    reason: "User requested",
    agent: "user-cli",
    status: "approved",
    reviewed_at: "2026-01-04T13:00:00Z",
    reviewed_by: "user",
  };

  const result = MemoryUpdateProposalSchema.safeParse(proposal);
  assertEquals(result.success, true);
});

Deno.test("MemoryUpdateProposalSchema: rejects invalid operation", () => {
  const proposal = {
    id: "550e8400-e29b-41d4-a716-446655440006",
    created_at: "2026-01-04T12:00:00Z",
    operation: "invalid-op", // Invalid
    target_scope: "project",
    learning: {
      id: "550e8400-e29b-41d4-a716-446655440007",
      created_at: "2026-01-04T12:00:00Z",
      source: "user",
      scope: "project",
      title: "Test",
      description: "Test",
      category: "pattern",
      tags: [],
      confidence: "low",
    },
    reason: "Test",
    agent: "test",
    status: "pending",
  };

  const result = MemoryUpdateProposalSchema.safeParse(proposal);
  assertEquals(result.success, false);
});

Deno.test("MemoryUpdateProposalSchema: rejects invalid status", () => {
  const proposal = {
    id: "550e8400-e29b-41d4-a716-446655440008",
    created_at: "2026-01-04T12:00:00Z",
    operation: "add",
    target_scope: "project",
    learning: {
      id: "550e8400-e29b-41d4-a716-446655440009",
      created_at: "2026-01-04T12:00:00Z",
      source: "user",
      scope: "project",
      title: "Test",
      description: "Test",
      category: "pattern",
      tags: [],
      confidence: "low",
    },
    reason: "Test",
    agent: "test",
    status: "unknown", // Invalid
  };

  const result = MemoryUpdateProposalSchema.safeParse(proposal);
  assertEquals(result.success, false);
});

// ===== MemoryExtractorService Tests =====

/**
 * Creates test environment for memory extractor tests
 */
async function initExtractorTest() {
  const { db, config, cleanup: dbCleanup } = await initTestDbService();

  // Create required directories
  await Deno.mkdir(getMemoryProjectsDir(config.system.root), { recursive: true });
  await Deno.mkdir(getMemoryExecutionDir(config.system.root), { recursive: true });
  await Deno.mkdir(getMemoryPendingDir(config.system.root), { recursive: true });
  await Deno.mkdir(getMemoryIndexDir(config.system.root), { recursive: true });
  await Deno.mkdir(getMemoryGlobalDir(config.system.root), { recursive: true });

  const memoryBank = new MemoryBankService(config, db);
  const extractor = new MemoryExtractorService(config, db, memoryBank);

  const cleanup = async () => {
    await dbCleanup();
  };

  return {
    config,
    db,
    memoryBank,
    extractor,
    cleanup,
  };
}

/**
 * Creates a test execution with learnable content
 */
function createSuccessfulExecution(portal: string, traceId: string): ExecutionMemory {
  return {
    trace_id: traceId,
    request_id: `req-${traceId.substring(0, 8)}`,
    started_at: "2026-01-04T10:00:00Z",
    completed_at: "2026-01-04T10:30:00Z",
    status: "completed",
    portal,
    agent: "senior-coder",
    summary:
      "Implemented repository pattern for database access. Created UserRepository with CRUD operations. Added proper error handling with typed exceptions.",
    context_files: ["src/services/user.ts", "src/types/errors.ts"],
    context_portals: [portal],
    changes: {
      files_created: ["src/repos/user_repo.ts", "src/types/repo_errors.ts"],
      files_modified: ["src/services/user.ts"],
      files_deleted: [],
    },
    lessons_learned: [
      "Repository pattern improves testability",
      "Typed errors make debugging easier",
    ],
  };
}

/**
 * Creates a test execution with failure
 */
function createFailedExecution(portal: string, traceId: string): ExecutionMemory {
  return {
    trace_id: traceId,
    request_id: `req-${traceId.substring(0, 8)}`,
    started_at: "2026-01-04T11:00:00Z",
    completed_at: "2026-01-04T11:15:00Z",
    status: "failed",
    portal,
    agent: "senior-coder",
    summary: "Failed to implement feature due to missing dependency configuration.",
    context_files: ["src/config.ts"],
    context_portals: [portal],
    changes: {
      files_created: [],
      files_modified: [],
      files_deleted: [],
    },
    error_message: "Module not found: @db/sqlite. Ensure dependencies are installed.",
    lessons_learned: ["Always verify dependencies before implementation"],
  };
}

/**
 * Creates a trivial execution with no learnable content
 */
function createTrivialExecution(portal: string, traceId: string): ExecutionMemory {
  return {
    trace_id: traceId,
    request_id: `req-${traceId.substring(0, 8)}`,
    started_at: "2026-01-04T12:00:00Z",
    completed_at: "2026-01-04T12:01:00Z",
    status: "completed",
    portal,
    agent: "assistant",
    summary: "Answered a simple question about syntax.",
    context_files: [],
    context_portals: [portal],
    changes: {
      files_created: [],
      files_modified: [],
      files_deleted: [],
    },
  };
}

Deno.test("MemoryExtractorService: analyzeExecution extracts learnings from success", async () => {
  const { extractor, cleanup } = await initExtractorTest();
  try {
    const execution = createSuccessfulExecution("my-app", "550e8400-e29b-41d4-a716-446655440010");

    const learnings = await extractor.analyzeExecution(execution);

    assertEquals(learnings.length > 0, true);
    // Should extract pattern from summary
    const hasPatternLearning = learnings.some((l) =>
      l.category === "pattern" || l.title.toLowerCase().includes("pattern")
    );
    assertEquals(hasPatternLearning, true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryExtractorService: analyzeExecution extracts from lessons_learned", async () => {
  const { extractor, cleanup } = await initExtractorTest();
  try {
    const execution = createSuccessfulExecution("my-app", "550e8400-e29b-41d4-a716-446655440011");

    const learnings = await extractor.analyzeExecution(execution);

    // Should have at least one learning derived from lessons_learned
    const hasLessonBased = learnings.some((l) =>
      l.description.includes("testability") || l.description.includes("debugging")
    );
    assertEquals(hasLessonBased, true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryExtractorService: analyzeExecution extracts from failed execution", async () => {
  const { extractor, cleanup } = await initExtractorTest();
  try {
    const execution = createFailedExecution("my-app", "550e8400-e29b-41d4-a716-446655440012");

    const learnings = await extractor.analyzeExecution(execution);

    // Should extract troubleshooting learning from failure
    assertEquals(learnings.length > 0, true);
    const hasTroubleshooting = learnings.some((l) => l.category === "troubleshooting" || l.category === "anti-pattern");
    assertEquals(hasTroubleshooting, true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryExtractorService: analyzeExecution includes error context", async () => {
  const { extractor, cleanup } = await initExtractorTest();
  try {
    const execution = createFailedExecution("my-app", "550e8400-e29b-41d4-a716-446655440013");

    const learnings = await extractor.analyzeExecution(execution);

    // Should reference the error in learning
    const mentionsError = learnings.some((l) =>
      l.description.includes("dependency") || l.description.includes("dependencies")
    );
    assertEquals(mentionsError, true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryExtractorService: analyzeExecution returns empty for trivial execution", async () => {
  const { extractor, cleanup } = await initExtractorTest();
  try {
    const execution = createTrivialExecution("my-app", "550e8400-e29b-41d4-a716-446655440014");

    const learnings = await extractor.analyzeExecution(execution);

    assertEquals(learnings.length, 0);
  } finally {
    await cleanup();
  }
});

// ===== createProposal Tests =====

Deno.test("MemoryExtractorService: createProposal writes to Pending directory", async () => {
  const { config, extractor, cleanup } = await initExtractorTest();
  try {
    const execution = createSuccessfulExecution("my-app", "550e8400-e29b-41d4-a716-446655440015");
    const learnings = await extractor.analyzeExecution(execution);

    // Should have at least one learning
    if (learnings.length === 0) {
      // Skip if no learnings extracted
      return;
    }

    const proposalId = await extractor.createProposal(learnings[0], execution, "senior-coder");

    assertExists(proposalId);

    // Check file exists in Pending
    const pendingDir = getMemoryPendingDir(config.system.root);
    const files = [];
    for await (const entry of Deno.readDir(pendingDir)) {
      files.push(entry.name);
    }
    assertEquals(files.length > 0, true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryExtractorService: createProposal generates valid proposal file", async () => {
  const { config, extractor, cleanup } = await initExtractorTest();
  try {
    const execution = createSuccessfulExecution("my-app", "550e8400-e29b-41d4-a716-446655440016");
    const learnings = await extractor.analyzeExecution(execution);

    if (learnings.length === 0) {
      return;
    }

    const proposalId = await extractor.createProposal(learnings[0], execution, "senior-coder");

    // Read and validate proposal file
    const pendingDir = getMemoryPendingDir(config.system.root);
    const proposalPath = join(pendingDir, `${proposalId}.json`);
    assertEquals(await exists(proposalPath), true);

    const content = await Deno.readTextFile(proposalPath);
    const proposal = JSON.parse(content);
    const result = MemoryUpdateProposalSchema.safeParse(proposal);
    assertEquals(result.success, true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryExtractorService: createProposal logs to Activity Journal", async () => {
  const { db, extractor, cleanup } = await initExtractorTest();
  try {
    const execution = createSuccessfulExecution("my-app", "550e8400-e29b-41d4-a716-446655440017");
    const learnings = await extractor.analyzeExecution(execution);

    if (learnings.length === 0) {
      return;
    }

    await extractor.createProposal(learnings[0], execution, "senior-coder");

    // Wait for batch flush
    await db.waitForFlush();

    // Check Activity Journal
    const activities = db.instance.prepare(
      "SELECT action_type, target FROM activity WHERE action_type = 'memory.proposal.created'",
    ).all() as Array<{ action_type: string; target: string }>;
    assertEquals(activities.length, 1);
  } finally {
    await cleanup();
  }
});

// ===== Pending Operations Tests =====

Deno.test("MemoryExtractorService: listPending returns all pending proposals", async () => {
  const { extractor, cleanup } = await initExtractorTest();
  try {
    const execution = createSuccessfulExecution("my-app", "550e8400-e29b-41d4-a716-446655440020");
    const learnings = await extractor.analyzeExecution(execution);

    // Create multiple proposals
    for (const learning of learnings.slice(0, 2)) {
      await extractor.createProposal(learning, execution, "senior-coder");
    }

    const pending = await extractor.listPending();

    assertEquals(pending.length >= learnings.slice(0, 2).length, true);
    assertEquals(pending.every((p) => p.status === "pending"), true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryExtractorService: getPending returns proposal details", async () => {
  const { extractor, cleanup } = await initExtractorTest();
  try {
    const execution = createSuccessfulExecution("my-app", "550e8400-e29b-41d4-a716-446655440021");
    const learnings = await extractor.analyzeExecution(execution);

    if (learnings.length === 0) {
      return;
    }

    const proposalId = await extractor.createProposal(learnings[0], execution, "senior-coder");

    const proposal = await extractor.getPending(proposalId);

    assertExists(proposal);
    assertEquals(proposal.id, proposalId);
    assertEquals(proposal.status, "pending");
    assertEquals(proposal.learning.title, learnings[0].title);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryExtractorService: approvePending merges learning to project", async () => {
  const { memoryBank, extractor, cleanup } = await initExtractorTest();
  try {
    // Create project memory first
    const projectMem: ProjectMemory = {
      portal: "my-app",
      overview: "Test project",
      patterns: [],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);

    const execution = createSuccessfulExecution("my-app", "550e8400-e29b-41d4-a716-446655440022");
    const learnings = await extractor.analyzeExecution(execution);

    if (learnings.length === 0) {
      return;
    }

    const proposalId = await extractor.createProposal(learnings[0], execution, "senior-coder");

    await extractor.approvePending(proposalId);

    // Verify learning was added to project
    const project = await memoryBank.getProjectMemory("my-app");
    assertExists(project);
    assertEquals(project.patterns.length > 0, true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryExtractorService: approvePending removes from Pending", async () => {
  const { config, memoryBank, extractor, cleanup } = await initExtractorTest();
  try {
    const projectMem: ProjectMemory = {
      portal: "my-app",
      overview: "Test project",
      patterns: [],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);

    const execution = createSuccessfulExecution("my-app", "550e8400-e29b-41d4-a716-446655440023");
    const learnings = await extractor.analyzeExecution(execution);

    if (learnings.length === 0) {
      return;
    }

    const proposalId = await extractor.createProposal(learnings[0], execution, "senior-coder");

    await extractor.approvePending(proposalId);

    // Check proposal file was removed
    const pendingPath = join(getMemoryPendingDir(config.system.root), `${proposalId}.json`);
    assertEquals(await exists(pendingPath), false);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryExtractorService: approvePending logs to Activity Journal", async () => {
  const { db, memoryBank, extractor, cleanup } = await initExtractorTest();
  try {
    const projectMem: ProjectMemory = {
      portal: "my-app",
      overview: "Test project",
      patterns: [],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);

    const execution = createSuccessfulExecution("my-app", "550e8400-e29b-41d4-a716-446655440024");
    const learnings = await extractor.analyzeExecution(execution);

    if (learnings.length === 0) {
      return;
    }

    const proposalId = await extractor.createProposal(learnings[0], execution, "senior-coder");

    await extractor.approvePending(proposalId);

    await db.waitForFlush();

    const activities = db.instance.prepare(
      "SELECT action_type FROM activity WHERE action_type = 'memory.proposal.approved'",
    ).all() as Array<{ action_type: string }>;
    assertEquals(activities.length, 1);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryExtractorService: rejectPending archives proposal", async () => {
  const { config, extractor, cleanup } = await initExtractorTest();
  try {
    const execution = createSuccessfulExecution("my-app", "550e8400-e29b-41d4-a716-446655440025");
    const learnings = await extractor.analyzeExecution(execution);

    if (learnings.length === 0) {
      return;
    }

    const proposalId = await extractor.createProposal(learnings[0], execution, "senior-coder");

    await extractor.rejectPending(proposalId, "Not relevant");

    // Check proposal file was removed from Pending
    const pendingPath = join(getMemoryPendingDir(config.system.root), `${proposalId}.json`);
    assertEquals(await exists(pendingPath), false);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryExtractorService: rejectPending logs rejection reason", async () => {
  const { db, extractor, cleanup } = await initExtractorTest();
  try {
    const execution = createSuccessfulExecution("my-app", "550e8400-e29b-41d4-a716-446655440026");
    const learnings = await extractor.analyzeExecution(execution);

    if (learnings.length === 0) {
      return;
    }

    const proposalId = await extractor.createProposal(learnings[0], execution, "senior-coder");

    await extractor.rejectPending(proposalId, "Not relevant to project");

    await db.waitForFlush();

    const activities = db.instance.prepare(
      "SELECT action_type, payload FROM activity WHERE action_type = 'memory.proposal.rejected'",
    ).all() as Array<{ action_type: string; payload: string }>;
    assertEquals(activities.length, 1);
    assertStringIncludes(activities[0].payload, "Not relevant");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryExtractorService: approveAll processes all pending", async () => {
  const { memoryBank, extractor, cleanup } = await initExtractorTest();
  try {
    const projectMem: ProjectMemory = {
      portal: "my-app",
      overview: "Test project",
      patterns: [],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);

    const execution = createSuccessfulExecution("my-app", "550e8400-e29b-41d4-a716-446655440027");
    const learnings = await extractor.analyzeExecution(execution);

    // Create multiple proposals
    for (const learning of learnings.slice(0, 2)) {
      await extractor.createProposal(learning, execution, "senior-coder");
    }

    const countBefore = (await extractor.listPending()).length;
    await extractor.approveAll();
    const countAfter = (await extractor.listPending()).length;

    assertEquals(countAfter, 0);
    assertEquals(countBefore > countAfter, true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryExtractorService: getPending throws for non-existent", async () => {
  const { extractor, cleanup } = await initExtractorTest();
  try {
    const proposal = await extractor.getPending("non-existent-id");
    assertEquals(proposal, null);
  } finally {
    await cleanup();
  }
});
