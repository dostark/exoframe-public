/**
 * Changeset commands for reviewing agent-generated code changes
 * Handles approval/rejection of git branches created by agents
 */

import { BaseCommand, type CommandContext } from "./base.ts";
import type { GitService } from "../services/git_service.ts";

export interface ChangesetMetadata {
  branch: string;
  trace_id: string;
  request_id: string;
  files_changed: number;
  created_at: string;
  agent_id: string;
}

export interface ChangesetDetails extends ChangesetMetadata {
  diff: string;
  commits: Array<{
    sha: string;
    message: string;
    timestamp: string;
  }>;
}

/**
 * Commands for reviewing and managing agent-generated code changesets
 */
export class ChangesetCommands extends BaseCommand {
  private gitService: GitService;

  constructor(
    context: CommandContext,
    gitService: GitService,
  ) {
    super(context);
    this.gitService = gitService;
  }

  /**
   * List all pending changesets (agent-created branches)
   * @param statusFilter Optional filter: 'pending', 'approved', 'rejected'
   * @returns List of changeset metadata
   */
  async list(statusFilter?: string): Promise<ChangesetMetadata[]> {
    const workspaceRoot = this.config.system.root;

    // Get all branches with feat/ prefix (agent branches)
    const branchesCmd = new Deno.Command("git", {
      args: ["-C", workspaceRoot, "branch", "--list", "feat/*", "--format=%(refname:short)"],
      stdout: "piped",
      stderr: "piped",
    });

    const { stdout, success } = await branchesCmd.output();
    if (!success) {
      return [];
    }

    const branches = new TextDecoder().decode(stdout).trim().split("\n").filter((b) => b);
    const changesets: ChangesetMetadata[] = [];

    for (const branch of branches) {
      // Extract trace_id from branch name (feat/{request_id}-{trace_id})
      // request_id format: request-NNN, trace_id format: xxx-yyy-zzz
      const match = branch.match(/^feat\/(request-\d+)-(.+)$/);
      if (!match) continue;

      const [, request_id, trace_id] = match;

      // Get branch creation time and author
      const logCmd = new Deno.Command("git", {
        args: [
          "-C",
          workspaceRoot,
          "log",
          branch,
          "--format=%H %aI %ae",
          "-1",
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const logResult = await logCmd.output();
      if (!logResult.success) continue;

      const logLine = new TextDecoder().decode(logResult.stdout).trim();
      const [, timestamp, agent_id] = logLine.split(" ");

      // Get number of files changed
      const diffCmd = new Deno.Command("git", {
        args: ["-C", workspaceRoot, "diff", "--name-only", "main..." + branch],
        stdout: "piped",
        stderr: "piped",
      });

      const diffResult = await diffCmd.output();
      const files = new TextDecoder().decode(diffResult.stdout).trim().split("\n").filter((f) => f);

      // Check if branch has been merged or rejected via activity log
      const activities = await this.db.getActivitiesByTrace(trace_id);
      const status = activities.some((a: { action_type: string }) => a.action_type === "changeset.approved")
        ? "approved"
        : activities.some((a: { action_type: string }) => a.action_type === "changeset.rejected")
        ? "rejected"
        : "pending";

      if (statusFilter && status !== statusFilter) continue;

      changesets.push({
        branch,
        trace_id,
        request_id,
        files_changed: files.length,
        created_at: timestamp,
        agent_id,
      });
    }

    return changesets.sort((a, b) => {
      const ta = Number(new Date(a.created_at));
      const tb = Number(new Date(b.created_at));
      // Newer first
      return (tb || 0) - (ta || 0);
    });
  }

  /**
   * Show detailed changeset information including diff
   * @param branchName Branch name or request_id
   * @returns Changeset details
   */
  async show(branchName: string): Promise<ChangesetDetails> {
    const workspaceRoot = this.config.system.root;

    // If not a full branch name, try to find matching branch
    let fullBranch = branchName;
    if (!branchName.startsWith("feat/")) {
      const branches = await this.list();
      const match = branches.find((b) => b.request_id === branchName || b.branch === `feat/${branchName}`);
      if (!match) {
        throw new Error(`Changeset not found: ${branchName}\nRun 'exoctl changeset list' to see available changesets`);
      }
      fullBranch = match.branch;
    }

    // Verify branch exists
    const checkCmd = new Deno.Command("git", {
      args: ["-C", workspaceRoot, "rev-parse", "--verify", fullBranch],
      stdout: "piped",
      stderr: "piped",
    });

    const checkResult = await checkCmd.output();
    if (!checkResult.success) {
      throw new Error(`Branch not found: ${fullBranch}`);
    }

    // Get commit history
    const logCmd = new Deno.Command("git", {
      args: [
        "-C",
        workspaceRoot,
        "log",
        fullBranch,
        "--not",
        "main",
        "--format=%H|||%s|||%aI",
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const logResult = await logCmd.output();
    const commits = new TextDecoder().decode(logResult.stdout)
      .trim()
      .split("\n")
      .filter((l) => l)
      .map((line) => {
        const [sha, message, timestamp] = line.split("|||");
        return { sha, message, timestamp };
      });

    // Get diff
    const diffCmd = new Deno.Command("git", {
      args: ["-C", workspaceRoot, "diff", "main..." + fullBranch],
      stdout: "piped",
      stderr: "piped",
    });

    const diffResult = await diffCmd.output();
    const diff = new TextDecoder().decode(diffResult.stdout);

    // Get files changed count
    const filesCmd = new Deno.Command("git", {
      args: ["-C", workspaceRoot, "diff", "--name-only", "main..." + fullBranch],
      stdout: "piped",
      stderr: "piped",
    });

    const filesResult = await filesCmd.output();
    const files = new TextDecoder().decode(filesResult.stdout).trim().split("\n").filter((f) => f);

    // Extract metadata from branch name
    // request_id format: request-NNN, trace_id format: xxx-yyy-zzz
    const match = fullBranch.match(/^feat\/(request-\d+)-(.+)$/);
    const [, request_id, trace_id] = match || ["", fullBranch, "unknown"];

    return {
      branch: fullBranch,
      trace_id,
      request_id,
      files_changed: files.length,
      created_at: commits[commits.length - 1]?.timestamp || new Date().toISOString(),
      agent_id: commits[0]?.sha.substring(0, 8) || "unknown",
      diff,
      commits,
    };
  }

  /**
   * Approve changeset - merge branch to main
   * @param branchName Branch name or request_id
   */
  async approve(branchName: string): Promise<void> {
    const workspaceRoot = this.config.system.root;
    const changeset = await this.show(branchName);

    // Verify we're on main branch
    const currentBranchCmd = new Deno.Command("git", {
      args: ["-C", workspaceRoot, "branch", "--show-current"],
      stdout: "piped",
      stderr: "piped",
    });

    const branchResult = await currentBranchCmd.output();
    const currentBranch = new TextDecoder().decode(branchResult.stdout).trim();

    if (currentBranch !== "main") {
      throw new Error(
        `Must be on 'main' branch to approve changesets (currently on '${currentBranch}')\nRun: git checkout main`,
      );
    }

    // Merge branch
    const mergeCmd = new Deno.Command("git", {
      args: [
        "-C",
        workspaceRoot,
        "merge",
        "--no-ff",
        changeset.branch,
        "-m",
        `Merge ${changeset.request_id}: ${
          changeset.commits[0]?.message || "agent changes"
        }\n\nTrace-Id: ${changeset.trace_id}`,
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const mergeResult = await mergeCmd.output();
    if (!mergeResult.success) {
      const error = new TextDecoder().decode(mergeResult.stderr);
      throw new Error(`Failed to merge branch: ${error}`);
    }

    // Get merge commit SHA
    const shaCmd = new Deno.Command("git", {
      args: ["-C", workspaceRoot, "rev-parse", "HEAD"],
      stdout: "piped",
      stderr: "piped",
    });

    const shaResult = await shaCmd.output();
    const commitSha = new TextDecoder().decode(shaResult.stdout).trim();

    // Log approval with user identity
    const userIdentity = await this.getUserIdentity();
    const actionLogger = await this.getActionLogger();
    actionLogger.info("changeset.approved", changeset.request_id, {
      commit_sha: commitSha,
      branch: changeset.branch,
      files_changed: changeset.files_changed,
      approved_at: new Date().toISOString(),
      via: "cli",
      command: this.getCommandLineString(),
    }, changeset.trace_id);
  }

  /**
   * Reject changeset - delete branch without merging
   * @param branchName Branch name or request_id
   * @param reason Rejection reason
   */
  async reject(branchName: string, reason: string): Promise<void> {
    if (!reason || reason.trim().length === 0) {
      throw new Error(
        'Rejection reason is required\nUse: exoctl changeset reject <id> --reason "your reason"',
      );
    }

    const workspaceRoot = this.config.system.root;
    const changeset = await this.show(branchName);

    // Delete branch
    const deleteCmd = new Deno.Command("git", {
      args: ["-C", workspaceRoot, "branch", "-D", changeset.branch],
      stdout: "piped",
      stderr: "piped",
    });

    const deleteResult = await deleteCmd.output();
    if (!deleteResult.success) {
      const error = new TextDecoder().decode(deleteResult.stderr);
      throw new Error(`Failed to delete branch: ${error}`);
    }

    // Log rejection with user identity
    const userIdentity = await this.getUserIdentity();
    const actionLogger = await this.getActionLogger();
    actionLogger.info("changeset.rejected", changeset.request_id, {
      branch: changeset.branch,
      rejection_reason: reason,
      files_changed: changeset.files_changed,
      rejected_at: new Date().toISOString(),
      via: "cli",
      command: this.getCommandLineString(),
    }, changeset.trace_id);
  }
}
