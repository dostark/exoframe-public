import { assertEquals, assert } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { GitService } from "../../src/services/git_service.ts";
import { createMockConfig } from "./config.ts";
import { initTestDbService } from "./db.ts";
import type { DatabaseService } from "../../src/services/db.ts";
import type { Config } from "../../src/config/schema.ts";

/**
 * Git Test Helper
 * 
 * Provides utilities for testing git operations with automatic setup/cleanup.
 */

export interface GitTestContext {
  tempDir: string;
  db: DatabaseService;
  cleanup: () => Promise<void>;
  config: Config;
  git: GitService;
}

/**
 * Creates a test environment with initialized git repository
 */
export async function createGitTestContext(prefix: string = "git-test-"): Promise<GitTestContext> {
  const tempDir = await Deno.makeTempDir({ prefix });
  const { db, cleanup: dbCleanup } = await initTestDbService();
  const config = createMockConfig(tempDir);
  const git = new GitService({ config, db });

  const cleanup = async () => {
    await dbCleanup();
    await Deno.remove(tempDir, { recursive: true });
  };

  return { tempDir, db, cleanup, config, git };
}

/**
 * Git Command Helper
 * Provides methods for common git operations in tests
 */
export class GitTestHelper {
  constructor(private repoPath: string) {}

  /**
   * Run a git command and return stdout
   */
  async runGit(args: string[]): Promise<string> {
    const cmd = new Deno.Command("git", {
      args,
      cwd: this.repoPath,
      stdout: "piped",
      stderr: "piped",
    });
    const { stdout, success, stderr } = await cmd.output();
    if (!success) {
      const error = new TextDecoder().decode(stderr);
      throw new Error(`Git command failed: ${args.join(" ")}\n${error}`);
    }
    return new TextDecoder().decode(stdout).trim();
  }

  /**
   * Check if .git directory exists
   */
  async assertRepositoryExists(): Promise<void> {
    const gitDir = await Deno.stat(join(this.repoPath, ".git"));
    assertEquals(gitDir.isDirectory, true, "Expected .git directory to exist");
  }

  /**
   * Get current git user.name config
   */
  async getUserName(): Promise<string> {
    return await this.runGit(["config", "user.name"]);
  }

  /**
   * Get current git user.email config
   */
  async getUserEmail(): Promise<string> {
    return await this.runGit(["config", "user.email"]);
  }

  /**
   * Assert that a branch exists
   */
  async assertBranchExists(branchName: string): Promise<void> {
    const output = await this.runGit(["branch", "--list", branchName]);
    assert(
      output.includes(branchName),
      `Expected branch '${branchName}' to exist, but it doesn't`,
    );
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    return await this.runGit(["branch", "--show-current"]);
  }

  /**
   * Get the last commit message
   */
  async getLastCommitMessage(): Promise<string> {
    return await this.runGit(["log", "-1", "--pretty=%B"]);
  }

  /**
   * Get the commit SHA for a given reference
   */
  async getCommitSha(ref: string = "HEAD"): Promise<string> {
    return await this.runGit(["rev-parse", ref]);
  }

  /**
   * List all branches
   */
  async listBranches(): Promise<string[]> {
    const output = await this.runGit(["branch", "--format=%(refname:short)"]);
    return output.split("\n").filter((b) => b.trim().length > 0);
  }

  /**
   * Create a file with content
   */
  async createFile(path: string, content: string): Promise<void> {
    const fullPath = join(this.repoPath, path);
    await Deno.writeTextFile(fullPath, content);
  }

  /**
   * Stage all changes
   */
  async stageAll(): Promise<void> {
    await this.runGit(["add", "."]);
  }

  /**
   * Create a commit directly (bypassing GitService)
   */
  async createCommit(message: string): Promise<string> {
    await this.runGit(["commit", "-m", message]);
    return await this.getCommitSha("HEAD");
  }

  /**
   * Create a file and commit it
   */
  async createFileAndCommit(
    filename: string,
    content: string,
    commitMessage: string,
  ): Promise<string> {
    await this.createFile(filename, content);
    await this.stageAll();
    return await this.createCommit(commitMessage);
  }

  /**
   * Get git status --porcelain output
   */
  async getStatus(): Promise<string> {
    return await this.runGit(["status", "--porcelain"]);
  }

  /**
   * Assert that working directory is clean
   */
  async assertCleanWorkingDir(): Promise<void> {
    const status = await this.getStatus();
    assertEquals(status, "", "Expected clean working directory");
  }

  /**
   * Get list of files changed in last commit
   */
  async getLastCommitFiles(): Promise<string[]> {
    const output = await this.runGit(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]);
    return output.split("\n").filter((f) => f.trim().length > 0);
  }

  /**
   * Assert that last commit message contains a string
   */
  async assertLastCommitContains(substring: string): Promise<void> {
    const message = await this.getLastCommitMessage();
    assert(
      message.includes(substring),
      `Expected commit message to contain '${substring}', but got:\n${message}`,
    );
  }
}
