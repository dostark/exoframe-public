/**
 * Integration Test: Scenario 12 - Mock Provider Plan Generation
 * Tests RequestProcessor integration with MockLLMProvider in full system context
 *
 * Focus: System-level integration (RequestProcessor + MockLLMProvider + Blueprint + DB + FileSystem)
 * Note: MockLLMProvider behavior is thoroughly tested in mock_llm_provider_test.ts
 *       This test focuses on the integration of these components in a realistic workflow
 *
 * Success Criteria:
 * - RequestProcessor successfully integrates with MockLLMProvider
 * - End-to-end flow: Request file → Blueprint loading → Plan generation → Status update
 * - Concurrent request processing works correctly with shared provider
 * - Activity logging tracks the full workflow
 */

import { assert, assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { TestEnvironment } from "./helpers/test_environment.ts";

Deno.test("Integration: RequestProcessor with MockLLMProvider", async (t) => {
  const env = await TestEnvironment.create();

  try {
    let requestPath: string;
    let planPath: string;

    // Setup: Create blueprint and processor
    await env.createBlueprint(
      "senior-coder",
      `# Senior Coder Blueprint

You are an expert software developer. Analyze requests and create detailed implementation plans.

## Response Format

Always respond with:
- <thought> tags containing your analysis
- <content> tags containing the implementation plan
`,
    );

    const { provider, processor } = env.createRequestProcessor();

    // ========================================================================
    // Test: Full integration - Request → Blueprint → MockProvider → Plan
    // ========================================================================
    await t.step("End-to-end: Request file to plan generation", async () => {
      const requestResult = await env.createRequest(
        "Implement user authentication with JWT tokens",
        { agentId: "senior-coder", priority: 7, tags: ["feature", "security"] },
      );

      requestPath = requestResult.filePath;
      const processorResult = await processor.process(requestPath);

      assertExists(processorResult, "RequestProcessor should generate plan");
      planPath = processorResult;

      // Verify plan file exists on filesystem
      const planExists = await Deno.stat(planPath).then(() => true).catch(() => false);
      assert(planExists, "Plan file should exist on filesystem");
    });

    // ========================================================================
    // Test: PlanWriter integration - MockProvider output → Formatted plan
    // ========================================================================
    await t.step("PlanWriter processes MockProvider output correctly", async () => {
      const planContent = await Deno.readTextFile(planPath);

      // PlanWriter should process <thought>/<content> tags into sections
      assertStringIncludes(planContent, "## Reasoning", "PlanWriter should create Reasoning section");
      assertStringIncludes(planContent, "## Proposed Plan", "PlanWriter should create Proposed Plan section");
    });

    // ========================================================================
    // Test: RequestProcessor updates request status
    // ========================================================================
    await t.step("RequestProcessor updates request status to 'planned'", async () => {
      const requestContent = await Deno.readTextFile(requestPath);
      assertStringIncludes(requestContent, "status: planned", "Status should update after planning");
    });
  } finally {
    await env.cleanup();
  }
});

// ============================================================================
// Test: Concurrent Request Processing (Integration-specific)
// ============================================================================

Deno.test("Integration: Concurrent Requests with Shared MockLLMProvider", async () => {
  const env = await TestEnvironment.create();

  try {
    // Setup blueprint and processor (shared provider instance)
    await env.createBlueprint(
      "senior-coder",
      `# Senior Coder Blueprint\n\nYou are an expert software developer.\n\n## Response Format\n\nAlways respond with:\n- <thought> tags containing your analysis\n- <content> tags containing the implementation plan\n`,
    );

    const { provider, processor } = env.createRequestProcessor();

    // Create and process multiple requests concurrently
    const requests = await Promise.all([
      env.createRequest("Implement feature A"),
      env.createRequest("Fix bug B"),
      env.createRequest("Add feature C"),
    ]);

    const planPaths = await Promise.all(
      requests.map((r) => processor.process(r.filePath)),
    );

    // Verify all succeeded with shared provider
    assertEquals(planPaths.length, 3, "All concurrent requests should succeed");
    for (const planPath of planPaths) {
      assertExists(planPath, "Each plan should be generated");

      // Verify file exists
      const exists = await Deno.stat(planPath).then(() => true).catch(() => false);
      assert(exists, "Plan file should exist");
    }

    // Verify each plan has correct trace_id correlation
    for (let i = 0; i < planPaths.length; i++) {
      const planContent = await Deno.readTextFile(planPaths[i]!);
      assertStringIncludes(
        planContent,
        requests[i].traceId,
        "Plan should reference correct trace_id",
      );
    }
  } finally {
    await env.cleanup();
  }
});

// ============================================================================
// Test: Activity Logging Integration
// ============================================================================

Deno.test("Integration: Mock Plan Generation - Activity Logging", async () => {
  const env = await TestEnvironment.create();

  try {
    // Setup blueprint and processor
    await env.createBlueprint(
      "senior-coder",
      `# Senior Coder Blueprint\n\nYou are an expert software developer.\n\n## Response Format\n\nAlways respond with:\n- <thought> tags containing your analysis\n- <content> tags containing the implementation plan\n`,
    );

    const { provider, processor } = env.createRequestProcessor();

    const result = await env.createRequest("Implement feature X");
    await processor.process(result.filePath);

    // Wait for activity log writes
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify RequestProcessor logged activities
    const activities = env.getActivityLog(result.traceId);
    assert(activities.length > 0, "RequestProcessor should log activities");

    const actionTypes = activities.map((a) => a.action_type);
    const hasProcessing = actionTypes.some((t) => t.includes("request.processing"));
    const hasPlanned = actionTypes.some((t) => t.includes("request.planned"));

    assert(
      hasProcessing || hasPlanned,
      "Should log request.processing or request.planned",
    );
  } finally {
    await env.cleanup();
  }
});
