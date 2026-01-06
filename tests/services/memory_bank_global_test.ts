/**
 * Memory Bank Global Memory Tests
 *
 * TDD tests for Phase 12.8: Global Memory functionality:
 * - Learning schema validation
 * - GlobalMemory schema validation
 * - getGlobalMemory() / initGlobalMemory()
 * - addGlobalLearning()
 * - promoteLearning() (project → global)
 * - demoteLearning() (global → project)
 * - Activity Journal integration
 */

import { assertEquals, assertExists, assertRejects, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { exists } from "@std/fs";
import { MemoryBankService } from "../../src/services/memory_bank.ts";
import { initTestDbService } from "../helpers/db.ts";
import {
  type GlobalMemory,
  GlobalMemorySchema,
  type Learning,
  LearningSchema,
  type ProjectMemory,
} from "../../src/schemas/memory_bank.ts";
import { getMemoryGlobalDir } from "../helpers/paths_helper.ts";

// ===== Learning Schema Tests =====

Deno.test("LearningSchema: validates minimal learning", () => {
  const learning = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    created_at: "2026-01-04T12:00:00Z",
    source: "execution",
    scope: "project",
    project: "my-app",
    title: "Error handling pattern",
    description: "Always use try-catch with typed errors in async functions",
    category: "pattern",
    tags: ["error-handling", "typescript"],
    confidence: "high",
    status: "approved",
  };

  const result = LearningSchema.safeParse(learning);
  assertEquals(result.success, true);
});

Deno.test("LearningSchema: validates global learning without project", () => {
  const learning = {
    id: "550e8400-e29b-41d4-a716-446655440001",
    created_at: "2026-01-04T12:00:00Z",
    source: "user",
    scope: "global",
    title: "Always run tests before commit",
    description: "Ensure all tests pass before committing to avoid CI failures",
    category: "insight",
    tags: ["testing", "workflow"],
    confidence: "high",
    status: "approved",
  };

  const result = LearningSchema.safeParse(learning);
  assertEquals(result.success, true);
});

Deno.test("LearningSchema: validates pending status with references", () => {
  const learning = {
    id: "550e8400-e29b-41d4-a716-446655440002",
    created_at: "2026-01-04T12:00:00Z",
    source: "agent",
    source_id: "trace-123",
    scope: "project",
    project: "my-app",
    title: "Avoid N+1 queries",
    description: "Use joins or batch loading to avoid N+1 query problems",
    category: "anti-pattern",
    tags: ["database", "performance"],
    confidence: "medium",
    references: [
      { type: "file", path: "src/services/user.ts" },
      { type: "execution", path: "trace-123" },
    ],
    status: "pending",
  };

  const result = LearningSchema.safeParse(learning);
  assertEquals(result.success, true);
});

Deno.test("LearningSchema: rejects invalid category", () => {
  const learning = {
    id: "550e8400-e29b-41d4-a716-446655440003",
    created_at: "2026-01-04T12:00:00Z",
    source: "user",
    scope: "global",
    title: "Test",
    description: "Test description",
    category: "invalid-category", // Invalid
    tags: [],
    confidence: "high",
    status: "approved",
  };

  const result = LearningSchema.safeParse(learning);
  assertEquals(result.success, false);
});

Deno.test("LearningSchema: rejects invalid status", () => {
  const learning = {
    id: "550e8400-e29b-41d4-a716-446655440004",
    created_at: "2026-01-04T12:00:00Z",
    source: "user",
    scope: "global",
    title: "Test",
    description: "Test description",
    category: "pattern",
    tags: [],
    confidence: "high",
    status: "unknown", // Invalid
  };

  const result = LearningSchema.safeParse(learning);
  assertEquals(result.success, false);
});

// ===== GlobalMemory Schema Tests =====

Deno.test("GlobalMemorySchema: validates empty global memory", () => {
  const globalMem: GlobalMemory = {
    version: "1.0.0",
    updated_at: "2026-01-04T12:00:00Z",
    learnings: [],
    patterns: [],
    anti_patterns: [],
    statistics: {
      total_learnings: 0,
      by_category: {},
      by_project: {},
      last_activity: "2026-01-04T12:00:00Z",
    },
  };

  const result = GlobalMemorySchema.safeParse(globalMem);
  assertEquals(result.success, true);
});

Deno.test("GlobalMemorySchema: validates populated global memory", () => {
  const globalMem = {
    version: "1.0.0",
    updated_at: "2026-01-04T12:00:00Z",
    learnings: [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        created_at: "2026-01-04T12:00:00Z",
        source: "user",
        scope: "global",
        title: "Global pattern",
        description: "A global pattern description",
        category: "pattern",
        tags: ["global"],
        confidence: "high",
        status: "approved",
      },
    ],
    patterns: [
      {
        name: "Error Boundary Pattern",
        description: "Wrap components in error boundaries",
        applies_to: ["all"],
        examples: ["src/components/ErrorBoundary.tsx"],
        tags: ["react", "error-handling"],
      },
    ],
    anti_patterns: [
      {
        name: "God Class",
        description: "A class that does too much",
        reason: "Hard to maintain and test",
        alternative: "Break into smaller, focused classes",
        tags: ["architecture", "oop"],
      },
    ],
    statistics: {
      total_learnings: 1,
      by_category: { pattern: 1 },
      by_project: { "my-app": 1 },
      last_activity: "2026-01-04T12:00:00Z",
    },
  };

  const result = GlobalMemorySchema.safeParse(globalMem);
  assertEquals(result.success, true);
});

// ===== MemoryBankService Global Memory Tests =====

Deno.test("MemoryBankService: getGlobalMemory returns null for new installation", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    const result = await service.getGlobalMemory();
    assertEquals(result, null);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: initGlobalMemory creates Global directory structure", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await service.initGlobalMemory();

    const globalDir = getMemoryGlobalDir(config.system.root);
    assertEquals(await exists(globalDir), true);
    assertEquals(await exists(join(globalDir, "learnings.md")), true);
    assertEquals(await exists(join(globalDir, "learnings.json")), true);
    assertEquals(await exists(join(globalDir, "patterns.md")), true);
    assertEquals(await exists(join(globalDir, "anti-patterns.md")), true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: getGlobalMemory returns initialized memory", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await service.initGlobalMemory();

    const globalMem = await service.getGlobalMemory();
    assertExists(globalMem);
    assertEquals(globalMem.version, "1.0.0");
    assertEquals(globalMem.learnings, []);
    assertEquals(globalMem.patterns, []);
    assertEquals(globalMem.anti_patterns, []);
    assertEquals(globalMem.statistics.total_learnings, 0);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: addGlobalLearning creates learning entry", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await service.initGlobalMemory();

    const learning: Learning = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      created_at: "2026-01-04T12:00:00Z",
      source: "user",
      scope: "global",
      title: "Always validate input",
      description: "Validate all user input at API boundaries",
      category: "pattern",
      tags: ["security", "validation"],
      confidence: "high",
      status: "approved",
    };

    await service.addGlobalLearning(learning);

    const globalMem = await service.getGlobalMemory();
    assertExists(globalMem);
    assertEquals(globalMem.learnings.length, 1);
    assertEquals(globalMem.learnings[0].title, "Always validate input");
    assertEquals(globalMem.statistics.total_learnings, 1);
    assertEquals(globalMem.statistics.by_category["pattern"], 1);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: addGlobalLearning updates markdown file", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await service.initGlobalMemory();

    const learning: Learning = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      created_at: "2026-01-04T12:00:00Z",
      source: "user",
      scope: "global",
      title: "Input Validation Pattern",
      description: "Always validate user input at API boundaries",
      category: "pattern",
      tags: ["security"],
      confidence: "high",
      status: "approved",
    };

    await service.addGlobalLearning(learning);

    const mdPath = join(getMemoryGlobalDir(config.system.root), "learnings.md");
    const content = await Deno.readTextFile(mdPath);
    assertStringIncludes(content, "Input Validation Pattern");
    assertStringIncludes(content, "Always validate user input");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: addGlobalLearning logs to Activity Journal", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await service.initGlobalMemory();

    const learning: Learning = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      created_at: "2026-01-04T12:00:00Z",
      source: "user",
      scope: "global",
      title: "Test learning",
      description: "Test description",
      category: "insight",
      tags: [],
      confidence: "medium",
      status: "approved",
    };

    await service.addGlobalLearning(learning);

    // Wait for batch flush
    await db.waitForFlush();

    // Check Activity Journal
    const activities = db.instance.prepare(
      "SELECT action_type, target FROM activity WHERE action_type = 'memory.global.learning.added'",
    ).all() as Array<{ action_type: string; target: string }>;
    assertEquals(activities.length, 1);
    assertEquals(activities[0].target, "global");
  } finally {
    await cleanup();
  }
});

// ===== Promote Learning Tests =====

Deno.test("MemoryBankService: promoteLearning moves from project to global", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    // Create project with a pattern/decision that could be promoted
    const projectMem: ProjectMemory = {
      portal: "my-app",
      overview: "Test project",
      patterns: [
        {
          name: "Repository Pattern",
          description: "All database access through repositories",
          examples: ["src/repos/user.ts"],
          tags: ["architecture"],
        },
      ],
      decisions: [],
      references: [],
    };
    await service.createProjectMemory(projectMem);
    await service.initGlobalMemory();

    // Promote the pattern as a learning
    const learningId = await service.promoteLearning("my-app", {
      type: "pattern",
      name: "Repository Pattern",
      title: "Repository Pattern (Promoted)",
      description: "All database access through repositories - promoted from my-app",
      category: "pattern",
      tags: ["architecture", "database"],
      confidence: "high",
    });

    assertExists(learningId);

    // Check it was added to global memory
    const globalMem = await service.getGlobalMemory();
    assertExists(globalMem);
    assertEquals(globalMem.learnings.length, 1);
    assertEquals(globalMem.learnings[0].title, "Repository Pattern (Promoted)");
    assertEquals(globalMem.learnings[0].project, "my-app");
    assertEquals(globalMem.statistics.by_project["my-app"], 1);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: promoteLearning logs to Activity Journal", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    const projectMem: ProjectMemory = {
      portal: "my-app",
      overview: "Test project",
      patterns: [],
      decisions: [
        {
          date: "2026-01-04",
          decision: "Use TypeScript",
          rationale: "Better type safety",
          tags: ["language"],
        },
      ],
      references: [],
    };
    await service.createProjectMemory(projectMem);
    await service.initGlobalMemory();

    await service.promoteLearning("my-app", {
      type: "decision",
      name: "Use TypeScript",
      title: "TypeScript for all projects",
      description: "Use TypeScript for better type safety",
      category: "decision",
      tags: ["language"],
      confidence: "high",
    });

    // Wait for batch flush
    await db.waitForFlush();

    const activities = db.instance.prepare(
      "SELECT action_type, target, payload FROM activity WHERE action_type = 'memory.learning.promoted'",
    ).all() as Array<{ action_type: string; target: string; payload: string }>;
    assertEquals(activities.length, 1);
    assertEquals(activities[0].target, "my-app");
    assertStringIncludes(activities[0].payload, "global");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: promoteLearning from non-existent project throws", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await service.initGlobalMemory();

    await assertRejects(
      async () => {
        await service.promoteLearning("non-existent", {
          type: "pattern",
          name: "Test",
          title: "Test",
          description: "Test",
          category: "pattern",
          tags: [],
          confidence: "medium",
        });
      },
      Error,
      "Project memory not found",
    );
  } finally {
    await cleanup();
  }
});

// ===== Demote Learning Tests =====

Deno.test("MemoryBankService: demoteLearning moves from global to project", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    // Create project and global memory
    const projectMem: ProjectMemory = {
      portal: "target-app",
      overview: "Target project",
      patterns: [],
      decisions: [],
      references: [],
    };
    await service.createProjectMemory(projectMem);
    await service.initGlobalMemory();

    // Add global learning
    const learning: Learning = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      created_at: "2026-01-04T12:00:00Z",
      source: "user",
      scope: "global",
      title: "Test Pattern",
      description: "A pattern to demote",
      category: "pattern",
      tags: ["test"],
      confidence: "high",
      status: "approved",
    };
    await service.addGlobalLearning(learning);

    // Demote to project
    await service.demoteLearning(learning.id, "target-app");

    // Verify removed from global
    const globalMem = await service.getGlobalMemory();
    assertExists(globalMem);
    assertEquals(globalMem.learnings.length, 0);

    // Verify added to project patterns
    const project = await service.getProjectMemory("target-app");
    assertExists(project);
    assertEquals(project.patterns.length, 1);
    assertEquals(project.patterns[0].name, "Test Pattern");
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: demoteLearning removes from global index", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    const projectMem: ProjectMemory = {
      portal: "target-app",
      overview: "Target",
      patterns: [],
      decisions: [],
      references: [],
    };
    await service.createProjectMemory(projectMem);
    await service.initGlobalMemory();

    // Add two learnings
    const learning1: Learning = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      created_at: "2026-01-04T12:00:00Z",
      source: "user",
      scope: "global",
      title: "Learning 1",
      description: "First learning",
      category: "pattern",
      tags: [],
      confidence: "high",
      status: "approved",
    };
    const learning2: Learning = {
      id: "550e8400-e29b-41d4-a716-446655440002",
      created_at: "2026-01-04T12:00:00Z",
      source: "user",
      scope: "global",
      title: "Learning 2",
      description: "Second learning",
      category: "insight",
      tags: [],
      confidence: "medium",
      status: "approved",
    };
    await service.addGlobalLearning(learning1);
    await service.addGlobalLearning(learning2);

    // Demote learning 1
    await service.demoteLearning(learning1.id, "target-app");

    // Global should have only learning 2
    const globalMem = await service.getGlobalMemory();
    assertExists(globalMem);
    assertEquals(globalMem.learnings.length, 1);
    assertEquals(globalMem.learnings[0].id, learning2.id);
    assertEquals(globalMem.statistics.total_learnings, 1);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: demoteLearning non-existent learning throws", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);

    const projectMem: ProjectMemory = {
      portal: "target-app",
      overview: "Target",
      patterns: [],
      decisions: [],
      references: [],
    };
    await service.createProjectMemory(projectMem);
    await service.initGlobalMemory();

    await assertRejects(
      async () => {
        await service.demoteLearning("non-existent-id", "target-app");
      },
      Error,
      "Learning not found",
    );
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: demoteLearning to non-existent project throws", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await service.initGlobalMemory();

    const learning: Learning = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      created_at: "2026-01-04T12:00:00Z",
      source: "user",
      scope: "global",
      title: "Test",
      description: "Test",
      category: "pattern",
      tags: [],
      confidence: "high",
      status: "approved",
    };
    await service.addGlobalLearning(learning);

    await assertRejects(
      async () => {
        await service.demoteLearning(learning.id, "non-existent-project");
      },
      Error,
      "Project memory not found",
    );
  } finally {
    await cleanup();
  }
});

// ===== Global Stats Tests =====

Deno.test("MemoryBankService: getGlobalStats returns accurate statistics", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await service.initGlobalMemory();

    // Add learnings with different categories
    const learnings: Learning[] = [
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        created_at: "2026-01-04T12:00:00Z",
        source: "user",
        scope: "global",
        project: "app-a",
        title: "Pattern 1",
        description: "Desc 1",
        category: "pattern",
        tags: [],
        confidence: "high",
        status: "approved",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440002",
        created_at: "2026-01-04T12:00:00Z",
        source: "user",
        scope: "global",
        project: "app-a",
        title: "Pattern 2",
        description: "Desc 2",
        category: "pattern",
        tags: [],
        confidence: "medium",
        status: "approved",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440003",
        created_at: "2026-01-04T12:00:00Z",
        source: "agent",
        scope: "global",
        project: "app-b",
        title: "Insight 1",
        description: "Desc 3",
        category: "insight",
        tags: [],
        confidence: "low",
        status: "approved",
      },
    ];

    for (const learning of learnings) {
      await service.addGlobalLearning(learning);
    }

    const globalMem = await service.getGlobalMemory();
    assertExists(globalMem);
    assertEquals(globalMem.statistics.total_learnings, 3);
    assertEquals(globalMem.statistics.by_category["pattern"], 2);
    assertEquals(globalMem.statistics.by_category["insight"], 1);
    assertEquals(globalMem.statistics.by_project["app-a"], 2);
    assertEquals(globalMem.statistics.by_project["app-b"], 1);
  } finally {
    await cleanup();
  }
});
