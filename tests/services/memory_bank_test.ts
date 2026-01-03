/**
 * Memory Bank Service Tests
 *
 * Comprehensive tests for memory bank CRUD operations, covering:
 * - Project memory management
 * - Execution memory management
 * - Search and query operations
 * - Activity Journal integration
 */

import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { exists } from "@std/fs";
import { MemoryBankService } from "../../src/services/memory_bank.ts";
import { initTestDbService } from "../helpers/db.ts";
import type { Decision, ExecutionMemory, Pattern, ProjectMemory } from "../../src/schemas/memory_bank.ts";

// ===== Project Memory Tests =====

Deno.test("MemoryBankService: getProjectMemory returns null for non-existent portal", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    const result = await service.getProjectMemory("non-existent-portal");
    assertEquals(result, null);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: createProjectMemory creates directory structure", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    const projectMem: ProjectMemory = {
      portal: "test-project",
      overview: "A test project for memory banks",
      patterns: [],
      decisions: [],
      references: [],
    };

    await service.createProjectMemory(projectMem);

    // Verify directory structure created
    const projectDir = join(config.system.root, "Memory", "Projects", "test-project");
    assertEquals(await exists(projectDir), true);
    assertEquals(await exists(join(projectDir, "overview.md")), true);
    assertEquals(await exists(join(projectDir, "patterns.md")), true);
    assertEquals(await exists(join(projectDir, "decisions.md")), true);
    assertEquals(await exists(join(projectDir, "references.md")), true);

    // Verify overview content
    const overviewContent = await Deno.readTextFile(join(projectDir, "overview.md"));
    assertStringIncludes(overviewContent, "A test project for memory banks");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: getProjectMemory reads existing project", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    // Create project first
    const projectMem: ProjectMemory = {
      portal: "my-app",
      overview: "My application overview",
      patterns: [
        {
          name: "Repository Pattern",
          description: "All database access through repositories",
          examples: ["src/repos/user_repo.ts"],
        },
      ],
      decisions: [],
      references: [],
    };

    await service.createProjectMemory(projectMem);

    // Read it back
    const retrieved = await service.getProjectMemory("my-app");
    assertExists(retrieved);
    assertEquals(retrieved.portal, "my-app");
    assertEquals(retrieved.overview, "My application overview");
    assertEquals(retrieved.patterns.length, 1);
    assertEquals(retrieved.patterns[0].name, "Repository Pattern");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: addPattern appends to existing patterns", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    // Create project
    await service.createProjectMemory({
      portal: "my-app",
      overview: "Test app",
      patterns: [],
      decisions: [],
      references: [],
    });

    // Add pattern
    const pattern: Pattern = {
      name: "Factory Pattern",
      description: "Creates objects without specifying exact class",
      examples: ["src/factories/user_factory.ts"],
      tags: ["creational", "design-pattern"],
    };

    await service.addPattern("my-app", pattern);

    // Verify pattern was added
    const retrieved = await service.getProjectMemory("my-app");
    assertExists(retrieved);
    assertEquals(retrieved.patterns.length, 1);
    assertEquals(retrieved.patterns[0].name, "Factory Pattern");
    assertEquals(retrieved.patterns[0].tags?.length, 2);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: addDecision appends to existing decisions", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    // Create project
    await service.createProjectMemory({
      portal: "my-app",
      overview: "Test app",
      patterns: [],
      decisions: [],
      references: [],
    });

    // Add decision
    const decision: Decision = {
      date: "2026-01-03",
      decision: "Use PostgreSQL for production database",
      rationale: "Need ACID compliance and better scaling",
      alternatives: ["MySQL", "MongoDB"],
      tags: ["database", "architecture"],
    };

    await service.addDecision("my-app", decision);

    // Verify decision was added
    const retrieved = await service.getProjectMemory("my-app");
    assertExists(retrieved);
    assertEquals(retrieved.decisions.length, 1);
    assertEquals(retrieved.decisions[0].decision, "Use PostgreSQL for production database");
    assertEquals(retrieved.decisions[0].alternatives?.length, 2);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: updateProjectMemory merges updates", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    // Create project
    await service.createProjectMemory({
      portal: "my-app",
      overview: "Original overview",
      patterns: [],
      decisions: [],
      references: [],
    });

    // Update overview
    await service.updateProjectMemory("my-app", {
      overview: "Updated overview with more details",
    });

    // Verify update
    const retrieved = await service.getProjectMemory("my-app");
    assertExists(retrieved);
    assertEquals(retrieved.overview, "Updated overview with more details");
  } finally {
    await cleanup();
  }
});

// ===== Execution Memory Tests =====

Deno.test("MemoryBankService: createExecutionRecord creates directory structure", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    const traceId = "550e8400-e29b-41d4-a716-446655440000";
    const execution: ExecutionMemory = {
      trace_id: traceId,
      request_id: "REQ-123",
      started_at: "2026-01-03T10:00:00Z",
      completed_at: "2026-01-03T10:15:00Z",
      status: "completed",
      portal: "my-app",
      agent: "senior-coder",
      summary: "Added authentication middleware",
      context_files: ["src/middleware/auth.ts"],
      context_portals: ["my-app"],
      changes: {
        files_created: ["src/middleware/auth.ts"],
        files_modified: ["src/app.ts"],
        files_deleted: [],
      },
      lessons_learned: ["Always validate JWT expiration"],
    };

    await service.createExecutionRecord(execution);

    // Verify directory structure
    const execDir = join(config.system.root, "Memory", "Execution", traceId);
    assertEquals(await exists(execDir), true);
    assertEquals(await exists(join(execDir, "summary.md")), true);
    assertEquals(await exists(join(execDir, "context.json")), true);

    // Verify context.json content
    const contextContent = await Deno.readTextFile(join(execDir, "context.json"));
    const contextData = JSON.parse(contextContent);
    assertEquals(contextData.trace_id, traceId);
    assertEquals(contextData.status, "completed");
    assertEquals(contextData.lessons_learned.length, 1);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: getExecutionByTraceId retrieves execution", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    const traceId = "550e8400-e29b-41d4-a716-446655440001";
    const execution: ExecutionMemory = {
      trace_id: traceId,
      request_id: "REQ-124",
      started_at: "2026-01-03T11:00:00Z",
      status: "running",
      portal: "my-app",
      agent: "senior-coder",
      summary: "In progress",
      context_files: [],
      context_portals: [],
      changes: {
        files_created: [],
        files_modified: [],
        files_deleted: [],
      },
    };

    await service.createExecutionRecord(execution);

    // Retrieve it
    const retrieved = await service.getExecutionByTraceId(traceId);
    assertExists(retrieved);
    assertEquals(retrieved.trace_id, traceId);
    assertEquals(retrieved.status, "running");
    assertEquals(retrieved.completed_at, undefined);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: getExecutionHistory returns all executions", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    // Create multiple executions
    const execution1: ExecutionMemory = {
      trace_id: "550e8400-e29b-41d4-a716-446655440010",
      request_id: "REQ-1",
      started_at: "2026-01-03T09:00:00Z",
      completed_at: "2026-01-03T09:10:00Z",
      status: "completed",
      portal: "app-1",
      agent: "senior-coder",
      summary: "First execution",
      context_files: [],
      context_portals: [],
      changes: { files_created: [], files_modified: [], files_deleted: [] },
    };

    const execution2: ExecutionMemory = {
      trace_id: "550e8400-e29b-41d4-a716-446655440011",
      request_id: "REQ-2",
      started_at: "2026-01-03T10:00:00Z",
      completed_at: "2026-01-03T10:10:00Z",
      status: "completed",
      portal: "app-2",
      agent: "senior-coder",
      summary: "Second execution",
      context_files: [],
      context_portals: [],
      changes: { files_created: [], files_modified: [], files_deleted: [] },
    };

    await service.createExecutionRecord(execution1);
    await service.createExecutionRecord(execution2);

    // Get all history
    const history = await service.getExecutionHistory();
    assertEquals(history.length, 2);

    // Verify sorted by started_at descending (most recent first)
    assertEquals(history[0].trace_id, "550e8400-e29b-41d4-a716-446655440011");
    assertEquals(history[1].trace_id, "550e8400-e29b-41d4-a716-446655440010");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: getExecutionHistory filters by portal", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    // Create executions for different portals
    await service.createExecutionRecord({
      trace_id: "550e8400-e29b-41d4-a716-446655440020",
      request_id: "REQ-1",
      started_at: "2026-01-03T09:00:00Z",
      status: "completed",
      portal: "app-1",
      agent: "senior-coder",
      summary: "App 1 execution",
      context_files: [],
      context_portals: [],
      changes: { files_created: [], files_modified: [], files_deleted: [] },
    });

    await service.createExecutionRecord({
      trace_id: "550e8400-e29b-41d4-a716-446655440021",
      request_id: "REQ-2",
      started_at: "2026-01-03T10:00:00Z",
      status: "completed",
      portal: "app-2",
      agent: "senior-coder",
      summary: "App 2 execution",
      context_files: [],
      context_portals: [],
      changes: { files_created: [], files_modified: [], files_deleted: [] },
    });

    // Filter by portal
    const app1History = await service.getExecutionHistory("app-1");
    assertEquals(app1History.length, 1);
    assertEquals(app1History[0].portal, "app-1");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: getExecutionHistory respects limit", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    // Create 5 executions
    for (let i = 0; i < 5; i++) {
      await service.createExecutionRecord({
        trace_id: `550e8400-e29b-41d4-a716-44665544003${i}`,
        request_id: `REQ-${i}`,
        started_at: `2026-01-03T0${i}:00:00Z`,
        status: "completed",
        portal: "my-app",
        agent: "senior-coder",
        summary: `Execution ${i}`,
        context_files: [],
        context_portals: [],
        changes: { files_created: [], files_modified: [], files_deleted: [] },
      });
    }

    // Get limited history
    const limited = await service.getExecutionHistory(undefined, 3);
    assertEquals(limited.length, 3);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: createExecutionRecord handles failed execution with error", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    const traceId = "550e8400-e29b-41d4-a716-446655440040";
    const execution: ExecutionMemory = {
      trace_id: traceId,
      request_id: "REQ-FAIL",
      started_at: "2026-01-03T10:00:00Z",
      completed_at: "2026-01-03T10:01:00Z",
      status: "failed",
      portal: "my-app",
      agent: "senior-coder",
      summary: "Failed to add feature",
      context_files: [],
      context_portals: [],
      changes: { files_created: [], files_modified: [], files_deleted: [] },
      error_message: "PermissionDenied: Cannot write to protected directory",
    };

    await service.createExecutionRecord(execution);

    const retrieved = await service.getExecutionByTraceId(traceId);
    assertExists(retrieved);
    assertEquals(retrieved.status, "failed");
    assertEquals(retrieved.error_message, "PermissionDenied: Cannot write to protected directory");
  } finally {
    await cleanup();
  }
});

// ===== Search & Query Tests =====

Deno.test("MemoryBankService: searchMemory finds matching content", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    // Create project with authentication-related content
    await service.createProjectMemory({
      portal: "auth-app",
      overview: "Authentication service using JWT tokens",
      patterns: [],
      decisions: [],
      references: [],
    });

    // Create execution with authentication work
    await service.createExecutionRecord({
      trace_id: "550e8400-e29b-41d4-a716-446655440050",
      request_id: "REQ-AUTH",
      started_at: "2026-01-03T10:00:00Z",
      status: "completed",
      portal: "auth-app",
      agent: "senior-coder",
      summary: "Implemented JWT authentication middleware",
      context_files: [],
      context_portals: [],
      changes: { files_created: [], files_modified: [], files_deleted: [] },
    });

    // Search for "authentication"
    const results = await service.searchMemory("authentication");
    assertEquals(results.length >= 2, true); // At least project + execution
  } finally {
    await cleanup();
  }
});

// ===== Activity Journal Integration Tests =====

Deno.test("MemoryBankService: createProjectMemory logs to Activity Journal", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    await service.createProjectMemory({
      portal: "test-portal",
      overview: "Test project",
      patterns: [],
      decisions: [],
      references: [],
    });

    // Wait for batch flush
    await db.waitForFlush();

    // Verify activity journal entry
    const activities = db.instance.prepare(
      "SELECT action_type, target FROM activity ORDER BY timestamp DESC LIMIT 1",
    ).all() as Array<{ action_type: string; target: string }>;
    assertEquals(activities.length, 1);
    assertEquals(activities[0].action_type, "memory.project.created");
    assertEquals(activities[0].target, "test-portal");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: addPattern logs to Activity Journal", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    await service.createProjectMemory({
      portal: "test-portal",
      overview: "Test",
      patterns: [],
      decisions: [],
      references: [],
    });

    await service.addPattern("test-portal", {
      name: "Test Pattern",
      description: "A test pattern",
      examples: [],
    });

    // Wait for batch flush
    await db.waitForFlush();

    // Verify activity journal entry for pattern
    const activities = db.instance.prepare(
      "SELECT action_type, payload FROM activity WHERE action_type = 'memory.pattern.added' LIMIT 1",
    ).all() as Array<{ action_type: string; payload: string }>;
    assertEquals(activities.length, 1);
    const payload = JSON.parse(activities[0].payload);
    assertEquals(payload.pattern_name, "Test Pattern");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: createExecutionRecord logs to Activity Journal", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    const traceId = "550e8400-e29b-41d4-a716-446655440060";
    await service.createExecutionRecord({
      trace_id: traceId,
      request_id: "REQ-TEST",
      started_at: "2026-01-03T10:00:00Z",
      status: "completed",
      portal: "test-app",
      agent: "senior-coder",
      summary: "Test execution",
      context_files: [],
      context_portals: [],
      changes: { files_created: [], files_modified: [], files_deleted: [] },
    });

    // Wait for batch flush
    await db.waitForFlush();

    // Verify activity journal entry
    const activities = db.instance.prepare(
      "SELECT action_type, trace_id FROM activity WHERE trace_id = ? LIMIT 1",
    ).all(traceId) as Array<{ action_type: string; trace_id: string }>;
    assertEquals(activities.length, 1);
    assertEquals(activities[0].action_type, "memory.execution.recorded");
  } finally {
    await cleanup();
  }
});

// ===== Index Management Tests =====

Deno.test("MemoryBankService: rebuildIndices generates index files", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    // Create some memory content
    await service.createProjectMemory({
      portal: "app-1",
      overview: "First app",
      patterns: [],
      decisions: [],
      references: [],
    });

    await service.createExecutionRecord({
      trace_id: "550e8400-e29b-41d4-a716-446655440070",
      request_id: "REQ-1",
      started_at: "2026-01-03T10:00:00Z",
      status: "completed",
      portal: "app-1",
      agent: "senior-coder",
      summary: "Test",
      context_files: ["src/app.ts"],
      context_portals: [],
      changes: { files_created: [], files_modified: [], files_deleted: [] },
    });

    // Rebuild indices
    await service.rebuildIndices();

    // Verify index files exist
    const indexDir = join(config.system.root, "Memory", "Index");
    assertEquals(await exists(join(indexDir, "files.json")), true);
    assertEquals(await exists(join(indexDir, "patterns.json")), true);
    assertEquals(await exists(join(indexDir, "tags.json")), true);

    // Verify files.json content
    const filesIndexContent = await Deno.readTextFile(join(indexDir, "files.json"));
    const filesIndex = JSON.parse(filesIndexContent);
    assertExists(filesIndex["src/app.ts"]);
    assertEquals(filesIndex["src/app.ts"].length >= 1, true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: getRecentActivity combines execution history", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    // Create execution
    await service.createExecutionRecord({
      trace_id: "550e8400-e29b-41d4-a716-446655440080",
      request_id: "REQ-1",
      started_at: "2026-01-03T10:00:00Z",
      completed_at: "2026-01-03T10:10:00Z",
      status: "completed",
      portal: "my-app",
      agent: "senior-coder",
      summary: "Added feature",
      context_files: [],
      context_portals: [],
      changes: { files_created: [], files_modified: [], files_deleted: [] },
    });

    // Get recent activity
    const activity = await service.getRecentActivity(10);
    assertEquals(activity.length >= 1, true);
    assertEquals(activity[0].type, "execution");
    assertEquals(activity[0].portal, "my-app");
  } finally {
    await cleanup();
  }
});
