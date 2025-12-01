/**
 * Test Environment Helper for Integration Tests
 *
 * Provides isolated, reproducible test workspace for end-to-end testing.
 * Creates temporary directory with complete ExoFrame workspace structure.
 */

import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { DatabaseService } from "../../../src/services/db.ts";
import { createMockConfig } from "../../helpers/config.ts";
import type { Config } from "../../../src/config/schema.ts";

export interface TestEnvironmentOptions {
  /** Custom config overrides */
  configOverrides?: Partial<Config>;
  /** Whether to initialize git repository */
  initGit?: boolean;
}

export class TestEnvironment {
  readonly tempDir: string;
  readonly config: Config;
  readonly db: DatabaseService;

  private constructor(
    tempDir: string,
    config: Config,
    db: DatabaseService,
  ) {
    this.tempDir = tempDir;
    this.config = config;
    this.db = db;
  }

  /**
   * Create a new isolated test environment
   */
  static async create(options: TestEnvironmentOptions = {}): Promise<TestEnvironment> {
    const tempDir = await Deno.makeTempDir({ prefix: "exo-integration-" });

    // Create directory structure
    await ensureDir(join(tempDir, "Inbox", "Requests"));
    await ensureDir(join(tempDir, "Inbox", "Plans"));
    await ensureDir(join(tempDir, "Inbox", "Rejected"));
    await ensureDir(join(tempDir, "System", "Active"));
    await ensureDir(join(tempDir, "System", "Archive"));
    await ensureDir(join(tempDir, "Knowledge", "Reports"));
    await ensureDir(join(tempDir, "Knowledge", "Portals"));
    await ensureDir(join(tempDir, "Knowledge", "Context"));
    await ensureDir(join(tempDir, "Blueprints", "Agents"));
    await ensureDir(join(tempDir, "Portals"));

    // Create config
    const config = createMockConfig(tempDir, {
      watcher: { debounce_ms: 50, stability_check: false },
      database: { batch_flush_ms: 50, batch_max_size: 10 },
      ...options.configOverrides,
    });

    // Initialize database
    const db = new DatabaseService(config);
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
      CREATE INDEX IF NOT EXISTS idx_activity_trace ON activity(trace_id);
      CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity(agent_id);
    `);

    // Initialize git if requested
    if (options.initGit !== false) {
      await new Deno.Command("git", {
        args: ["init", "-b", "main"],
        cwd: tempDir,
        stdout: "null",
        stderr: "null",
      }).output();

      await new Deno.Command("git", {
        args: ["config", "user.email", "test@exoframe.dev"],
        cwd: tempDir,
      }).output();

      await new Deno.Command("git", {
        args: ["config", "user.name", "ExoFrame Test"],
        cwd: tempDir,
      }).output();

      // Create initial commit
      await Deno.writeTextFile(join(tempDir, ".gitkeep"), "");
      await new Deno.Command("git", {
        args: ["add", "."],
        cwd: tempDir,
      }).output();
      await new Deno.Command("git", {
        args: ["commit", "-m", "Initial commit"],
        cwd: tempDir,
      }).output();
    }

    return new TestEnvironment(tempDir, config, db);
  }

  /**
   * Create a request file in /Inbox/Requests
   */
  async createRequest(
    description: string,
    options: {
      traceId?: string;
      agentId?: string;
      priority?: number;
      tags?: string[];
      portal?: string;
    } = {},
  ): Promise<{ filePath: string; traceId: string }> {
    const traceId = options.traceId ?? crypto.randomUUID();
    const shortId = traceId.substring(0, 8);
    const fileName = `request-${shortId}.md`;
    const filePath = join(this.tempDir, "Inbox", "Requests", fileName);

    const frontmatter = [
      "---",
      `trace_id: "${traceId}"`,
      `agent_id: ${options.agentId ?? "senior-coder"}`,
      `status: pending`,
      `priority: ${options.priority ?? 5}`,
      `tags: [${(options.tags ?? []).map((t) => `"${t}"`).join(", ")}]`,
      options.portal ? `portal: "${options.portal}"` : null,
      `created_at: "${new Date().toISOString()}"`,
      "---",
    ].filter(Boolean).join("\n");

    const content = `${frontmatter}\n\n# Request\n\n${description}\n`;

    await Deno.writeTextFile(filePath, content);

    return { filePath, traceId };
  }

  /**
   * Create a plan file in /Inbox/Plans (simulating plan generation)
   */
  async createPlan(
    traceId: string,
    requestId: string,
    options: {
      status?: string;
      agentId?: string;
      actions?: Array<{ tool: string; params: Record<string, unknown> }>;
    } = {},
  ): Promise<string> {
    const shortId = traceId.substring(0, 8);
    const fileName = `${requestId}_plan.md`;
    const filePath = join(this.tempDir, "Inbox", "Plans", fileName);

    const actions = options.actions ?? [
      { tool: "write_file", params: { path: "test.txt", content: "Hello World" } },
    ];

    const frontmatter = [
      "---",
      `trace_id: "${traceId}"`,
      `request_id: "${requestId}"`,
      `agent_id: ${options.agentId ?? "senior-coder"}`,
      `status: ${options.status ?? "review"}`,
      `created_at: "${new Date().toISOString()}"`,
      "---",
    ].join("\n");

    const actionsYaml = actions.map((a) =>
      `- tool: ${a.tool}\n  params:\n${
        Object.entries(a.params).map(([k, v]) => `    ${k}: "${v}"`).join("\n")
      }`
    ).join("\n");

    const content = `${frontmatter}

# Proposed Plan

## Actions

\`\`\`yaml
${actionsYaml}
\`\`\`

## Reasoning

This plan will accomplish the requested task.
`;

    await Deno.writeTextFile(filePath, content);

    return filePath;
  }

  /**
   * Move plan to /System/Active (approve)
   */
  async approvePlan(planPath: string): Promise<string> {
    const fileName = planPath.split("/").pop()!;
    const activePath = join(this.tempDir, "System", "Active", fileName);

    // Read and update status
    let content = await Deno.readTextFile(planPath);
    content = content.replace(/status: review/, "status: approved");

    await Deno.writeTextFile(activePath, content);
    await Deno.remove(planPath);

    return activePath;
  }

  /**
   * Move plan to /Inbox/Rejected
   */
  async rejectPlan(planPath: string, reason: string): Promise<string> {
    const fileName = planPath.split("/").pop()!;
    const rejectedPath = join(this.tempDir, "Inbox", "Rejected", fileName);

    // Read and update status
    let content = await Deno.readTextFile(planPath);
    content = content.replace(/status: review/, "status: rejected");
    content += `\n\n## Rejection Reason\n\n${reason}\n`;

    await Deno.writeTextFile(rejectedPath, content);
    await Deno.remove(planPath);

    return rejectedPath;
  }

  /**
   * Get plan from /Inbox/Plans by trace ID
   */
  async getPlanByTraceId(traceId: string): Promise<string | null> {
    const plansDir = join(this.tempDir, "Inbox", "Plans");

    try {
      for await (const entry of Deno.readDir(plansDir)) {
        if (entry.isFile && entry.name.endsWith(".md")) {
          const content = await Deno.readTextFile(join(plansDir, entry.name));
          if (content.includes(`trace_id: "${traceId}"`)) {
            return join(plansDir, entry.name);
          }
        }
      }
    } catch {
      // Directory might not exist
    }

    return null;
  }

  /**
   * Get report from /Knowledge/Reports by trace ID
   */
  async getReportByTraceId(traceId: string): Promise<string | null> {
    const reportsDir = join(this.tempDir, "Knowledge", "Reports");

    try {
      for await (const entry of Deno.readDir(reportsDir)) {
        if (entry.isFile && entry.name.endsWith(".md")) {
          const content = await Deno.readTextFile(join(reportsDir, entry.name));
          if (content.includes(traceId)) {
            return content;
          }
        }
      }
    } catch {
      // Directory might not exist
    }

    return null;
  }

  /**
   * List git branches with ExoFrame naming convention
   */
  async getGitBranches(): Promise<string[]> {
    const cmd = new Deno.Command("git", {
      args: ["branch", "-a"],
      cwd: this.tempDir,
      stdout: "piped",
    });

    const { stdout } = await cmd.output();
    const output = new TextDecoder().decode(stdout);

    return output
      .split("\n")
      .map((b) => b.trim().replace(/^\* /, ""))
      .filter((b) => b.length > 0);
  }

  /**
   * Get activity log entries by trace ID
   */
  getActivityLog(traceId: string): Array<{
    action_type: string;
    actor: string;
    target: string | null;
    payload: string;
    timestamp: string;
  }> {
    // Flush pending logs
    this.db.waitForFlush();

    return this.db.getActivitiesByTrace(traceId);
  }

  /**
   * Wait for a condition with timeout
   */
  async waitFor(
    condition: () => Promise<boolean>,
    options: { timeout?: number; interval?: number } = {},
  ): Promise<boolean> {
    const timeout = options.timeout ?? 5000;
    const interval = options.interval ?? 100;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    return false;
  }

  /**
   * Check if file exists
   */
  async fileExists(relativePath: string): Promise<boolean> {
    return await exists(join(this.tempDir, relativePath));
  }

  /**
   * Read file content
   */
  async readFile(relativePath: string): Promise<string> {
    return await Deno.readTextFile(join(this.tempDir, relativePath));
  }

  /**
   * Write file content
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = join(this.tempDir, relativePath);
    await ensureDir(fullPath.substring(0, fullPath.lastIndexOf("/")));
    await Deno.writeTextFile(fullPath, content);
  }

  /**
   * List files in directory
   */
  async listFiles(relativePath: string): Promise<string[]> {
    const fullPath = join(this.tempDir, relativePath);
    const files: string[] = [];
    try {
      for await (const entry of Deno.readDir(fullPath)) {
        if (entry.isFile) {
          files.push(entry.name);
        }
      }
    } catch {
      // Directory might not exist
    }
    return files;
  }

  /**
   * Cleanup test environment
   */
  async cleanup(): Promise<void> {
    try {
      await this.db.close();
    } catch {
      // Ignore close errors
    }

    try {
      await Deno.remove(this.tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
