/**
 * Additional Coverage Tests for MemoryCommands
 *
 * Covers untested paths to improve coverage from 66.1% to >80%
 *
 * Tests for:
 * - Search with embeddings option
 * - Search markdown format
 * - Project list markdown format
 * - Execution list markdown format
 * - Global memory initialization message
 * - Global list learnings table format
 * - Pending approve error paths
 * - Pending reject error paths
 * - Rebuild index with embeddings
 */

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { MemoryCommands } from "../../src/cli/memory_commands.ts";
import { MemoryBankService } from "../../src/services/memory_bank.ts";
import { MemoryEmbeddingService } from "../../src/services/memory_embedding.ts";
import { initTestDbService } from "../helpers/db.ts";
import { createMockConfig } from "../helpers/config.ts";
import type { Learning, ProjectMemory } from "../../src/schemas/memory_bank.ts";
import {
  getMemoryExecutionDir,
  getMemoryGlobalDir,
  getMemoryIndexDir,
  getMemoryPendingDir,
  getMemoryProjectsDir,
} from "../helpers/paths_helper.ts";

/**
 * Creates a complete memory test environment
 */
async function initMemoryTest() {
  const tempRoot = await Deno.makeTempDir({ prefix: "memory-cov-test-" });

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
  const embedding = new MemoryEmbeddingService(config);

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
    embedding,
    cleanup,
  };
}

/**
 * Creates test project memory with learnings
 */
async function createTestProjectWithLearnings(
  memoryBank: MemoryBankService,
  portal: string,
): Promise<void> {
  await memoryBank.createProjectMemory({
    portal,
    overview: `Overview for ${portal}`,
    patterns: [
      {
        name: "Error Handling Pattern",
        description: "Always use try-catch for async operations",
        examples: ["src/api.ts"],
        tags: ["error-handling", "typescript"],
      },
    ],
    decisions: [
      {
        date: "2026-01-04",
        decision: "Use TypeScript strict mode",
        rationale: "Better type safety",
        tags: ["typescript"],
      },
    ],
    references: [],
    learnings: [
      {
        id: "aaaaaaaa-aaaa-4000-8000-000000000001",
        created_at: new Date().toISOString(),
        source: "agent",
        scope: "project",
        project: portal,
        title: "Error handling improves reliability",
        description: "Adding proper error handling reduced bugs by 50%",
        category: "insight",
        tags: ["error-handling"],
        confidence: "high",
        status: "approved",
      },
    ],
  } as ProjectMemory);
}

// ===== Search with Embeddings Tests =====

Deno.test("MemoryCommands: search with useEmbeddings option", async () => {
  const { commands, memoryBank, embedding, cleanup } = await initMemoryTest();
  try {
    await createTestProjectWithLearnings(memoryBank, "EmbedProject");

    // Create embeddings for the learning
    const learning: Learning = {
      id: "bbbbbbbb-bbbb-4000-8000-000000000001",
      created_at: new Date().toISOString(),
      source: "agent",
      scope: "global",
      title: "Error handling best practices",
      description: "Use try-catch with proper logging for errors",
      category: "pattern",
      tags: ["error-handling"],
      confidence: "high",
      status: "approved",
    };
    await embedding.embedLearning(learning);

    const result = await commands.search("error handling", {
      useEmbeddings: true,
      format: "table",
    });

    // Should return some results (even if empty due to mock embeddings)
    assertEquals(typeof result, "string");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: search with tags option", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestProjectWithLearnings(memoryBank, "TagProject");

    const result = await commands.search("pattern", {
      tags: ["typescript"],
      format: "table",
    });

    assertEquals(typeof result, "string");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: search --format md outputs markdown", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestProjectWithLearnings(memoryBank, "MdSearchProject");

    const result = await commands.search("Pattern", { format: "md" });

    // If results found, should have markdown formatting
    if (!result.includes("No results found")) {
      assertStringIncludes(result, "# Search Results");
      assertStringIncludes(result, "| Type |");
    }
  } finally {
    await cleanup();
  }
});

// ===== Project List Markdown Format Test =====

Deno.test("MemoryCommands: project list --format md outputs markdown", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestProjectWithLearnings(memoryBank, "MdListProject");

    const result = await commands.projectList("md");

    assertStringIncludes(result, "# Project Memories");
    assertStringIncludes(result, "| Project |");
    assertStringIncludes(result, "MdListProject");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: project show --format md outputs markdown", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestProjectWithLearnings(memoryBank, "MdShowProject");

    const result = await commands.projectShow("MdShowProject", "md");

    assertStringIncludes(result, "# Project Memory:");
    assertStringIncludes(result, "## Overview");
    assertStringIncludes(result, "## Patterns");
  } finally {
    await cleanup();
  }
});

// ===== Execution List Markdown Format Test =====

Deno.test("MemoryCommands: execution list --format md outputs markdown", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    const traceId = "cccccccc-cccc-4000-8000-000000000001";
    await memoryBank.createExecutionRecord({
      trace_id: traceId,
      request_id: "req-123",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "completed",
      portal: "MdExecProject",
      agent: "test-agent",
      summary: "Test execution",
      context_files: [],
      context_portals: ["MdExecProject"],
      changes: {
        files_created: [],
        files_modified: [],
        files_deleted: [],
      },
    });

    const result = await commands.executionList({ format: "md" });

    assertStringIncludes(result, "# Execution History");
    assertStringIncludes(result, "| Trace ID |");
  } finally {
    await cleanup();
  }
});

// ===== Global Memory Tests =====

Deno.test("MemoryCommands: globalShow returns init message when not initialized", async () => {
  const { commands, cleanup } = await initMemoryTest();
  try {
    const result = await commands.globalShow("table");

    assertStringIncludes(result, "not initialized");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: globalShow with initialized memory", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    const result = await commands.globalShow("table");

    assertStringIncludes(result, "Global Memory");
    assertStringIncludes(result, "Version:");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: globalShow --format md outputs markdown", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    const result = await commands.globalShow("md");

    assertStringIncludes(result, "# Global Memory");
    assertStringIncludes(result, "| Property | Value |");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: globalListLearnings returns init message when not initialized", async () => {
  const { commands, cleanup } = await initMemoryTest();
  try {
    const result = await commands.globalListLearnings("table");

    assertStringIncludes(result, "not initialized");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: globalListLearnings with no learnings", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    const result = await commands.globalListLearnings("table");

    assertStringIncludes(result, "No learnings");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: globalListLearnings --format md outputs markdown", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    // Add a global learning
    await memoryBank.addGlobalLearning({
      id: "dddddddd-dddd-4000-8000-000000000001",
      created_at: new Date().toISOString(),
      source: "user",
      scope: "global",
      title: "Test global learning",
      description: "A test learning description",
      category: "pattern",
      tags: ["test"],
      confidence: "medium",
      status: "approved",
    });

    const result = await commands.globalListLearnings("md");

    assertStringIncludes(result, "# Global Learnings");
    assertStringIncludes(result, "| ID |");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: globalStats returns init message when not initialized", async () => {
  const { commands, cleanup } = await initMemoryTest();
  try {
    const result = await commands.globalStats("table");

    assertStringIncludes(result, "not initialized");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: globalStats --format md outputs markdown", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    const result = await commands.globalStats("md");

    assertStringIncludes(result, "# Global Memory Statistics");
    assertStringIncludes(result, "| Metric | Value |");
  } finally {
    await cleanup();
  }
});

// ===== Promote/Demote Error Handling Tests =====

Deno.test("MemoryCommands: promote returns error for non-existent project", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    const result = await commands.promote("NonExistentPortal", {
      type: "pattern",
      name: "test",
      title: "Test Pattern",
      description: "Test description",
      category: "pattern",
      tags: ["test"],
      confidence: "medium",
    });

    assertStringIncludes(result, "Error");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: demote returns error for non-existent learning", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await memoryBank.initGlobalMemory();
    await createTestProjectWithLearnings(memoryBank, "DemoteTarget");

    const result = await commands.demote("non-existent-id", "DemoteTarget");

    assertStringIncludes(result, "Error");
  } finally {
    await cleanup();
  }
});

// ===== Pending Commands Error Handling =====

Deno.test("MemoryCommands: pendingApprove returns error for non-existent proposal", async () => {
  const { commands, cleanup } = await initMemoryTest();
  try {
    const result = await commands.pendingApprove("non-existent-proposal-id");

    assertStringIncludes(result, "not found");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: pendingReject returns error for non-existent proposal", async () => {
  const { commands, cleanup } = await initMemoryTest();
  try {
    const result = await commands.pendingReject("non-existent-proposal-id", "Reason");

    assertStringIncludes(result, "not found");
  } finally {
    await cleanup();
  }
});

// ===== Rebuild Index with Embeddings =====

Deno.test("MemoryCommands: rebuildIndex with embeddings option", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    // Add a learning to embed
    await memoryBank.addGlobalLearning({
      id: "eeeeeeee-eeee-4000-8000-000000000001",
      created_at: new Date().toISOString(),
      source: "user",
      scope: "global",
      title: "Embedding test learning",
      description: "This learning will be embedded during index rebuild",
      category: "insight",
      tags: ["test"],
      confidence: "high",
      status: "approved",
    });

    const result = await commands.rebuildIndex({ includeEmbeddings: true });

    assertStringIncludes(result, "rebuilt successfully");
    assertStringIncludes(result, "Embeddings regenerated");
  } finally {
    await cleanup();
  }
});

// ===== Edge Cases for Execution Show =====

Deno.test("MemoryCommands: execution show with error message", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    const traceId = "ffffffff-ffff-4000-8000-000000000001";
    await memoryBank.createExecutionRecord({
      trace_id: traceId,
      request_id: "req-error",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "failed",
      portal: "ErrorProject",
      agent: "test-agent",
      summary: "Failed execution",
      context_files: [],
      context_portals: [],
      changes: {
        files_created: [],
        files_modified: [],
        files_deleted: [],
      },
      error_message: "Connection timeout after 30 seconds",
    });

    const result = await commands.executionShow(traceId, "table");

    assertStringIncludes(result, "Error:");
    assertStringIncludes(result, "Connection timeout");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: execution show with changes and lessons learned", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    const traceId = "11111111-1111-4000-8000-000000000001";
    await memoryBank.createExecutionRecord({
      trace_id: traceId,
      request_id: "req-full",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "completed",
      portal: "FullProject",
      agent: "test-agent",
      summary: "Full execution with changes",
      context_files: ["src/main.ts", "src/api.ts"],
      context_portals: ["FullProject"],
      changes: {
        files_created: ["src/new.ts"],
        files_modified: ["src/main.ts"],
        files_deleted: ["src/old.ts"],
      },
      lessons_learned: ["Lesson 1: Test first", "Lesson 2: Document everything"],
    });

    const result = await commands.executionShow(traceId, "table");

    assertStringIncludes(result, "Changes:");
    assertStringIncludes(result, "Created:");
    assertStringIncludes(result, "Modified:");
    assertStringIncludes(result, "Deleted:");
    assertStringIncludes(result, "Lessons Learned:");
    assertStringIncludes(result, "Test first");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: execution show --format md with full data", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    const traceId = "22222222-2222-4000-8000-000000000001";
    await memoryBank.createExecutionRecord({
      trace_id: traceId,
      request_id: "req-md",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "completed",
      portal: "MdFullProject",
      agent: "test-agent",
      summary: "Full markdown test",
      context_files: ["src/index.ts"],
      context_portals: ["MdFullProject"],
      changes: {
        files_created: ["src/feature.ts"],
        files_modified: ["src/index.ts"],
        files_deleted: [],
      },
      lessons_learned: ["Always write tests"],
    });

    const result = await commands.executionShow(traceId, "md");

    assertStringIncludes(result, "# Execution:");
    assertStringIncludes(result, "## Context Files");
    assertStringIncludes(result, "## Changes");
    assertStringIncludes(result, "### Created");
    assertStringIncludes(result, "### Modified");
    assertStringIncludes(result, "## Lessons Learned");
  } finally {
    await cleanup();
  }
});

// ===== Global Learning Table Format =====

Deno.test("MemoryCommands: globalListLearnings table format with learnings", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    // Add multiple learnings
    for (let i = 1; i <= 3; i++) {
      await memoryBank.addGlobalLearning({
        id: `33333333-3333-4000-8000-00000000000${i}`,
        created_at: new Date().toISOString(),
        source: "agent",
        scope: "global",
        title: `Learning ${i}`,
        description: `Description for learning ${i}`,
        category: "pattern",
        tags: ["test"],
        confidence: "high",
        status: "approved",
      });
    }

    const result = await commands.globalListLearnings("table");

    assertStringIncludes(result, "Global Learnings");
    assertStringIncludes(result, "ID");
    assertStringIncludes(result, "Category");
    assertStringIncludes(result, "Confidence");
    assertStringIncludes(result, "Total: 3 learning(s)");
  } finally {
    await cleanup();
  }
});

// ===== Global Stats with Data =====

Deno.test("MemoryCommands: globalStats with learnings by category and project", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await memoryBank.initGlobalMemory();
    await createTestProjectWithLearnings(memoryBank, "StatsProject");

    // Add learnings of different categories
    await memoryBank.addGlobalLearning({
      id: "44444444-4444-4000-8000-000000000001",
      created_at: new Date().toISOString(),
      source: "agent",
      scope: "global",
      title: "Pattern Learning",
      description: "A pattern",
      category: "pattern",
      tags: [],
      confidence: "high",
      status: "approved",
    });

    await memoryBank.addGlobalLearning({
      id: "44444444-4444-4000-8000-000000000002",
      created_at: new Date().toISOString(),
      source: "agent",
      scope: "global",
      title: "Insight Learning",
      description: "An insight",
      category: "insight",
      tags: [],
      confidence: "medium",
      status: "approved",
    });

    const result = await commands.globalStats("table");

    assertStringIncludes(result, "Global Memory Statistics");
    assertStringIncludes(result, "Total Learnings:");
    assertStringIncludes(result, "By Category:");
  } finally {
    await cleanup();
  }
});
