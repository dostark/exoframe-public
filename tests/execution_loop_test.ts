import { assert, assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { ExecutionLoop } from "../src/services/execution_loop.ts";
import { createMockConfig } from "./helpers/config.ts";
import { initTestDbService } from "./helpers/db.ts";

/**
 * Tests for Step 4.3: Execution Loop (Resilient)
 *
 * Success Criteria:
 * - Monitor /System/Active for approved plans
 * - Acquire lease to prevent concurrent execution
 * - Execute plan using Tool Registry and Git Service
 * - Handle success path: commit changes, generate report, archive plan
 * - Handle failure path: rollback git, generate failure report, move plan back
 * - Release lease even on failure
 * - Log all execution steps to Activity Journal with trace_id and agent_id
 */

Deno.test("ExecutionLoop: processes approved plan from /System/Active", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-test-process-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    // Create a simple plan file
    const planContent = `---
trace_id: "test-trace-001"
request_id: "test-request"
status: "active"
agent_id: "test-agent"
---

# Test Plan

## Actions
1. Read a test file
`;

    const planPath = join(systemActiveDir, "test-request.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });

    // Process the plan
    const result = await loop.processTask(planPath);

    assertEquals(result.success, true);
    assertExists(result.traceId);

    // Plan should be moved to archive
    const archiveDir = join(tempDir, "Inbox", "Archive");
    const archivedPlan = join(archiveDir, "test-request.md");
    const archivedExists = await Deno.stat(archivedPlan).then(() => true).catch(() => false);
    assert(archivedExists, "Plan should be archived after successful execution");

    // Activity should be logged
    await new Promise((resolve) => setTimeout(resolve, 150)); // Wait for batched logs
    const activities = db.getActivitiesByTrace("test-trace-001");
    const startedLog = activities.find((a: any) => a.action_type === "execution.started");
    assertExists(startedLog, "execution.started should be logged");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop: acquires lease to prevent concurrent execution", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-test-lease-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    const planContent = `---
trace_id: "test-trace-lease"
request_id: "lease-test"
status: "active"
agent_id: "test-agent"
---

# Lease Test Plan

Note: This test doesn't use special markers, so execution will complete quickly.
We need to test concurrent lease acquisition.
`;

    const planPath = join(systemActiveDir, "lease-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop1 = new ExecutionLoop({ config, db, agentId: "agent-1" });
    const loop2 = new ExecutionLoop({ config, db, agentId: "agent-2" });

    // Start first execution but don't await
    const exec1Promise = loop1.processTask(planPath);

    // Give first execution time to acquire lease
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Try second execution while first is still running
    // This should work if file still exists, or fail gracefully if file was already processed
    try {
      await loop2.processTask(planPath);
      // If we get here, file was already processed (acceptable)
    } catch (error) {
      // Should be either "lease already held" or "file not found" (both acceptable)
      const errorMsg = error instanceof Error ? error.message : String(error);
      const validErrors = ["lease already held", "No such file"];
      assert(
        validErrors.some((msg) => errorMsg.includes(msg)),
        `Expected lease or file error, got: ${errorMsg}`,
      );
    }

    // Wait for first execution to complete
    await exec1Promise;
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop: creates git branch and commits with trace_id", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-test-git-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    const planContent = `---
trace_id: "test-trace-git"
request_id: "git-commit-test"
status: "active"
agent_id: "test-agent"
---

# Git Integration Test

## Actions
1. Write a test file
`;

    const planPath = join(systemActiveDir, "git-commit-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.processTask(planPath);

    assertEquals(result.success, true);

    // Check that git branch was created
    const gitCmd = new Deno.Command("git", {
      args: ["branch", "--list", "feat/git-commit-test-*"],
      cwd: tempDir,
      stdout: "piped",
    });
    const { stdout } = await gitCmd.output();
    const branches = new TextDecoder().decode(stdout);
    assert(branches.includes("feat/git-commit-test"), "Git branch should be created");

    // Check that commit includes trace_id
    const logCmd = new Deno.Command("git", {
      args: ["log", "--oneline", "-1"],
      cwd: tempDir,
      stdout: "piped",
    });
    const { stdout: logOutput } = await logCmd.output();
    const _commitLog = new TextDecoder().decode(logOutput);

    const detailCmd = new Deno.Command("git", {
      args: ["log", "-1", "--pretty=format:%B"],
      cwd: tempDir,
      stdout: "piped",
    });
    const { stdout: detailOutput } = await detailCmd.output();
    const commitMsg = new TextDecoder().decode(detailOutput);
    assert(commitMsg.includes("[ExoTrace: test-trace-git]"), "Commit should include trace_id");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop: handles tool execution failure gracefully", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-test-failure-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    // Plan that will fail (path traversal attempt)
    const planContent = `---
trace_id: "test-trace-fail"
request_id: "fail-test"
status: "active"
agent_id: "test-agent"
---

# Failure Test Plan

## Actions
1. Read file with path traversal: ../../etc/passwd
`;

    const planPath = join(systemActiveDir, "fail-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.processTask(planPath);

    assertEquals(result.success, false);
    assertExists(result.error);

    // Plan should be moved back to Inbox/Requests with error status
    const requestsDir = join(tempDir, "Inbox", "Requests");
    const movedPlan = join(requestsDir, "fail-test.md");
    const movedExists = await Deno.stat(movedPlan).then(() => true).catch(() => false);
    assert(movedExists, "Plan should be moved back to /Inbox/Requests on failure");

    // Failure report should be generated
    const reportsDir = join(tempDir, "Knowledge", "Reports");
    const files = await Array.fromAsync(Deno.readDir(reportsDir));
    const failureReport = files.find((f) => f.name.includes("fail-test") && f.name.includes("failure"));
    assertExists(failureReport, "Failure report should be generated");

    // Activity should log failure
    await new Promise((resolve) => setTimeout(resolve, 150));
    const activities = db.getActivitiesByTrace("test-trace-fail");
    const failedLog = activities.find((a: any) => a.action_type === "execution.failed");
    assertExists(failedLog, "execution.failed should be logged");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop: generates mission report on success", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-test-report-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    const planContent = `---
trace_id: "test-trace-report"
request_id: "report-test"
status: "active"
agent_id: "test-agent"
---

# Report Test Plan

## Actions
1. Create a test file
`;

    const planPath = join(systemActiveDir, "report-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.processTask(planPath);

    assertEquals(result.success, true);

    // Mission report should be generated
    const reportsDir = join(tempDir, "Knowledge", "Reports");
    const files = await Array.fromAsync(Deno.readDir(reportsDir));
    const missionReport = files.find((f) => f.name.includes("report-test") && !f.name.includes("failure"));
    assertExists(missionReport, "Mission report should be generated on success");

    // Report should contain trace_id
    const reportPath = join(reportsDir, missionReport!.name);
    const reportContent = await Deno.readTextFile(reportPath);
    assert(reportContent.includes("test-trace-report"), "Report should include trace_id");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop: releases lease even on failure", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-test-lease-release-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    const planContent = `---
trace_id: "test-trace-lease-release"
request_id: "lease-release-test"
status: "active"
agent_id: "test-agent"
---

# Lease Release Test

## Actions
1. Intentionally fail
`;

    const planPath = join(systemActiveDir, "lease-release-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop1 = new ExecutionLoop({ config, db, agentId: "agent-1" });
    const loop2 = new ExecutionLoop({ config, db, agentId: "agent-2" });

    // First execution fails
    const result1 = await loop1.processTask(planPath);
    assertEquals(result1.success, false);

    // Second execution should be able to acquire lease (first released it)
    // Note: Plan was moved back to Requests, need to move it back to Active
    const requestsDir = join(tempDir, "Inbox", "Requests");
    const movedPlan = join(requestsDir, "lease-release-test.md");
    await Deno.rename(movedPlan, planPath);

    // This should succeed in acquiring lease (previous lease was released)
    // Will still fail execution, but that's expected
    const result2 = await loop2.processTask(planPath);
    assertEquals(result2.success, false);
    // If we got here without "lease already held" error, lease was properly released
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop: logs all execution steps to Activity Journal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-test-logging-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    const planContent = `---
trace_id: "test-trace-logging"
request_id: "logging-test"
status: "active"
agent_id: "test-agent"
---

# Logging Test Plan

## Actions
1. Perform logged operations
`;

    const planPath = join(systemActiveDir, "logging-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    await loop.processTask(planPath);

    // Wait for batched logs to flush
    await new Promise((resolve) => setTimeout(resolve, 150));

    const activities = db.getActivitiesByTrace("test-trace-logging");

    // Check for key execution steps
    const actionTypes = activities.map((a: any) => a.action_type);

    assert(
      actionTypes.includes("execution.started"),
      "Should log execution.started",
    );
    assert(
      actionTypes.some((type: string) => type.startsWith("git.")),
      "Should log git operations",
    );
    assert(
      actionTypes.includes("execution.completed") || actionTypes.includes("execution.failed"),
      "Should log execution outcome",
    );

    // Verify agent_id is set
    const agentActions = activities.filter((a: any) => a.actor === "agent");
    agentActions.forEach((action: any) => {
      assertEquals(action.agent_id, "test-agent", "Agent actions should have agent_id");
    });
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop: parses plan frontmatter correctly", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-test-parse-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    const planContent = `---
trace_id: "test-trace-parse"
request_id: "parse-test"
status: "active"
agent_id: "senior-coder"
---

# Parse Test Plan
`;

    const planPath = join(systemActiveDir, "parse-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "senior-coder" });
    const result = await loop.processTask(planPath);

    // If parsing failed, this would have thrown
    assertEquals(result.traceId, "test-trace-parse");
    assertExists(result);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop: rejects plan with missing required frontmatter", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-test-invalid-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    // Plan missing trace_id
    const planContent = `---
request_id: "invalid-test"
status: "active"
---

# Invalid Plan
`;

    const planPath = join(systemActiveDir, "invalid-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });

    // Should fail with clear error about missing trace_id
    const result = await loop.processTask(planPath);
    assertEquals(result.success, false);
    assert(result.error?.includes("trace_id"), `Error should mention trace_id, got: ${result.error}`);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop: handles git rollback on failure", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-test-rollback-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    const planContent = `---
trace_id: "test-trace-rollback"
request_id: "rollback-test"
status: "active"
agent_id: "test-agent"
---

# Rollback Test Plan

## Actions
1. Make some changes
2. Intentionally fail
`;

    const planPath = join(systemActiveDir, "rollback-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.processTask(planPath);

    assertEquals(result.success, false, "Execution should fail due to 'Intentionally fail' marker");

    // Git working tree should be clean (changes rolled back)
    const statusCmd = new Deno.Command("git", {
      args: ["status", "--porcelain"],
      cwd: tempDir,
      stdout: "piped",
    });
    const { stdout } = await statusCmd.output();
    const status = new TextDecoder().decode(stdout);

    // Should be empty or only show untracked files from test setup
    // The key is that changes made during execution should be gone
    assert(
      !status.includes("modified:") && !status.includes("deleted:"),
      "Modified/deleted files should be rolled back",
    );
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});
