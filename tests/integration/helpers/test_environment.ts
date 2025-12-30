/**
 * Test Environment Helper for Integration Tests
 *
 * Provides isolated, reproducible test workspace for end-to-end testing.
 * Creates temporary directory with complete ExoFrame workspace structure.
 */

import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { DatabaseService } from "../../../src/services/db.ts";
import { initTestDbService } from "../../helpers/db.ts";
import type { Config } from "../../../src/config/schema.ts";
import { MockLLMProvider } from "../../../src/ai/providers/mock_llm_provider.ts";
import { RequestProcessor } from "../../../src/services/request_processor.ts";
import { ExecutionLoop } from "../../../src/services/execution_loop.ts";

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
  private readonly _dbCleanup?: () => Promise<void>;

  private constructor(
    tempDir: string,
    config: Config,
    db: DatabaseService,
    cleanup?: () => Promise<void>,
  ) {
    this.tempDir = tempDir;
    this.config = config;
    this.db = db;
    this._dbCleanup = cleanup;
  }

  /**
   * Create a new isolated test environment
   */
  static async create(options: TestEnvironmentOptions = {}): Promise<TestEnvironment> {
    // Use centralized test DB + tempdir helper for consistency
    const { db, tempDir, config, cleanup } = await initTestDbService();

    // Create any additional directory structure required for integration tests
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

      // Create initial commit with .gitignore to prevent collateral damage from git reset --hard
      await Deno.writeTextFile(
        join(tempDir, ".gitignore"),
        "Inbox/\nSystem/journal.db*\nSystem/daemon.*\ndeno.lock\n",
      );
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

    return new TestEnvironment(tempDir, config, db, cleanup);
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
      `created: "${new Date().toISOString()}"`,
      `status: pending`,
      `priority: ${options.priority ?? 5}`,
      `agent: ${options.agentId ?? "senior-coder"}`,
      `source: test`,
      `created_by: test_environment`,
      options.portal ? `portal: "${options.portal}"` : null,
      `tags: [${(options.tags ?? []).map((t) => `"${t}"`).join(", ")}]`,
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
    const _shortId = traceId.substring(0, 8);
    const fileName = `${requestId}_plan.md`;
    const filePath = join(this.tempDir, "Inbox", "Plans", fileName);

    // Ensure plans directory exists (some tests may remove/recreate dirs concurrently)
    await ensureDir(join(this.tempDir, "Inbox", "Plans"));

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
      `- tool: ${a.tool}\n  params:\n${Object.entries(a.params).map(([k, v]) => `    ${k}: "${v}"`).join("\n")}`
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
    const requestId = fileName.replace(/_plan\.md$/, "");
    const activePath = join(this.tempDir, "System", "Active", fileName);

    // Robustly wait for the plan to appear. In high-concurrency tests the file may
    // be created slightly later or with a slightly different name/format. We poll
    // for up to 2 seconds and also scan the Plans directory for matching files by
    // name prefix or content that references the expected request_id or trace_id.
    let planExists = await exists(planPath);

    if (!planExists) {
      const start = Date.now();
      const timeoutMs = 2000;
      const intervalMs = 50;

      while (Date.now() - start < timeoutMs) {
        if (await exists(planPath)) {
          planExists = true;
          break;
        }

        // Scan Inbox/Plans for file with exact name or matching prefix
        try {
          const plansDir = join(this.tempDir, "Inbox", "Plans");
          for await (const entry of Deno.readDir(plansDir)) {
            if (!entry.isFile) continue;
            // Exact name match
            if (entry.name === fileName) {
              planPath = join(plansDir, entry.name);
              planExists = true;
              break;
            }
            // Prefix match: sometimes files may have timestamps/suffixes
            if (entry.name.startsWith(requestId)) {
              const candidatePath = join(plansDir, entry.name);
              try {
                const c = await Deno.readTextFile(candidatePath);
                if (c.includes(`request_id: "${requestId}"`) || c.includes(`trace_id: "${requestId}"`)) {
                  planPath = candidatePath;
                  planExists = true;
                  break;
                }
              } catch {
                // ignore read errors and continue searching
              }
            }
          }
          if (planExists) break;
        } catch {
          // ignore directory read errors
        }

        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }

    if (!planExists) {
      // As a last resort, scan both Inbox/Plans and System/Active for a matching
      // plan by `request_id` or `trace_id`. If an approved copy already exists in
      // System/Active, return that path (tests are happy as long as the plan is
      // available for processing).
      const plansDir = join(this.tempDir, "Inbox", "Plans");
      const activeDir = join(this.tempDir, "System", "Active");

      try {
        for await (const dir of [plansDir, activeDir]) {
          for await (const entry of Deno.readDir(dir)) {
            if (!entry.isFile) continue;
            const candidatePath = join(dir, entry.name);
            try {
              const c = await Deno.readTextFile(candidatePath);
              if (c.includes(`request_id: "${requestId}"`) || c.includes(`trace_id: "${requestId}"`)) {
                // If found in Active, ensure status is approved and return it.
                if (dir === activeDir) {
                  return candidatePath;
                }

                // Found in Plans; use this as planPath and proceed
                planPath = candidatePath;
                planExists = true;
                break;
              }
            } catch {
              // ignore read errors
            }
          }
          if (planExists) break;
        }
      } catch {
        // ignore
      }
    }

    if (!planExists) {
      throw new Error(`Plan file not found: ${planPath}`);
    }

    // Read and update status (be tolerant of different status formats)
    let content = await Deno.readTextFile(planPath);
    if (/status: review/.test(content)) {
      content = content.replace(/status: review/, "status: approved");
    } else if (/status: \w+/.test(content)) {
      content = content.replace(/status: \w+/, "status: approved");
    } else {
      // append status if missing
      content = content.replace(/---\s*\n/, `---\nstatus: approved\n`);
    }

    // Ensure active directory exists (some tests may remove/recreate dirs)
    await ensureDir(join(this.tempDir, "System", "Active"));

    await Deno.writeTextFile(activePath, content);

    // Attempt to remove original plan file (ignore if already moved/removed)
    try {
      await Deno.remove(planPath);
    } catch {
      // ignore
    }

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
   * Create an ExecutionLoop instance for testing
   */
  createExecutionLoop(agentId: string = "test-agent"): ExecutionLoop {
    return new ExecutionLoop({
      config: this.config,
      db: this.db,
      agentId,
    });
  }

  /**
   * Inject failure marker into plan to trigger intentional failure
   */
  async injectFailureMarker(planPath: string): Promise<void> {
    let content = await Deno.readTextFile(planPath);
    content = content.replace(
      "# Proposed Plan",
      "# Proposed Plan\n\nIntentionally fail",
    );
    await Deno.writeTextFile(planPath, content);
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
   * Create a blueprint agent file
   */
  async createBlueprint(
    agentId: string,
    content?: string,
  ): Promise<string> {
    const blueprintsPath = join(this.tempDir, "Blueprints", "Agents");
    await ensureDir(blueprintsPath);

    const defaultContent = `# ${agentId} Blueprint

You are an expert software developer with deep knowledge of multiple programming languages and frameworks.

## Response Format

Always respond with valid JSON containing a plan with actionable steps.`;

    const blueprintPath = join(blueprintsPath, `${agentId}.md`);
    await Deno.writeTextFile(blueprintPath, content ?? defaultContent);

    return blueprintPath;
  }

  /**
   * Create a RequestProcessor with MockLLMProvider
   */
  createRequestProcessor(options?: {
    providerMode?: "recorded" | "scripted" | "pattern" | "failing" | "slow";
    recordings?: any[];
    includeReasoning?: boolean;
    inboxPath?: string;
    blueprintsPath?: string;
  }): {
    provider: MockLLMProvider;
    processor: RequestProcessor;
  } {
    const provider = new MockLLMProvider(
      options?.providerMode ?? "recorded",
      { recordings: options?.recordings ?? [] },
    );

    const processor = new RequestProcessor(
      this.config,
      provider,
      this.db,
      {
        inboxPath: options?.inboxPath ?? join(this.tempDir, "Inbox"),
        blueprintsPath: options?.blueprintsPath ??
          join(this.tempDir, "Blueprints", "Agents"),
        includeReasoning: options?.includeReasoning ?? true,
      },
    );

    return { provider, processor };
  }

  /**
   * Create a mock LLM provider with optional recordings
   */
  createMockProvider(
    mode: "recorded" | "scripted" | "pattern" | "failing" | "slow" = "recorded",
    recordings: any[] = [],
  ): MockLLMProvider {
    return new MockLLMProvider(mode, { recordings });
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
    // Prefer the DB helper's cleanup (it closes DB and removes the tempdir),
    // but fall back to manual cleanup if not available.
    if (this._dbCleanup) {
      try {
        await this._dbCleanup();
        return;
      } catch {
        // Fall back to manual cleanup
      }
    }

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
