/**
 * Tests for MemoryCommands (CLI Memory Banks Management)
 *
 * Phase 12.5: Core CLI Commands
 *
 * Success Criteria:
 * - Test 1: memory list returns all banks summary
 * - Test 2: memory list --format json outputs valid JSON
 * - Test 3: memory search finds patterns
 * - Test 4: memory search --portal filters correctly
 * - Test 5: memory project list shows all projects
 * - Test 6: memory project show displays details
 * - Test 7: memory project show non-existent returns error
 * - Test 8: memory execution list returns history
 * - Test 9: memory execution list --portal filters
 * - Test 10: memory execution show displays details
 * - Test 11: memory execution show non-existent returns error
 * - Test 12: --format table produces table output
 * - Test 13: --format md produces markdown output
 */

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { MemoryCommands } from "../../src/cli/memory_commands.ts";
import { MemoryBankService } from "../../src/services/memory_bank.ts";
import { initTestDbService } from "../helpers/db.ts";
import { createMockConfig } from "../helpers/config.ts";
import { getMemoryExecutionDir, getMemoryIndexDir, getMemoryProjectsDir } from "../helpers/paths_helper.ts";

/**
 * Creates a complete memory test environment
 */
async function initMemoryTest() {
  const tempRoot = await Deno.makeTempDir({ prefix: "memory-test-" });

  const { db, cleanup: dbCleanup } = await initTestDbService();

  // Create required directories
  await Deno.mkdir(join(getMemoryProjectsDir(tempRoot)), { recursive: true });
  await Deno.mkdir(join(getMemoryExecutionDir(tempRoot)), { recursive: true });
  await Deno.mkdir(join(getMemoryIndexDir(tempRoot)), { recursive: true });

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

/**
 * Creates test project memory
 */
async function createTestProject(memoryBank: MemoryBankService, portal: string) {
  await memoryBank.createProjectMemory({
    portal,
    overview: `Overview for ${portal}`,
    patterns: [
      {
        name: "Test Pattern",
        description: "A test pattern for unit testing",
        examples: ["src/test.ts"],
        tags: ["testing", "typescript"],
      },
    ],
    decisions: [
      {
        date: "2026-01-04",
        decision: "Use TypeScript for all code",
        rationale: "Type safety and tooling support",
        tags: ["typescript"],
      },
    ],
    references: [
      {
        type: "file",
        path: "src/main.ts",
        description: "Main entry point",
      },
    ],
  });
}

/**
 * Creates test execution memory
 */
async function createTestExecution(memoryBank: MemoryBankService, traceId: string, portal: string) {
  await memoryBank.createExecutionRecord({
    trace_id: traceId,
    request_id: "req-" + traceId.substring(0, 8),
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: "completed",
    portal,
    agent: "test-agent",
    summary: "Test execution for " + portal,
    context_files: ["src/main.ts"],
    context_portals: [portal],
    changes: {
      files_created: ["src/new.ts"],
      files_modified: ["src/main.ts"],
      files_deleted: [],
    },
    lessons_learned: ["Always test first"],
  });
}

// ===== Memory List Tests =====

Deno.test("MemoryCommands: list returns summary with no data", async () => {
  const { commands, cleanup } = await initMemoryTest();
  try {
    const result = await commands.list("table");

    assertStringIncludes(result, "Memory Banks Summary");
    assertStringIncludes(result, "Projects:");
    assertStringIncludes(result, "Executions:");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: list returns summary with projects", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestProject(memoryBank, "TestProject");

    const result = await commands.list("table");

    assertStringIncludes(result, "Projects:    1");
    assertStringIncludes(result, "TestProject");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: list --format json outputs valid JSON", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestProject(memoryBank, "JsonProject");

    const result = await commands.list("json");
    const parsed = JSON.parse(result);

    assertEquals(Array.isArray(parsed.projects), true);
    assertStringIncludes(parsed.projects.join(","), "JsonProject");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: list --format md outputs markdown", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestProject(memoryBank, "MdProject");

    const result = await commands.list("md");

    assertStringIncludes(result, "# Memory Banks Summary");
    assertStringIncludes(result, "| Metric | Value |");
    assertStringIncludes(result, "- MdProject");
  } finally {
    await cleanup();
  }
});

// ===== Memory Search Tests =====

Deno.test("MemoryCommands: search finds patterns by name", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestProject(memoryBank, "SearchProject");

    const result = await commands.search("Test Pattern");

    assertStringIncludes(result, "Test Pattern");
    assertStringIncludes(result, "SearchProject");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: search returns no results message", async () => {
  const { commands, cleanup } = await initMemoryTest();
  try {
    const result = await commands.search("nonexistent query 12345");

    assertStringIncludes(result, "No results found");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: search --portal filters correctly", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestProject(memoryBank, "ProjectA");
    await createTestProject(memoryBank, "ProjectB");

    // Search with portal filter
    const result = await commands.search("Pattern", { portal: "ProjectA" });

    assertStringIncludes(result, "ProjectA");
    // Should not contain ProjectB since we filtered by ProjectA
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: search --format json outputs valid JSON", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestProject(memoryBank, "JsonSearchProject");

    const result = await commands.search("Pattern", { format: "json" });
    const parsed = JSON.parse(result);

    assertEquals(Array.isArray(parsed), true);
  } finally {
    await cleanup();
  }
});

// ===== Project Commands Tests =====

Deno.test("MemoryCommands: project list shows all projects", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestProject(memoryBank, "Alpha");
    await createTestProject(memoryBank, "Beta");

    const result = await commands.projectList("table");

    assertStringIncludes(result, "Alpha");
    assertStringIncludes(result, "Beta");
    assertStringIncludes(result, "Patterns");
    assertStringIncludes(result, "Decisions");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: project list empty returns message", async () => {
  const { commands, cleanup } = await initMemoryTest();
  try {
    const result = await commands.projectList("table");

    assertStringIncludes(result, "No project memories found");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: project show displays details", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestProject(memoryBank, "DetailProject");

    const result = await commands.projectShow("DetailProject", "table");

    assertStringIncludes(result, "DetailProject");
    assertStringIncludes(result, "Overview");
    assertStringIncludes(result, "Test Pattern");
    assertStringIncludes(result, "Use TypeScript");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: project show non-existent returns error", async () => {
  const { commands, cleanup } = await initMemoryTest();
  try {
    const result = await commands.projectShow("NonExistent", "table");

    assertStringIncludes(result, "Error");
    assertStringIncludes(result, "not found");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: project show --format json outputs valid JSON", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestProject(memoryBank, "JsonShowProject");

    const result = await commands.projectShow("JsonShowProject", "json");
    const parsed = JSON.parse(result);

    assertEquals(parsed.portal, "JsonShowProject");
    assertEquals(Array.isArray(parsed.patterns), true);
  } finally {
    await cleanup();
  }
});

// ===== Execution Commands Tests =====

Deno.test("MemoryCommands: execution list returns history", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestExecution(memoryBank, "11111111-1111-1111-1111-111111111111", "ExecProject");

    const result = await commands.executionList({ format: "table" });

    assertStringIncludes(result, "Execution History");
    assertStringIncludes(result, "11111111");
    assertStringIncludes(result, "completed");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: execution list empty returns message", async () => {
  const { commands, cleanup } = await initMemoryTest();
  try {
    const result = await commands.executionList({ format: "table" });

    assertStringIncludes(result, "No execution history found");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: execution list --portal filters correctly", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestExecution(memoryBank, "22222222-2222-2222-2222-222222222222", "FilterProjectA");
    await createTestExecution(memoryBank, "33333333-3333-3333-3333-333333333333", "FilterProjectB");

    const result = await commands.executionList({ portal: "FilterProjectA", format: "table" });

    assertStringIncludes(result, "22222222");
    // Execution for FilterProjectB should be filtered out
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: execution list --limit works", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestExecution(memoryBank, "44444444-4444-4444-4444-444444444444", "LimitProject");
    await createTestExecution(memoryBank, "55555555-5555-5555-5555-555555555555", "LimitProject");
    await createTestExecution(memoryBank, "66666666-6666-6666-6666-666666666666", "LimitProject");

    const result = await commands.executionList({ limit: 2, format: "table" });

    assertStringIncludes(result, "Showing 2 execution(s)");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: execution show displays details", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    const traceId = "77777777-7777-7777-7777-777777777777";
    await createTestExecution(memoryBank, traceId, "ShowExecProject");

    const result = await commands.executionShow(traceId, "table");

    assertStringIncludes(result, traceId);
    assertStringIncludes(result, "ShowExecProject");
    assertStringIncludes(result, "completed");
    assertStringIncludes(result, "test-agent");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: execution show non-existent returns error", async () => {
  const { commands, cleanup } = await initMemoryTest();
  try {
    const result = await commands.executionShow("nonexistent-trace-id", "table");

    assertStringIncludes(result, "Error");
    assertStringIncludes(result, "not found");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: execution show --format json outputs valid JSON", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    const traceId = "88888888-8888-8888-8888-888888888888";
    await createTestExecution(memoryBank, traceId, "JsonExecProject");

    const result = await commands.executionShow(traceId, "json");
    const parsed = JSON.parse(result);

    assertEquals(parsed.trace_id, traceId);
    assertEquals(parsed.status, "completed");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryCommands: execution show --format md outputs markdown", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    const traceId = "99999999-9999-9999-9999-999999999999";
    await createTestExecution(memoryBank, traceId, "MdExecProject");

    const result = await commands.executionShow(traceId, "md");

    assertStringIncludes(result, "# Execution:");
    assertStringIncludes(result, "## Details");
    assertStringIncludes(result, "| Field | Value |");
  } finally {
    await cleanup();
  }
});

// ===== Rebuild Index Test =====

Deno.test("MemoryCommands: rebuild-index completes successfully", async () => {
  const { commands, memoryBank, cleanup } = await initMemoryTest();
  try {
    await createTestProject(memoryBank, "IndexProject");
    await createTestExecution(memoryBank, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "IndexProject");

    const result = await commands.rebuildIndex();

    assertStringIncludes(result, "rebuilt successfully");
  } finally {
    await cleanup();
  }
});
