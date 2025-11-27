/**
 * Mission Reporter Tests - Step 4.5 of Implementation Plan
 *
 * Tests for the MissionReporter service that generates comprehensive
 * mission reports after successful task execution.
 *
 * TDD: Tests written first, then implementation follows.
 */

import { assert, assertEquals, assertExists, assertMatch, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { MissionReporter, type ReportConfig, type TraceData } from "../src/services/mission_reporter.ts";
import { createMockConfig } from "./helpers/config.ts";
import { initTestDbService } from "./helpers/db.ts";

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
      "Knowledge/Portals/MyApp.md",
      "Knowledge/Context/Architecture_Docs.md",
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
// Test: Report Generation
// ============================================================================

Deno.test("MissionReporter: generates report after successful execution", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-test-" });
  const { db, cleanup } = await initTestDbService();

  try {
    // Create required directories
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData();

    const result = await reporter.generate(traceData);

    // Verify report file exists
    assertExists(result.reportPath);
    const reportStat = await Deno.stat(result.reportPath);
    assert(reportStat.isFile);

    // Verify content is not empty
    const content = await Deno.readTextFile(result.reportPath);
    assert(content.length > 0);
    assertStringIncludes(content, "Mission Report");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MissionReporter: filename follows naming convention", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-name-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      requestId: "implement-login",
      traceId: "abc12345-def6-7890-ghij-klmnopqrstuv",
    });

    const result = await reporter.generate(traceData);

    // Filename format: {date}_{shortTraceId}_{requestId}.md
    const filename = result.reportPath.split("/").pop();
    assertExists(filename);
    // Should match pattern like 2025-11-26_abc12345_implement-login.md
    assertMatch(filename, /^\d{4}-\d{2}-\d{2}_abc12345_implement-login\.md$/);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Test: Git Diff Summary
// ============================================================================

Deno.test("MissionReporter: includes git diff summary", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-git-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    // Create a feature branch with changes
    await runGitCommand(tempDir, ["checkout", "-b", "feat/implement-auth-550e8400"]);

    // Make some changes
    await Deno.mkdir(join(tempDir, "src", "auth"), { recursive: true });
    await Deno.writeTextFile(join(tempDir, "src", "auth", "login.ts"), "export function login() {}");
    await Deno.writeTextFile(join(tempDir, "src", "auth", "middleware.ts"), "export function auth() {}");
    await runGitCommand(tempDir, ["add", "."]);
    await runGitCommand(tempDir, [
      "commit",
      "-m",
      "Implement auth\n\n[ExoTrace: 550e8400-e29b-41d4-a716-446655440000]",
    ]);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData();

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should include git summary section
    assertStringIncludes(content, "## Git Summary");
    // Should show files changed
    assertStringIncludes(content, "files changed");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MissionReporter: categorizes file changes (created/modified)", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-changes-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    // Create a feature branch with different types of changes
    await runGitCommand(tempDir, ["checkout", "-b", "feat/test-changes-12345678"]);

    // Create new files
    await Deno.mkdir(join(tempDir, "src", "new"), { recursive: true });
    await Deno.writeTextFile(join(tempDir, "src", "new", "file.ts"), "// new file");

    // Modify existing file
    await Deno.writeTextFile(join(tempDir, "README.md"), "# Updated Project\n\nWith more content.");

    await runGitCommand(tempDir, ["add", "."]);
    await runGitCommand(tempDir, ["commit", "-m", "Mixed changes\n\n[ExoTrace: 12345678-abcd-efgh]"]);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      traceId: "12345678-abcd-efgh-ijkl-mnopqrstuvwx",
      branch: "feat/test-changes-12345678",
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should have Changes Made section
    assertStringIncludes(content, "## Changes Made");
    // Should show files created
    assertStringIncludes(content, "Files Created");
    // Should show files modified
    assertStringIncludes(content, "Files Modified");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Test: Context Linking
// ============================================================================

Deno.test("MissionReporter: links to context files with wiki links", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-links-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await Deno.mkdir(join(tempDir, "Knowledge", "Portals"), { recursive: true });
    await Deno.mkdir(join(tempDir, "Knowledge", "Context"), { recursive: true });
    await setupTestGitRepo(tempDir);

    // Create context files
    await Deno.writeTextFile(
      join(tempDir, "Knowledge", "Portals", "MyApp.md"),
      "# MyApp Portal\n",
    );
    await Deno.writeTextFile(
      join(tempDir, "Knowledge", "Context", "API_Spec.md"),
      "# API Specification\n",
    );

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      contextFiles: [
        join(tempDir, "Knowledge", "Portals", "MyApp.md"),
        join(tempDir, "Knowledge", "Context", "API_Spec.md"),
      ],
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should have Context Used section with wiki links
    assertStringIncludes(content, "## Context Used");
    assertStringIncludes(content, "[[Portals/MyApp]]");
    assertStringIncludes(content, "[[Context/API_Spec]]");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Test: YAML Frontmatter
// ============================================================================

Deno.test("MissionReporter: formats report with valid YAML frontmatter", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-yaml-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const completedAt = new Date("2025-11-26T14:30:00Z");
    const traceData = createTestTraceData({
      traceId: "test-trace-12345",
      requestId: "test-request",
      agentId: "test-agent",
      status: "completed",
      branch: "feat/test-branch",
      completedAt,
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Verify YAML frontmatter structure
    assert(content.startsWith("---\n"), "Should start with YAML delimiter");
    assertStringIncludes(content, 'trace_id: "test-trace-12345"');
    assertStringIncludes(content, 'request_id: "test-request"');
    assertStringIncludes(content, 'status: "completed"');
    assertStringIncludes(content, 'agent_id: "test-agent"');
    assertStringIncludes(content, 'branch: "feat/test-branch"');
    assertStringIncludes(content, "completed_at:");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MissionReporter: frontmatter has all required fields", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-required-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData();

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    assertExists(frontmatterMatch, "Should have frontmatter");
    const frontmatter = frontmatterMatch[1];

    // All required fields present
    assertStringIncludes(frontmatter, "trace_id:");
    assertStringIncludes(frontmatter, "request_id:");
    assertStringIncludes(frontmatter, "status:");
    assertStringIncludes(frontmatter, "completed_at:");
    assertStringIncludes(frontmatter, "agent_id:");
    assertStringIncludes(frontmatter, "branch:");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Test: Activity Journal Logging
// ============================================================================

Deno.test("MissionReporter: logs report creation to Activity Journal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-log-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      traceId: "log-test-trace-id",
    });

    await reporter.generate(traceData);

    // Wait for batched logs to flush
    await db.waitForFlush();

    // Verify activity log entry
    const logs = db.instance.prepare(
      "SELECT * FROM activity WHERE action_type = ?",
    ).all("report.generated");

    assertEquals(logs.length, 1);
    const log = logs[0] as Record<string, unknown>;
    assertEquals(log.trace_id, "log-test-trace-id");

    // Verify payload contains report_path
    const payload = JSON.parse(log.payload as string);
    assertExists(payload.report_path);
    assertEquals(payload.status, "completed");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Test: Reasoning Section
// ============================================================================

Deno.test("MissionReporter: includes reasoning section", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-reasoning-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      reasoning: "Chose JWT over sessions for stateless authentication. Used bcrypt for password hashing.",
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should have Reasoning section
    assertStringIncludes(content, "## Reasoning");
    assertStringIncludes(content, "JWT over sessions");
    assertStringIncludes(content, "bcrypt");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Test: Error Handling
// ============================================================================

Deno.test("MissionReporter: handles missing trace data gracefully", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-error-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);

    // Minimal trace data with missing optional fields
    const traceData: TraceData = {
      traceId: "minimal-trace",
      requestId: "minimal-request",
      agentId: "agent",
      status: "completed",
      branch: "feat/minimal",
      completedAt: new Date(),
      contextFiles: [],
      reasoning: "",
      summary: "",
    };

    // Should not throw, but generate report with placeholders
    const result = await reporter.generate(traceData);
    assertExists(result.reportPath);

    const content = await Deno.readTextFile(result.reportPath);
    assert(content.length > 0);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MissionReporter: logs error when report generation fails", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-fail-" });
  const { db, cleanup } = await initTestDbService();

  try {
    // Don't create reports directory - this should cause write to fail
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"), // doesn't exist
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      traceId: "fail-trace-id",
    });

    let error: Error | null = null;
    try {
      await reporter.generate(traceData);
    } catch (e) {
      error = e as Error;
    }

    assertExists(error, "Should throw error when directory doesn't exist");

    // Wait for batched logs to flush
    await db.waitForFlush();

    // Verify error logged
    const logs = db.instance.prepare(
      "SELECT * FROM activity WHERE action_type = ?",
    ).all("report.failed");

    assertEquals(logs.length, 1);
    const log = logs[0] as Record<string, unknown>;
    assertEquals(log.trace_id, "fail-trace-id");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Test: Report Searchability
// ============================================================================

Deno.test("MissionReporter: reports are searchable by trace_id", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-search-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const uniqueTraceId = "searchable-" + crypto.randomUUID();
    const traceData = createTestTraceData({
      traceId: uniqueTraceId,
    });

    await reporter.generate(traceData);

    // Search by trace_id in report content
    const reportsDir = join(tempDir, "Knowledge", "Reports");
    let found = false;

    for await (const entry of Deno.readDir(reportsDir)) {
      if (entry.isFile && entry.name.endsWith(".md")) {
        const content = await Deno.readTextFile(join(reportsDir, entry.name));
        if (content.includes(uniqueTraceId)) {
          found = true;
          break;
        }
      }
    }

    assert(found, "Report should be searchable by trace_id");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Test: Summary Section
// ============================================================================

Deno.test("MissionReporter: includes summary section", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-summary-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      summary: "Implemented a complete user authentication system with JWT tokens.",
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should have Summary section
    assertStringIncludes(content, "## Summary");
    assertStringIncludes(content, "JWT tokens");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Test: Next Steps Section
// ============================================================================

Deno.test("MissionReporter: includes next steps section", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-next-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData();

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should have Next Steps section with standard items
    assertStringIncludes(content, "## Next Steps");
    assertStringIncludes(content, "Review");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Test: Report Title
// ============================================================================

Deno.test("MissionReporter: generates report title from request ID", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-title-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      requestId: "implement-user-authentication",
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Title should be formatted from request ID
    assertStringIncludes(content, "# Mission Report: Implement User Authentication");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Test: Branch Detection
// ============================================================================

Deno.test("MissionReporter: detects current branch for git diff", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-branch-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    // Create and checkout feature branch
    const branchName = "feat/my-feature-12345678";
    await runGitCommand(tempDir, ["checkout", "-b", branchName]);

    // Make some changes
    await Deno.writeTextFile(join(tempDir, "new-file.ts"), "// new code");
    await runGitCommand(tempDir, ["add", "."]);
    await runGitCommand(tempDir, ["commit", "-m", "Add feature"]);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      branch: branchName,
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Branch should be in frontmatter
    assertStringIncludes(content, `branch: "${branchName}"`);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Test: Multiple Reports
// ============================================================================

Deno.test("MissionReporter: generates unique filenames for multiple reports", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-multi-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);

    // Generate multiple reports with different trace IDs
    const reports = await Promise.all([
      reporter.generate(createTestTraceData({ traceId: "trace-1-" + crypto.randomUUID() })),
      reporter.generate(createTestTraceData({ traceId: "trace-2-" + crypto.randomUUID() })),
      reporter.generate(createTestTraceData({ traceId: "trace-3-" + crypto.randomUUID() })),
    ]);

    // All should have unique paths
    const paths = new Set(reports.map((r) => r.reportPath));
    assertEquals(paths.size, 3, "All reports should have unique filenames");

    // All files should exist
    for (const report of reports) {
      const stat = await Deno.stat(report.reportPath);
      assert(stat.isFile);
    }
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Test: Failed Status Reports
// ============================================================================

Deno.test("MissionReporter: handles failed status in trace data", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-failed-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      status: "failed",
      reasoning: "Failed due to permission error when writing to protected directory.",
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should show failed status
    assertStringIncludes(content, 'status: "failed"');
    assertStringIncludes(content, "permission error");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Test: Edge Cases for Coverage
// ============================================================================

Deno.test("MissionReporter: handles deleted files in git diff", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-deleted-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    // Create and commit a file, then delete it
    const testFilePath = join(tempDir, "to-delete.txt");
    await Deno.writeTextFile(testFilePath, "This will be deleted");
    await runGitCommand(tempDir, ["add", "."]);
    await runGitCommand(tempDir, ["commit", "-m", "Add file to delete"]);

    // Create feature branch and delete the file
    await runGitCommand(tempDir, ["checkout", "-b", "feat/delete-file-12345678"]);
    await Deno.remove(testFilePath);
    await runGitCommand(tempDir, ["add", "."]);
    await runGitCommand(tempDir, ["commit", "-m", "Delete file\n\n[ExoTrace: 12345678]"]);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      traceId: "12345678-abcd-efgh-ijkl-mnopqrstuvwx",
      branch: "feat/delete-file-12345678",
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should have Files Deleted section
    assertStringIncludes(content, "## Changes Made");
    assertStringIncludes(content, "Files Deleted");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MissionReporter: works without database service", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-no-db-" });

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      // No db provided
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData();

    // Should not throw even without db
    const result = await reporter.generate(traceData);
    assertExists(result.reportPath);

    const content = await Deno.readTextFile(result.reportPath);
    assert(content.length > 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MissionReporter: shows no summary when empty", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-no-summary-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      summary: "", // Empty summary
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should have placeholder text
    assertStringIncludes(content, "No summary provided");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MissionReporter: shows no reasoning when empty", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-no-reason-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      reasoning: "", // Empty reasoning
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should have placeholder text
    assertStringIncludes(content, "No reasoning provided");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MissionReporter: shows no context when empty array", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-no-ctx-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      contextFiles: [], // Empty context files
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should have placeholder text
    assertStringIncludes(content, "No context files were used");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MissionReporter: handles no file changes (empty git diff)", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-no-changes-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    // Create branch but don't make any changes
    await runGitCommand(tempDir, ["checkout", "-b", "feat/no-changes-12345678"]);
    // Make an empty commit
    await runGitCommand(tempDir, ["commit", "--allow-empty", "-m", "Empty commit"]);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      traceId: "12345678-no-changes",
      branch: "feat/no-changes-12345678",
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should show no file changes detected
    assertStringIncludes(content, "No file changes detected");
    assertStringIncludes(content, "0 files changed");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MissionReporter: handles failed status with proper next steps", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-fail-steps-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      status: "failed",
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should have failure-specific next steps
    assertStringIncludes(content, "## Next Steps");
    assertStringIncludes(content, "Review the error");
    assertStringIncludes(content, "retry execution");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MissionReporter: handles file paths with spaces in wiki links", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-spaces-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await Deno.mkdir(join(tempDir, "Knowledge", "Portals"), { recursive: true });
    await setupTestGitRepo(tempDir);

    // Create context file with spaces in name
    await Deno.writeTextFile(
      join(tempDir, "Knowledge", "Portals", "My App.md"),
      "# My App\n",
    );

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData({
      contextFiles: [join(tempDir, "Knowledge", "Portals", "My App.md")],
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should handle spaces in wiki links
    assertStringIncludes(content, "[[Portals/My App]]");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MissionReporter: error logging works without db", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-err-no-db-" });

  try {
    // Don't create reports directory - this will cause failure
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"), // doesn't exist
      knowledgeRoot: join(tempDir, "Knowledge"),
      // No db - error logging should not crash
    };

    const reporter = new MissionReporter(config, reportConfig);
    const traceData = createTestTraceData();

    let threw = false;
    try {
      await reporter.generate(traceData);
    } catch {
      threw = true;
    }

    assert(threw, "Should throw when reports directory doesn't exist");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("MissionReporter: handles context file using basename fallback", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mission-reporter-basename-" });
  const { db, cleanup } = await initTestDbService();

  try {
    await Deno.mkdir(join(tempDir, "Knowledge", "Reports"), { recursive: true });
    await setupTestGitRepo(tempDir);

    const config = createMockConfig(tempDir);
    const reportConfig: ReportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db,
    };

    const reporter = new MissionReporter(config, reportConfig);
    // Context file from a completely different path
    const traceData = createTestTraceData({
      contextFiles: ["/some/other/path/External_Doc.md"],
    });

    const result = await reporter.generate(traceData);
    const content = await Deno.readTextFile(result.reportPath);

    // Should include the context file somehow (either relative or basename)
    assertStringIncludes(content, "## Context Used");
    // The path will be relative, but from a different location
    assertStringIncludes(content, "[[");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});
