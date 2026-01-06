/**
 * Memory Integration Tests
 *
 * End-to-end tests for Memory Banks v2 workflows:
 * - Full workflow: execution → extract → approve → search
 * - Promote workflow: project → global
 * - Search workflow: tag + keyword + embedding
 * - CLI workflow: complete command sequence
 *
 * Phase 12.11: Integration & Documentation
 */

import { assertEquals, assertExists, assertGreaterOrEqual, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { MemoryBankService } from "../../src/services/memory_bank.ts";
import { MemoryExtractorService } from "../../src/services/memory_extractor.ts";
import { MemoryEmbeddingService } from "../../src/services/memory_embedding.ts";
import { MemoryCommands } from "../../src/cli/memory_commands.ts";
import { initTestDbService } from "../helpers/db.ts";
import type { ExecutionMemory, Learning, ProjectMemory } from "../../src/schemas/memory_bank.ts";
import { getMemoryGlobalDir } from "../helpers/paths_helper.ts";

// ===== Full Workflow Tests =====

Deno.test("Integration: full workflow - execution → extract → approve → search", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const memoryBank = new MemoryBankService(config, db);
    const extractor = new MemoryExtractorService(config, db, memoryBank);
    const _embedding = new MemoryEmbeddingService(config);

    // Step 1: Create project memory
    const projectMem: ProjectMemory = {
      portal: "integration-test-portal",
      overview: "Integration test project",
      patterns: [],
      decisions: [],
      references: [],
    };
    await memoryBank.createProjectMemory(projectMem);

    // Step 2: Simulate execution completion
    const execution: ExecutionMemory = {
      trace_id: "dddddddd-4444-4000-8000-000000000001",
      request_id: "REQ-INT-001",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "completed",
      portal: "integration-test-portal",
      agent: "test-agent",
      summary: "Implemented error handling middleware with proper async/await patterns",
      context_files: ["src/middleware/error.ts"],
      context_portals: ["integration-test-portal"],
      changes: {
        files_created: ["src/middleware/error.ts"],
        files_modified: ["src/app.ts"],
        files_deleted: [],
      },
      lessons_learned: ["Always use try-catch for async middleware"],
    };
    await memoryBank.createExecutionRecord(execution);

    // Step 3: Extract learnings using analyzeExecution
    const extractedLearnings = extractor.analyzeExecution(execution);
    assertGreaterOrEqual(extractedLearnings.length, 1);

    // Step 4: Create proposal from learning
    const proposalId = await extractor.createProposal(extractedLearnings[0], execution, execution.agent);
    assertExists(proposalId);

    // Step 5: Verify pending proposal exists
    const pending = await extractor.listPending();
    assertGreaterOrEqual(pending.length, 1);

    // Step 6: Approve the proposal
    await extractor.approvePending(proposalId);

    // Step 7: Verify learning was merged as pattern to project (scope: project)
    // When scope is "project", approval adds as pattern, not global learning
    const updatedProjectMem = await memoryBank.getProjectMemory("integration-test-portal");
    assertExists(updatedProjectMem);
    assertGreaterOrEqual(updatedProjectMem.patterns.length, 1);

    // Step 8: Search for the pattern
    const searchResults = await memoryBank.searchByKeyword("try-catch");
    assertGreaterOrEqual(searchResults.length, 1);
  } finally {
    await cleanup();
  }
});

Deno.test("Integration: execution failure extracts troubleshooting learning", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const memoryBank = new MemoryBankService(config, db);
    const extractor = new MemoryExtractorService(config, db, memoryBank);

    // Create project
    await memoryBank.createProjectMemory({
      portal: "failure-test-portal",
      overview: "Test portal for failure handling",
      patterns: [],
      decisions: [],
      references: [],
    });

    // Create failed execution
    const execution: ExecutionMemory = {
      trace_id: "eeeeeeee-5555-4000-8000-000000000001",
      request_id: "REQ-FAIL-001",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "failed",
      portal: "failure-test-portal",
      agent: "test-agent",
      summary: "Failed to parse configuration file",
      context_files: ["config.json"],
      context_portals: ["failure-test-portal"],
      changes: {
        files_created: [],
        files_modified: [],
        files_deleted: [],
      },
      error_message: "Invalid JSON: Unexpected token at position 42",
    };
    await memoryBank.createExecutionRecord(execution);

    // Extract learnings from failure using analyzeExecution
    const learnings = extractor.analyzeExecution(execution);

    // Should extract troubleshooting learning
    assertGreaterOrEqual(learnings.length, 1);
    const learning = learnings[0];
    assertEquals(learning.category, "troubleshooting");
    assertStringIncludes(learning.description.toLowerCase(), "json");
  } finally {
    await cleanup();
  }
});

Deno.test("Integration: promote workflow - project → global", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const memoryBank = new MemoryBankService(config, db);

    // Create project with a pattern
    await memoryBank.createProjectMemory({
      portal: "promote-test-portal",
      overview: "Test portal for promotion",
      patterns: [
        {
          name: "Singleton Pattern",
          description: "Ensures only one instance of a class exists",
          examples: ["src/config.ts"],
          tags: ["creational", "design-pattern"],
        },
      ],
      decisions: [],
      references: [],
    });

    // Promote learning to global
    const learning: Learning = {
      id: "ffffffff-6666-4000-8000-000000000001",
      created_at: new Date().toISOString(),
      source: "user",
      scope: "global",
      title: "Singleton Pattern Best Practice",
      description: "Use lazy initialization for singletons to avoid startup overhead",
      category: "pattern",
      tags: ["singleton", "design-pattern", "performance"],
      confidence: "high",
      status: "approved",
    };

    await memoryBank.addGlobalLearning(learning);

    // Verify global learning exists
    const searchResults = await memoryBank.searchByTags(["singleton"]);
    assertGreaterOrEqual(searchResults.length, 1);
    assertEquals(searchResults[0].title, "Singleton Pattern Best Practice");
  } finally {
    await cleanup();
  }
});

// ===== Search Workflow Tests =====

Deno.test("Integration: search workflow - tag + keyword + embedding combined", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const memoryBank = new MemoryBankService(config, db);
    const embedding = new MemoryEmbeddingService(config);

    // Create diverse test data
    await memoryBank.createProjectMemory({
      portal: "search-workflow-portal",
      overview: "A project focused on database optimization",
      patterns: [
        {
          name: "Connection Pooling",
          description: "Reuse database connections for better performance",
          examples: ["src/db/pool.ts"],
          tags: ["database", "performance", "optimization"],
        },
        {
          name: "Query Builder",
          description: "Build SQL queries programmatically",
          examples: ["src/db/query.ts"],
          tags: ["database", "sql", "architecture"],
        },
      ],
      decisions: [
        {
          date: "2026-01-04",
          decision: "Use connection pooling",
          rationale: "Reduce connection overhead",
          tags: ["database", "performance"],
        },
      ],
      references: [],
    });

    // Add global learnings
    const learnings: Learning[] = [
      {
        id: "11111111-aaaa-4000-8000-000000000001",
        created_at: new Date().toISOString(),
        source: "agent",
        scope: "global",
        title: "Database indexing strategy",
        description: "Create indexes on frequently queried columns for optimal database performance",
        category: "insight",
        tags: ["database", "performance", "indexing"],
        confidence: "high",
        status: "approved",
      },
      {
        id: "11111111-aaaa-4000-8000-000000000002",
        created_at: new Date().toISOString(),
        source: "user",
        scope: "global",
        title: "Error logging best practice",
        description: "Always log errors with stack traces and context for debugging",
        category: "pattern",
        tags: ["error-handling", "logging", "debugging"],
        confidence: "high",
        status: "approved",
      },
    ];

    const globalDir = getMemoryGlobalDir(config.system.root);
    await Deno.mkdir(globalDir, { recursive: true });
    await Deno.writeTextFile(
      join(globalDir, "learnings.json"),
      JSON.stringify(learnings, null, 2),
    );

    // Initialize embedding manifest and embed learnings
    await embedding.initializeManifest();
    for (const learning of learnings) {
      await embedding.embedLearning(learning);
    }

    // Test tag-based search
    const tagResults = await memoryBank.searchByTags(["database"]);
    assertGreaterOrEqual(tagResults.length, 2);

    // Test keyword search
    const keywordResults = await memoryBank.searchByKeyword("performance");
    assertGreaterOrEqual(keywordResults.length, 2);

    // Test combined search
    const combinedResults = await memoryBank.searchMemoryAdvanced({
      tags: ["database"],
      keyword: "performance",
    });
    assertGreaterOrEqual(combinedResults.length, 1);

    // Test embedding search with lower threshold for mock embeddings
    // Mock embeddings may not achieve high similarity, so we use threshold 0
    const embeddingResults = await embedding.searchByEmbedding("database indexing", { threshold: 0, limit: 20 });
    // With threshold 0, we should get all embeddings back
    assertGreaterOrEqual(embeddingResults.length, 1);
  } finally {
    await cleanup();
  }
});

// ===== CLI Workflow Tests =====

Deno.test("Integration: CLI workflow - complete command sequence", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const commands = new MemoryCommands({ config, db });

    // Step 1: List (should be empty or minimal)
    const listResult = await commands.list("table");
    assertExists(listResult);

    // Step 2: Create project memory via service (simulating real usage)
    const memoryBank = new MemoryBankService(config, db);
    await memoryBank.createProjectMemory({
      portal: "cli-test-portal",
      overview: "CLI integration test project",
      patterns: [
        {
          name: "Factory Pattern",
          description: "Object creation through factory methods",
          examples: ["src/factories/user.ts"],
          tags: ["creational", "design-pattern"],
        },
      ],
      decisions: [],
      references: [],
    });

    // Step 3: List projects
    const projectListResult = await commands.projectList("table");
    assertStringIncludes(projectListResult, "cli-test-portal");

    // Step 4: Show project
    const projectShowResult = await commands.projectShow("cli-test-portal", "table");
    assertStringIncludes(projectShowResult, "Factory Pattern");

    // Step 5: Search
    const searchResult = await commands.search("factory", { format: "table" });
    assertStringIncludes(searchResult, "Factory");

    // Step 6: Rebuild index
    const rebuildResult = await commands.rebuildIndex();
    assertStringIncludes(rebuildResult, "rebuilt");
  } finally {
    await cleanup();
  }
});

Deno.test("Integration: CLI pending workflow - list → approve → verify", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const commands = new MemoryCommands({ config, db });
    const memoryBank = new MemoryBankService(config, db);
    const extractor = new MemoryExtractorService(config, db, memoryBank);

    // Create test data
    await memoryBank.createProjectMemory({
      portal: "pending-cli-portal",
      overview: "Pending CLI test",
      patterns: [],
      decisions: [],
      references: [],
    });

    const execution: ExecutionMemory = {
      trace_id: "22222222-bbbb-4000-8000-000000000001",
      request_id: "REQ-CLI-001",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "completed",
      portal: "pending-cli-portal",
      agent: "test-agent",
      summary: "Added validation middleware",
      context_files: ["src/validate.ts"],
      context_portals: ["pending-cli-portal"],
      changes: {
        files_created: ["src/validate.ts"],
        files_modified: [],
        files_deleted: [],
      },
      lessons_learned: ["Input validation should happen at API boundaries"],
    };
    await memoryBank.createExecutionRecord(execution);

    // Extract learnings and create proposal
    const learnings = extractor.analyzeExecution(execution);
    assertGreaterOrEqual(learnings.length, 1);
    await extractor.createProposal(learnings[0], execution, execution.agent);

    // List pending via CLI
    const pendingList = await commands.pendingList("table");
    assertStringIncludes(pendingList, "pending");

    // Get the proposal ID
    const pending = await extractor.listPending();
    assertGreaterOrEqual(pending.length, 1);
    const proposalId = pending[0].id;

    // Approve via CLI
    const approveResult = await commands.pendingApprove(proposalId);
    assertStringIncludes(approveResult, "approved");

    // Verify no more pending
    const emptyPending = await extractor.listPending();
    assertEquals(emptyPending.length, 0);
  } finally {
    await cleanup();
  }
});

// ===== Performance Tests =====

Deno.test("Integration: performance - search completes under 100ms", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const memoryBank = new MemoryBankService(config, db);

    // Create some test data
    await memoryBank.createProjectMemory({
      portal: "perf-test-portal",
      overview: "Performance test project with various patterns",
      patterns: Array.from({ length: 20 }, (_, i) => ({
        name: `Pattern ${i}`,
        description: `Description for pattern ${i} with some searchable text`,
        examples: [`src/pattern${i}.ts`],
        tags: ["test", `tag${i % 5}`],
      })),
      decisions: Array.from({ length: 10 }, (_, i) => ({
        date: `2026-01-0${(i % 9) + 1}`,
        decision: `Decision ${i}`,
        rationale: `Rationale for decision ${i}`,
        tags: ["decision", `tag${i % 3}`],
      })),
      references: [],
    });

    // Measure search time
    const startTime = performance.now();
    await memoryBank.searchMemory("pattern");
    const searchTime = performance.now() - startTime;

    // Search should complete in under 100ms
    assertGreaterOrEqual(100, searchTime, `Search took ${searchTime}ms, expected < 100ms`);
  } finally {
    await cleanup();
  }
});

Deno.test("Integration: performance - embedding search completes under 500ms", async () => {
  const { db: _db, config, cleanup } = await initTestDbService();

  try {
    const embedding = new MemoryEmbeddingService(config);

    // Create and embed some learnings
    const learnings: Learning[] = Array.from({ length: 20 }, (_, i) => ({
      id: `33333333-cccc-4000-8000-00000000000${i.toString().padStart(2, "0")}`,
      created_at: new Date().toISOString(),
      source: "agent" as const,
      scope: "global" as const,
      title: `Learning ${i}`,
      description: `Description for learning ${i} with some searchable content`,
      category: "insight" as const,
      tags: [`tag${i % 5}`],
      confidence: "medium" as const,
      status: "approved" as const,
    }));

    for (const learning of learnings) {
      await embedding.embedLearning(learning);
    }

    // Measure embedding search time
    const startTime = performance.now();
    await embedding.searchByEmbedding("searchable content");
    const searchTime = performance.now() - startTime;

    // Embedding search should complete in under 500ms
    assertGreaterOrEqual(500, searchTime, `Embedding search took ${searchTime}ms, expected < 500ms`);
  } finally {
    await cleanup();
  }
});
