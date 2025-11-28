#!/usr/bin/env -S deno run --allow-all --no-check
/**
 * ExoFrame CLI (exoctl) - Human Interface for System Management
 *
 * Provides commands for:
 * - Plan review (approve/reject/revise)
 * - Changeset review (approve/reject code changes)
 * - Git operations (branch/status/log with trace_id)
 * - Daemon control (start/stop/status)
 * - Portal management (add/remove/verify external projects)
 *
 * NOTE: Run with --no-check flag for rapid development.
 */

import { Command } from "@cliffy/command";
import { ConfigService } from "../config/service.ts";
import { DatabaseService } from "../services/db.ts";
import { GitService } from "../services/git_service.ts";
import { PlanCommands } from "./plan_commands.ts";
import { RequestCommands } from "./request_commands.ts";
import { ChangesetCommands } from "./changeset_commands.ts";
import { GitCommands } from "./git_commands.ts";
import { DaemonCommands } from "./daemon_commands.ts";
import { PortalCommands } from "./portal_commands.ts";

// Initialize services
const configService = new ConfigService();
const config = configService.get();
const db = new DatabaseService(config);
const gitService = new GitService({ config, db });

// Initialize command handlers
const context = { config, db };
const requestCommands = new RequestCommands(context, config.system.root);
const planCommands = new PlanCommands(context, config.system.root);
const changesetCommands = new ChangesetCommands(context, gitService);
const gitCommands = new GitCommands(context);
const daemonCommands = new DaemonCommands(context);
const portalCommands = new PortalCommands({ config, db, configService });

await new Command()
  .name("exoctl")
  .version("1.0.0")
  .description("ExoFrame CLI - Human interface for agent orchestration")
  // Request commands (PRIMARY INTERFACE)
  .command(
    "request",
    new Command()
      .description("Create requests for ExoFrame agents (PRIMARY INTERFACE)")
      .arguments("[description:string]")
      .option("-a, --agent <agent:string>", "Target agent blueprint", { default: "default" })
      .option("-p, --priority <priority:string>", "Priority: low, normal, high, critical", { default: "normal" })
      .option("--portal <portal:string>", "Portal alias for context")
      .option("-f, --file <file:string>", "Read description from file")
      .option("--dry-run", "Show what would be created without writing")
      .option("--json", "Output in JSON format")
      .action(async (options, description?: string) => {
        try {
          // Handle file input
          if (options.file) {
            const result = await requestCommands.createFromFile(options.file, {
              agent: options.agent,
              priority: options.priority as "low" | "normal" | "high" | "critical",
              portal: options.portal,
            });
            printRequestResult(result, !!options.json, !!options.dryRun);
            return;
          }

          // Require description for inline mode
          if (!description) {
            console.error('Error: Description required. Usage: exoctl request "<description>"');
            console.error("       Or use --file to read from file.");
            Deno.exit(1);
          }

          // Create request
          const result = await requestCommands.create(description, {
            agent: options.agent,
            priority: options.priority as "low" | "normal" | "high" | "critical",
            portal: options.portal,
          });

          if (options.dryRun) {
            console.log("Dry run - would create:");
            printRequestResult(result, true, true);
            return;
          }

          printRequestResult(result, !!options.json, false);
        } catch (error) {
          console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
          Deno.exit(1);
        }
      })
      .command(
        "list",
        new Command()
          .description("List pending requests")
          .option("-s, --status <status:string>", "Filter by status")
          .option("--json", "Output in JSON format")
          .action(async (options) => {
            try {
              const requests = await requestCommands.list(options.status);
              if (options.json) {
                console.log(JSON.stringify(requests, null, 2));
              } else {
                if (requests.length === 0) {
                  console.log("No requests found.");
                  return;
                }
                console.log(`\n📥 Requests (${requests.length}):\n`);
                for (const req of requests) {
                  const priorityIcon = { critical: "🔴", high: "🟠", normal: "🟢", low: "⚪" }[req.priority] || "🟢";
                  console.log(`${priorityIcon} ${req.trace_id.slice(0, 8)}`);
                  console.log(`   Status: ${req.status}`);
                  console.log(`   Agent: ${req.agent}`);
                  console.log(`   Created: ${req.created_by} @ ${req.created}`);
                  console.log();
                }
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
          .description("Show request details")
          .action(async (_options: void, ...args: string[]) => {
            const id = args[0];
            try {
              const { metadata, content } = await requestCommands.show(id);
              console.log(`\n📄 Request: ${metadata.trace_id.slice(0, 8)}\n`);
              console.log(`Trace ID: ${metadata.trace_id}`);
              console.log(`Status: ${metadata.status}`);
              console.log(`Priority: ${metadata.priority}`);
              console.log(`Agent: ${metadata.agent}`);
              console.log(`Created: ${metadata.created_by} @ ${metadata.created}`);
              console.log("\n" + "─".repeat(60) + "\n");
              console.log(content);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      ),
  )
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
                console.log(
                  `   Last commit: ${branch.last_commit} (${new Date(branch.last_commit_date).toLocaleDateString()})`,
                );
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
  // Portal commands
  .command(
    "portal",
    new Command()
      .description("Manage external project portals")
      .command(
        "add <target-path> <alias>",
        new Command()
          .description("Add a new portal (symlink to external project)")
          .action(async (_options, ...args: string[]) => {
            const targetPath = args[0] as unknown as string;
            const alias = args[1] as unknown as string;
            try {
              await portalCommands.add(targetPath, alias);
              console.log(`✓ Portal '${alias}' added successfully`);
              console.log(`  Target: ${targetPath}`);
              console.log(`  Symlink: Portals/${alias}`);
              console.log(`  Context card generated`);
              console.log(`\n⚠️  Restart daemon to apply changes: exoctl daemon restart`);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "list",
        new Command()
          .description("List all configured portals")
          .action(async () => {
            try {
              const portals = await portalCommands.list();
              if (portals.length === 0) {
                console.log("No portals configured.");
                console.log("\nAdd a portal with: exoctl portal add <path> <alias>");
                return;
              }
              console.log(`\n🔗 Configured Portals (${portals.length}):\n`);
              for (const portal of portals) {
                const statusIcon = portal.status === "active" ? "✓" : "⚠";
                console.log(`${portal.alias}`);
                console.log(`  Status: ${portal.status === "active" ? "Active" : "Broken"} ${statusIcon}`);
                console.log(`  Target: ${portal.targetPath}${portal.status === "broken" ? " (not found)" : ""}`);
                console.log(`  Symlink: ${portal.symlinkPath}`);
                console.log(`  Context: ${portal.contextCardPath}`);
                console.log();
              }
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "show <alias>",
        new Command()
          .description("Show detailed information about a portal")
          .action(async (_options, ...args: string[]) => {
            const alias = args[0] as unknown as string;
            try {
              const portal = await portalCommands.show(alias);
              console.log(`\n📁 Portal: ${portal.alias}\n`);
              console.log(`Target Path:    ${portal.targetPath}`);
              console.log(`Symlink:        ${portal.symlinkPath}`);
              console.log(`Status:         ${portal.status === "active" ? "Active ✓" : "Broken ⚠"}`);
              console.log(`Context Card:   ${portal.contextCardPath}`);
              if (portal.permissions) console.log(`Permissions:    ${portal.permissions}`);
              if (portal.created) console.log(`Created:        ${portal.created}`);
              if (portal.lastVerified) console.log(`Last Verified:  ${portal.lastVerified}`);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "remove <alias>",
        new Command()
          .description("Remove a portal (archives context card)")
          .option("--keep-card", "Keep context card instead of archiving")
          .action(async (options, ...args: string[]) => {
            const alias = args[0] as unknown as string;
            try {
              await portalCommands.remove(alias, { keepCard: options.keepCard });
              console.log(`✓ Portal '${alias}' removed`);
              if (!options.keepCard) {
                console.log(`  Context card archived`);
              }
              console.log(`\n⚠️  Restart daemon to apply changes: exoctl daemon restart`);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "verify",
        new Command()
          .description("Verify portal integrity")
          .arguments("[alias:string]")
          .action(async (_options, alias?: string) => {
            try {
              const results = await portalCommands.verify(alias);
              console.log("\n🔍 Portal Verification:\n");
              let healthy = 0;
              let broken = 0;
              for (const result of results) {
                const icon = result.status === "ok" ? "✓" : "✗";
                console.log(`${result.alias}: ${result.status.toUpperCase()} ${icon}`);
                if (result.issues && result.issues.length > 0) {
                  for (const issue of result.issues) {
                    console.log(`  ⚠️  ${issue}`);
                  }
                  broken++;
                } else {
                  healthy++;
                }
              }
              console.log(`\nSummary: ${healthy} healthy, ${broken} broken`);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      )
      .command(
        "refresh <alias>",
        new Command()
          .description("Refresh portal context card (re-scan project)")
          .action(async (_options, ...args: string[]) => {
            const alias = args[0] as unknown as string;
            try {
              await portalCommands.refresh(alias);
              console.log(`✓ Context card refreshed for '${alias}'`);
            } catch (error) {
              console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              Deno.exit(1);
            }
          }),
      ),
  )
  .parse(Deno.args);

// Helper function for printing request results
import type { RequestMetadata } from "./request_commands.ts";

function printRequestResult(result: RequestMetadata, json: boolean, dryRun: boolean) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const prefix = dryRun ? "Would create:" : "✓ Request created:";
    console.log(`${prefix} ${result.filename}`);
    console.log(`  Trace ID: ${result.trace_id}`);
    console.log(`  Priority: ${result.priority}`);
    console.log(`  Agent: ${result.agent}`);
    console.log(`  Path: ${result.path}`);
    if (!dryRun) {
      console.log(`  Next: Daemon will process this automatically`);
    }
  }
}