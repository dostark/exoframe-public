/**
 * Tests for ChangesetCommands
 * Covers list, show, approve, and reject operations
 *
 * Success Criteria:
 * - Test 1: list returns changesets sorted by creation date
 * - Test 2: show displays changeset details (branch, commits, files)
 * - Test 3: approve merges branch to main with --no-ff
 * - Test 4: reject archives branch without merging
 * - Test 5: Commands validate branch exists and is correct type
 * - Test 6: Counts files changed in changeset listings
 */

import { assertEquals, assertExists, assertRejects, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@^1.0.0/bdd";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { ChangesetCommands } from "../../src/cli/changeset_commands.ts";
import { DatabaseService } from "../../src/services/db.ts";
import { GitService } from "../../src/services/git_service.ts";
import { createMockConfig } from "../helpers/config.ts";

describe("ChangesetCommands", () => {
  let tempDir: string;
  let db: DatabaseService;
  let gitService: GitService;
  let changesetCommands: ChangesetCommands;

  beforeEach(async () => {
    // Create temp directory structure
    tempDir = await Deno.makeTempDir({ prefix: "changeset_commands_test_" });
    const systemDir = join(tempDir, "System");
    await ensureDir(systemDir);

    // Initialize git repository
    await runGitCommand(tempDir, ["init", "-b", "main"]);
    await runGitCommand(tempDir, ["config", "user.email", "test@example.com"]);
    await runGitCommand(tempDir, ["config", "user.name", "Test User"]);

    // Create initial commit on main
    await Deno.writeTextFile(join(tempDir, "README.md"), "# Test Project\n");
    await runGitCommand(tempDir, ["add", "README.md"]);
    await runGitCommand(tempDir, ["commit", "-m", "Initial commit"]);

    // Initialize database
    const config = createMockConfig(tempDir);
    db = new DatabaseService(config);

    // Initialize activity table
    db.instance.exec(`
      CREATE TABLE IF NOT EXISTS activity (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        agent_id TEXT,
        action_type TEXT NOT NULL,
        target TEXT,
        payload TEXT NOT NULL,
        timestamp DATETIME DEFAULT (datetime('now'))
      );
    `);

    gitService = new GitService({ config, db });
    changesetCommands = new ChangesetCommands({ config, db }, gitService);
  });

  afterEach(async () => {
    await db.close();
    await Deno.remove(tempDir, { recursive: true });
  });

  describe("list", () => {
    it("should return empty array when no changesets exist", async () => {
      const changesets = await changesetCommands.list();
      assertEquals(changesets, []);
    });

    it("should find feat/* branches", async () => {
      // Create a feature branch with proper naming
      await createFeatureBranch(tempDir, "request-001", "abc-123-def");

      const changesets = await changesetCommands.list();
      assertEquals(changesets.length, 1);
      assertEquals(changesets[0].branch, "feat/request-001-abc-123-def");
    });

    it("should extract trace_id from branch name", async () => {
      await createFeatureBranch(tempDir, "request-002", "def-456-abc");

      const changesets = await changesetCommands.list();
      assertEquals(changesets[0].trace_id, "def-456-abc");
      assertEquals(changesets[0].request_id, "request-002");
    });

    it("should filter by status", async () => {
      await createFeatureBranch(tempDir, "request-003", "abc-789-def");

      // Log an approval in activity log
      await db.logActivity(
        "human",
        "changeset.approved",
        "request-003",
        { approved_by: "test@example.com" },
        "abc-789-def",
        null,
      );
      // Wait for batched write to complete
      await db.waitForFlush();

      // Filter for approved
      const approved = await changesetCommands.list("approved");
      assertEquals(approved.length, 1);

      // Filter for pending
      const pending = await changesetCommands.list("pending");
      assertEquals(pending.length, 0);
    });

    it("should sort by creation date descending", async () => {
      // Create multiple branches with delays
      await createFeatureBranch(tempDir, "request-001", "aaa-111-bbb");
      // Git commit timestamps are second-precision, need real delay
      await delay(1500);
      await createFeatureBranch(tempDir, "request-002", "bbb-222-ccc");

      const changesets = await changesetCommands.list();
      assertEquals(changesets.length, 2);
      // Most recent should be first
      assertEquals(changesets[0].request_id, "request-002");
      assertEquals(changesets[1].request_id, "request-001");
    });

    it("should count files changed", async () => {
      await createFeatureBranch(tempDir, "request-004", "ccc-333-ddd", 2);

      const changesets = await changesetCommands.list();
      assertEquals(changesets[0].files_changed, 2);
    });
  });

  describe("show", () => {
    it("should display changeset details", async () => {
      await createFeatureBranch(tempDir, "request-005", "abc-345-fed");

      const details = await changesetCommands.show("feat/request-005-abc-345-fed");

      assertExists(details);
      assertEquals(details.branch, "feat/request-005-abc-345-fed");
      assertEquals(details.trace_id, "abc-345-fed");
      assertEquals(details.request_id, "request-005");
      assertExists(details.diff);
      assertExists(details.commits);
      assertEquals(details.commits.length, 1);
    });

    it("should accept request_id as shorthand", async () => {
      await createFeatureBranch(tempDir, "request-006", "def-678-abc");

      const details = await changesetCommands.show("request-006");
      assertEquals(details.branch, "feat/request-006-def-678-abc");
    });

    it("should throw error for non-existent changeset", async () => {
      await assertRejects(
        async () => await changesetCommands.show("non-existent"),
        Error,
        "Changeset not found",
      );
    });

    it("should include commit history", async () => {
      await createFeatureBranch(tempDir, "request-007", "abc-901-def");

      const details = await changesetCommands.show("request-007");
      assertEquals(details.commits.length, 1);
      assertExists(details.commits[0].sha);
      assertExists(details.commits[0].message);
      assertStringIncludes(details.commits[0].message, "Add feature");
    });

    it("should generate unified diff", async () => {
      await createFeatureBranch(tempDir, "request-008", "def-234-abc");

      const details = await changesetCommands.show("request-008");
      assertStringIncludes(details.diff, "diff --git");
      assertStringIncludes(details.diff, "feature content");
    });
  });

  describe("approve", () => {
    it("should merge branch to main", async () => {
      await createFeatureBranch(tempDir, "request-009", "abc-567-fed");

      await changesetCommands.approve("request-009");

      // Verify branch was merged
      const log = await runGitCommand(tempDir, ["log", "--oneline"]);
      assertStringIncludes(log, "Merge request-009");
    });

    it("should validate current branch is main", async () => {
      await createFeatureBranch(tempDir, "request-010", "def-890-abc");

      // Switch to a different branch
      await runGitCommand(tempDir, ["checkout", "-b", "other-branch"]);

      await assertRejects(
        async () => await changesetCommands.approve("request-010"),
        Error,
        "Must be on 'main' branch",
      );
    });

    it("should use --no-ff merge", async () => {
      await createFeatureBranch(tempDir, "request-011", "abc-123-fed");

      await changesetCommands.approve("request-011");

      // Check that a merge commit was created
      const log = await runGitCommand(tempDir, ["log", "--oneline", "-n", "1"]);
      assertStringIncludes(log, "Merge");
    });

    it("should log commit SHA to activity", async () => {
      await createFeatureBranch(tempDir, "request-012", "def-456-abc");

      await changesetCommands.approve("request-012");
      // Wait for batched write to complete
      await db.waitForFlush();

      // Check activity log
      const activities = await db.getActivitiesByTrace("def-456-abc");
      const approval = activities.find((a: { action_type: string }) => a.action_type === "changeset.approved");

      assertExists(approval);
      assertExists(approval.payload);
      const payload = JSON.parse(approval.payload);
      assertExists(payload.commit_sha);
      assertEquals(payload.approved_by, "test@example.com");
    });
  });

  describe("reject", () => {
    it("should require rejection reason", async () => {
      await createFeatureBranch(tempDir, "request-013", "abc-789-fed");

      await assertRejects(
        async () => await changesetCommands.reject("request-013", ""),
        Error,
        "Rejection reason is required",
      );
    });

    it("should delete branch", async () => {
      await createFeatureBranch(tempDir, "request-014", "def-012-abc");

      await changesetCommands.reject("request-014", "Not needed");

      // Verify branch was deleted
      const branches = await runGitCommand(tempDir, ["branch", "--list", "feat/*"]);
      assertEquals(branches.includes("feat/request-014-def-012-abc"), false);
    });

    it("should log rejection to activity", async () => {
      await createFeatureBranch(tempDir, "request-015", "abc-345-edf");

      await changesetCommands.reject("request-015", "Quality issues");
      // Wait for batched write to complete
      await db.waitForFlush();

      // Check activity log
      const activities = await db.getActivitiesByTrace("abc-345-edf");
      const rejection = activities.find((a: { action_type: string }) => a.action_type === "changeset.rejected");

      assertExists(rejection);
      const payload = JSON.parse(rejection.payload);
      assertEquals(payload.rejection_reason, "Quality issues");
      assertEquals(payload.rejected_by, "test@example.com");
    });

    it("should include rejection reason in log", async () => {
      await createFeatureBranch(tempDir, "request-016", "def-678-bca");

      await changesetCommands.reject("request-016", "Needs redesign");
      // Wait for batched write to complete
      await db.waitForFlush();

      const activities = await db.getActivitiesByTrace("def-678-bca");
      const rejection = activities.find((a: { action_type: string }) => a.action_type === "changeset.rejected");
      assertExists(rejection);
      if (!rejection) throw new Error("Rejection not found");
      const payload = JSON.parse(rejection.payload);

      assertStringIncludes(payload.rejection_reason, "Needs redesign");
    });
  });
});

// Helper functions

async function runGitCommand(cwd: string, args: string[]): Promise<string> {
  const cmd = new Deno.Command("git", {
    args: ["-C", cwd, ...args],
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout, success } = await cmd.output();
  if (!success) {
    const stderr = new TextDecoder().decode(await cmd.output().then((r) => r.stderr));
    throw new Error(`Git command failed: ${args.join(" ")}\n${stderr}`);
  }

  return new TextDecoder().decode(stdout).trim();
}

async function createFeatureBranch(
  repoDir: string,
  requestId: string,
  traceId: string,
  fileCount: number = 1,
): Promise<void> {
  const branchName = `feat/${requestId}-${traceId}`;

  // Create branch
  await runGitCommand(repoDir, ["checkout", "-b", branchName]);

  // Add files
  for (let i = 0; i < fileCount; i++) {
    const fileName = `feature-${i + 1}.txt`;
    await Deno.writeTextFile(join(repoDir, fileName), `feature content ${i + 1}\n`);
    await runGitCommand(repoDir, ["add", fileName]);
  }

  // Commit
  await runGitCommand(repoDir, ["commit", "-m", `Add feature for ${requestId}\n\nTrace-Id: ${traceId}`]);

  // Switch back to main
  await runGitCommand(repoDir, ["checkout", "main"]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Additional edge case tests from tests/changeset_commands_test.ts
describe("ChangesetCommands - Edge Cases", () => {
  let tempDir: string;
  let db: DatabaseService;
  let gitService: GitService;
  let changesetCommands: ChangesetCommands;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: "changeset_edge_test_" });
    const systemDir = join(tempDir, "System");
    await ensureDir(systemDir);

    // Initialize git repository
    await runGitCommand(tempDir, ["init", "-b", "main"]);
    await runGitCommand(tempDir, ["config", "user.email", "test@example.com"]);
    await runGitCommand(tempDir, ["config", "user.name", "Test User"]);

    // Create initial commit on main
    await Deno.writeTextFile(join(tempDir, "README.md"), "# Test Project\n");
    await runGitCommand(tempDir, ["add", "README.md"]);
    await runGitCommand(tempDir, ["commit", "-m", "Initial commit"]);

    const config = createMockConfig(tempDir);
    db = new DatabaseService(config);

    db.instance.exec(`
      CREATE TABLE IF NOT EXISTS activity (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        agent_id TEXT,
        action_type TEXT NOT NULL,
        target TEXT,
        payload TEXT NOT NULL,
        timestamp DATETIME DEFAULT (datetime('now'))
      );
    `);

    gitService = new GitService({ config, db });
    changesetCommands = new ChangesetCommands({ config, db }, gitService);
  });

  afterEach(async () => {
    await db.close();
    await Deno.remove(tempDir, { recursive: true });
  });

  it("list() should skip branches with invalid naming format", async () => {
    // Create branches with various invalid formats
    await runGitCommand(tempDir, ["checkout", "-b", "feat/invalid"]);
    await runGitCommand(tempDir, ["checkout", "main"]);

    await runGitCommand(tempDir, ["checkout", "-b", "feature/not-feat"]);
    await runGitCommand(tempDir, ["checkout", "main"]);

    const changesets = await changesetCommands.list();
    assertEquals(changesets.length, 0);
  });

  it("list() should handle branches with no files changed", async () => {
    // Create empty feature branch (no actual file changes)
    const branchName = "feat/request-003-empty-branch";
    await runGitCommand(tempDir, ["checkout", "-b", branchName]);
    await runGitCommand(tempDir, ["commit", "--allow-empty", "-m", "Empty commit"]);
    await runGitCommand(tempDir, ["checkout", "main"]);

    const changesets = await changesetCommands.list();
    assertEquals(changesets.length, 1);
    assertEquals(changesets[0].files_changed, 0);
  });

  it("show() should throw error when branch does not exist", async () => {
    await assertRejects(
      async () => await changesetCommands.show("feat/nonexistent-branch"),
      Error,
      "not found",
    );
  });

  it("show() should find branch by request_id", async () => {
    await createFeatureBranch(tempDir, "request-007", "abc-901-def");

    const details = await changesetCommands.show("request-007");
    assertExists(details);
    assertEquals(details.request_id, "request-007");
  });

  it("show() should throw error when request_id not found", async () => {
    await assertRejects(
      async () => await changesetCommands.show("nonexistent-request"),
      Error,
      "Changeset not found",
    );
  });

  it("approve() should throw error when not on main branch", async () => {
    await createFeatureBranch(tempDir, "request-010", "def-890-abc");

    // Switch to a different branch
    await runGitCommand(tempDir, ["checkout", "-b", "other-branch"]);

    await assertRejects(
      async () => await changesetCommands.approve("request-010"),
      Error,
      "main",
    );

    // Switch back for cleanup
    await runGitCommand(tempDir, ["checkout", "main"]);
  });

  it("reject() should throw error when rejection reason is empty", async () => {
    await createFeatureBranch(tempDir, "request-011", "abc-111-def");

    await assertRejects(
      async () => await changesetCommands.reject("request-011", ""),
      Error,
      "Rejection reason is required",
    );
  });

  it("reject() should throw error when rejection reason is whitespace only", async () => {
    await createFeatureBranch(tempDir, "request-012", "def-222-abc");

    await assertRejects(
      async () => await changesetCommands.reject("request-012", "   "),
      Error,
      "Rejection reason is required",
    );
  });

  it("reject() should handle rejection of non-existent branch gracefully", async () => {
    await assertRejects(
      async () => await changesetCommands.reject("nonexistent", "Not needed"),
      Error,
      "Changeset not found",
    );
  });
});
