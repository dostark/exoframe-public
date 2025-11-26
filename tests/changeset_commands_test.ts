/**
 * Tests for ChangesetCommands - CLI commands for reviewing agent code changes
 * 
 * Note: These tests focus on error handling and edge cases.
 * Integration tests requiring full git operations are more complex and are 
 * tested separately through manual integration testing.
 */

import { assertEquals, assertRejects } from "jsr:@std/assert@^1.0.0";
import { ChangesetCommands } from "../src/cli/changeset_commands.ts";
import type { CommandContext } from "../src/cli/base.ts";
import { GitService } from "../src/services/git_service.ts";
import { initTestDbService } from "./helpers/db.ts";
import { createMockConfig } from "./helpers/config.ts";
import { join } from "jsr:@std/path@^1.0.8";

/**
 * Helper: Create a mock Git repository for testing
 */
async function createMockGitRepo(tempDir: string) {
  const gitDir = join(tempDir, ".git");
  await Deno.mkdir(gitDir, { recursive: true });
  
  // Initialize git repo with 'main' as default branch
  const initCmd = new Deno.Command("git", {
    args: ["-C", tempDir, "init", "-b", "main"],
    stdout: "piped",
    stderr: "piped",
  });
  await initCmd.output();
  
  // Set git config
  await new Deno.Command("git", {
    args: ["-C", tempDir, "config", "user.name", "Test User"],
  }).output();
  await new Deno.Command("git", {
    args: ["-C", tempDir, "config", "user.email", "test@example.com"],
  }).output();
  
  // Create initial commit on main
  const readmeFile = join(tempDir, "README.md");
  await Deno.writeTextFile(readmeFile, "# Test Repo\n");
  await new Deno.Command("git", {
    args: ["-C", tempDir, "add", "README.md"],
  }).output();
  await new Deno.Command("git", {
    args: ["-C", tempDir, "commit", "-m", "Initial commit"],
  }).output();
  
  return tempDir;
}

/**
 * Helper: Create a feature branch with changes
 */
async function createFeatureBranch(
  repoPath: string,
  branchName: string,
  fileChanges: Record<string, string>,
) {
  // Create and checkout branch
  await new Deno.Command("git", {
    args: ["-C", repoPath, "checkout", "-b", branchName],
  }).output();
  
  // Make changes
  for (const [filename, content] of Object.entries(fileChanges)) {
    const filePath = join(repoPath, filename);
    await Deno.writeTextFile(filePath, content);
    const addCmd = new Deno.Command("git", {
      args: ["-C", repoPath, "add", filename],
    });
    await addCmd.output();
  }
  
  // Commit changes
  await new Deno.Command("git", {
    args: ["-C", repoPath, "commit", "-m", "Agent changes"],
  }).output();
  
  // Return to main
  await new Deno.Command("git", {
    args: ["-C", repoPath, "checkout", "main"],
  }).output();
}

/**
 * Helper: Create mock CommandContext with test database
 */
async function createMockContext(workspaceRoot: string): Promise<CommandContext> {
  const { db } = await initTestDbService();
  const config = createMockConfig(workspaceRoot);
  
  return {
    config,
    db,
  };
}

/**
 * Helper: Create GitService instance for testing
 */
async function createMockGitService(workspaceRoot: string): Promise<GitService> {
  const config = createMockConfig(workspaceRoot);
  const { db } = await initTestDbService();
  
  return new GitService({
    config,
    db,
  });
}

Deno.test("ChangesetCommands: list() returns empty array when no feature branches exist", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createMockGitRepo(tempDir);
    const context = await createMockContext(tempDir);
    const gitService = await createMockGitService(tempDir);
    const commands = new ChangesetCommands(context, gitService);
    
    const changesets = await commands.list();
    
    assertEquals(changesets, []);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ChangesetCommands: list() lists feature branches with correct metadata", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createMockGitRepo(tempDir);
    const context = await createMockContext(tempDir);
    const gitService = await createMockGitService(tempDir);
    const commands = new ChangesetCommands(context, gitService);
    
    // Create a feature branch
    await createFeatureBranch(
      tempDir,
      "feat/request-001-abc-123-def",
      { "test.txt": "test content" },
    );
    
    const changesets = await commands.list();
    
    assertEquals(changesets.length, 1);
    assertEquals(changesets[0].branch, "feat/request-001-abc-123-def");
    assertEquals(changesets[0].request_id, "request-001");
    assertEquals(changesets[0].trace_id, "abc-123-def");
    assertEquals(changesets[0].files_changed, 1);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ChangesetCommands: list() skips branches with invalid naming format", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createMockGitRepo(tempDir);
    const context = await createMockContext(tempDir);
    const gitService = await createMockGitService(tempDir);
    const commands = new ChangesetCommands(context, gitService);
    
    // Create branches with various invalid formats
    await new Deno.Command("git", {
      args: ["-C", tempDir, "checkout", "-b", "feat/invalid"],
    }).output();
    await new Deno.Command("git", {
      args: ["-C", tempDir, "checkout", "main"],
    }).output();
    
    await new Deno.Command("git", {
      args: ["-C", tempDir, "checkout", "-b", "feature/not-feat"],
    }).output();
    await new Deno.Command("git", {
      args: ["-C", tempDir, "checkout", "main"],
    }).output();
    
    const changesets = await commands.list();
    
    assertEquals(changesets.length, 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ChangesetCommands: list() handles branches with no files changed", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createMockGitRepo(tempDir);
    const context = await createMockContext(tempDir);
    const gitService = await createMockGitService(tempDir);
    const commands = new ChangesetCommands(context, gitService);
    
    // Create empty feature branch (no actual file changes)
    await new Deno.Command("git", {
      args: ["-C", tempDir, "checkout", "-b", "feat/request-003-empty-branch"],
    }).output();
    await new Deno.Command("git", {
      args: ["-C", tempDir, "commit", "--allow-empty", "-m", "Empty commit"],
    }).output();
    await new Deno.Command("git", {
      args: ["-C", tempDir, "checkout", "main"],
    }).output();
    
    const changesets = await commands.list();
    
    assertEquals(changesets.length, 1);
    assertEquals(changesets[0].files_changed, 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ChangesetCommands: show() throws error when branch does not exist", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createMockGitRepo(tempDir);
    const context = await createMockContext(tempDir);
    const gitService = await createMockGitService(tempDir);
    const commands = new ChangesetCommands(context, gitService);
    
    await assertRejects(
      async () => await commands.show("feat/nonexistent"),
      Error,
      "Branch not found: feat/nonexistent",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ChangesetCommands: show() finds branch by request_id", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createMockGitRepo(tempDir);
    const context = await createMockContext(tempDir);
    const gitService = await createMockGitService(tempDir);
    const commands = new ChangesetCommands(context, gitService);
    
    // Create feature branch
    await createFeatureBranch(
      tempDir,
      "feat/request-999-find-me",
      { "findme.txt": "found" },
    );
    
    // Show by request_id instead of full branch name
    const details = await commands.show("request-999");
    
    assertEquals(details.branch, "feat/request-999-find-me");
    assertEquals(details.request_id, "request-999");
    assertEquals(details.trace_id, "find-me");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ChangesetCommands: show() throws error when request_id not found", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createMockGitRepo(tempDir);
    const context = await createMockContext(tempDir);
    const gitService = await createMockGitService(tempDir);
    const commands = new ChangesetCommands(context, gitService);
    
    await assertRejects(
      async () => await commands.show("request-404"),
      Error,
      "Changeset not found: request-404",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ChangesetCommands: approve() throws error when not on main branch", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createMockGitRepo(tempDir);
    const context = await createMockContext(tempDir);
    const gitService = await createMockGitService(tempDir);
    const commands = new ChangesetCommands(context, gitService);
    
    // Create and stay on feature branch
    await createFeatureBranch(
      tempDir,
      "feat/request-700-approval-test",
      { "test.txt": "test" },
    );
    await new Deno.Command("git", {
      args: ["-C", tempDir, "checkout", "feat/request-700-approval-test"],
    }).output();
    
    await assertRejects(
      async () => await commands.approve("request-700"),
      Error,
      "Must be on 'main' branch",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ChangesetCommands: reject() throws error when rejection reason is empty", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createMockGitRepo(tempDir);
    const context = await createMockContext(tempDir);
    const gitService = await createMockGitService(tempDir);
    const commands = new ChangesetCommands(context, gitService);
    
    await createFeatureBranch(
      tempDir,
      "feat/request-100-reject-test",
      { "test.txt": "test" },
    );
    
    await assertRejects(
      async () => await commands.reject("request-100", ""),
      Error,
      "Rejection reason is required",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ChangesetCommands: reject() throws error when rejection reason is whitespace only", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createMockGitRepo(tempDir);
    const context = await createMockContext(tempDir);
    const gitService = await createMockGitService(tempDir);
    const commands = new ChangesetCommands(context, gitService);
    
    await createFeatureBranch(
      tempDir,
      "feat/request-101-reject-test",
      { "test.txt": "test" },
    );
    
    await assertRejects(
      async () => await commands.reject("request-101", "   "),
      Error,
      "Rejection reason is required",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ChangesetCommands: reject() handles rejection of non-existent branch gracefully", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createMockGitRepo(tempDir);
    const context = await createMockContext(tempDir);
    const gitService = await createMockGitService(tempDir);
    const commands = new ChangesetCommands(context, gitService);
    
    await assertRejects(
      async () => await commands.reject("request-404", "Does not exist"),
      Error,
      "Changeset not found",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
