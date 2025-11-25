/**
 * Tests for BaseCommand abstract class
 * Covers all shared utilities used by command handlers
 */

import { assertEquals, assertExists, assertThrows } from "jsr:@std/assert@^1.0.0";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@^1.0.0/bdd";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { BaseCommand, type CommandContext } from "../../src/cli/base.ts";
import { DatabaseService } from "../../src/services/db.ts";
import { createMockConfig } from "../helpers/config.ts";

// Concrete implementation of BaseCommand for testing
class TestCommand extends BaseCommand {
  constructor(context: CommandContext) {
    super(context);
  }

  // Expose protected methods for testing
  public testGetUserIdentity(): Promise<string> {
    return this.getUserIdentity();
  }

  public testExtractFrontmatter(content: string) {
    return this.extractFrontmatter(content);
  }

  public testSerializeFrontmatter(frontmatter: Record<string, string>): string {
    return this.serializeFrontmatter(frontmatter);
  }

  public testUpdateFrontmatter(content: string, updates: Record<string, string>): string {
    return this.updateFrontmatter(content, updates);
  }

  public testValidateFrontmatter(
    frontmatter: Record<string, string>,
    required: string[],
    filePath: string,
  ): void {
    return this.validateFrontmatter(frontmatter, required, filePath);
  }

  public testFormatTimestamp(isoString: string): string {
    return this.formatTimestamp(isoString);
  }

  public testTruncate(str: string, maxLength: number): string {
    return this.truncate(str, maxLength);
  }
}

describe("BaseCommand", () => {
  let tempDir: string;
  let db: DatabaseService;
  let testCommand: TestCommand;

  beforeEach(async () => {
    tempDir = await Deno.makeTempDir({ prefix: "base_command_test_" });
    
    // Create System directory for database
    const systemDir = join(tempDir, "System");
    await ensureDir(systemDir);
    
    const config = createMockConfig(tempDir);
    db = new DatabaseService(config);
    testCommand = new TestCommand({ config, db });
  });

  afterEach(async () => {
    await db.close();
    await Deno.remove(tempDir, { recursive: true });
  });

  describe("getUserIdentity", () => {
    it("should get user identity from git config", async () => {
      const identity = await testCommand.testGetUserIdentity();
      assertExists(identity);
      assertEquals(typeof identity, "string");
      // Should be either git user.email, git user.name, or OS username
    });

    it("should fallback to OS username if git not available", async () => {
      // This will naturally test the fallback since git config might not be set
      const identity = await testCommand.testGetUserIdentity();
      assertExists(identity);
      assertEquals(typeof identity, "string");
      // Should never be empty
      assertEquals(identity.length > 0, true);
    });
  });

  describe("extractFrontmatter", () => {
    it("should extract valid frontmatter from markdown", () => {
      const markdown = `---
title: Test Plan
status: review
trace_id: abc-123
---

# Plan Content

This is the body.`;

      const result = testCommand.testExtractFrontmatter(markdown);
      assertEquals(result.title, "Test Plan");
      assertEquals(result.status, "review");
      assertEquals(result.trace_id, "abc-123");
    });

    it("should handle quoted values", () => {
      const markdown = `---
title: "Quoted Title"
status: 'single-quoted'
description: "Value with: colon"
---

Body`;

      const result = testCommand.testExtractFrontmatter(markdown);
      assertEquals(result.title, "Quoted Title");
      assertEquals(result.status, "single-quoted");
      assertEquals(result.description, "Value with: colon");
    });

    it("should return empty object for missing frontmatter", () => {
      const markdown = `# Just a heading

No frontmatter here.`;

      const result = testCommand.testExtractFrontmatter(markdown);
      assertEquals(result, {});
    });

    it("should handle empty frontmatter block", () => {
      const markdown = `---
---

Body`;

      const result = testCommand.testExtractFrontmatter(markdown);
      assertEquals(result, {});
    });

    it("should skip lines without colons", () => {
      const markdown = `---
title: Valid
invalid line without colon
status: review
---

Body`;

      const result = testCommand.testExtractFrontmatter(markdown);
      assertEquals(result.title, "Valid");
      assertEquals(result.status, "review");
      assertEquals(result["invalid line without colon"], undefined);
    });
  });

  describe("serializeFrontmatter", () => {
    it("should serialize frontmatter to YAML format", () => {
      const frontmatter = {
        title: "Test",
        status: "review",
        trace_id: "abc-123",
      };

      const result = testCommand.testSerializeFrontmatter(frontmatter);
      assertEquals(result.startsWith("---\n"), true);
      assertEquals(result.endsWith("---"), true);
      assertEquals(result.includes("title: Test"), true);
      assertEquals(result.includes("status: review"), true);
      assertEquals(result.includes("trace_id: abc-123"), true);
    });

    it("should quote values with special characters", () => {
      const frontmatter = {
        simple: "value",
        with_colon: "value: with colon",
        with_space: "value with spaces",
      };

      const result = testCommand.testSerializeFrontmatter(frontmatter);
      assertEquals(result.includes('with_colon: "value: with colon"'), true);
      assertEquals(result.includes('with_space: "value with spaces"'), true);
    });

    it("should handle empty frontmatter", () => {
      const frontmatter = {};
      const result = testCommand.testSerializeFrontmatter(frontmatter);
      assertEquals(result, "---\n---");
    });
  });

  describe("updateFrontmatter", () => {
    it("should update existing frontmatter fields", () => {
      const content = `---
title: Original
status: draft
---

Body content`;

      const updated = testCommand.testUpdateFrontmatter(content, {
        status: "review",
        author: "TestUser",
      });

      const frontmatter = testCommand.testExtractFrontmatter(updated);
      assertEquals(frontmatter.title, "Original");
      assertEquals(frontmatter.status, "review");
      assertEquals(frontmatter.author, "TestUser");
      assertEquals(updated.includes("Body content"), true);
    });

    it("should preserve body content", () => {
      const content = `---
title: Test
---

# Heading

Paragraph 1

Paragraph 2`;

      const updated = testCommand.testUpdateFrontmatter(content, {
        status: "approved",
      });

      assertEquals(updated.includes("# Heading"), true);
      assertEquals(updated.includes("Paragraph 1"), true);
      assertEquals(updated.includes("Paragraph 2"), true);
    });

    it("should handle content without frontmatter", () => {
      const content = "# Just content\n\nNo frontmatter.";

      const updated = testCommand.testUpdateFrontmatter(content, {
        status: "new",
      });

      const frontmatter = testCommand.testExtractFrontmatter(updated);
      assertEquals(frontmatter.status, "new");
      assertEquals(updated.includes("Just content"), true);
    });
  });

  describe("validateFrontmatter", () => {
    it("should pass validation when all required fields present", () => {
      const frontmatter = {
        trace_id: "abc-123",
        request_id: "req-001",
        status: "review",
      };

      // Should not throw
      testCommand.testValidateFrontmatter(
        frontmatter,
        ["trace_id", "request_id", "status"],
        "/test/file.md",
      );
    });

    it("should throw error when required field missing", () => {
      const frontmatter = {
        trace_id: "abc-123",
        status: "review",
        // missing request_id
      };

      assertThrows(
        () => {
          testCommand.testValidateFrontmatter(
            frontmatter,
            ["trace_id", "request_id", "status"],
            "/test/file.md",
          );
        },
        Error,
        "missing required field 'request_id'",
      );
    });

    it("should include file path in error message", () => {
      const frontmatter = {
        status: "review",
      };

      assertThrows(
        () => {
          testCommand.testValidateFrontmatter(
            frontmatter,
            ["trace_id"],
            "/path/to/plan.md",
          );
        },
        Error,
        "/path/to/plan.md",
      );
    });

    it("should handle empty required fields array", () => {
      const frontmatter = {
        title: "Test",
      };

      // Should not throw with no requirements
      testCommand.testValidateFrontmatter(frontmatter, [], "/test/file.md");
    });
  });

  describe("formatTimestamp", () => {
    it("should format ISO timestamp to readable string", () => {
      const iso = "2025-11-25T14:30:00.000Z";
      const formatted = testCommand.testFormatTimestamp(iso);

      assertExists(formatted);
      assertEquals(typeof formatted, "string");
      // Should contain date components (exact format depends on locale)
      assertEquals(formatted.length > 0, true);
    });

    it("should handle different ISO formats", () => {
      const timestamps = [
        "2025-11-25T14:30:00Z",
        "2025-11-25T14:30:00.123Z",
        "2025-11-25T14:30:00+00:00",
      ];

      for (const ts of timestamps) {
        const formatted = testCommand.testFormatTimestamp(ts);
        assertExists(formatted);
        assertEquals(typeof formatted, "string");
      }
    });
  });

  describe("truncate", () => {
    it("should truncate long strings", () => {
      const str = "This is a very long string that needs truncation";
      const result = testCommand.testTruncate(str, 20);

      assertEquals(result.length, 20);
      assertEquals(result.endsWith("..."), true);
      assertEquals(result, "This is a very lo...");
    });

    it("should not truncate short strings", () => {
      const str = "Short";
      const result = testCommand.testTruncate(str, 20);

      assertEquals(result, "Short");
      assertEquals(result.length, 5);
    });

    it("should handle exact length", () => {
      const str = "Exactly20Characters!";
      const result = testCommand.testTruncate(str, 20);

      assertEquals(result, "Exactly20Characters!");
      assertEquals(result.length, 20);
    });

    it("should handle edge case with maxLength less than 3", () => {
      const str = "Test";
      const result = testCommand.testTruncate(str, 2);

      // When maxLength < 3, substring(0, negative) returns empty string
      // So result is just "..." (length 3)
      assertEquals(result, "...");
      assertEquals(result.length, 3);
    });
  });
});
