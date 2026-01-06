/**
 * Tests for PlanWriter Service
 *
 * Success Criteria:
 * - writePlan() creates plan file with correct content structure
 * - writePlan() handles missing database gracefully (testing mode)
 * - writePlan() logs plan creation activity when database available
 * - All private methods generate correct content sections
 */

import { assert, assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@1";
import {
  type AgentExecutionResult,
  PlanWriter,
  type PlanWriterConfig,
  type RequestMetadata,
} from "../../src/services/plan_writer.ts";
import { initTestDbService } from "../helpers/db.ts";

/**
 * Creates a mock PlanWriterConfig for testing
 */
function createMockPlanWriterConfig(tempDir: string, db?: any): PlanWriterConfig {
  const plansDir = `${tempDir}/plans`;
  // Ensure plans directory exists
  Deno.mkdirSync(plansDir, { recursive: true });

  return {
    plansDirectory: plansDir,
    includeReasoning: true,
    generateWikiLinks: true,
    runtimeRoot: tempDir,
    db,
  };
}

/**
 * Creates a mock AgentExecutionResult for testing
 */
function createMockExecutionResult(planJson: string, thought = "Test reasoning"): AgentExecutionResult {
  return {
    thought,
    content: planJson,
    raw: `<thought>${thought}</thought><content>${planJson}</content>`,
  };
}

Deno.test("PlanWriter: constructor initializes with config", () => {
  const tempDir = "/tmp/test";
  const mockConfig = createMockPlanWriterConfig(tempDir);
  const writer = new PlanWriter(mockConfig);

  assertExists(writer);
  // Private properties can't be directly tested, but constructor should succeed
});

Deno.test("PlanWriter: writePlan creates plan file with correct structure", async () => {
  const { tempDir, cleanup } = await initTestDbService();
  const mockConfig = createMockPlanWriterConfig(tempDir);

  try {
    const writer = new PlanWriter(mockConfig);

    const metadata: RequestMetadata = {
      requestId: "test-request-123",
      traceId: "test-trace-123",
      createdAt: new Date(),
      contextFiles: ["file1.md", "file2.md"],
      contextWarnings: ["Warning about file1"],
    };

    const planJson = JSON.stringify({
      title: "Test Implementation Plan",
      description: "A test plan for validation",
      steps: [
        {
          step: 1,
          title: "Create Component",
          description: "Create the main component",
          tools: ["write_file"],
          successCriteria: ["Component created"],
        },
      ],
      estimatedDuration: "1 hour",
      risks: ["Dependency conflicts"],
    });

    const result = createMockExecutionResult(planJson);
    const writeResult = await writer.writePlan(result, metadata);

    // Verify file was created
    assert(await Deno.stat(writeResult.planPath).then(() => true).catch(() => false));

    // Read and verify content structure
    const content = writeResult.content;

    // Check header section
    assertStringIncludes(content, "# Test Implementation Plan");
    assertStringIncludes(content, "test-request-123");

    // Check context section
    assertStringIncludes(content, "## Context References");
    assertStringIncludes(content, "[[file1]]");
    assertStringIncludes(content, "[[file2]]");
    assertStringIncludes(content, "Warning about file1");

    // Check implementation section
    assertStringIncludes(content, "## Execution Steps");
    assertStringIncludes(content, "## Step 1: Create Component");

    // Check next steps section
    assertStringIncludes(content, "## Next Steps");
    assertStringIncludes(content, "test-request-123");
  } finally {
    await cleanup();
  }
});

Deno.test("PlanWriter: writePlan handles minimal plan content", async () => {
  const { tempDir, cleanup } = await initTestDbService();
  const mockConfig = createMockPlanWriterConfig(tempDir);

  try {
    const writer = new PlanWriter(mockConfig);

    const metadata: RequestMetadata = {
      requestId: "minimal-request",
      traceId: "trace-456",
      createdAt: new Date(),
      contextFiles: [],
      contextWarnings: [],
    };

    const minimalPlanJson = JSON.stringify({
      title: "Minimal Plan",
      description: "Just the basics",
      steps: [
        {
          step: 1,
          title: "Do something",
          description: "Basic task",
        },
      ],
    });

    const result = createMockExecutionResult(minimalPlanJson);
    const writeResult = await writer.writePlan(result, metadata);

    const content = writeResult.content;

    assertStringIncludes(content, "# Minimal Plan");
    assertStringIncludes(content, "Just the basics");
    assertStringIncludes(content, "Do something");
  } finally {
    await cleanup();
  }
});

Deno.test("PlanWriter: writePlan logs activity when database available", async () => {
  const { db, tempDir, cleanup } = await initTestDbService();

  try {
    const mockConfig = createMockPlanWriterConfig(tempDir, db);

    const writer = new PlanWriter(mockConfig);

    const metadata: RequestMetadata = {
      requestId: "logging-test",
      traceId: "logging-trace-789",
      createdAt: new Date(),
      contextFiles: ["test.md"],
      contextWarnings: [],
    };

    const planJson = JSON.stringify({
      title: "Logging Test Plan",
      description: "Test logging functionality",
      steps: [{ step: 1, title: "Test", description: "Test step" }],
    });

    const result = createMockExecutionResult(planJson);
    await writer.writePlan(result, metadata);

    // Wait for async logging
    await db.waitForFlush();

    // Verify activity was logged
    const activities = db.getActivitiesByTrace("logging-trace-789");
    assert(activities.length >= 2, `Expected at least 2 activities, got ${activities.length}`);

    // Check for plan.created activity
    const createdActivity = activities.find((a) => a.action_type === "plan.created");
    assertExists(createdActivity);
    assertEquals(createdActivity.target, "logging-test");

    const payload = JSON.parse(createdActivity.payload);
    assertEquals(payload.request_id, "logging-test");
    assertEquals(payload.context_files_count, 1);
  } finally {
    await cleanup();
  }
});

Deno.test("PlanWriter: writePlan works without database (testing mode)", async () => {
  const tempDir = await Deno.makeTempDir();
  const mockConfig = createMockPlanWriterConfig(tempDir, undefined);

  try {
    const writer = new PlanWriter(mockConfig);

    const metadata: RequestMetadata = {
      requestId: "no-db-test",
      traceId: "no-db-trace",
      createdAt: new Date(),
      contextFiles: [],
      contextWarnings: [],
    };

    const planJson = JSON.stringify({
      title: "No DB Plan",
      description: "Test without database",
      steps: [{ step: 1, title: "Test", description: "Test step" }],
    });

    const result = createMockExecutionResult(planJson);
    const writeResult = await writer.writePlan(result, metadata);

    // Should not throw error and should create file
    assert(await Deno.stat(writeResult.planPath).then(() => true).catch(() => false));
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("PlanWriter: writePlan handles invalid JSON gracefully", async () => {
  const { tempDir, cleanup } = await initTestDbService();
  const mockConfig = createMockPlanWriterConfig(tempDir);

  try {
    const writer = new PlanWriter(mockConfig);

    const metadata: RequestMetadata = {
      requestId: "invalid-json-test",
      traceId: "invalid-trace",
      createdAt: new Date(),
      contextFiles: [],
      contextWarnings: [],
    };

    // Invalid JSON that should cause validation error
    const invalidJson = '{ "title": "Broken JSON", invalid }';
    const result = createMockExecutionResult(invalidJson);

    // Should throw an error for invalid JSON
    let threw = false;
    try {
      await writer.writePlan(result, metadata);
    } catch (error) {
      threw = true;
      assertStringIncludes((error as Error).message, "not valid JSON");
    }

    assert(threw, "Expected PlanValidationError to be thrown for invalid JSON");
  } finally {
    await cleanup();
  }
});
