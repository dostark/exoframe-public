import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { GitService } from "../src/services/git_service.ts";
import { createMockConfig } from "./helpers/config.ts";
import { initTestDbService } from "./helpers/db.ts";

/**
 * Tests for Step 4.2: Git Integration (Identity Aware)
 *
 * Success Criteria:
 * - Auto-initializes git repository if not present
 * - Auto-configures git identity if missing
 * - Creates feature branches with naming convention: feat/{requestId}-{traceId}
 * - Commits with trace_id in commit message footer
 * - Handles branch name conflicts (appends timestamp)
 * - Validates changes exist before commit
 * - All git operations logged to Activity Journal
 */

Deno.test("GitService: auto-initializes repository if not present", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "git-test-init-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const git = new GitService({ config, db });

    await git.ensureRepository();

    // Verify .git directory exists
    const gitDir = await Deno.stat(join(tempDir, ".git"));
    assertEquals(gitDir.isDirectory, true);

    // Allow time for batched logging
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Verify git.init logged
    const logs = db.instance.prepare(
      "SELECT * FROM activity WHERE action_type = ?",
    ).all("git.init");
    assertEquals(logs.length, 1);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("GitService: auto-configures identity if missing", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "git-test-identity-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const git = new GitService({ config, db });

    await git.ensureRepository();
    await git.ensureIdentity();

    // Check git config
    const cmd = new Deno.Command("git", {
      args: ["config", "user.name"],
      cwd: tempDir,
      stdout: "piped",
    });
    const { stdout } = await cmd.output();
    const userName = new TextDecoder().decode(stdout).trim();

    assertExists(userName);
    assert(userName.includes("ExoFrame") || userName.includes("bot"), `Expected username to contain ExoFrame or bot, got: ${userName}`);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("GitService: creates branch with naming convention", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "git-test-branch-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const git = new GitService({ config, db });

    await git.ensureRepository();
    await git.ensureIdentity();

    const branchName = await git.createBranch({
      requestId: "implement-auth",
      traceId: "550e8400-e29b-41d4-a716",
    });

    assertEquals(branchName, "feat/implement-auth-550e8400");

    // Verify branch exists
    const cmd = new Deno.Command("git", {
      args: ["branch", "--list", branchName],
      cwd: tempDir,
      stdout: "piped",
    });
    const { stdout } = await cmd.output();
    const output = new TextDecoder().decode(stdout);

    assertEquals(output.includes(branchName), true);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("GitService: handles duplicate branch names", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "git-test-dup-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const git = new GitService({ config, db });

    await git.ensureRepository();
    await git.ensureIdentity();

    const branch1 = await git.createBranch({
      requestId: "test-feature",
      traceId: "abc123",
    });

    const branch2 = await git.createBranch({
      requestId: "test-feature",
      traceId: "abc123",
    });

    // Second branch should have timestamp suffix
    assertEquals(branch1, "feat/test-feature-abc123");
    assertEquals(branch2.startsWith("feat/test-feature-abc123-"), true);
    assertEquals(branch1 !== branch2, true);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("GitService: commits with trace_id footer", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "git-test-commit-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const git = new GitService({ config, db });

    await git.ensureRepository();
    await git.ensureIdentity();

    // Create a test file
    await Deno.writeTextFile(join(tempDir, "test.txt"), "content");

    await git.commit({
      message: "Add test file",
      traceId: "550e8400-e29b-41d4-a716-446655440000",
    });

    // Verify commit message includes trace_id
    const cmd = new Deno.Command("git", {
      args: ["log", "-1", "--pretty=%B"],
      cwd: tempDir,
      stdout: "piped",
    });
    const { stdout } = await cmd.output();
    const commitMsg = new TextDecoder().decode(stdout);

    assertEquals(commitMsg.includes("Add test file"), true);
    assertEquals(commitMsg.includes("[ExoTrace: 550e8400-e29b-41d4-a716-446655440000]"), true);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("GitService: rejects commit with no changes", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "git-test-nochange-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const git = new GitService({ config, db });

    await git.ensureRepository();
    await git.ensureIdentity();

    // Try to commit with no changes
    await assertRejects(
      async () => {
        await git.commit({
          message: "Empty commit",
          traceId: "test-trace",
        });
      },
      Error,
      "nothing to commit",
    );
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("GitService: logs all git operations", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "git-test-log-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const git = new GitService({ config, db, traceId: "test-trace-456", agentId: "git-agent" });

    await git.ensureRepository();
    await git.ensureIdentity();
    await git.createBranch({ requestId: "test", traceId: "abc" });

    // Allow time for batched logging
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Verify operations logged
    const logs = db.getActivitiesByTrace("test-trace-456");
    const gitLogs = logs.filter((log) => log.action_type.startsWith("git."));

    assertEquals(gitLogs.length >= 3, true); // init, identity, branch
    
    // Check agent_id is tracked
    const agentLogs = logs.filter((log) => log.agent_id === "git-agent");
    assertEquals(agentLogs.length >= 1, true);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("GitService: handles git command failures", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "git-test-fail-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const git = new GitService({ config, db });

    await git.ensureRepository();

    // Try to checkout non-existent branch
    await assertRejects(
      async () => {
        await git.checkoutBranch("nonexistent-branch");
      },
      Error,
      "branch",
    );
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("GitService: commit message format is correct", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "git-test-format-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const git = new GitService({ config, db });

    await git.ensureRepository();
    await git.ensureIdentity();

    // Create and commit a file
    await Deno.writeTextFile(join(tempDir, "code.ts"), "console.log('test')");

    await git.commit({
      message: "Implement feature X",
      description: "Added function to handle user input",
      traceId: "trace-123",
    });

    // Check commit message format
    const cmd = new Deno.Command("git", {
      args: ["log", "-1", "--pretty=%B"],
      cwd: tempDir,
      stdout: "piped",
    });
    const { stdout } = await cmd.output();
    const commitMsg = new TextDecoder().decode(stdout);

    // Should have title, description, and trace footer
    assertEquals(commitMsg.includes("Implement feature X"), true);
    assertEquals(commitMsg.includes("Added function to handle user input"), true);
    assertEquals(commitMsg.includes("[ExoTrace: trace-123]"), true);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("GitService: works in already initialized repository", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "git-test-existing-" });
  const { db, cleanup } = await initTestDbService();

  try {
    // Initialize git manually
    await new Deno.Command("git", {
      args: ["init"],
      cwd: tempDir,
    }).output();

    await new Deno.Command("git", {
      args: ["config", "user.name", "Manual User"],
      cwd: tempDir,
    }).output();

    await new Deno.Command("git", {
      args: ["config", "user.email", "manual@test.com"],
      cwd: tempDir,
    }).output();

    const config = createMockConfig(tempDir);
    const git = new GitService({ config, db });

    // Should not fail on already initialized repo
    await git.ensureRepository();
    await git.ensureIdentity();

    // Should be able to create branch
    const branch = await git.createBranch({
      requestId: "test",
      traceId: "xyz",
    });

    assertExists(branch);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});
