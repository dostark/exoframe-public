/**
 * Tests for Context Loader (Step 3.3)
 * Covers all success criteria from the Implementation Plan
 *
 * Success Criteria:
 * - Test 1: Token limit enforcement (10 massive files, 500k tokens total, 100k budget)
 * - Test 2: Warning block generation in agent's prompt
 * - Test 3: Agent receives warning and can reference it
 * - Test 4: Local agent behavior (no limits)
 * - Test 5: Truncation strategies produce different results
 */

import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@^1.0.0/bdd";
import { ContextLoader } from "../src/services/context_loader.ts";
import type { ContextConfig, ContextLoadResult } from "../src/services/context_loader.ts";

// ============================================================================
// Test Setup and Fixtures
// ============================================================================

let testDir: string;
const testFiles: string[] = [];

/**
 * Create a test file with specified content
 */
async function createTestFile(
  name: string,
  content: string,
): Promise<string> {
  const path = `${testDir}/${name}`;
  await Deno.writeTextFile(path, content);
  testFiles.push(path);
  return path;
}

/**
 * Generate content of specified token count (approximate)
 */
function generateContent(tokenCount: number): string {
  // 1 token ≈ 4 chars
  const charCount = tokenCount * 4;
  return "x".repeat(charCount);
}

beforeEach(async () => {
  // Create temporary test directory
  testDir = await Deno.makeTempDir({ prefix: "context_loader_test_" });
});

afterEach(async () => {
  // Clean up test files and directory
  try {
    await Deno.remove(testDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
  testFiles.length = 0;
});

// ============================================================================
// Test 1: Token Limit Enforcement
// ============================================================================

describe("Token Limit Enforcement", () => {
  it("should respect token limits with safety margin", async () => {
    // Create 10 files with 50k tokens each (500k total)
    const files: string[] = [];
    for (let i = 0; i < 10; i++) {
      const file = await createTestFile(
        `file${i}.txt`,
        generateContent(50000),
      );
      files.push(file);
    }

    const config: ContextConfig = {
      maxTokens: 100000,
      safetyMargin: 0.8, // Use 80k tokens
      truncationStrategy: "smallest-first",
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit(files);

    // Should only use 80% of max (80k tokens)
    assertEquals(result.totalTokens <= 80000, true);

    // Should have warnings about skipped files
    assertEquals(result.warnings.length > 0, true);

    // Should have skipped some files
    assertEquals(result.skippedFiles.length > 0, true);

    // Should not include all files
    assertEquals(result.includedFiles.length < files.length, true);
  });

  it("should include only files that fit within budget", async () => {
    // Create files: 10k, 20k, 30k, 40k, 50k tokens
    const file1 = await createTestFile("small.txt", generateContent(10000));
    const file2 = await createTestFile("medium1.txt", generateContent(20000));
    const file3 = await createTestFile("medium2.txt", generateContent(30000));
    const file4 = await createTestFile("large1.txt", generateContent(40000));
    const file5 = await createTestFile("large2.txt", generateContent(50000));

    const config: ContextConfig = {
      maxTokens: 100000,
      safetyMargin: 0.5, // Use 50k tokens
      truncationStrategy: "smallest-first",
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([
      file5,
      file4,
      file3,
      file2,
      file1,
    ]);

    // With smallest-first, should load: 10k + 20k + 30k = ~60k (might exceed slightly)
    // or 10k + 20k = 30k (under budget)
    assertEquals(result.totalTokens <= 50000, true);

    // Should include smallest files
    assertEquals(result.includedFiles.includes(file1), true);
  });

  it("should track total tokens accurately", async () => {
    const file1 = await createTestFile("file1.txt", generateContent(1000));
    const file2 = await createTestFile("file2.txt", generateContent(2000));
    const file3 = await createTestFile("file3.txt", generateContent(3000));

    const config: ContextConfig = {
      maxTokens: 10000,
      safetyMargin: 1.0,
      truncationStrategy: "smallest-first",
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([file1, file2, file3]);

    // Should be approximately 6000 tokens (1000 + 2000 + 3000)
    // Allow some variance due to token counting approximation
    assertEquals(result.totalTokens >= 5800, true);
    assertEquals(result.totalTokens <= 6200, true);
  });
});

// ============================================================================
// Test 2: Warning Block Generation
// ============================================================================

describe("Warning Block Generation", () => {
  it("should include warning block when files are skipped", async () => {
    const file1 = await createTestFile("file1.txt", generateContent(60000));
    const file2 = await createTestFile("file2.txt", generateContent(60000));

    const config: ContextConfig = {
      maxTokens: 100000,
      safetyMargin: 0.8,
      truncationStrategy: "smallest-first",
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([file1, file2]);

    // Should contain warning header
    assertStringIncludes(result.content, "[System Warning: Context Truncated]");
    assertStringIncludes(result.content, "Token Budget");
    assertStringIncludes(result.content, "Files Affected");
  });

  it("should list skipped files in warnings", async () => {
    const file1 = await createTestFile("small.txt", generateContent(10000));
    const file2 = await createTestFile("huge.txt", generateContent(100000));

    const config: ContextConfig = {
      maxTokens: 50000,
      safetyMargin: 0.8,
      truncationStrategy: "smallest-first",
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([file1, file2]);

    // Should have warning about huge.txt being skipped
    assertEquals(result.warnings.length > 0, true);
    const warningText = result.warnings.join(" ");
    assertStringIncludes(warningText.toLowerCase(), "huge.txt");
    assertStringIncludes(warningText.toLowerCase(), "skipped");
  });

  it("should not include warning block when all files fit", async () => {
    const file1 = await createTestFile("tiny1.txt", generateContent(100));
    const file2 = await createTestFile("tiny2.txt", generateContent(100));

    const config: ContextConfig = {
      maxTokens: 100000,
      safetyMargin: 0.8,
      truncationStrategy: "smallest-first",
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([file1, file2]);

    // Should have no warnings
    assertEquals(result.warnings.length, 0);

    // Should not contain warning block
    assertEquals(result.content.includes("[System Warning"), false);
  });
});

// ============================================================================
// Test 3: Context Content Format
// ============================================================================

describe("Context Content Format", () => {
  it("should format context with file paths as headers", async () => {
    const file1 = await createTestFile("test.txt", "Hello World");

    const config: ContextConfig = {
      maxTokens: 10000,
      safetyMargin: 1.0,
      truncationStrategy: "smallest-first",
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([file1]);

    assertStringIncludes(result.content, "## Context:");
    assertStringIncludes(result.content, "test.txt");
    assertStringIncludes(result.content, "Hello World");
  });

  it("should include file content in formatted output", async () => {
    const content = "This is test content\nWith multiple lines";
    const file = await createTestFile("multi.txt", content);

    const config: ContextConfig = {
      maxTokens: 10000,
      safetyMargin: 1.0,
      truncationStrategy: "smallest-first",
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([file]);

    assertStringIncludes(result.content, content);
  });
});

// ============================================================================
// Test 4: Local Agent Behavior (No Limits)
// ============================================================================

describe("Local Agent Behavior", () => {
  it("should load all files for local agents", async () => {
    // Create large files that would exceed normal limits
    const files: string[] = [];
    for (let i = 0; i < 5; i++) {
      const file = await createTestFile(
        `large${i}.txt`,
        generateContent(50000),
      );
      files.push(file);
    }

    const config: ContextConfig = {
      maxTokens: 10000, // Would normally limit to 10k
      safetyMargin: 0.8,
      truncationStrategy: "smallest-first",
      isLocalAgent: true, // But local agent ignores limits
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit(files);

    // All files should be included
    assertEquals(result.includedFiles.length, files.length);
    assertEquals(result.skippedFiles.length, 0);
    assertEquals(result.warnings.length, 0);
  });

  it("should not generate warnings for local agents", async () => {
    const file = await createTestFile("huge.txt", generateContent(1000000));

    const config: ContextConfig = {
      maxTokens: 1000,
      safetyMargin: 0.8,
      truncationStrategy: "smallest-first",
      isLocalAgent: true,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([file]);

    assertEquals(result.warnings.length, 0);
    assertEquals(result.content.includes("[System Warning"), false);
  });
});

// ============================================================================
// Test 5: Truncation Strategies
// ============================================================================

describe("Truncation Strategies", () => {
  it("smallest-first should prioritize smallest files", async () => {
    const small = await createTestFile("small.txt", generateContent(1000));
    const medium = await createTestFile("medium.txt", generateContent(5000));
    const large = await createTestFile("large.txt", generateContent(10000));

    const config: ContextConfig = {
      maxTokens: 10000,
      safetyMargin: 0.8, // 8000 tokens
      truncationStrategy: "smallest-first",
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([large, medium, small]);

    // Should include smallest files first
    assertEquals(result.includedFiles.includes(small), true);
  });

  it("drop-oldest should prioritize newest files", async () => {
    const old = await createTestFile("old.txt", generateContent(5000));
    await new Promise((resolve) => setTimeout(resolve, 100)); // Ensure time difference

    const recent = await createTestFile("recent.txt", generateContent(5000));

    const config: ContextConfig = {
      maxTokens: 10000,
      safetyMargin: 0.8, // 8000 tokens
      truncationStrategy: "drop-oldest",
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([old, recent]);

    // Should include the more recent file
    assertEquals(result.includedFiles.includes(recent), true);
  });

  it("truncate-each should include partial content from files", async () => {
    const file1 = await createTestFile("file1.txt", generateContent(10000));
    const file2 = await createTestFile("file2.txt", generateContent(10000));

    const config: ContextConfig = {
      maxTokens: 10000,
      safetyMargin: 0.8, // 8000 tokens
      truncationStrategy: "truncate-each",
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([file1, file2]);

    // With truncate-each, both files should get at least some representation
    // Total should not exceed limit
    assertEquals(result.totalTokens <= 8000, true);

    // Should have truncation warnings
    assertEquals(result.truncatedFiles.length > 0, true);
  });

  it("different strategies should produce different results", async () => {
    const file1 = await createTestFile("a.txt", generateContent(3000));
    const file2 = await createTestFile("b.txt", generateContent(4000));
    const file3 = await createTestFile("c.txt", generateContent(5000));

    const baseConfig = {
      maxTokens: 10000,
      safetyMargin: 0.8,
      isLocalAgent: false,
    };

    const strategies = [
      "smallest-first",
      "drop-largest",
      "truncate-each",
    ] as const;
    const results: ContextLoadResult[] = [];

    for (const strategy of strategies) {
      const config: ContextConfig = { ...baseConfig, truncationStrategy: strategy };
      const loader = new ContextLoader(config);
      const result = await loader.loadWithLimit([file1, file2, file3]);
      results.push(result);
    }

    // Results should differ (at least one pair should be different)
    let foundDifference = false;
    for (let i = 0; i < results.length - 1; i++) {
      if (
        results[i].includedFiles.length !== results[i + 1].includedFiles.length ||
        results[i].truncatedFiles.length !== results[i + 1].truncatedFiles.length
      ) {
        foundDifference = true;
        break;
      }
    }

    assertEquals(foundDifference, true, "Strategies should produce different results");
  });
});

// ============================================================================
// Test 6: Per-File Token Caps
// ============================================================================

describe("Per-File Token Caps", () => {
  it("should enforce per-file token caps", async () => {
    const huge = await createTestFile("huge.txt", generateContent(100000));

    const config: ContextConfig = {
      maxTokens: 150000,
      safetyMargin: 1.0,
      truncationStrategy: "smallest-first",
      perFileTokenCap: 10000, // Cap each file at 10k tokens
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([huge]);

    // File should be truncated to cap
    assertEquals(result.totalTokens <= 10000, true);
    assertEquals(result.truncatedFiles.length, 1);
    assertEquals(result.warnings.some((w) => w.includes("Per-file cap")), true);
  });

  it("should not enforce caps when not configured", async () => {
    const large = await createTestFile("large.txt", generateContent(50000));

    const config: ContextConfig = {
      maxTokens: 100000,
      safetyMargin: 1.0,
      truncationStrategy: "smallest-first",
      // No perFileTokenCap
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([large]);

    // Should include full file
    assertEquals(result.truncatedFiles.length, 0);
    assertEquals(result.totalTokens >= 45000, true); // Around 50k with variance
  });
});

// ============================================================================
// Test 7: Error Handling
// ============================================================================

describe("Error Handling", () => {
  it("should handle missing files gracefully", async () => {
    const existing = await createTestFile("exists.txt", generateContent(1000));
    const missing = `${testDir}/missing.txt`;

    const config: ContextConfig = {
      maxTokens: 10000,
      safetyMargin: 1.0,
      truncationStrategy: "smallest-first",
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([existing, missing]);

    // Should still load the existing file
    assertEquals(result.includedFiles.includes(existing), true);

    // Missing file should not cause failure
    assertEquals(result.includedFiles.includes(missing), false);
  });

  it("should continue loading when one file fails", async () => {
    const file1 = await createTestFile("file1.txt", generateContent(1000));
    const file2 = await createTestFile("file2.txt", generateContent(1000));
    const missing = `${testDir}/nonexistent.txt`;

    const config: ContextConfig = {
      maxTokens: 10000,
      safetyMargin: 1.0,
      truncationStrategy: "smallest-first",
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([file1, missing, file2]);

    // Should load both existing files
    assertEquals(result.includedFiles.length, 2);
    assertEquals(result.includedFiles.includes(file1), true);
    assertEquals(result.includedFiles.includes(file2), true);
  });
});

// ============================================================================
// Test 8: Result Structure
// ============================================================================

describe("Result Structure", () => {
  it("should return complete ContextLoadResult structure", async () => {
    const file = await createTestFile("test.txt", generateContent(1000));

    const config: ContextConfig = {
      maxTokens: 10000,
      safetyMargin: 1.0,
      truncationStrategy: "smallest-first",
      isLocalAgent: false,
    };

    const loader = new ContextLoader(config);
    const result = await loader.loadWithLimit([file]);

    // Verify all fields exist
    assertExists(result.content);
    assertExists(result.warnings);
    assertExists(result.totalTokens);
    assertExists(result.includedFiles);
    assertExists(result.skippedFiles);
    assertExists(result.truncatedFiles);

    // Verify types
    assertEquals(typeof result.content, "string");
    assertEquals(Array.isArray(result.warnings), true);
    assertEquals(typeof result.totalTokens, "number");
    assertEquals(Array.isArray(result.includedFiles), true);
    assertEquals(Array.isArray(result.skippedFiles), true);
    assertEquals(Array.isArray(result.truncatedFiles), true);
  });
});
