/**
 * Integration Test: Scenario 2 - Plan Rejection
 * Request → Plan → Reject → Archive
 *
 * Success Criteria:
 * - Test 1: Plan can be rejected with a reason from /Inbox/Plans
 * - Test 2: Rejected plan is moved to /Inbox/Rejected directory
 * - Test 3: Rejected plan status is updated to "rejected"
 * - Test 4: Rejection reason is appended to plan content
 * - Test 5: Original request remains in /Inbox/Requests (not modified)
 * - Test 6: Rejection is logged to Activity Journal with trace_id
 * - Test 7: Rejected plan preserves original trace_id for correlation
 */

import {
  assert,
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { TestEnvironment } from "./helpers/test_environment.ts";

Deno.test("Integration: Plan Rejection - Request to Archive", async (t) => {
  const env = await TestEnvironment.create();

  try {
    let traceId: string;
    let requestPath: string;
    let planPath: string;
    let rejectedPath: string;
    const rejectionReason = "The proposed implementation does not follow our coding standards. Please use async/await instead of callbacks.";

    // Setup: Create request and plan
    await t.step("Setup: Create request and plan", async () => {
      const result = await env.createRequest(
        "Implement callback-based file reader",
        { agentId: "senior-coder", priority: 5 },
      );
      traceId = result.traceId;
      requestPath = result.filePath;

      planPath = await env.createPlan(traceId, "callback-reader", {
        status: "review",
        actions: [
          {
            tool: "write_file",
            params: {
              path: "src/reader.ts",
              content: "function readFile(path, callback) { /* callback style */ }",
            },
          },
        ],
      });

      // Verify setup
      const planExists = await env.fileExists("Inbox/Plans/callback-reader_plan.md");
      assertEquals(planExists, true, "Plan should exist before rejection");
    });

    // ========================================================================
    // Test 1: Plan can be rejected with a reason
    // ========================================================================
    await t.step("Test 1: Plan can be rejected with reason", async () => {
      // Read plan content before rejection
      const beforeContent = await Deno.readTextFile(planPath);
      assertStringIncludes(beforeContent, "status: review");

      // Reject the plan
      rejectedPath = await env.rejectPlan(planPath, rejectionReason);

      // Verify rejection happened
      assertExists(rejectedPath, "Should return rejected plan path");
    });

    // ========================================================================
    // Test 2: Rejected plan moved to /Inbox/Rejected
    // ========================================================================
    await t.step("Test 2: Rejected plan moved to /Inbox/Rejected", async () => {
      // Verify plan is in Rejected directory
      const rejectedExists = await env.fileExists("Inbox/Rejected/callback-reader_plan.md");
      assertEquals(rejectedExists, true, "Plan should exist in /Inbox/Rejected");

      // Verify plan is NOT in Plans directory anymore
      const plansExists = await env.fileExists("Inbox/Plans/callback-reader_plan.md");
      assertEquals(plansExists, false, "Plan should be removed from /Inbox/Plans");

      // Verify plan is NOT in Active directory
      const activeExists = await env.fileExists("System/Active/callback-reader_plan.md");
      assertEquals(activeExists, false, "Plan should NOT be in /System/Active");
    });

    // ========================================================================
    // Test 3: Rejected plan status updated
    // ========================================================================
    await t.step("Test 3: Rejected plan status updated to 'rejected'", async () => {
      const content = await Deno.readTextFile(rejectedPath);

      assertStringIncludes(content, "status: rejected");
      assert(
        !content.includes("status: review"),
        "Should not have review status anymore",
      );
    });

    // ========================================================================
    // Test 4: Rejection reason appended
    // ========================================================================
    await t.step("Test 4: Rejection reason appended to plan", async () => {
      const content = await Deno.readTextFile(rejectedPath);

      // Should have rejection reason section
      assertStringIncludes(content, "## Rejection Reason");
      assertStringIncludes(content, rejectionReason);
      assertStringIncludes(content, "coding standards");
      assertStringIncludes(content, "async/await");
    });

    // ========================================================================
    // Test 5: Original request unchanged
    // ========================================================================
    await t.step("Test 5: Original request remains unchanged", async () => {
      // Request should still exist
      const requestExists = await env.fileExists(
        `Inbox/Requests/request-${traceId.substring(0, 8)}.md`,
      );
      assertEquals(requestExists, true, "Request should still exist");

      // Request content should be unchanged
      const content = await Deno.readTextFile(requestPath);
      assertStringIncludes(content, "status: pending");
      assertStringIncludes(content, `trace_id: "${traceId}"`);
      assertStringIncludes(content, "callback-based file reader");
    });

    // ========================================================================
    // Test 6: Rejection logged to Activity Journal
    // ========================================================================
    await t.step("Test 6: Rejection logged to Activity Journal", async () => {
      // Log the rejection activity
      env.db.logActivity(
        "user",
        "plan.rejected",
        rejectedPath,
        {
          reason: rejectionReason,
          request_id: "callback-reader",
        },
        traceId,
      );

      // Wait for log flush
      await new Promise((resolve) => setTimeout(resolve, 150));

      const activities = env.getActivityLog(traceId);

      // Should have rejection activity
      const rejectionActivity = activities.find((a) => a.action_type === "plan.rejected");
      assertExists(rejectionActivity, "Should have plan.rejected activity");

      // Verify payload contains reason
      const payload = JSON.parse(rejectionActivity.payload);
      assertStringIncludes(payload.reason, "coding standards");
    });

    // ========================================================================
    // Test 7: Trace ID preserved
    // ========================================================================
    await t.step("Test 7: Rejected plan preserves original trace_id", async () => {
      const content = await Deno.readTextFile(rejectedPath);

      // Should have same trace_id as original request
      assertStringIncludes(content, `trace_id: "${traceId}"`);

      // Verify it's the exact same ID (not a new one)
      const traceMatch = content.match(/trace_id: "([^"]+)"/);
      assertExists(traceMatch, "Should have trace_id in frontmatter");
      assertEquals(traceMatch[1], traceId, "trace_id should match original");
    });
  } finally {
    await env.cleanup();
  }
});

// Additional rejection scenario tests

Deno.test("Integration: Plan Rejection - Multiple plans can be rejected", async () => {
  const env = await TestEnvironment.create();

  try {
    // Create multiple requests and plans
    const { traceId: trace1 } = await env.createRequest("First task");
    const { traceId: trace2 } = await env.createRequest("Second task");

    const plan1 = await env.createPlan(trace1, "first-task", { status: "review" });
    const plan2 = await env.createPlan(trace2, "second-task", { status: "review" });

    // Reject both
    const rejected1 = await env.rejectPlan(plan1, "Reason 1");
    const rejected2 = await env.rejectPlan(plan2, "Reason 2");

    // Verify both in Rejected directory
    const exists1 = await env.fileExists("Inbox/Rejected/first-task_plan.md");
    const exists2 = await env.fileExists("Inbox/Rejected/second-task_plan.md");

    assertEquals(exists1, true, "First rejected plan should exist");
    assertEquals(exists2, true, "Second rejected plan should exist");

    // Verify different trace_ids preserved
    const content1 = await Deno.readTextFile(rejected1);
    const content2 = await Deno.readTextFile(rejected2);

    assertStringIncludes(content1, `trace_id: "${trace1}"`);
    assertStringIncludes(content2, `trace_id: "${trace2}"`);
  } finally {
    await env.cleanup();
  }
});

Deno.test("Integration: Plan Rejection - Empty reason is handled", async () => {
  const env = await TestEnvironment.create();

  try {
    const { traceId } = await env.createRequest("Task with empty rejection");
    const planPath = await env.createPlan(traceId, "empty-reason", { status: "review" });

    // Reject with empty reason (edge case)
    const rejectedPath = await env.rejectPlan(planPath, "");

    // Should still move the file
    const exists = await env.fileExists("Inbox/Rejected/empty-reason_plan.md");
    assertEquals(exists, true, "Plan should be moved even with empty reason");

    // Should still have rejection section
    const content = await Deno.readTextFile(rejectedPath);
    assertStringIncludes(content, "## Rejection Reason");
  } finally {
    await env.cleanup();
  }
});

Deno.test("Integration: Plan Rejection - Long reason is preserved", async () => {
  const env = await TestEnvironment.create();

  try {
    const { traceId } = await env.createRequest("Task with long rejection");
    const planPath = await env.createPlan(traceId, "long-reason", { status: "review" });

    const longReason = `
This plan has several issues that need to be addressed:

1. **Security Concern**: The proposed implementation stores credentials in plaintext.
   This violates our security policy SECURITY-001.

2. **Performance Issue**: The algorithm has O(n²) complexity which will not scale
   for our expected data volumes of 1M+ records.

3. **Code Style**: Please follow our TypeScript style guide:
   - Use camelCase for variables
   - Use PascalCase for classes
   - Add JSDoc comments to public methods

4. **Missing Tests**: The plan does not include unit tests.
   We require 80% coverage for all new code.

Please revise and resubmit.
    `.trim();

    const rejectedPath = await env.rejectPlan(planPath, longReason);
    const content = await Deno.readTextFile(rejectedPath);

    // All parts of the long reason should be preserved
    assertStringIncludes(content, "Security Concern");
    assertStringIncludes(content, "Performance Issue");
    assertStringIncludes(content, "Code Style");
    assertStringIncludes(content, "Missing Tests");
    assertStringIncludes(content, "SECURITY-001");
    assertStringIncludes(content, "80% coverage");
  } finally {
    await env.cleanup();
  }
});
