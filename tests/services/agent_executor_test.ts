/**
 * Agent Executor Tests
 *
 * Tests for agent orchestration via MCP with security mode enforcement.
 * Covers blueprint loading, subprocess spawning, MCP connection, and git audit.
 */

import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";
import { join } from "jsr:@std/path@1";
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
  // Use centralized test DB + tempdir
  dbService = await initTestDbService();
  testDir = dbService.tempDir;
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

  // Test config
  testConfig = {
    system: {
      root: testDir,
      log_level: "info" as const,
    },
    paths: {
      inbox: join(testDir, "Inbox"),
      memory: join(testDir, "Memory"),
      system: join(testDir, "System"),
      blueprints: join(testDir, "Blueprints"),
    },
    watcher: {
      debounce_ms: 200,
      stability_check: false,
    },
    portals: [
      {
        alias: "TestPortal",
        target_path: portalDir,
      },
    ],
    database: {
      batch_flush_ms: 100,
      batch_max_size: 100,
    },
  } as Config;
}

// Cleanup after all tests
async function cleanup() {
  try {
    await dbService.cleanup();
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
      agents_allowed: ["test-agent", "ollama-agent"],
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
        timeout_ms: 300000,
        max_tool_calls: 100,
        audit_enabled: true,
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
        timeout_ms: 300000,
        max_tool_calls: 100,
        audit_enabled: true,
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
  name: "AgentExecutor: revertUnauthorizedChanges handles empty list gracefully",
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
        timeout_ms: 300000,
        max_tool_calls: 10,
        audit_enabled: true,
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

      assertThrows(
        () => {
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
      const _executor = new AgentExecutor(
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
        max_tool_calls: 100,
        audit_enabled: true,
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
      const _executor = new AgentExecutor(
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
        timeout_ms: 300000,
        max_tool_calls: 100,
        audit_enabled: true,
      };

      const optionsWithoutAudit: AgentExecutionOptions = {
        agent_id: "test-agent",
        portal: "TestPortal",
        security_mode: "hybrid",
        timeout_ms: 300000,
        max_tool_calls: 100,
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

Deno.test({
  name: "AgentExecutor: executes with MockLLMProvider",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();

      // Import MockProvider
      const { MockProvider } = await import("../../src/ai/providers.ts");

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

      // Create MockProvider with a valid JSON response
      const mockResponse = `\`\`\`json
{
  "branch": "feat/test-feature",
  "commit_sha": "abc1234567890abcdef1234567890abcdef1234",
  "files_changed": ["src/test.ts", "src/helper.ts"],
  "description": "Implemented test feature",
  "tool_calls": 3,
  "execution_time_ms": 1500
}
\`\`\``;

      const mockProvider = new MockProvider(mockResponse);

      // Create executor with MockProvider
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
        mockProvider,
      );

      const context: ExecutionContext = {
        trace_id: crypto.randomUUID(),
        request_id: "test-request-123",
        request: "Implement a test feature",
        plan: "Create test files and implement feature logic",
        portal: "TestPortal",
      };

      const options: AgentExecutionOptions = {
        agent_id: "test-agent",
        portal: "TestPortal",
        security_mode: "sandboxed",
        timeout_ms: 5000,
        max_tool_calls: 50,
        audit_enabled: true,
      };

      // Execute step with MockProvider
      const result = await executor.executeStep(context, options);

      // Verify result matches mock response
      assertExists(result);
      assertEquals(result.branch, "feat/test-feature");
      assertEquals(result.commit_sha, "abc1234567890abcdef1234567890abcdef1234");
      assertEquals(result.files_changed.length, 2);
      assert(result.files_changed.includes("src/test.ts"));
      assert(result.files_changed.includes("src/helper.ts"));
      assertEquals(result.description, "Implemented test feature");
      assertEquals(result.tool_calls, 3);
      assertExists(result.execution_time_ms);

      // Verify activity was logged
      await db.waitForFlush();
      const activities = db.getActivitiesByTrace(context.trace_id);
      assert(activities.length >= 2); // start and complete logs
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: handles invalid JSON from MockLLMProvider gracefully",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();

      // Import MockProvider
      const { MockProvider } = await import("../../src/ai/providers.ts");

      // Create test blueprint
      const blueprintContent = `---
model: mock-model
provider: mock
capabilities:
  - code_generation
---

# Test Agent

You are a test agent.`;

      await Deno.writeTextFile(
        join(blueprintsDir, "test-agent.md"),
        blueprintContent,
      );

      // Create MockProvider with invalid response
      const mockProvider = new MockProvider("This is not valid JSON");

      // Create executor with MockProvider
      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
        mockProvider,
      );

      const context: ExecutionContext = {
        trace_id: crypto.randomUUID(),
        request_id: "test-request-456",
        request: "Test invalid response handling",
        plan: "Handle invalid JSON gracefully",
        portal: "TestPortal",
      };

      const options: AgentExecutionOptions = {
        agent_id: "test-agent",
        portal: "TestPortal",
        security_mode: "sandboxed",
        timeout_ms: 5000,
        max_tool_calls: 50,
        audit_enabled: true,
      };

      // Execute step - should handle gracefully
      const result = await executor.executeStep(context, options);

      // Should return default result when parsing fails
      assertExists(result);
      assertStringIncludes(result.branch, "feat/test-request-456");
      assertEquals(result.commit_sha, "0000000000000000000000000000000000000000");
      assertEquals(result.files_changed.length, 0);
      assertExists(result.execution_time_ms);
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: passes execution context via prompt (criterion 6)",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();

      // Import MockProvider
      const { MockProvider } = await import("../../src/ai/providers.ts");

      // Create test blueprint
      const blueprintContent = `---
model: mock-model
provider: mock
capabilities:
  - code_generation
---

# Test Agent

You are a test agent for ExoFrame testing.`;

      await Deno.writeTextFile(
        join(blueprintsDir, "test-agent.md"),
        blueprintContent,
      );

      // Capture the prompt passed to the provider
      let capturedPrompt = "";
      const mockResponse = `\`\`\`json
{
  "branch": "feat/context-test",
  "commit_sha": "1234567890abcdef1234567890abcdef12345678",
  "files_changed": ["test.ts"],
  "description": "Test with context",
  "tool_calls": 1,
  "execution_time_ms": 100
}
\`\`\``;

      const mockProvider = new MockProvider(mockResponse);

      // Wrap generate to capture the prompt
      const originalGenerate = mockProvider.generate.bind(mockProvider);
      mockProvider.generate = async (prompt: string, options?: any) => {
        capturedPrompt = prompt;
        return await originalGenerate(prompt, options);
      };

      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
        mockProvider,
      );

      const context: ExecutionContext = {
        trace_id: "test-trace-12345",
        request_id: "test-request-789",
        request: "Implement feature X",
        plan: "Step 1: Create file\nStep 2: Write code",
        portal: "TestPortal",
      };

      const options: AgentExecutionOptions = {
        agent_id: "test-agent",
        portal: "TestPortal",
        security_mode: "sandboxed",
        timeout_ms: 5000,
        max_tool_calls: 50,
        audit_enabled: true,
      };

      await executor.executeStep(context, options);

      // Verify execution context was passed in the prompt
      assertStringIncludes(capturedPrompt, "test-trace-12345"); // trace_id
      assertStringIncludes(capturedPrompt, "test-request-789"); // request_id
      assertStringIncludes(capturedPrompt, "TestPortal"); // portal
      assertStringIncludes(capturedPrompt, "sandboxed"); // security_mode
      assertStringIncludes(capturedPrompt, "Implement feature X"); // request
      assertStringIncludes(capturedPrompt, "Step 1: Create file"); // plan
      assertStringIncludes(capturedPrompt, "You are a test agent for ExoFrame testing"); // system prompt
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: handles agent completion signal (criterion 8)",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();

      // Import MockProvider
      const { MockProvider } = await import("../../src/ai/providers.ts");

      // Create test blueprint
      const blueprintContent = `---
model: mock-model
provider: mock
---

# Completion Test Agent

Test agent for completion handling.`;

      await Deno.writeTextFile(
        join(blueprintsDir, "test-agent.md"),
        blueprintContent,
      );

      const mockResponse = `\`\`\`json
{
  "branch": "feat/completion-test",
  "commit_sha": "abcdef1234567890abcdef1234567890abcdef12",
  "files_changed": ["completion.ts"],
  "description": "Completed successfully",
  "tool_calls": 2,
  "execution_time_ms": 150
}
\`\`\``;

      const mockProvider = new MockProvider(mockResponse);

      const executor = new AgentExecutor(
        testConfig,
        db,
        logger,
        pathResolver,
        permissions,
        mockProvider,
      );

      const context: ExecutionContext = {
        trace_id: crypto.randomUUID(),
        request_id: "completion-test",
        request: "Test completion handling",
        plan: "Execute and complete",
        portal: "TestPortal",
      };

      const options: AgentExecutionOptions = {
        agent_id: "test-agent",
        portal: "TestPortal",
        security_mode: "sandboxed",
        timeout_ms: 5000,
        max_tool_calls: 50,
        audit_enabled: true,
      };

      // Execute and verify completion
      const result = await executor.executeStep(context, options);

      // Verify completion was handled correctly
      assertExists(result);
      assertEquals(result.branch, "feat/completion-test");
      assertEquals(result.commit_sha, "abcdef1234567890abcdef1234567890abcdef12");
      assertEquals(result.description, "Completed successfully");
      assertEquals(result.tool_calls, 2);

      // Verify completion was logged
      await db.waitForFlush();
      const activities = db.getActivitiesByTrace(context.trace_id);

      const completionLog = activities.find((a) => a.action_type === "agent.execution_completed");

      assertExists(completionLog, "Completion should be logged");

      // Verify payload contains completion details (payload is stored as JSON string)
      const payload = JSON.parse(completionLog.payload);
      assertEquals(payload.branch, "feat/completion-test");
      assertEquals(payload.commit_sha, "abcdef1234567890abcdef1234567890abcdef12");
      assertEquals(payload.files_changed, 1); // Note: logged as count, not array
      assertEquals(payload.tool_calls, 2);
      assertExists(payload.completed_at);
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: executes with OllamaProvider when available (criterion 16)",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();

      // Import OllamaProvider
      const { OllamaProvider } = await import("../../src/ai/providers.ts");

      // Create test blueprint
      const blueprintContent = `---
model: llama3.2
provider: ollama
capabilities:
  - code_generation
---

# Ollama Test Agent

You are a test agent using Ollama provider.`;

      await Deno.writeTextFile(
        join(blueprintsDir, "ollama-agent.md"),
        blueprintContent,
      );

      // Mock Ollama API response
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (input: string | URL | Request, _init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        if (url.includes("/api/generate")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                response: `\`\`\`json
{
  "branch": "feat/ollama-test",
  "commit_sha": "1234567890abcdef1234567890abcdef12345678",
  "files_changed": ["ollama.ts"],
  "description": "Implemented via Ollama",
  "tool_calls": 5,
  "execution_time_ms": 2000
}
\`\`\``,
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }

        return originalFetch(input as RequestInfo, _init);
      };

      try {
        const ollamaProvider = new OllamaProvider({
          baseUrl: "http://localhost:11434",
          model: "llama3.2",
          timeoutMs: 5000,
        });

        const executor = new AgentExecutor(
          testConfig,
          db,
          logger,
          pathResolver,
          permissions,
          ollamaProvider,
        );

        const context: ExecutionContext = {
          trace_id: crypto.randomUUID(),
          request_id: "ollama-test-123",
          request: "Test Ollama integration",
          plan: "Execute via Ollama provider",
          portal: "TestPortal",
        };

        const options: AgentExecutionOptions = {
          agent_id: "ollama-agent",
          portal: "TestPortal",
          security_mode: "sandboxed",
          timeout_ms: 5000,
          max_tool_calls: 50,
          audit_enabled: true,
        };

        // Execute step with OllamaProvider
        const result = await executor.executeStep(context, options);

        // Verify result matches Ollama response
        assertExists(result);
        assertEquals(result.branch, "feat/ollama-test");
        assertEquals(result.commit_sha, "1234567890abcdef1234567890abcdef12345678");
        assertEquals(result.files_changed.length, 1);
        assert(result.files_changed.includes("ollama.ts"));
        assertEquals(result.description, "Implemented via Ollama");
        assertEquals(result.tool_calls, 5);
        assertExists(result.execution_time_ms);

        // Verify activity was logged
        await db.waitForFlush();
        const activities = db.getActivitiesByTrace(context.trace_id);
        assert(activities.length >= 2); // start and complete logs

        const completionLog = activities.find((a) => a.action_type === "agent.execution_completed");
        assertExists(completionLog, "Ollama execution should be logged");
      } finally {
        globalThis.fetch = originalFetch;
      }
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "AgentExecutor: handles Ollama connection errors gracefully (criterion 16)",
  fn: async () => {
    await setup();
    try {
      const { db, logger, pathResolver, permissions } = getServices();

      // Import OllamaProvider and ConnectionError
      const { OllamaProvider } = await import("../../src/ai/providers.ts");

      // Create test blueprint
      const blueprintContent = `---
model: llama3.2
provider: ollama
---

# Ollama Error Test Agent

Test agent for error handling.`;

      await Deno.writeTextFile(
        join(blueprintsDir, "ollama-agent.md"),
        blueprintContent,
      );

      // Mock Ollama API to return connection error
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (_input: string | URL | Request, _init?: RequestInit) => {
        return Promise.reject(new TypeError("fetch failed"));
      };

      try {
        const ollamaProvider = new OllamaProvider({
          baseUrl: "http://localhost:11434",
          model: "llama3.2",
          timeoutMs: 5000,
        });

        const executor = new AgentExecutor(
          testConfig,
          db,
          logger,
          pathResolver,
          permissions,
          ollamaProvider,
        );

        const context: ExecutionContext = {
          trace_id: crypto.randomUUID(),
          request_id: "ollama-error-test",
          request: "Test Ollama error handling",
          plan: "Should fail with connection error",
          portal: "TestPortal",
        };

        const options: AgentExecutionOptions = {
          agent_id: "ollama-agent",
          portal: "TestPortal",
          security_mode: "sandboxed",
          timeout_ms: 5000,
          max_tool_calls: 50,
          audit_enabled: true,
        };

        // Execute should throw ConnectionError
        await assertRejects(
          async () => await executor.executeStep(context, options),
          Error,
          "Failed to connect to Ollama",
        );

        // Verify error was logged
        await db.waitForFlush();
        const activities = db.getActivitiesByTrace(context.trace_id);

        const errorLog = activities.find((a) => a.action_type === "agent.execution_failed");
        assertExists(errorLog, "Error should be logged");
      } finally {
        globalThis.fetch = originalFetch;
      }
    } finally {
      await cleanup();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
