/**
 * Mission Reporter Tests - Updated for Memory Banks
 *
 * Tests for the updated MissionReporter service that generates execution
 * memory records in the Memory/Execution/ directory structure.
 *
 * Success Criteria:
 * - Test 1: Creates execution memory record with structured files
 * - Test 2: Extracts lessons learned from reasoning text
 * - Test 3: Logs activities correctly
 * - Test 4: Handles errors gracefully
 */

import { assert, assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { MissionReporter, type ReportConfig, type TraceData } from "../src/services/mission_reporter.ts";
import { MemoryBankService } from "../src/services/memory_bank.ts";
import { createMockConfig } from "./helpers/config.ts";
import { initTestDbService } from "./helpers/db.ts";
import { getMemoryExecutionDir } from "./helpers/paths_helper.ts";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a test trace data with sensible defaults
 */
function createTestTraceData(overrides: Partial<TraceData> = {}): TraceData {
  return {
    traceId: overrides.traceId ?? "550e8400-e29b-41d4-a716-446655440000",
    requestId: overrides.requestId ?? "implement-auth",
    agentId: overrides.agentId ?? "senior-coder",
    status: overrides.status ?? "completed",
    branch: overrides.branch ?? "feat/implement-auth-550e8400",
    completedAt: overrides.completedAt ?? new Date(),
    contextFiles: overrides.contextFiles ?? [
      "Portals/MyApp/config.md",
      "Memory/Projects/MyApp/architecture.md",
    ],
    reasoning: overrides.reasoning ?? "Chose JWT over sessions for stateless authentication.",
    summary: overrides.summary ?? "Successfully implemented JWT-based authentication system.",
  };
}

/**
 * Sets up a git repository with test commits
 */
async function setupTestGitRepo(tempDir: string): Promise<void> {
  // Initialize git
  await runGitCommand(tempDir, ["init"]);
  await runGitCommand(tempDir, ["config", "user.email", "test@test.com"]);
  await runGitCommand(tempDir, ["config", "user.name", "Test User"]);

  // Create initial commit
  await Deno.writeTextFile(join(tempDir, "README.md"), "# Test Project\n");
  await runGitCommand(tempDir, ["add", "."]);
  await runGitCommand(tempDir, ["commit", "-m", "Initial commit"]);
}

/**
 * Helper to run git commands
 */
async function runGitCommand(cwd: string, args: string[]): Promise<string> {
  const cmd = new Deno.Command("git", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout, stderr, code } = await cmd.output();
  if (code !== 0) {
    throw new Error(`Git command failed: ${new TextDecoder().decode(stderr)}`);
  }
  return new TextDecoder().decode(stdout);
}

// ============================================================================
// Test: Basic Report Generation
// ============================================================================

Deno.test("MissionReporter: generates execution memory record after successful execution", async () => {
  const { db, tempDir, cleanup } = await initTestDbService();

  try {
    // Create required directories for Memory Banks
    await Deno.mkdir(getMemoryExecutionDir(tempDir), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: getMemoryExecutionDir(tempDir),
    };

    const memoryBank = new MemoryBankService(config, db);
    const reporter = new MissionReporter(config, reportConfig, memoryBank, db);
    const traceData = createTestTraceData();

    const result = await reporter.generate(traceData);

    // Verify result is successful
    assert(result.success);
    assertExists(result.reportPath);
    assertEquals(result.traceId, traceData.traceId);

    // Verify execution memory directory exists
    const executionDir = join(getMemoryExecutionDir(tempDir), traceData.traceId);
    const dirStat = await Deno.stat(executionDir);
    assert(dirStat.isDirectory);

    // Verify the required files exist
    const summaryFile = join(executionDir, "summary.md");
    const contextFile = join(executionDir, "context.json");

    const summaryExists = await Deno.stat(summaryFile).then(() => true).catch(() => false);
    const contextExists = await Deno.stat(contextFile).then(() => true).catch(() => false);

    assert(summaryExists, "summary.md should exist");
    assert(contextExists, "context.json should exist");
  } finally {
    await cleanup();
  }
});

Deno.test("MissionReporter: creates structured execution memory with lessons learned", async () => {
  const { db, tempDir, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(getMemoryExecutionDir(tempDir), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: getMemoryExecutionDir(tempDir),
    };

    const memoryBank = new MemoryBankService(config, db);
    const reporter = new MissionReporter(config, reportConfig, memoryBank, db);
    const traceData = createTestTraceData({
      reasoning:
        "I learned that JWT tokens are better for stateless auth. I discovered that Redis is useful for caching.",
      summary: "Successfully implemented authentication with lessons learned about security best practices.",
    });

    const result = await reporter.generate(traceData);

    // Verify result is successful
    assert(result.success);

    // Read the execution memory to verify lessons learned extraction
    const executionMemory = await memoryBank.getExecutionByTraceId(traceData.traceId);
    assertExists(executionMemory);

    // Should have extracted lessons from reasoning text
    assert(executionMemory.lessons_learned && executionMemory.lessons_learned.length > 0);
    assert(
      executionMemory.lessons_learned.some((lesson: string) =>
        lesson.toLowerCase().includes("jwt") || lesson.toLowerCase().includes("redis")
      ),
    );
  } finally {
    await cleanup();
  }
});

Deno.test("MissionReporter: handles failed execution status", async () => {
  const { db, tempDir, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(getMemoryExecutionDir(tempDir), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: getMemoryExecutionDir(tempDir),
    };

    const memoryBank = new MemoryBankService(config, db);
    const reporter = new MissionReporter(config, reportConfig, memoryBank, db);
    const traceData = createTestTraceData({
      status: "failed",
      summary: "Failed to implement authentication due to dependency issues.",
    });

    const result = await reporter.generate(traceData);

    // Verify result is successful (we still create memory records for failures)
    assert(result.success);

    // Read the execution memory to verify status
    const executionMemory = await memoryBank.getExecutionByTraceId(traceData.traceId);
    assertExists(executionMemory);
    assertEquals(executionMemory.status, "failed");
    assertExists(executionMemory.error_message);
  } finally {
    await cleanup();
  }
});

Deno.test("MissionReporter: extracts portal from context files", async () => {
  const { db, tempDir, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(getMemoryExecutionDir(tempDir), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: getMemoryExecutionDir(tempDir),
    };

    const memoryBank = new MemoryBankService(config, db);
    const reporter = new MissionReporter(config, reportConfig, memoryBank, db);
    const traceData = createTestTraceData({
      contextFiles: [
        "Portals/TestPortal/config.md",
        "src/components/Auth.tsx",
      ],
    });

    const result = await reporter.generate(traceData);

    // Verify result is successful
    assert(result.success);

    // Read the execution memory to verify portal extraction
    const executionMemory = await memoryBank.getExecutionByTraceId(traceData.traceId);
    assertExists(executionMemory);
    assertEquals(executionMemory.portal, "TestPortal");
  } finally {
    await cleanup();
  }
});

Deno.test("MissionReporter: works without database service", async () => {
  const tempDir = await Deno.makeTempDir();

  try {
    await Deno.mkdir(getMemoryExecutionDir(tempDir), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: getMemoryExecutionDir(tempDir),
    };

    // Create memoryBank without db (should fall back to console logging)
    const mockDb = {
      logActivity: () => {},
    } as any;

    const memoryBank = new MemoryBankService(config, mockDb);
    const reporter = new MissionReporter(config, reportConfig, memoryBank);
    const traceData = createTestTraceData();

    const result = await reporter.generate(traceData);

    // Should still work without database
    assert(result.success);
    assertExists(result.reportPath);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
