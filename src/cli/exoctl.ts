#!/usr/bin/env -S deno run --allow-all --no-check
/**
 * ExoFrame CLI (exoctl) - Human Interface for System Management
 *
 * Provides commands for:
 * - Plan review (approve/reject/revise)
 * - Changeset review (approve/reject code changes)
 * - Git operations (branch/status/log with trace_id)
 * - Daemon control (start/stop/status)
 *
 * NOTE: Run with --no-check flag for rapid development.
 */

import { Command } from "@cliffy/command";
import { ConfigService } from "../config/service.ts";
import { DatabaseService } from "../services/db.ts";
import { GitService } from "../services/git_service.ts";
import { PlanCommands } from "./plan_commands.ts";
import { ChangesetCommands } from "./changeset_commands.ts";
import { GitCommands } from "./git_commands.ts";
import { DaemonCommands } from "./daemon_commands.ts";

// Initialize services
const configService = new ConfigService();
const config = configService.get();
const db = new DatabaseService(config);
const gitService = new GitService({ config, db });

// Initialize command handlers
const context = { config, db };
const planCommands = new PlanCommands(context, config.system.root);
const changesetCommands = new ChangesetCommands(context, gitService);
const gitCommands = new GitCommands(context);
const daemonCommands = new DaemonCommands(context);

await new Command()
  .name("exoctl")
  .version("1.0.0")
  .description("ExoFrame CLI - Human interface for agent orchestration")

  // Plan commands
  .command(
    "plan",
    new Command()
      .description("Manage AI-generated plans")
      .command(
        "list",
        new Command()
          .description("List all plans awaiting review")
          .option("-s, --status <status:string>", "Filter by status (review, needs_revision)")
          .action(async (options) => {
            try {
              const plans = await planCommands.list(options.status);
              if (plans.length === 0) {
                console.log("No plans found.");
                return;
              }
              console.log(`\n📋 Plans (${plans.length}):\n`);
              for (const plan of plans) {
                const statusIcon = plan.status === "review" ? "🔍" : "⚠️";
                console.log(`${statusIcon} ${plan.id}`);
                console.log(`   Status: ${plan.status}`);
                if (plan.trace_id) console.log(`   Trace: ${plan.trace_id.substring(0, 8)}...`);
                console.log();
              }
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "show <id>",
        new Command()
          .description("Show details of a specific plan")
          .action(async (_options, ...args: string[]) => {
            const id = args[0] as unknown as string;
            try {
              const plan = await planCommands.show(id);
              console.log(`\n📄 Plan: ${plan.id}\n`);
              console.log(`Status: ${plan.status}`);
              if (plan.trace_id) console.log(`Trace: ${plan.trace_id}`);
              console.log("\n" + "─".repeat(60) + "\n");
              console.log(plan.content);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "approve <id>",
        new Command()
          .description("Approve a plan and move it to /System/Active")
          .action(async (_options, ...args: string[]) => {
            const id = args[0] as unknown as string;
            try {
              await planCommands.approve(id);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "reject <id>",
        new Command()
          .description("Reject a plan with a reason")
          .option("-r, --reason <reason:string>", "Rejection reason (required)", { required: true })
          .action(async (options, ...args: string[]) => {
            const id = args[0] as unknown as string;
            try {
              await planCommands.reject(id, options.reason);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "revise <id>",
        new Command()
          .description("Request revision with review comments")
          .option("-c, --comment <comment:string>", "Review comment (can be specified multiple times)", {
            collect: true,
            required: true,
          })
          .action(async (options, ...args: string[]) => {
            const id = args[0] as unknown as string;
            try {
              await planCommands.revise(id, options.comment);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      ),
  )

  // Changeset commands
  .command(
    "changeset",
    new Command()
      .description("Review and manage agent-generated code changes")
      .command(
        "list",
        new Command()
          .description("List all pending changesets")
          .option("-s, --status <status:string>", "Filter by status (pending, approved, rejected)")
          .action(async (options) => {
            try {
              const changesets = await changesetCommands.list(options.status);
              if (changesets.length === 0) {
                console.log("No changesets found.");
                return;
              }
              console.log(`\n🔀 Changesets (${changesets.length}):\n`);
              for (const cs of changesets) {
                console.log(`📌 ${cs.request_id} (${cs.branch})`);
                console.log(`   Files: ${cs.files_changed}`);
                console.log(`   Created: ${new Date(cs.created_at).toLocaleString()}`);
                console.log(`   Trace: ${cs.trace_id.substring(0, 8)}...`);
                console.log();
              }
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "show <id>",
        new Command()
          .description("Show changeset details including diff")
          .action(async (_options, ...args: string[]) => {
            const id = args[0] as unknown as string;
            try {
              const cs = await changesetCommands.show(id);
              console.log(`\n🔀 Changeset: ${cs.request_id}\n`);
              console.log(`Branch: ${cs.branch}`);
              console.log(`Files changed: ${cs.files_changed}`);
              console.log(`Commits: ${cs.commits.length}`);
              console.log(`\nCommits:\n`);
              for (const commit of cs.commits) {
                console.log(`  ${commit.sha.substring(0, 8)} - ${commit.message}`);
              }
              console.log(`\nDiff:\n`);
              console.log(cs.diff);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "approve <id>",
        new Command()
          .description("Approve changeset and merge to main")
          .action(async (_options, ...args: string[]) => {
            const id = args[0] as unknown as string;
            try {
              await changesetCommands.approve(id);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "reject <id>",
        new Command()
          .description("Reject changeset and delete branch")
          .option("-r, --reason <reason:string>", "Rejection reason (required)", { required: true })
          .action(async (options, ...args: string[]) => {
            const id = args[0] as unknown as string;
            try {
              await changesetCommands.reject(id, options.reason);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      ),
  )

  // Git commands
  .command(
    "git",
    new Command()
      .description("Git repository operations")
      .command(
        "branches",
        new Command()
          .description("List all branches")
          .option("-p, --pattern <pattern:string>", "Filter by pattern (e.g., 'feat/*')")
          .action(async (options) => {
            try {
              const branches = await gitCommands.listBranches(options.pattern);
              console.log(`\n🌳 Branches (${branches.length}):\n`);
              for (const branch of branches) {
                const current = branch.is_current ? "* " : "  ";
                console.log(`${current}${branch.name}`);
                console.log(`   Last commit: ${branch.last_commit} (${new Date(branch.last_commit_date).toLocaleDateString()})`);
                if (branch.trace_id) console.log(`   Trace: ${branch.trace_id.substring(0, 8)}...`);
                console.log();
              }
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "status",
        new Command()
          .description("Show repository status")
          .action(async () => {
            try {
              const status = await gitCommands.status();
              console.log(`\n📊 Repository Status\n`);
              console.log(`Branch: ${status.branch}\n`);
              if (status.modified.length > 0) {
                console.log(`Modified (${status.modified.length}):`);
                status.modified.forEach((f) => console.log(`  M ${f}`));
              }
              if (status.added.length > 0) {
                console.log(`Added (${status.added.length}):`);
                status.added.forEach((f) => console.log(`  A ${f}`));
              }
              if (status.deleted.length > 0) {
                console.log(`Deleted (${status.deleted.length}):`);
                status.deleted.forEach((f) => console.log(`  D ${f}`));
              }
              if (status.untracked.length > 0) {
                console.log(`Untracked (${status.untracked.length}):`);
                status.untracked.forEach((f) => console.log(`  ? ${f}`));
              }
              if (
                status.modified.length === 0 && status.added.length === 0 &&
                status.deleted.length === 0 && status.untracked.length === 0
              ) {
                console.log("Working tree clean");
              }
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "log",
        new Command()
          .description("Search commit log by trace_id")
          .option("-t, --trace <trace_id:string>", "Filter by trace ID", { required: true })
          .action(async (options) => {
            try {
              const commits = await gitCommands.logByTraceId(options.trace);
              if (commits.length === 0) {
                console.log(`No commits found for trace: ${options.trace}`);
                return;
              }
              console.log(`\n📜 Commits for trace ${options.trace.substring(0, 8)}...\n`);
              for (const commit of commits) {
                console.log(`${commit.sha.substring(0, 8)} - ${commit.message}`);
                console.log(`  Author: ${commit.author}`);
                console.log(`  Date: ${new Date(commit.date).toLocaleString()}`);
                console.log();
              }
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      ),
  )

  // Daemon commands
  .command(
    "daemon",
    new Command()
      .description("Control the ExoFrame daemon")
      .command(
        "start",
        new Command()
          .description("Start the ExoFrame daemon")
          .action(async () => {
            try {
              await daemonCommands.start();
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "stop",
        new Command()
          .description("Stop the ExoFrame daemon")
          .action(async () => {
            try {
              await daemonCommands.stop();
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "restart",
        new Command()
          .description("Restart the ExoFrame daemon")
          .action(async () => {
            try {
              await daemonCommands.restart();
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "status",
        new Command()
          .description("Check daemon status")
          .action(async () => {
            try {
              const status = await daemonCommands.status();
              console.log(`\n🔧 Daemon Status\n`);
              console.log(`Version: ${status.version}`);
              console.log(`Status: ${status.running ? "Running ✓" : "Stopped ✗"}`);
              if (status.pid) console.log(`PID: ${status.pid}`);
              if (status.uptime) console.log(`Uptime: ${status.uptime}`);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "logs",
        new Command()
          .description("Show daemon logs")
          .option("-n, --lines <lines:number>", "Number of lines to show", { default: 50 })
          .option("-f, --follow", "Follow log output")
          .action(async (options) => {
            try {
              await daemonCommands.logs(options.lines, options.follow);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      ),
  )

  .parse(Deno.args);
