/**
 * Memory Search Service Tests
 *
 * Tests for tag-based search and keyword search with ranking:
 * - searchByTags() returns matching entries
 * - searchByTags with multiple tags uses AND logic
 * - searchByKeyword finds text matches
 * - searchByKeyword ranks by frequency
 * - Combined search uses tiered approach
 *
 * Phase 12.10: Tag-Based Search & Simple RAG
 */

import { assertEquals, assertExists, assertGreaterOrEqual } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { MemoryBankService } from "../../src/services/memory_bank.ts";
import { initTestDbService } from "../helpers/db.ts";
import type { Learning, ProjectMemory } from "../../src/schemas/memory_bank.ts";

// ===== Test Setup Helpers =====

/**
 * Create test project memory with tags
 */
async function setupTestProjectWithTags(
  service: MemoryBankService,
): Promise<void> {
  const projectMem: ProjectMemory = {
    portal: "search-test-project",
    overview: "A project for testing search functionality",
    patterns: [
      {
        name: "Repository Pattern",
        description: "Database access through repository classes",
        examples: ["src/repos/user_repo.ts"],
        tags: ["database", "architecture", "typescript"],
      },
      {
        name: "Factory Pattern",
        description: "Object creation using factory methods",
        examples: ["src/factories/user_factory.ts"],
        tags: ["creational", "design-pattern", "typescript"],
      },
      {
        name: "Observer Pattern",
        description: "Event-driven communication between objects",
        examples: ["src/events/event_bus.ts"],
        tags: ["behavioral", "design-pattern", "events"],
      },
    ],
    decisions: [
      {
        date: "2026-01-04",
        decision: "Use SQLite for local storage",
        rationale: "Lightweight, no external dependencies",
        tags: ["database", "architecture"],
      },
      {
        date: "2026-01-05",
        decision: "Adopt TypeScript strict mode",
        rationale: "Better type safety and IDE support",
        tags: ["typescript", "tooling"],
      },
    ],
    references: [],
  };

  await service.createProjectMemory(projectMem);
}

/**
 * Create test global learning with tags
 */
async function setupTestLearnings(
  _service: MemoryBankService,
  configRoot: string,
): Promise<void> {
  const learnings: Learning[] = [
    {
      id: "aaaaaaaa-1111-4000-8000-000000000001",
      created_at: new Date().toISOString(),
      source: "agent",
      scope: "global",
      title: "Error handling best practice",
      description: "Always wrap async operations in try-catch for proper error propagation",
      category: "pattern",
      tags: ["error-handling", "typescript", "async"],
      confidence: "high",
      status: "approved",
    },
    {
      id: "aaaaaaaa-1111-4000-8000-000000000002",
      created_at: new Date().toISOString(),
      source: "user",
      scope: "global",
      title: "Avoid callback hell",
      description: "Use async/await instead of nested callbacks for better readability",
      category: "anti-pattern",
      tags: ["async", "code-quality", "typescript"],
      confidence: "high",
      status: "approved",
    },
    {
      id: "aaaaaaaa-1111-4000-8000-000000000003",
      created_at: new Date().toISOString(),
      source: "execution",
      source_id: "trace-123",
      scope: "project",
      project: "search-test-project",
      title: "Database connection pooling",
      description: "Use connection pooling to avoid exhausting database connections",
      category: "insight",
      tags: ["database", "performance"],
      confidence: "medium",
      status: "approved",
    },
  ];

  // Write learnings to global memory
  const globalDir = join(configRoot, "Memory", "Global");
  await Deno.mkdir(globalDir, { recursive: true });
  await Deno.writeTextFile(
    join(globalDir, "learnings.json"),
    JSON.stringify(learnings, null, 2),
  );
}

// ===== searchByTags Tests =====

Deno.test("MemoryBankService: searchByTags returns matching entries (single tag)", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await setupTestProjectWithTags(service);
    await setupTestLearnings(service, config.system.root);

    // Search by single tag
    const results = await service.searchByTags(["typescript"]);

    // Should find patterns and learnings with 'typescript' tag
    assertGreaterOrEqual(results.length, 3);

    // All results should have the typescript tag
    for (const result of results) {
      assertExists(result.tags);
      assertEquals(result.tags?.includes("typescript"), true, `Result ${result.title} should have 'typescript' tag`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: searchByTags returns matching entries (database tag)", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await setupTestProjectWithTags(service);
    await setupTestLearnings(service, config.system.root);

    // Search by database tag
    const results = await service.searchByTags(["database"]);

    // Should find Repository Pattern, SQLite decision, and connection pooling learning
    assertGreaterOrEqual(results.length, 2);

    // All results should have the database tag
    for (const result of results) {
      assertExists(result.tags);
      assertEquals(result.tags?.includes("database"), true);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: searchByTags with multiple tags uses AND logic", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await setupTestProjectWithTags(service);
    await setupTestLearnings(service, config.system.root);

    // Search by multiple tags (AND logic)
    const results = await service.searchByTags(["typescript", "async"]);

    // Should only find items with BOTH tags
    assertGreaterOrEqual(results.length, 1);

    for (const result of results) {
      assertExists(result.tags);
      assertEquals(result.tags?.includes("typescript"), true);
      assertEquals(result.tags?.includes("async"), true);
    }
  } finally {
    await cleanup();
  }
});

// ===== searchByKeyword Tests =====

Deno.test("MemoryBankService: searchByKeyword finds text matches in titles", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await setupTestProjectWithTags(service);
    await setupTestLearnings(service, config.system.root);

    // Search by keyword in title
    const results = await service.searchByKeyword("pattern");

    // Should find patterns with "Pattern" in the name
    assertGreaterOrEqual(results.length, 3);

    // Check that results contain expected items
    const titles = results.map((r) => r.title.toLowerCase());
    assertEquals(titles.some((t) => t.includes("repository")), true);
    assertEquals(titles.some((t) => t.includes("factory")), true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: searchByKeyword finds text matches in descriptions", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await setupTestProjectWithTags(service);
    await setupTestLearnings(service, config.system.root);

    // Search by keyword in description
    const results = await service.searchByKeyword("async");

    // Should find learnings with "async" in description
    assertGreaterOrEqual(results.length, 1);

    // Check that results contain expected items
    const descriptions = results.map((r) => r.summary.toLowerCase());
    assertEquals(descriptions.some((d) => d.includes("async")), true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: searchByKeyword ranks by frequency", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await setupTestProjectWithTags(service);
    await setupTestLearnings(service, config.system.root);

    // Search by keyword that appears multiple times in some entries
    const results = await service.searchByKeyword("database");

    // Results should be sorted by relevance score
    assertGreaterOrEqual(results.length, 2);

    // Verify results are sorted by relevance (descending)
    for (let i = 1; i < results.length; i++) {
      const prevScore = results[i - 1].relevance_score ?? 0;
      const currScore = results[i].relevance_score ?? 0;
      assertGreaterOrEqual(
        prevScore,
        currScore,
        `Results should be sorted by relevance: ${prevScore} >= ${currScore}`,
      );
    }
  } finally {
    await cleanup();
  }
});

// ===== Combined Search Tests =====

Deno.test("MemoryBankService: combined search uses tiered approach (tags first)", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await setupTestProjectWithTags(service);
    await setupTestLearnings(service, config.system.root);

    // Combined search with tags and keyword
    const results = await service.searchMemoryAdvanced({
      tags: ["typescript"],
      keyword: "pattern",
    });

    // Tag matches should have higher relevance than keyword-only matches
    assertGreaterOrEqual(results.length, 1);

    // First result should have both tag and keyword match (highest relevance)
    const topResult = results[0];
    assertExists(topResult.tags);
    assertEquals(topResult.tags?.includes("typescript"), true);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: combined search falls back to keyword if no tag matches", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await setupTestProjectWithTags(service);

    // Search with non-existent tag but valid keyword
    const results = await service.searchMemoryAdvanced({
      tags: ["nonexistent-tag"],
      keyword: "database",
    });

    // Should still return keyword matches even though no tag matches
    assertGreaterOrEqual(results.length, 1);
  } finally {
    await cleanup();
  }
});

// ===== Edge Cases =====

Deno.test("MemoryBankService: searchByTags returns empty array for non-existent tags", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await setupTestProjectWithTags(service);

    const results = await service.searchByTags(["nonexistent-tag-xyz"]);
    assertEquals(results.length, 0);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: searchByKeyword returns empty array for non-matching keywords", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await setupTestProjectWithTags(service);

    const results = await service.searchByKeyword("zzzznonexistentkeywordzzz");
    assertEquals(results.length, 0);
  } finally {
    await cleanup();
  }
});

Deno.test("MemoryBankService: searchByTags is case-insensitive", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new MemoryBankService(config, db);
    await setupTestProjectWithTags(service);

    // Search with different cases
    const upperResults = await service.searchByTags(["TYPESCRIPT"]);
    const lowerResults = await service.searchByTags(["typescript"]);
    const mixedResults = await service.searchByTags(["TypeScript"]);

    // All should return the same results
    assertEquals(upperResults.length, lowerResults.length);
    assertEquals(upperResults.length, mixedResults.length);
  } finally {
    await cleanup();
  }
});
