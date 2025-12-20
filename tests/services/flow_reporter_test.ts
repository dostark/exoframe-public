import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@^1.0.0/bdd";
import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { exists } from "@std/fs";
import { type FlowReportConfig, FlowReporter } from "../../src/services/flow_reporter.ts";
import { createMockConfig } from "../helpers/config.ts";
import { initTestDbService } from "../helpers/db.ts";
import type { Flow } from "../../src/schemas/flow.ts";
import type { FlowResult, StepResult } from "../../src/flows/flow_runner.ts";

describe("FlowReporter", () => {
  let tempDir: string;
  let cleanup: () => Promise<void>;
  let config: any;
  let reportConfig: FlowReportConfig;
  let reporter: FlowReporter;

  beforeEach(async () => {
    const dbResult = await initTestDbService();
    tempDir = dbResult.tempDir;
    cleanup = dbResult.cleanup;
    config = createMockConfig(tempDir);

    reportConfig = {
      reportsDirectory: join(tempDir, "Knowledge", "Reports"),
      knowledgeRoot: join(tempDir, "Knowledge"),
      db: dbResult.db,
    };

    // Ensure reports directory exists
    await Deno.mkdir(reportConfig.reportsDirectory, { recursive: true });

    reporter = new FlowReporter(config, reportConfig);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("constructor", () => {
    it("should initialize with valid config", () => {
      assertExists(reporter);
    });

    it("should initialize without database", () => {
      const configWithoutDb = { ...reportConfig, db: undefined };
      const reporterWithoutDb = new FlowReporter(config, configWithoutDb);
      assertExists(reporterWithoutDb);
    });
  });

  describe("generate", () => {
    it("should generate report for successful flow execution", async () => {
      // Create mock flow data
      const flow: Flow = {
        id: "test-flow",
        name: "Test Flow",
        description: "A test flow",
        version: "1.0.0",
        steps: [
          {
            id: "step1",
            name: "First Step",
            agent: "test-agent",
            dependsOn: [],
            input: {
              source: "request",
              transform: "passthrough",
            },
            retry: {
              maxAttempts: 1,
              backoffMs: 1000,
            },
          },
          {
            id: "step2",
            name: "Second Step",
            agent: "test-agent",
            dependsOn: ["step1"],
            input: {
              source: "request",
              transform: "passthrough",
            },
            retry: {
              maxAttempts: 1,
              backoffMs: 1000,
            },
          },
        ],
        output: {
          from: "step2",
          format: "markdown",
        },
        settings: {
          maxParallelism: 3,
          failFast: true,
        },
      };

      const stepResults = new Map<string, StepResult>([
        [
          "step1",
          {
            stepId: "step1",
            success: true,
            duration: 1000,
            startedAt: new Date("2025-01-01T10:00:00Z"),
            completedAt: new Date("2025-01-01T10:00:01Z"),
            result: {
              thought: "Step 1 reasoning",
              content: "Step 1 output",
              raw: "Raw response 1",
            },
          },
        ],
        [
          "step2",
          {
            stepId: "step2",
            success: true,
            duration: 2000,
            startedAt: new Date("2025-01-01T10:00:02Z"),
            completedAt: new Date("2025-01-01T10:00:04Z"),
            result: {
              thought: "Step 2 reasoning",
              content: "Step 2 output",
              raw: "Raw response 2",
            },
          },
        ],
      ]);

      const flowResult: FlowResult = {
        flowRunId: "run-123-456",
        success: true,
        stepResults,
        output: "Final aggregated output",
        duration: 4000,
        startedAt: new Date("2025-01-01T10:00:00Z"),
        completedAt: new Date("2025-01-01T10:00:04Z"),
      };

      const requestId = "request-abc123";

      // Generate report
      const result = await reporter.generate(flow, flowResult, requestId);

      // Verify result structure
      assertExists(result.reportPath);
      assertExists(result.content);
      assertExists(result.createdAt);

      // Verify file was created
      assertEquals(await exists(result.reportPath), true);

      // Verify content includes required sections
      assertStringIncludes(result.content, 'type: "flow_report"');
      assertStringIncludes(result.content, 'flow: "test-flow"');
      assertStringIncludes(result.content, 'flow_run_id: "run-123-456"');
      assertStringIncludes(result.content, "success: true");
      assertStringIncludes(result.content, 'request_id: "request-abc123"');
      assertStringIncludes(result.content, "# Flow Report: Test Flow");
      assertStringIncludes(result.content, "## Execution Summary");
      assertStringIncludes(result.content, "## Step Outputs");
      assertStringIncludes(result.content, "## Dependency Graph");
    });

    it("should generate report for failed flow execution", async () => {
      // Create mock flow data with failure
      const flow: Flow = {
        id: "failed-flow",
        name: "Failed Flow",
        description: "A flow that fails",
        version: "1.0.0",
        steps: [
          {
            id: "step1",
            name: "Failing Step",
            agent: "test-agent",
            dependsOn: [],
            input: {
              source: "request",
              transform: "passthrough",
            },
            retry: {
              maxAttempts: 1,
              backoffMs: 1000,
            },
          },
        ],
        output: {
          from: "step1",
          format: "markdown",
        },
        settings: {
          maxParallelism: 3,
          failFast: true,
        },
      };

      const stepResults = new Map<string, StepResult>([
        [
          "step1",
          {
            stepId: "step1",
            success: false,
            error: "Agent execution failed",
            duration: 500,
            startedAt: new Date("2025-01-01T10:00:00Z"),
            completedAt: new Date("2025-01-01T10:00:00.500Z"),
          },
        ],
      ]);

      const flowResult: FlowResult = {
        flowRunId: "run-789-012",
        success: false,
        stepResults,
        output: "",
        duration: 500,
        startedAt: new Date("2025-01-01T10:00:00Z"),
        completedAt: new Date("2025-01-01T10:00:00.500Z"),
      };

      // Generate report
      const result = await reporter.generate(flow, flowResult);

      // Verify content indicates failure
      assertStringIncludes(result.content, "success: false");
      assertStringIncludes(result.content, "steps_failed: 1");
      assertStringIncludes(result.content, "steps_completed: 0");
      assertStringIncludes(result.content, "❌ Failed");
      assertStringIncludes(result.content, "Agent execution failed");
    });

    it("should generate correct filename format", async () => {
      // Create minimal mock data
      const flow: Flow = {
        id: "filename-test",
        name: "Filename Test",
        description: "Test filename generation",
        version: "1.0.0",
        steps: [{
          id: "step1",
          name: "Step 1",
          agent: "agent",
          dependsOn: [],
          input: {
            source: "request",
            transform: "passthrough",
          },
          retry: {
            maxAttempts: 1,
            backoffMs: 1000,
          },
        }],
        output: {
          from: "step1",
          format: "markdown",
        },
        settings: {
          maxParallelism: 3,
          failFast: true,
        },
      };

      const stepResults = new Map<string, StepResult>([
        [
          "step1",
          {
            stepId: "step1",
            success: true,
            duration: 100,
            startedAt: new Date(),
            completedAt: new Date(),
            result: {
              thought: "Output reasoning",
              content: "output",
              raw: "raw output",
            },
          },
        ],
      ]);

      const flowResult: FlowResult = {
        flowRunId: "run-abc-def-ghi",
        success: true,
        stepResults,
        output: "output",
        duration: 100,
        startedAt: new Date(),
        completedAt: new Date(),
      };

      const result = await reporter.generate(flow, flowResult);

      // Filename should match pattern: flow_{flowId}_{shortRunId}_{timestamp}.md
      const filename = result.reportPath.split("/").pop()!;
      assertStringIncludes(filename, "flow_filename-test_run-abc-_");
      assertStringIncludes(filename, ".md");
    });
  });
});


