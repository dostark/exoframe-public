/**
 * Tests for PlanWriter Service
 * Implements Step 3.4 of the ExoFrame Implementation Plan
 *
 * Success Criteria:
 * 1. Filename Generation: "implement-auth.md" → "implement-auth_plan.md"
 * 2. Wiki Link Generation: Context files generate Obsidian [[wiki links]]
 * 3. Frontmatter Structure: Plan includes valid YAML frontmatter
 * 4. Reasoning Section: Includes thought content from <thought> tags
 * 5. Context Warnings: Context warnings are included in plan
 */

import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@^1.0.0/bdd";
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";

// Import the service we're testing (will create this)
import { PlanWriter } from "../src/services/plan_writer.ts";
import type { PlanWriterConfig, RequestMetadata } from "../src/services/plan_writer.ts";

// Import AgentExecutionResult from AgentRunner (Step 3.2)
interface AgentExecutionResult {
  thought: string;
  content: string;
  raw: string;
}

describe("PlanWriter", () => {
  let testDir: string;
  let plansDir: string;
  let knowledgeDir: string;
  let config: PlanWriterConfig;
  let planWriter: PlanWriter;

  beforeEach(async () => {
    // Create temporary test directories
    testDir = await Deno.makeTempDir({ prefix: "plan_writer_test_" });
    plansDir = `${testDir}/Inbox/Plans`;
    knowledgeDir = `${testDir}/Knowledge`;

    await Deno.mkdir(plansDir, { recursive: true });
    await Deno.mkdir(knowledgeDir, { recursive: true });

    // Create test knowledge files for wiki link testing
    await Deno.writeTextFile(
      `${knowledgeDir}/Architecture_Docs.md`,
      "# Architecture Documentation\nSystem architecture details...",
    );
    await Deno.writeTextFile(
      `${knowledgeDir}/API_Spec.md`,
      "# API Specification\nAPI endpoint details...",
    );

    // Configure PlanWriter
    config = {
      plansDirectory: plansDir,
      includeReasoning: true,
      generateWikiLinks: true,
      knowledgeRoot: knowledgeDir,
      systemRoot: `${testDir}/System`,
    };

    planWriter = new PlanWriter(config);
  });

  afterEach(async () => {
    // Clean up test directory
    await Deno.remove(testDir, { recursive: true });
  });

  describe("Filename Generation", () => {
    it("should generate correct filename from request ID", async () => {
      const agentResult: AgentExecutionResult = {
        thought: "Analyzing request...",
        content: "# Implementation Plan\nCreate auth module...",
        raw: "<thought>Analyzing...</thought><content>...</content>",
      };

      const metadata: RequestMetadata = {
        requestId: "implement-auth",
        traceId: "550e8400-e29b-41d4-a716-446655440000",
        createdAt: new Date("2024-11-25T10:30:00Z"),
        contextFiles: [],
        contextWarnings: [],
      };

      const result = await planWriter.writePlan(agentResult, metadata);

      assertStringIncludes(result.planPath, "implement-auth_plan.md");
    });

    it("should handle request IDs with special characters", async () => {
      const agentResult: AgentExecutionResult = {
        thought: "Planning...",
        content: "# Plan\nDetails...",
        raw: "",
      };

      const metadata: RequestMetadata = {
        requestId: "fix-bug-123",
        traceId: "abc-def-ghi",
        createdAt: new Date(),
        contextFiles: [],
        contextWarnings: [],
      };

      const result = await planWriter.writePlan(agentResult, metadata);

      assertStringIncludes(result.planPath, "fix-bug-123_plan.md");
    });
  });

  describe("Wiki Link Generation", () => {
    it("should generate Obsidian wiki links for context files", async () => {
      const agentResult: AgentExecutionResult = {
        thought: "Using architecture docs...",
        content: "# Implementation\nBased on existing architecture...",
        raw: "",
      };

      const metadata: RequestMetadata = {
        requestId: "add-feature",
        traceId: "abc123",
        createdAt: new Date(),
        contextFiles: [
          `${knowledgeDir}/Architecture_Docs.md`,
          `${knowledgeDir}/API_Spec.md`,
        ],
        contextWarnings: [],
      };

      const result = await planWriter.writePlan(agentResult, metadata);

      assertStringIncludes(result.content, "[[Architecture_Docs]]");
      assertStringIncludes(result.content, "[[API_Spec]]");
    });

    it("should handle nested paths in wiki links", async () => {
      const contextDir = `${knowledgeDir}/Context`;
      await Deno.mkdir(contextDir, { recursive: true });
      await Deno.writeTextFile(
        `${contextDir}/Security_Guidelines.md`,
        "Security docs...",
      );

      const agentResult: AgentExecutionResult = {
        thought: "Security context",
        content: "# Secure Implementation",
        raw: "",
      };

      const metadata: RequestMetadata = {
        requestId: "security-feature",
        traceId: "xyz789",
        createdAt: new Date(),
        contextFiles: [`${contextDir}/Security_Guidelines.md`],
        contextWarnings: [],
      };

      const result = await planWriter.writePlan(agentResult, metadata);

      assertStringIncludes(result.content, "[[Security_Guidelines]]");
    });
  });

  describe("Frontmatter Structure", () => {
    it("should include valid YAML frontmatter", async () => {
      const agentResult: AgentExecutionResult = {
        thought: "Planning auth",
        content: "# Auth Implementation",
        raw: "",
      };

      const metadata: RequestMetadata = {
        requestId: "implement-auth",
        traceId: "550e8400-e29b-41d4-a716-446655440000",
        createdAt: new Date("2024-11-25T10:30:00Z"),
        contextFiles: [],
        contextWarnings: [],
      };

      const result = await planWriter.writePlan(agentResult, metadata);

      // Check frontmatter delimiters
      assertStringIncludes(result.content, "---");

      // Check required frontmatter fields
      assertStringIncludes(
        result.content,
        'trace_id: "550e8400-e29b-41d4-a716-446655440000"',
      );
      assertStringIncludes(result.content, 'request_id: "implement-auth"');
      assertStringIncludes(result.content, 'status: "review"');
      assertStringIncludes(result.content, 'created_at: "2024-11-25T10:30:00');
    });

    it("should place frontmatter at the beginning of the file", async () => {
      const agentResult: AgentExecutionResult = {
        thought: "Testing",
        content: "Content",
        raw: "",
      };

      const metadata: RequestMetadata = {
        requestId: "test",
        traceId: "abc",
        createdAt: new Date(),
        contextFiles: [],
        contextWarnings: [],
      };

      const result = await planWriter.writePlan(agentResult, metadata);

      // Frontmatter should start at the beginning
      assert(result.content.startsWith("---\n"));
    });
  });

  describe("Reasoning Section", () => {
    it("should include reasoning section when thought is provided", async () => {
      const agentResult: AgentExecutionResult = {
        thought: "Analyzing the request, I recommend creating a new authentication module because...",
        content: "# Implementation\nCreate auth module...",
        raw: "",
      };

      const metadata: RequestMetadata = {
        requestId: "add-auth",
        traceId: "xyz",
        createdAt: new Date(),
        contextFiles: [],
        contextWarnings: [],
      };

      const result = await planWriter.writePlan(agentResult, metadata);

      assertStringIncludes(result.content, "## Reasoning");
      assertStringIncludes(result.content, "Analyzing the request");
      assertStringIncludes(result.content, "authentication module");
    });

    it("should omit reasoning section when includeReasoning is false", async () => {
      const configNoReasoning: PlanWriterConfig = {
        ...config,
        includeReasoning: false,
      };
      const writer = new PlanWriter(configNoReasoning);

      const agentResult: AgentExecutionResult = {
        thought: "This should not appear",
        content: "# Implementation",
        raw: "",
      };

      const metadata: RequestMetadata = {
        requestId: "test",
        traceId: "abc",
        createdAt: new Date(),
        contextFiles: [],
        contextWarnings: [],
      };

      const result = await writer.writePlan(agentResult, metadata);

      // Should not include reasoning section
      assertEquals(result.content.includes("## Reasoning"), false);
      assertEquals(result.content.includes("This should not appear"), false);
    });
  });

  describe("Context Warnings", () => {
    it("should include context warnings section", async () => {
      const agentResult: AgentExecutionResult = {
        thought: "Planning",
        content: "# Implementation",
        raw: "",
      };

      const metadata: RequestMetadata = {
        requestId: "test",
        traceId: "abc",
        createdAt: new Date(),
        contextFiles: [`${knowledgeDir}/Architecture_Docs.md`],
        contextWarnings: [
          "Skipped large_file.txt (100k tokens, would exceed limit)",
          "Truncated another_file.md to 5000 tokens",
        ],
      };

      const result = await planWriter.writePlan(agentResult, metadata);

      assertStringIncludes(result.content, "Context Warnings");
      assertStringIncludes(result.content, "Skipped large_file.txt");
      assertStringIncludes(result.content, "Truncated another_file.md");
    });

    it("should not include warnings section when no warnings", async () => {
      const agentResult: AgentExecutionResult = {
        thought: "Planning",
        content: "# Implementation",
        raw: "",
      };

      const metadata: RequestMetadata = {
        requestId: "test",
        traceId: "abc",
        createdAt: new Date(),
        contextFiles: [`${knowledgeDir}/Architecture_Docs.md`],
        contextWarnings: [],
      };

      const result = await planWriter.writePlan(agentResult, metadata);

      // Should still have Context References section
      assertStringIncludes(result.content, "## Context References");

      // But no warnings subsection
      assertEquals(result.content.includes("**Context Warnings:**"), false);
    });
  });

  describe("Plan Structure", () => {
    it("should include all required sections", async () => {
      const agentResult: AgentExecutionResult = {
        thought: "Detailed reasoning about the approach...",
        content: "# Plan: Implement Authentication\n\n## Proposed Changes\n\nCreate new auth module...",
        raw: "",
      };

      const metadata: RequestMetadata = {
        requestId: "implement-auth",
        traceId: "123-456",
        createdAt: new Date(),
        contextFiles: [`${knowledgeDir}/Architecture_Docs.md`],
        contextWarnings: [],
      };

      const result = await planWriter.writePlan(agentResult, metadata);

      // Check for all major sections
      assertStringIncludes(result.content, "# Plan:");
      assertStringIncludes(result.content, "## Summary");
      assertStringIncludes(result.content, "## Reasoning");
      assertStringIncludes(result.content, "## Proposed Changes");
      assertStringIncludes(result.content, "## Context References");
      assertStringIncludes(result.content, "## Next Steps");
    });

    it("should write plan file to correct location", async () => {
      const agentResult: AgentExecutionResult = {
        thought: "Planning",
        content: "# Implementation",
        raw: "",
      };

      const metadata: RequestMetadata = {
        requestId: "test-plan",
        traceId: "abc",
        createdAt: new Date(),
        contextFiles: [],
        contextWarnings: [],
      };

      const result = await planWriter.writePlan(agentResult, metadata);

      // Verify file was written
      const fileExists = await Deno.stat(result.planPath)
        .then(() => true)
        .catch(() => false);

      assert(fileExists, "Plan file should be created");

      // Verify file content matches returned content
      const fileContent = await Deno.readTextFile(result.planPath);
      assertEquals(fileContent, result.content);
    });
  });

  describe("Next Steps Section", () => {
    it("should include next steps with correct request ID", async () => {
      const agentResult: AgentExecutionResult = {
        thought: "Planning",
        content: "# Implementation",
        raw: "",
      };

      const metadata: RequestMetadata = {
        requestId: "my-feature",
        traceId: "xyz",
        createdAt: new Date(),
        contextFiles: [],
        contextWarnings: [],
      };

      const result = await planWriter.writePlan(agentResult, metadata);

      assertStringIncludes(result.content, "## Next Steps");
      assertStringIncludes(result.content, "/System/Active/my-feature.md");
    });
  });

  describe("Result Structure", () => {
    it("should return complete PlanWriteResult", async () => {
      const agentResult: AgentExecutionResult = {
        thought: "Planning",
        content: "# Implementation",
        raw: "",
      };

      const metadata: RequestMetadata = {
        requestId: "test",
        traceId: "abc",
        createdAt: new Date(),
        contextFiles: [],
        contextWarnings: [],
      };

      const result = await planWriter.writePlan(agentResult, metadata);

      // Check result structure
      assert(result.planPath, "Should have planPath");
      assert(result.content, "Should have content");
      assert(result.writtenAt, "Should have writtenAt");
      assert(result.writtenAt instanceof Date, "writtenAt should be a Date");
    });
  });
});
