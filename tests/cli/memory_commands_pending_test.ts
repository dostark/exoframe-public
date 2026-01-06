/**
 * Tests for MemoryCommands Pending Operations (CLI Memory Banks)
 *
 * Phase 12.9: Agent Memory Updates - CLI Commands
 *
 * Tests CLI commands for:
 * - memory pending list: List all pending proposals
 * - memory pending show <id>: Show proposal details
 * - memory pending approve <id>: Approve a proposal
 * - memory pending reject <id>: Reject a proposal
 * - memory pending approve-all: Approve all pending
 */

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { MemoryCommands } from "../../src/cli/memory_commands.ts";
import { MemoryBankService } from "../../src/services/memory_bank.ts";
import { MemoryExtractorService } from "../../src/services/memory_extractor.ts";
import { initTestDbService } from "../helpers/db.ts";
import { createMockConfig } from "../helpers/config.ts";
import type { ExecutionMemory, ProjectMemory } from "../../src/schemas/memory_bank.ts";
import {
  getMemoryExecutionDir,
  getMemoryGlobalDir,
  getMemoryIndexDir,
  getMemoryPendingDir,
  getMemoryProjectsDir,
} from "../helpers/paths_helper.ts";

/**
 * Creates a complete memory test environment for pending commands
 */
async function initPendingTest() {
  const tempRoot = await Deno.makeTempDir({ prefix: "memory-pending-test-" });

  const { db, cleanup: dbCleanup } = await initTestDbService();

  // Create required directories
  await Deno.mkdir(getMemoryProjectsDir(tempRoot), { recursive: true });
  await Deno.mkdir(getMemoryExecutionDir(tempRoot), { recursive: true });
  await Deno.mkdir(getMemoryIndexDir(tempRoot), { recursive: true });
  await Deno.mkdir(getMemoryGlobalDir(tempRoot), { recursive: true });
  await Deno.mkdir(getMemoryPendingDir(tempRoot), { recursive: true });

  const config = createMockConfig(tempRoot);
  const commands = new MemoryCommands({ config, db });
  const memoryBank = new MemoryBankService(config, db);
  const extractor = new MemoryExtractorService(config, db, memoryBank);

  const cleanup = async () => {
    await dbCleanup();
    await Deno.remove(tempRoot, { recursive: true }).catch(() => {});
  };

  return {
    tempRoot,
    config,
    db,
    commands,
    memoryBank,
    extractor,
    cleanup,
  };
}

/**
 * Creates a test execution with learnable content
 */
function createTestExecution(portal: string, traceId: string): ExecutionMemory {
  return {
    trace_id: traceId,
    request_id: `req-${traceId.substring(0, 8)}`,
    started_at: "2026-01-04T10:00:00Z",
    completed_at: "2026-01-04T10:30:00Z",
    status: "completed",
    portal,
    agent: "senior-coder",
    summary: "Implemented repository pattern for database access with proper error handling.",
    context_files: ["src/services/user.ts"],
    context_portals: [portal],
    changes: {
      files_created: ["src/repos/user_repo.ts"],
      files_modified: ["src/services/user.ts"],
      files_deleted: [],
    },
    lessons_learned: ["Repository pattern improves testability"],
  };
}

// ===== Pending List Tests =====

Deno.test("MemoryCommands: pendingList returns empty message", async () => {
  const { commands, cleanup } = await initPendingTest();
  try {
    const result = await commands.pendingList("table");

    assertStringIncludes(result, "No pending");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: pendingList shows proposals", async () => {
  const { commands, memoryBank, extractor, cleanup } = await initPendingTest();
  try {
    // Create a project first
    const projectMem: ProjectMemory = {
      portal: "test-app",
      overview: "Test project",
      patterns: [],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);

    // Create a pending proposal
    const execution = createTestExecution("test-app", "550e8400-e29b-41d4-a716-446655440030");
    const learnings = await extractor.analyzeExecution(execution);

    if (learnings.length > 0) {
      await extractor.createProposal(learnings[0], execution, "senior-coder");
    }

    const result = await commands.pendingList("table");

    // Should show the pending proposal
    if (learnings.length > 0) {
      assertStringIncludes(result, "Pending");
    }
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: pendingList --format json outputs valid JSON", async () => {
  const { commands, memoryBank, extractor, cleanup } = await initPendingTest();
  try {
    // Create a project and proposal first
    const projectMem: ProjectMemory = {
      portal: "test-app",
      overview: "Test project",
      patterns: [],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);

    const execution = createTestExecution("test-app", "550e8400-e29b-41d4-a716-446655440030");
    const learnings = await extractor.analyzeExecution(execution);

    if (learnings.length > 0) {
      await extractor.createProposal(learnings[0], execution, "senior-coder");
    }

    const result = await commands.pendingList("json");
    const parsed = JSON.parse(result);

    assertEquals(Array.isArray(parsed), true);
  } finally {
    await cleanup();
  }
});

// ===== Pending Show Tests =====

Deno.test("MemoryCommands: pendingShow displays proposal details", async () => {
  const { commands, memoryBank, extractor, cleanup } = await initPendingTest();
  try {
    const projectMem: ProjectMemory = {
      portal: "test-app",
      overview: "Test project",
      patterns: [],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);

    const execution = createTestExecution("test-app", "550e8400-e29b-41d4-a716-446655440031");
    const learnings = await extractor.analyzeExecution(execution);

    if (learnings.length === 0) {
      return;
    }

    const proposalId = await extractor.createProposal(learnings[0], execution, "senior-coder");

    const result = await commands.pendingShow(proposalId, "table");

    assertStringIncludes(result, proposalId.substring(0, 8));
    assertStringIncludes(result, "pending");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: pendingShow non-existent returns error", async () => {
  const { commands, cleanup } = await initPendingTest();
  try {
    const result = await commands.pendingShow("non-existent-id", "table");

    assertStringIncludes(result, "not found");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: pendingShow --format json outputs valid JSON", async () => {
  const { commands, memoryBank, extractor, cleanup } = await initPendingTest();
  try {
    const projectMem: ProjectMemory = {
      portal: "test-app",
      overview: "Test project",
      patterns: [],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);

    const execution = createTestExecution("test-app", "550e8400-e29b-41d4-a716-446655440032");
    const learnings = await extractor.analyzeExecution(execution);

    if (learnings.length === 0) {
      return;
    }

    const proposalId = await extractor.createProposal(learnings[0], execution, "senior-coder");

    const result = await commands.pendingShow(proposalId, "json");
    const parsed = JSON.parse(result);

    assertEquals(parsed.id, proposalId);
    assertEquals(parsed.status, "pending");
  } finally {
    await cleanup();
  }
});

// ===== Pending Approve Tests =====

Deno.test("MemoryCommands: pendingApprove merges learning", async () => {
  const { commands, memoryBank, extractor, cleanup } = await initPendingTest();
  try {
    const projectMem: ProjectMemory = {
      portal: "test-app",
      overview: "Test project",
      patterns: [],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);

    const execution = createTestExecution("test-app", "550e8400-e29b-41d4-a716-446655440033");
    const learnings = await extractor.analyzeExecution(execution);

    if (learnings.length === 0) {
      return;
    }

    const proposalId = await extractor.createProposal(learnings[0], execution, "senior-coder");

    const result = await commands.pendingApprove(proposalId);

    assertStringIncludes(result, "approved");

    // Verify learning was added
    const project = await memoryBank.getProjectMemory("test-app");
    assertEquals(project !== null, true);
    assertEquals(project!.patterns.length > 0, true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: pendingApprove non-existent returns error", async () => {
  const { commands, cleanup } = await initPendingTest();
  try {
    const result = await commands.pendingApprove("non-existent-id");

    assertStringIncludes(result, "not found");
  } finally {
    await cleanup();
  }
});

// ===== Pending Reject Tests =====

Deno.test("MemoryCommands: pendingReject archives proposal", async () => {
  const { commands, memoryBank, extractor, cleanup } = await initPendingTest();
  try {
    const projectMem: ProjectMemory = {
      portal: "test-app",
      overview: "Test project",
      patterns: [],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);

    const execution = createTestExecution("test-app", "550e8400-e29b-41d4-a716-446655440034");
    const learnings = await extractor.analyzeExecution(execution);

    if (learnings.length === 0) {
      return;
    }

    const proposalId = await extractor.createProposal(learnings[0], execution, "senior-coder");

    const result = await commands.pendingReject(proposalId, "Not relevant");

    assertStringIncludes(result, "rejected");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: pendingReject non-existent returns error", async () => {
  const { commands, cleanup } = await initPendingTest();
  try {
    const result = await commands.pendingReject("non-existent-id", "test");

    assertStringIncludes(result, "not found");
  } finally {
    await cleanup();
  }
});

// ===== Pending Approve All Tests =====

Deno.test("MemoryCommands: pendingApproveAll processes all", async () => {
  const { commands, memoryBank, extractor, cleanup } = await initPendingTest();
  try {
    const projectMem: ProjectMemory = {
      portal: "test-app",
      overview: "Test project",
      patterns: [],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);

    const execution = createTestExecution("test-app", "550e8400-e29b-41d4-a716-446655440035");
    const learnings = await extractor.analyzeExecution(execution);

    // Create multiple proposals
    for (const learning of learnings.slice(0, 2)) {
      await extractor.createProposal(learning, execution, "senior-coder");
    }

    const result = await commands.pendingApproveAll();

    assertStringIncludes(result.toLowerCase(), "approved");

    // Verify no pending remain
    const pending = await extractor.listPending();
    assertEquals(pending.length, 0);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: pendingApproveAll with none returns message", async () => {
  const { commands, cleanup } = await initPendingTest();
  try {
    const result = await commands.pendingApproveAll();

    assertStringIncludes(result.toLowerCase(), "no pending");
  } finally {
    await cleanup();
  }
});
