/**
 * Tests for RequestProcessor Service
 * Implements Step 5.9 of the ExoFrame Implementation Plan
 *
 * TDD Test Cases:
 * 1. Parses valid request file (YAML frontmatter + body)
 * 2. Skips invalid frontmatter (logs error, returns null)
 * 3. Generates plan with MockLLMProvider
 * 4. Writes plan to Workspace/Plans/
 * 5. Plan has correct frontmatter (trace_id, request_id, status)
 * 6. Updates request status to "planned"
 * 7. Logs activity to database
 * 8. Handles LLM errors gracefully
 */

import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@^1.0.0/bdd";
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { join } from "@std/path";

import { RequestProcessor, type RequestProcessorConfig } from "../src/services/request_processor.ts";
import { MockLLMProvider } from "../src/ai/providers/mock_llm_provider.ts";
import { DatabaseService } from "../src/services/db.ts";
import { initTestDbService } from "./helpers/db.ts";
import type { Config } from "../src/config/schema.ts";
import {
  getBlueprintsAgentsDir,
  getWorkspaceDir,
  getWorkspacePlansDir,
  getWorkspaceRequestsDir,
} from "./helpers/paths_helper.ts";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a mock response with thought and content tags
 */
function createMockResponse(thought: string, content: string): string {
  return `<thought>${thought}</thought>\n<content>${content}</content>`;
}

function createTestRequestPath(tempDir: string): { traceId: string; requestPath: string } {
  const traceId = crypto.randomUUID();
  const requestPath = join(getWorkspaceRequestsDir(tempDir), `request-${traceId.slice(0, 8)}.md`);
  return { traceId, requestPath };
}
/**
 * Create a request file with YAML frontmatter
 */
function createRequestContent(opts: {
  traceId: string;
  agent?: string;
  flow?: string;
  status?: string;
  priority?: string;
  body: string;
}): string {
  const fields = [
    `trace_id: "${opts.traceId}"`,
    `created: "${new Date().toISOString()}"`,
    `status: ${opts.status || "pending"}`,
    `priority: ${opts.priority || "normal"}`,
    opts.flow ? null : `agent: ${opts.agent || "default"}`, // Only include agent if no flow
    opts.flow ? `flow: ${opts.flow}` : null,
    `source: cli`,
    `created_by: "test@example.com"`,
  ].filter(Boolean);

  return `---
${fields.join("\n")}
---

# Request

${opts.body}
`;
}

/**
 * Create a default agent blueprint file
 */
function createBlueprintContent(): string {
  return `# Default Agent Blueprint

You are a helpful coding assistant. When given a request, analyze it and create a detailed implementation plan.

## Response Format

Always respond with:
1. <thought> tags containing your analysis
2. <content> tags containing the implementation plan

Example:
<thought>Analyzing the request...</thought>
<content>
# Implementation Plan
1. Step one
2. Step two
</content>
`;
}

// ============================================================================
// Tests
// ============================================================================

describe("RequestProcessor", () => {
  let testDir: string;
  let config: Config;
  let db: DatabaseService;
  let processorConfig: RequestProcessorConfig;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    // Initialize database with initTestDbService (creates temp dir with activity table)
    const testDbResult = await initTestDbService();
    testDir = testDbResult.tempDir;
    db = testDbResult.db;
    config = testDbResult.config;
    cleanup = testDbResult.cleanup;

    // Create additional required directories
    await Deno.mkdir(getWorkspaceRequestsDir(testDir), { recursive: true });
    await Deno.mkdir(getWorkspacePlansDir(testDir), { recursive: true });
    await Deno.mkdir(join(testDir, "Blueprints", "Agents"), { recursive: true });

    // Create default blueprint
    await Deno.writeTextFile(
      join(testDir, "Blueprints", "Agents", "default.md"),
      createBlueprintContent(),
    );

    // Create processor config
    processorConfig = {
      workspacePath: getWorkspaceDir(testDir),
      requestsDir: getWorkspaceRequestsDir(testDir),
      blueprintsPath: getBlueprintsAgentsDir(testDir),
      includeReasoning: true,
    };
  });

  afterEach(async () => {
    // Use the cleanup function from initTestDbService
    await cleanup();
  });

  describe("Request Parsing", () => {
    it("should parse valid request file with YAML frontmatter", async () => {
      const { traceId, requestPath } = createTestRequestPath(testDir);
      const requestContent = createRequestContent({
        traceId,
        agent: "default",
        body: "Add a hello world function to utils.ts",
      });

      await Deno.writeTextFile(requestPath, requestContent);

      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse(
          "Analyzing request",
          JSON.stringify({
            title: "Implementation Plan",
            description: "Plan for adding hello world function",
            steps: [{ step: 1, title: "Implement function", description: "Add hello world to utils.ts" }],
          }),
        )],
      });
      const processor = new RequestProcessor(config, provider, db, processorConfig);

      const result = await processor.process(requestPath);

      assert(result !== null, "Result should not be null for valid request");
      assertStringIncludes(result!, "_plan.md");
    });

    it("should return null for invalid YAML frontmatter", async () => {
      const requestPath = join(getWorkspaceRequestsDir(testDir), "invalid-request.md");
      const invalidContent = `+++
this is toml not yaml
+++

# Request

Do something
`;

      await Deno.writeTextFile(requestPath, invalidContent);

      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse("Test", "Content")],
      });
      const processor = new RequestProcessor(config, provider, db, processorConfig);

      const result = await processor.process(requestPath);

      assertEquals(result, null, "Should return null for invalid frontmatter");
    });

    it("should return null for request missing trace_id", async () => {
      const requestPath = join(getWorkspaceRequestsDir(testDir), "missing-trace.md");
      const invalidContent = `+++
status = "pending"
agent = "default"
+++

# Request

Do something
`;

      await Deno.writeTextFile(requestPath, invalidContent);

      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse("Test", "Content")],
      });
      const processor = new RequestProcessor(config, provider, db, processorConfig);

      const result = await processor.process(requestPath);

      assertEquals(result, null, "Should return null for missing trace_id");
    });
  });

  describe("Plan Generation", () => {
    it("should generate plan using MockLLMProvider", async () => {
      const { traceId, requestPath } = createTestRequestPath(testDir);
      const requestContent = createRequestContent({
        traceId,
        body: "Create a user authentication system",
      });

      await Deno.writeTextFile(requestPath, requestContent);

      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse(
          "Analyzing auth requirements",
          JSON.stringify({
            title: "Auth Implementation Plan",
            description: "User authentication system implementation",
            steps: [{ step: 1, title: "Implement auth", description: "Create authentication system" }],
          }),
        )],
      });
      const processor = new RequestProcessor(config, provider, db, processorConfig);

      const planPath = await processor.process(requestPath);

      assert(planPath !== null, "Plan path should not be null");

      // Verify plan file was created
      const planContent = await Deno.readTextFile(planPath!);
      assert(planContent.length > 0, "Plan content should not be empty");
    });

    it("should write plan to Workspace/Plans/ directory", async () => {
      const { traceId, requestPath } = createTestRequestPath(testDir);
      const requestContent = createRequestContent({
        traceId,
        body: "Add logging to the service layer",
      });

      await Deno.writeTextFile(requestPath, requestContent);

      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse(
          "Logging analysis",
          JSON.stringify({
            title: "Logging Plan",
            description: "Add logging to service layer",
            steps: [{ step: 1, title: "Add logging", description: "Add logging to the service layer" }],
          }),
        )],
      });
      const processor = new RequestProcessor(config, provider, db, processorConfig);

      const planPath = await processor.process(requestPath);

      assert(planPath !== null);
      assertStringIncludes(planPath!, getWorkspacePlansDir(testDir));
    });

    it("should create plan with correct frontmatter", async () => {
      const { traceId, requestPath } = createTestRequestPath(testDir);
      const requestId = `request-${traceId.slice(0, 8)}`;
      const requestContent = createRequestContent({
        traceId,
        body: "Implement error handling",
      });

      await Deno.writeTextFile(requestPath, requestContent);

      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse(
          "Error handling analysis",
          JSON.stringify({
            title: "Error Handling Plan",
            description: "Implement error handling",
            steps: [{ step: 1, title: "Error handling", description: "Implement proper error handling" }],
          }),
        )],
      });
      const processor = new RequestProcessor(config, provider, db, processorConfig);

      const planPath = await processor.process(requestPath);
      assert(planPath !== null);

      const planContent = await Deno.readTextFile(planPath!);

      // Verify frontmatter structure
      assertStringIncludes(planContent, `trace_id: "${traceId}"`);
      assertStringIncludes(planContent, `request_id: "${requestId}"`);
      assertStringIncludes(planContent, "status: review");
    });
  });

  describe("Request Status Update", () => {
    it("should update request status to 'planned'", async () => {
      const { traceId, requestPath } = createTestRequestPath(testDir);
      const requestContent = createRequestContent({
        traceId,
        status: "pending",
        body: "Add unit tests",
      });

      await Deno.writeTextFile(requestPath, requestContent);

      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse(
          "Test analysis",
          JSON.stringify({
            title: "Test Plan",
            description: "Add unit tests",
            steps: [{ step: 1, title: "Add tests", description: "Add comprehensive unit tests" }],
          }),
        )],
      });
      const processor = new RequestProcessor(config, provider, db, processorConfig);

      await processor.process(requestPath);

      // Re-read request file to check status update
      const updatedContent = await Deno.readTextFile(requestPath);
      assertStringIncludes(updatedContent, "status: planned");
    });
  });

  describe("Activity Logging", () => {
    it("should log processing start and completion", async () => {
      const { traceId, requestPath } = createTestRequestPath(testDir);
      const requestContent = createRequestContent({
        traceId,
        body: "Refactor the database layer",
      });

      await Deno.writeTextFile(requestPath, requestContent);

      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse(
          "Refactoring analysis",
          JSON.stringify({
            title: "Refactor Plan",
            description: "Refactor the database layer",
            steps: [{ step: 1, title: "Refactor DB", description: "Refactor database layer" }],
          }),
        )],
      });
      const processor = new RequestProcessor(config, provider, db, processorConfig);

      await processor.process(requestPath);

      // Wait for activity logs to be flushed
      await db.waitForFlush();

      // Query activity log for this trace_id using the proper API
      const activities = db.getActivitiesByTrace(traceId);

      assert(activities.length >= 2, "Should have at least 2 activity entries");

      const actionTypes = activities.map((a) => a.action_type);
      assert(actionTypes.includes("request.processing"), "Should log processing start");
      assert(actionTypes.includes("request.planned"), "Should log completion");
    });
  });

  describe("Error Handling", () => {
    it("should handle LLM errors gracefully", async () => {
      const { traceId, requestPath } = createTestRequestPath(testDir);
      const requestContent = createRequestContent({
        traceId,
        body: "This will fail",
      });

      await Deno.writeTextFile(requestPath, requestContent);

      // Use "failing" strategy to simulate LLM failure
      const provider = new MockLLMProvider("failing", {
        errorMessage: "Simulated LLM error",
      });
      const processor = new RequestProcessor(config, provider, db, processorConfig);

      const result = await processor.process(requestPath);

      // Should return null on error (not throw)
      assertEquals(result, null, "Should return null on LLM error");

      // Check request status is updated to 'failed'
      const updatedContent = await Deno.readTextFile(requestPath);
      assertStringIncludes(updatedContent, "status: failed");
    });

    it("should handle missing blueprint gracefully", async () => {
      const { traceId, requestPath } = createTestRequestPath(testDir);
      const requestContent = createRequestContent({
        traceId,
        agent: "nonexistent-agent",
        body: "Use a missing blueprint",
      });

      await Deno.writeTextFile(requestPath, requestContent);

      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse("Test", "Content")],
      });
      const processor = new RequestProcessor(config, provider, db, processorConfig);

      const result = await processor.process(requestPath);

      // Should return null when blueprint doesn't exist
      assertEquals(result, null, "Should return null for missing blueprint");
    });

    it("should handle file read errors", async () => {
      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse("Test", "Content")],
      });
      const processor = new RequestProcessor(config, provider, db, processorConfig);

      // Try to process a non-existent file
      const result = await processor.process("/nonexistent/path/request.md");

      assertEquals(result, null, "Should return null for non-existent file");
    });
  });

  describe("Blueprint Loading", () => {
    it("should load custom agent blueprint", async () => {
      // Create a custom blueprint
      await Deno.writeTextFile(
        join(testDir, "Blueprints", "Agents", "code-reviewer.md"),
        `# Code Reviewer Blueprint

You are an expert code reviewer. Analyze code changes and provide feedback.

<thought>Analyzing code...</thought>
<content>Code review feedback here</content>
`,
      );

      const { traceId, requestPath } = createTestRequestPath(testDir);
      const requestContent = createRequestContent({
        traceId,
        agent: "code-reviewer",
        body: "Review my pull request",
      });

      await Deno.writeTextFile(requestPath, requestContent);

      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse(
          "Code review analysis",
          JSON.stringify({
            title: "Code Review Feedback",
            description: "Review pull request feedback",
            steps: [{ step: 1, title: "Review code", description: "Analyze code changes" }],
          }),
        )],
      });
      const processor = new RequestProcessor(config, provider, db, processorConfig);

      const result = await processor.process(requestPath);

      assert(result !== null, "Should successfully process with custom blueprint");
    });

    it("should use default blueprint when agent is 'default'", async () => {
      const { traceId, requestPath } = createTestRequestPath(testDir);
      const requestContent = createRequestContent({
        traceId,
        agent: "default",
        body: "Use the default blueprint",
      });

      await Deno.writeTextFile(requestPath, requestContent);

      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse(
          "Default analysis",
          JSON.stringify({
            title: "Default Plan",
            description: "Use the default blueprint",
            steps: [{ step: 1, title: "Execute", description: "Execute using default blueprint" }],
          }),
        )],
      });
      const processor = new RequestProcessor(config, provider, db, processorConfig);

      const result = await processor.process(requestPath);

      assert(result !== null, "Should work with default blueprint");
    });
  });

  describe("Flow Request Support", () => {
    it("should process requests with flow field", async () => {
      const { traceId, requestPath } = createTestRequestPath(testDir);
      const requestContent = `---
trace_id: "${traceId}"
created: "${new Date().toISOString()}"
status: pending
priority: high
flow: code-review
source: cli
created_by: "test@example.com"
---

Review this pull request for security issues.`;

      await Deno.writeTextFile(requestPath, requestContent);

      // Mock provider that returns flow execution plan
      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse(
          "Flow execution planning",
          JSON.stringify({
            title: "Flow Execution Plan",
            description: "Execute code-review flow",
            steps: [{
              step: 1,
              title: "Execute Flow",
              description: "Execute the code-review flow with the given request",
            }],
          }),
        )],
      });

      // Create processor with RequestRouter integration
      const processor = new RequestProcessor(config, provider, db, processorConfig);

      const planPath = await processor.process(requestPath);
      assert(planPath !== null, "Should process flow requests");

      const planContent = await Deno.readTextFile(planPath!);
      assertStringIncludes(planContent, `trace_id: "${traceId}"`);
      assertStringIncludes(planContent, "status: review");
    });

    it("should process requests with nonexistent flow when validation is disabled", async () => {
      const { traceId, requestPath } = createTestRequestPath(testDir);
      const requestContent = `---
trace_id: "${traceId}"
created: "${new Date().toISOString()}"
status: pending
priority: high
flow: nonexistent-flow
source: cli
created_by: "test@example.com"
---

Test flow processing.`;

      await Deno.writeTextFile(requestPath, requestContent);

      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse("Should not be called", "{}")],
      });

      const processor = new RequestProcessor(config, provider, db, processorConfig);

      const result = await processor.process(requestPath);
      assert(result !== null, "Should process flow requests even when validation is disabled");
    });

    it("should reject requests with both flow and agent fields", async () => {
      const { traceId, requestPath } = createTestRequestPath(testDir);
      const requestContent = `---
trace_id: "${traceId}"
created: "${new Date().toISOString()}"
status: pending
priority: high
flow: code-review
agent: senior-coder
source: cli
created_by: "test@example.com"
---

Conflicting request.`;

      await Deno.writeTextFile(requestPath, requestContent);

      const provider = new MockLLMProvider("scripted", {
        responses: [createMockResponse("Should not be called", "{}")],
      });

      const processor = new RequestProcessor(config, provider, db, processorConfig);

      const result = await processor.process(requestPath);
      assertEquals(result, null, "Should reject conflicting flow/agent fields");
    });
  });
});
