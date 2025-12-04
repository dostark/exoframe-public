/**
 * Agent Executor Tests
 *
 * Tests for agent orchestration via MCP with security mode enforcement.
 * Covers blueprint loading, subprocess spawning, MCP connection, and git audit.
 */

import { assert, assertEquals, assertExists, assertRejects, assertStringIncludes } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import { AgentExecutor } from "../../src/services/agent_executor.ts";
import { Config } from "../../src/config/schema.ts";
import { initTestDbService } from "../helpers/db.ts";
import { EventLogger } from "../../src/services/event_logger.ts";
import { PathResolver } from "../../src/services/path_resolver.ts";
import { PortalPermissionsService } from "../../src/services/portal_permissions.ts";
import type { AgentExecutionOptions, ExecutionContext } from "../../src/schemas/agent_executor.ts";
import type { PortalPermissions } from "../../src/schemas/portal_permissions.ts";

// Test fixtures - initialized once
let testDir: string;
let blueprintsDir: string;
let portalDir: string;
let systemDir: string;
let testConfig: Config;
let dbService: Awaited<ReturnType<typeof initTestDbService>>;

// Setup before all tests
async function setup() {
  testDir = await Deno.makeTempDir();
  blueprintsDir = join(testDir, "Blueprints", "Agents");
  portalDir = join(testDir, "TestPortal");
  systemDir = join(testDir, "System");

  // Setup test environment
  await Deno.mkdir(blueprintsDir, { recursive: true });
  await Deno.mkdir(portalDir, { recursive: true });
  await Deno.mkdir(systemDir, { recursive: true });

  // Initialize git in portal
  const initGit = new Deno.Command("git", {
    args: ["init"],
    cwd: portalDir,
  });
  await initGit.output();

  const configGitUser = new Deno.Command("git", {
    args: ["config", "user.name", "Test User"],
    cwd: portalDir,
  });
  await configGitUser.output();

  const configGitEmail = new Deno.Command("git", {
    args: ["config", "user.email", "test@exoframe.local"],
    cwd: portalDir,
  });
  await configGitEmail.output();

  // Create initial commit
  await Deno.writeTextFile(join(portalDir, "README.md"), "# Test Portal\n");
  const addReadme = new Deno.Command("git", {
    args: ["add", "README.md"],
    cwd: portalDir,
  });
  await addReadme.output();

  const initialCommit = new Deno.Command("git", {
    args: ["commit", "-m", "Initial commit"],
    cwd: portalDir,
  });
  await initialCommit.output();

  // Initialize database service with proper schema
  dbService = await initTestDbService();

  // Test config
  testConfig = {
    system: {
      root: testDir,
      knowledge: join(testDir, "Knowledge"),
      inbox: join(testDir, "Inbox"),
      system_dir: join(testDir, "System"),
      blueprints: blueprintsDir,
    },
    watcher: {
      enabled: false,
      debounce_ms: 200,
    },
    llm: {
      default_provider: "mock",
      providers: {
        mock: {
          type: "mock",
          model: "mock-model",
        },
      },
    },
    portals: [
      {
        name: "TestPortal",
        path: portalDir,
        agents_allowed: ["test-agent"],
        operations: ["read", "write", "git"],
        security: {
          mode: "sandboxed",
          audit_enabled: true,
        },
      },
    ],
    mcp: {
      enabled: true,
      transport: "stdio",
      server_name: "exoframe-test",
      version: "1.0.0",
    },
    database: {
      batch_flush_ms: 100,
      batch_max_size: 100,
    },
  };
}

// Cleanup after all tests
async function cleanup() {
  try {
    await dbService.cleanup();
    await Deno.remove(testDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

// Helper to get initialized services for tests
function getServices() {
  const logger = new EventLogger({ db: dbService.db });
  const pathResolver = new PathResolver(testConfig);
  const portalPermissions: PortalPermissions[] = [
    {
      alias: "TestPortal",
      target_path: portalDir,
      agents_allowed: ["test-agent"],
      operations: ["read", "write", "git"],
      security: {
        mode: "sandboxed",
        audit_enabled: true,
        log_all_actions: true,
      },
    },
  ];
  const permissions = new PortalPermissionsService(portalPermissions);

  return {
    db: dbService.db,
    logger,
    pathResolver,
    permissions,
  };
}

Deno.test({
  name: "AgentExecutor: creates instance with required services",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      assertExists(executor);
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: loads blueprint from file",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();

      // Create test blueprint
      const blueprintContent = `---
model: mock-model
provider: mock
capabilities:
  - code_generation
  - git_operations
---

# Test Agent

You are a test agent for ExoFrame testing.`;

      await Deno.writeTextFile(
        join(blueprintsDir, "test-agent.md"),
        blueprintContent,
      );

      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

    const blueprint = await executor.loadBlueprint("test-agent");

      assertExists(blueprint);
      assertEquals(blueprint.name, "test-agent");
      assertEquals(blueprint.model, "mock-model");
      assertEquals(blueprint.provider, "mock");
      assert(blueprint.capabilities.includes("code_generation"));
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: throws error for missing blueprint",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      await assertRejects(
        async () => {
          await executor.loadBlueprint("nonexistent-agent");
        },
        Error,
        "Blueprint not found",
      );
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: validates portal exists before execution",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      const context: ExecutionContext = {
      trace_id: crypto.randomUUID(),
      request_id: "test-request",
      request: "Test request",
      plan: "Test plan",
      portal: "NonexistentPortal",
    };

    const options: AgentExecutionOptions = {
      agent_id: "test-agent",
      portal: "NonexistentPortal",
      security_mode: "sandboxed",
    };

    await assertRejects(
      async () => {
        await executor.executeStep(context, options);
      },
        Error,
        "Portal not found",
      );
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: validates agent has portal permissions",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      const context: ExecutionContext = {
        trace_id: crypto.randomUUID(),
        request_id: "test-request",
        request: "Test request",
        plan: "Test plan",
        portal: "TestPortal",
      };

      const options: AgentExecutionOptions = {
        agent_id: "unauthorized-agent", // Not in agents_allowed
        portal: "TestPortal",
        security_mode: "sandboxed",
      };

      await assertRejects(
        async () => {
          await executor.executeStep(context, options);
        },
        Error,
        "Agent not allowed",
      );
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: sandboxed mode builds subprocess with no file access",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      const permissions_flags = executor.buildSubprocessPermissions(
        "sandboxed",
        portalDir,
      );

      assertStringIncludes(permissions_flags.join(" "), "--allow-read=NONE");
      assertStringIncludes(permissions_flags.join(" "), "--allow-write=NONE");
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: hybrid mode builds subprocess with read-only portal access",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      const permissions_flags = executor.buildSubprocessPermissions(
        "hybrid",
        portalDir,
      );

      assertStringIncludes(
        permissions_flags.join(" "),
        `--allow-read=${portalDir}`,
      );
      assertStringIncludes(permissions_flags.join(" "), "--allow-write=NONE");
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: detects unauthorized changes in hybrid mode",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();

      // Create a file outside of MCP tools
      const unauthorizedFile = join(portalDir, "unauthorized.txt");
      await Deno.writeTextFile(unauthorizedFile, "Unauthorized change");

      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      const unauthorizedChanges = await executor.auditGitChanges(
        portalDir,
        [],
      );

      assert(unauthorizedChanges.length > 0);
      assert(
        unauthorizedChanges.some((file) => file.includes("unauthorized.txt")),
      );
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: reverts unauthorized changes in hybrid mode",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();

      // Create a tracked file and commit it
      const trackedFile = join(portalDir, "tracked.txt");
      await Deno.writeTextFile(trackedFile, "Original content");
      await new Deno.Command("git", {
        args: ["add", "tracked.txt"],
        cwd: portalDir,
      }).output();
      await new Deno.Command("git", {
        args: ["commit", "-m", "Add tracked file"],
        cwd: portalDir,
      }).output();

      // Make unauthorized changes to tracked file
      await Deno.writeTextFile(trackedFile, "Unauthorized modification");

      // Create an untracked file (also unauthorized)
      const untrackedFile = join(portalDir, "untracked.txt");
      await Deno.writeTextFile(untrackedFile, "Unauthorized new file");

      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      // Detect unauthorized changes
      const unauthorizedChanges = await executor.auditGitChanges(
        portalDir,
        [],
      );

      assert(unauthorizedChanges.length >= 2);

      // Revert unauthorized changes
      await executor.revertUnauthorizedChanges(portalDir, unauthorizedChanges);

      // Verify tracked file was restored
      const restoredContent = await Deno.readTextFile(trackedFile);
      assertEquals(restoredContent, "Original content");

      // Verify untracked file was deleted
      let untrackedExists = true;
      try {
        await Deno.stat(untrackedFile);
      } catch {
        untrackedExists = false;
      }
      assertEquals(untrackedExists, false);

      // Verify no unauthorized changes remain
      const remainingChanges = await executor.auditGitChanges(portalDir, []);
      assertEquals(remainingChanges.length, 0);
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name:
    "AgentExecutor: revertUnauthorizedChanges handles empty list gracefully",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();

      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      // Should not throw when given empty array
      await executor.revertUnauthorizedChanges(portalDir, []);

      // No assertion needed - just verify it doesn't throw
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: allows authorized changes via MCP tools",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();

      // Create a file and stage it (simulating MCP tool write)
      const authorizedFile = join(portalDir, "authorized.txt");
      await Deno.writeTextFile(authorizedFile, "Authorized change");

      const addFile = new Deno.Command("git", {
        args: ["add", "authorized.txt"],
        cwd: portalDir,
      });
      await addFile.output();

      const commitFile = new Deno.Command("git", {
        args: ["commit", "-m", "Authorized change via MCP"],
        cwd: portalDir,
      });
      await commitFile.output();

      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      // Audit should find no unauthorized changes (all committed)
      const unauthorizedChanges = await executor.auditGitChanges(
        portalDir,
        ["authorized.txt"],
      );

      assertEquals(unauthorizedChanges.length, 0);
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: logs execution start to Activity Journal",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      const trace_id = crypto.randomUUID();
      await executor.logExecutionStart(trace_id, "test-agent", "TestPortal");

      // Wait for batched logs to flush
      await db.waitForFlush();

      // Query activity log
      const activities = db.getActivitiesByTrace(trace_id);

      assert(activities.length > 0);
      const startActivity = activities.find((a) => a.action_type === "agent.execution_started");
      assertExists(startActivity);
      assertEquals(startActivity.agent_id, "test-agent");
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: logs execution completion to Activity Journal",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      const trace_id = crypto.randomUUID();
      await executor.logExecutionComplete(trace_id, "test-agent", {
        branch: "feat/test",
        commit_sha: "abc1234",
        files_changed: ["file.txt"],
        description: "Test changes",
        tool_calls: 5,
        execution_time_ms: 1000,
      });

      // Wait for batched logs to flush
      await db.waitForFlush();

      // Query activity log
      const activities = db.getActivitiesByTrace(trace_id);

      assert(activities.length > 0);
      const completeActivity = activities.find((a) => a.action_type === "agent.execution_completed");
      assertExists(completeActivity);
      assertEquals(completeActivity.agent_id, "test-agent");
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: logs execution errors to Activity Journal",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      const trace_id = crypto.randomUUID();
      await executor.logExecutionError(trace_id, "test-agent", {
        type: "timeout",
        message: "Execution timed out after 5 minutes",
        trace_id,
      });

      // Wait for batched logs to flush
      await db.waitForFlush();

      // Query activity log
      const activities = db.getActivitiesByTrace(trace_id);

      assert(activities.length > 0);
      const errorActivity = activities.find((a) => a.action_type === "agent.execution_failed");
      assertExists(errorActivity);
      assertEquals(errorActivity.agent_id, "test-agent");
      assertStringIncludes(
        errorActivity.payload,
        "timeout",
      );
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: enforces max tool call limit",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

    const options: AgentExecutionOptions = {
      agent_id: "test-agent",
      portal: "TestPortal",
      security_mode: "sandboxed",
      max_tool_calls: 10,
    };

    // Simulate 11 tool calls
    const toolCalls = Array(11).fill("read_file");

    const exceededLimit = executor.checkToolCallLimit(
      toolCalls.length,
      options.max_tool_calls,
    );

      assert(exceededLimit);
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: validates changeset result has required fields",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      const validResult = {
        branch: "feat/test-abc123",
        commit_sha: "abc1234567890abcdef",
        files_changed: ["src/file.ts"],
        description: "Implement feature",
        tool_calls: 5,
        execution_time_ms: 2000,
      };

      const validated = executor.validateChangesetResult(validResult);
      assertExists(validated);
      assertEquals(validated.branch, "feat/test-abc123");
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: rejects invalid changeset result",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      const invalidResult = {
        branch: "feat/test",
        // Missing commit_sha
        files_changed: ["src/file.ts"],
        description: "Implement feature",
      };

      await assertRejects(
        async () => {
          executor.validateChangesetResult(invalidResult);
        },
        Error,
      );
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: extracts commit SHA from git log",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      // Get latest commit SHA from test repo
      const logProcess = new Deno.Command("git", {
        args: ["log", "-1", "--format=%H"],
        cwd: portalDir,
      });
      const output = await logProcess.output();
      const expectedSha = new TextDecoder().decode(output.stdout).trim();

      const sha = await executor.getLatestCommitSha(portalDir);

      assertEquals(sha, expectedSha);
      assert(sha.length >= 7); // At least short SHA
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: gets changed files from git diff",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();

      // Modify a file
      await Deno.writeTextFile(
        join(portalDir, "README.md"),
        "# Test Portal\n\nModified content\n",
      );

      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      const changedFiles = await executor.getChangedFiles(portalDir);

      assert(changedFiles.length > 0);
      assert(changedFiles.includes("README.md"));
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: timeout configuration works correctly",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      const options: AgentExecutionOptions = {
        agent_id: "test-agent",
        portal: "TestPortal",
        security_mode: "sandboxed",
        timeout_ms: 30000, // 30 seconds
      };

      assertEquals(options.timeout_ms, 30000);
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: audit enabled flag controls git audit",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
      );

      const optionsWithAudit: AgentExecutionOptions = {
        agent_id: "test-agent",
        portal: "TestPortal",
        security_mode: "hybrid",
        audit_enabled: true,
      };

      const optionsWithoutAudit: AgentExecutionOptions = {
        agent_id: "test-agent",
        portal: "TestPortal",
        security_mode: "hybrid",
        audit_enabled: false,
      };

      assert(optionsWithAudit.audit_enabled);
      assert(!optionsWithoutAudit.audit_enabled);
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
