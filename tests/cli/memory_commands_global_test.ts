/**
 * Tests for MemoryCommands Global Operations (CLI Memory Banks)
 *
 * Phase 12.8: Global Memory CLI Commands
 *
 * Tests CLI commands for:
 * - memory global show: Show global memory
 * - memory global add-learning: Add a global learning
 * - memory global list-learnings: List all global learnings
 * - memory global stats: Show global statistics
 * - memory promote: Promote project learning to global
 * - memory demote: Demote global learning to project
 */

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { MemoryCommands } from "../../src/cli/memory_commands.ts";
import { MemoryBankService } from "../../src/services/memory_bank.ts";
import { initTestDbService } from "../helpers/db.ts";
import { createMockConfig } from "../helpers/config.ts";
import type { Learning, ProjectMemory } from "../../src/schemas/memory_bank.ts";
import {
  getMemoryExecutionDir,
  getMemoryGlobalDir,
  getMemoryIndexDir,
  getMemoryProjectsDir,
} from "../helpers/paths_helper.ts";

/**
 * Creates a complete memory test environment for global commands
 */
async function initGlobalMemoryTest() {
  const tempRoot = await Deno.makeTempDir({ prefix: "memory-global-test-" });

  const { db, cleanup: dbCleanup } = await initTestDbService();

  // Create required directories
  await Deno.mkdir(getMemoryProjectsDir(tempRoot), { recursive: true });
  await Deno.mkdir(getMemoryExecutionDir(tempRoot), { recursive: true });
  await Deno.mkdir(getMemoryIndexDir(tempRoot), { recursive: true });
  await Deno.mkdir(getMemoryGlobalDir(tempRoot), { recursive: true });

  const config = createMockConfig(tempRoot);
  const commands = new MemoryCommands({ config, db });
  const memoryBank = new MemoryBankService(config, db);

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
    cleanup,
  };
}

// ===== Global Show Tests =====

Deno.test("MemoryCommands: globalShow returns empty for uninitialized", async () => {
  const { commands, cleanup } = await initGlobalMemoryTest();
  try {
    const result = await commands.globalShow("table");

    assertStringIncludes(result, "not initialized");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: globalShow displays initialized memory", async () => {
  const { commands, memoryBank, cleanup } = await initGlobalMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    const result = await commands.globalShow("table");

    assertStringIncludes(result, "Global Memory");
    assertStringIncludes(result, "Version:");
    assertStringIncludes(result, "Learnings:");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: globalShow --format json outputs valid JSON", async () => {
  const { commands, memoryBank, cleanup } = await initGlobalMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    const result = await commands.globalShow("json");
    const parsed = JSON.parse(result);

    assertEquals(parsed.version, "1.0.0");
    assertEquals(Array.isArray(parsed.learnings), true);
    assertEquals(typeof parsed.statistics, "object");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: globalShow --format md outputs markdown", async () => {
  const { commands, memoryBank, cleanup } = await initGlobalMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    const result = await commands.globalShow("md");

    assertStringIncludes(result, "# Global Memory");
    assertStringIncludes(result, "## Statistics");
  } finally {
    await cleanup();
  }
});

// ===== Global List Learnings Tests =====

Deno.test("MemoryCommands: globalListLearnings returns empty message", async () => {
  const { commands, memoryBank, cleanup } = await initGlobalMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    const result = await commands.globalListLearnings("table");

    assertStringIncludes(result, "No learnings");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: globalListLearnings displays learnings", async () => {
  const { commands, memoryBank, cleanup } = await initGlobalMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    const learning: Learning = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      created_at: "2026-01-04T12:00:00Z",
      source: "user",
      scope: "global",
      title: "Test Learning Title",
      description: "Test learning description",
      category: "pattern",
      tags: ["test-tag"],
      confidence: "high",
      status: "approved",
    };
    await memoryBank.addGlobalLearning(learning);

    const result = await commands.globalListLearnings("table");

    assertStringIncludes(result, "Test Learning Title");
    assertStringIncludes(result, "pattern");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: globalListLearnings --format json outputs valid JSON", async () => {
  const { commands, memoryBank, cleanup } = await initGlobalMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    const learning: Learning = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      created_at: "2026-01-04T12:00:00Z",
      source: "user",
      scope: "global",
      title: "JSON Test Learning",
      description: "Test for JSON output",
      category: "insight",
      tags: [],
      confidence: "medium",
      status: "approved",
    };
    await memoryBank.addGlobalLearning(learning);

    const result = await commands.globalListLearnings("json");
    const parsed = JSON.parse(result);

    assertEquals(Array.isArray(parsed), true);
    assertEquals(parsed.length, 1);
    assertEquals(parsed[0].title, "JSON Test Learning");
  } finally {
    await cleanup();
  }
});

// ===== Global Stats Tests =====

Deno.test("MemoryCommands: globalStats displays statistics", async () => {
  const { commands, memoryBank, cleanup } = await initGlobalMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    // Add some learnings
    const learnings: Learning[] = [
      {
        id: "550e8400-e29b-41d4-a716-446655440010",
        created_at: "2026-01-04T12:00:00Z",
        source: "user",
        scope: "global",
        project: "app-a",
        title: "Learning 1",
        description: "First",
        category: "pattern",
        tags: [],
        confidence: "high",
        status: "approved",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440011",
        created_at: "2026-01-04T12:00:00Z",
        source: "user",
        scope: "global",
        project: "app-b",
        title: "Learning 2",
        description: "Second",
        category: "insight",
        tags: [],
        confidence: "medium",
        status: "approved",
      },
    ];

    for (const l of learnings) {
      await memoryBank.addGlobalLearning(l);
    }

    const result = await commands.globalStats("table");

    assertStringIncludes(result, "Global Memory Statistics");
    assertStringIncludes(result, "Total Learnings:");
    assertStringIncludes(result, "2");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: globalStats --format json outputs valid JSON", async () => {
  const { commands, memoryBank, cleanup } = await initGlobalMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    const result = await commands.globalStats("json");
    const parsed = JSON.parse(result);

    assertEquals(typeof parsed.total_learnings, "number");
    assertEquals(typeof parsed.by_category, "object");
    assertEquals(typeof parsed.by_project, "object");
  } finally {
    await cleanup();
  }
});

// ===== Promote Command Tests =====

Deno.test("MemoryCommands: promote moves learning to global", async () => {
  const { commands, memoryBank, cleanup } = await initGlobalMemoryTest();
  try {
    // Create project with pattern
    const projectMem: ProjectMemory = {
      portal: "source-app",
      overview: "Source project",
      patterns: [
        {
          name: "Repository Pattern",
          description: "Database access via repositories",
          examples: ["src/repo.ts"],
          tags: ["architecture"],
        },
      ],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);
    await memoryBank.initGlobalMemory();

    // Promote the pattern
    const result = await commands.promote("source-app", {
      type: "pattern",
      name: "Repository Pattern",
      title: "Repository Pattern (Global)",
      description: "Use repositories for all database access",
      category: "pattern",
      tags: ["architecture"],
      confidence: "high",
    });

    assertStringIncludes(result, "promoted");

    // Verify in global memory
    const globalMem = await memoryBank.getGlobalMemory();
    assertEquals(globalMem?.learnings.length, 1);
    assertEquals(globalMem?.learnings[0].title, "Repository Pattern (Global)");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: promote non-existent project returns error", async () => {
  const { commands, memoryBank, cleanup } = await initGlobalMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    const result = await commands.promote("non-existent", {
      type: "pattern",
      name: "Test",
      title: "Test",
      description: "Test",
      category: "pattern",
      tags: [],
      confidence: "medium",
    });

    assertStringIncludes(result, "Error:");
    assertStringIncludes(result, "not found");
  } finally {
    await cleanup();
  }
});

// ===== Demote Command Tests =====

Deno.test("MemoryCommands: demote moves learning to project", async () => {
  const { commands, memoryBank, cleanup } = await initGlobalMemoryTest();
  try {
    // Create target project
    const projectMem: ProjectMemory = {
      portal: "target-app",
      overview: "Target project",
      patterns: [],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);
    await memoryBank.initGlobalMemory();

    // Add global learning
    const learning: Learning = {
      id: "550e8400-e29b-41d4-a716-446655440099",
      created_at: "2026-01-04T12:00:00Z",
      source: "user",
      scope: "global",
      title: "Learning to Demote",
      description: "This will be demoted",
      category: "pattern",
      tags: ["demote-test"],
      confidence: "high",
      status: "approved",
    };
    await memoryBank.addGlobalLearning(learning);

    // Demote the learning
    const result = await commands.demote(learning.id, "target-app");

    assertStringIncludes(result, "demoted");

    // Verify removed from global
    const globalMem = await memoryBank.getGlobalMemory();
    assertEquals(globalMem?.learnings.length, 0);

    // Verify added to project
    const project = await memoryBank.getProjectMemory("target-app");
    assertEquals(project?.patterns.length, 1);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: demote non-existent learning returns error", async () => {
  const { commands, memoryBank, cleanup } = await initGlobalMemoryTest();
  try {
    const projectMem: ProjectMemory = {
      portal: "target-app",
      overview: "Target",
      patterns: [],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);
    await memoryBank.initGlobalMemory();

    const result = await commands.demote("non-existent-id", "target-app");

    assertStringIncludes(result, "Error:");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: demote to non-existent project returns error", async () => {
  const { commands, memoryBank, cleanup } = await initGlobalMemoryTest();
  try {
    await memoryBank.initGlobalMemory();

    const learning: Learning = {
      id: "550e8400-e29b-41d4-a716-446655440098",
      created_at: "2026-01-04T12:00:00Z",
      source: "user",
      scope: "global",
      title: "Test",
      description: "Test",
      category: "pattern",
      tags: [],
      confidence: "high",
      status: "approved",
    };
    await memoryBank.addGlobalLearning(learning);

    const result = await commands.demote(learning.id, "non-existent-project");

    assertStringIncludes(result, "Error:");
  } finally {
    await cleanup();
  }
});
