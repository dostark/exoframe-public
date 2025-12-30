/**
 * Tests for PlanCommands (CLI Plan Management)
 *
 * Success Criteria:
 * - Test 1: approve moves plan to /System/Active and updates status
 * - Test 2: reject moves plan to /Inbox/Rejected with reason
 * - Test 3: revise appends review comments and keeps plan in review
 * - Test 4: list returns all plans with status indicators
 * - Test 5: show displays plan content and metadata
 * - Test 6: Commands validate plan exists and has correct status
 * - Test 7: Tracks user identity in approval/rejection actions
 */

import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert@^1.0.0";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@^1.0.0/bdd";
import { join } from "@std/path";
import { PlanCommands } from "../../src/cli/plan_commands.ts";
import { DatabaseService } from "../../src/services/db.ts";
import { createCliTestContext } from "./helpers/test_setup.ts";

describe("PlanCommands", () => {
  let tempDir: string;
  let db: DatabaseService;
  let planCommands: PlanCommands;
  let inboxPlansDir: string;
  let systemActiveDir: string;
  let inboxRejectedDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    // Initialize shared CLI test context
    const result = await createCliTestContext({ createDirs: ["Inbox/Plans", "System/Active", "Inbox/Rejected"] });
    tempDir = result.tempDir;
    db = result.db;
    cleanup = result.cleanup;
    const config = result.config;

    // Derived paths
    inboxPlansDir = join(tempDir, "Inbox", "Plans");
    systemActiveDir = join(tempDir, "System", "Active");
    inboxRejectedDir = join(tempDir, "Inbox", "Rejected");

    // Initialize PlanCommands
    planCommands = new PlanCommands({ config, db }, tempDir);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("approve", () => {
    it("should approve a plan and move it to /System/Active", async () => {
      // Create a plan file with status='review'
      const planId = "test-plan-001";
      const planContent = `---
trace_id: "trace-123"
agent_id: agent-456
status: review
created_at: "2025-11-25T10:00:00Z"
---

# Test Plan

## Actions
\`\`\`toml
- tool: file_write
  params:
    path: test.txt
    content: hello
\`\`\`
`;
      const planPath = join(inboxPlansDir, `${planId}.md`);
      await Deno.writeTextFile(planPath, planContent);

      // Approve the plan
      await planCommands.approve(planId);

      // Verify plan moved to /System/Active
      const activePlanPath = join(systemActiveDir, `${planId}.md`);
      const exists = await Deno.stat(activePlanPath).then(() => true).catch(() => false);
      assertEquals(exists, true, "Plan should be moved to /System/Active");

      // Verify original plan removed
      const originalExists = await Deno.stat(planPath).then(() => true).catch(() => false);
      assertEquals(originalExists, false, "Original plan should be removed");

      // Verify frontmatter updated
      const updatedContent = await Deno.readTextFile(activePlanPath);
      assertEquals(updatedContent.includes("status: approved"), true, "Status should be 'approved'");
      assertEquals(updatedContent.includes("approved_by:"), true, "Should have approved_by field");
      assertEquals(updatedContent.includes("approved_at:"), true, "Should have approved_at field");

      // Verify activity logged
      const activities = db.getRecentActivity(10);
      const approval = activities.find((a) => a.action_type === "plan.approved" && a.target === planId);
      assertExists(approval, "Approval should be logged");
      assertExists(approval?.actor);
      assertEquals(approval?.agent_id, null);
      assertEquals(approval?.payload?.via, "cli");
      assertEquals(approval?.trace_id, "trace-123");
    });

    it("should reject approval if plan does not exist", async () => {
      await assertRejects(
        async () => await planCommands.approve("nonexistent-plan"),
        Error,
        "Plan not found",
      );
    });

    it("should reject approval if plan status is not 'review'", async () => {
      const planId = "test-plan-002";
      const planContent = `---
trace_id: "trace-456"
status: needs_revision
---

# Test Plan
`;
      await Deno.writeTextFile(join(inboxPlansDir, `${planId}.md`), planContent);

      await assertRejects(
        async () => await planCommands.approve(planId),
        Error,
        "Only plans with status='review' can be approved",
      );
    });

    it("should archive existing plan if target path already exists", async () => {
      const planId = "test-plan-003";
      const planContent = `---
trace_id: "trace-789"
status: review
---

# Test Plan (New)
`;
      await Deno.writeTextFile(join(inboxPlansDir, `${planId}.md`), planContent);

      // Create existing file in Active
      const existingContent = "existing file content";
      await Deno.writeTextFile(join(systemActiveDir, `${planId}.md`), existingContent);

      // Approve should succeed now
      await planCommands.approve(planId);

      // Verify new content in Active
      const activeContent = await Deno.readTextFile(join(systemActiveDir, `${planId}.md`));
      assertEquals(activeContent.includes("# Test Plan (New)"), true, "New plan should be in Active");

      // Verify old content archived
      const archiveDir = join(tempDir, "System", "Archive");
      const archiveEntries = [];
      for await (const entry of Deno.readDir(archiveDir)) {
        archiveEntries.push(entry);
      }

      const archivedFile = archiveEntries.find((e) => e.name.startsWith(`${planId}_archived_`));
      assertExists(archivedFile, "Old plan should be archived");

      const archivedContent = await Deno.readTextFile(join(archiveDir, archivedFile.name));
      assertEquals(archivedContent, existingContent, "Archived content should match old file");
    });
  });

  describe("reject", () => {
    it("should reject a plan with reason and move to /Inbox/Rejected", async () => {
      const planId = "test-plan-004";
      const planContent = `---
trace_id: "trace-abc"
agent_id: agent-xyz
status: review
---

# Test Plan
`;
      await Deno.writeTextFile(join(inboxPlansDir, `${planId}.md`), planContent);

      const reason = "Plan is too vague and lacks specific actions";
      await planCommands.reject(planId, reason);

      // Verify plan moved to /Inbox/Rejected with _rejected.md suffix
      const rejectedPath = join(inboxRejectedDir, `${planId}_rejected.md`);
      const exists = await Deno.stat(rejectedPath).then(() => true).catch(() => false);
      assertEquals(exists, true, "Plan should be moved to /Inbox/Rejected");

      // Verify original plan removed
      const originalPath = join(inboxPlansDir, `${planId}.md`);
      const originalExists = await Deno.stat(originalPath).then(() => true).catch(() => false);
      assertEquals(originalExists, false, "Original plan should be removed");

      // Verify frontmatter updated
      const rejectedContent = await Deno.readTextFile(rejectedPath);
      assertEquals(rejectedContent.includes("status: rejected"), true);
      assertEquals(rejectedContent.includes("rejected_by:"), true);
      assertEquals(rejectedContent.includes("rejected_at:"), true);
      assertEquals(rejectedContent.includes(`rejection_reason: ${reason}`), true);

      // Verify activity logged
      const activities = db.getRecentActivity(10);
      const rejection = activities.find((a) => a.action_type === "plan.rejected" && a.target === planId);
      assertExists(rejection, "Rejection should be logged");
      // Actor is now user identity (email or username) instead of "human"
      assertExists(rejection?.actor);
      assertEquals(rejection?.payload?.reason, reason);
      assertEquals(rejection?.payload?.via, "cli");
    });

    it("should reject rejection if reason is empty", async () => {
      await assertRejects(
        async () => await planCommands.reject("test-plan-005", ""),
        Error,
        "Rejection reason is required",
      );
    });

    it("should reject rejection if plan does not exist", async () => {
      await assertRejects(
        async () => await planCommands.reject("nonexistent-plan", "Some reason"),
        Error,
        "Plan not found",
      );
    });
  });

  describe("revise", () => {
    it("should request revision with single comment", async () => {
      const planId = "test-plan-006";
      const planContent = `---
trace_id: "trace-def"
status: review
---

# Test Plan

## Actions
Some actions here
`;
      await Deno.writeTextFile(join(inboxPlansDir, `${planId}.md`), planContent);

      const comment = "Please add more specific file paths";
      await planCommands.revise(planId, [comment]);

      // Verify file still in /Inbox/Plans
      const planPath = join(inboxPlansDir, `${planId}.md`);
      const exists = await Deno.stat(planPath).then(() => true).catch(() => false);
      assertEquals(exists, true, "Plan should remain in /Inbox/Plans");

      // Verify content updated
      const updatedContent = await Deno.readTextFile(planPath);
      assertEquals(updatedContent.includes("status: needs_revision"), true);
      assertEquals(updatedContent.includes("reviewed_by:"), true);
      assertEquals(updatedContent.includes("reviewed_at:"), true);
      assertEquals(updatedContent.includes("## Review Comments"), true);
      assertEquals(updatedContent.includes(`⚠️ ${comment}`), true);

      // Verify activity logged
      const activities = db.getRecentActivity(10);
      const revision = activities.find((a) => a.action_type === "plan.revision_requested" && a.target === planId);
      assertExists(revision, "Revision request should be logged");
      assertEquals(revision?.payload?.comment_count, 1);
    });

    it("should request revision with multiple comments", async () => {
      const planId = "test-plan-007";
      const planContent = `---
trace_id: "trace-ghi"
status: review
---

# Test Plan
`;
      await Deno.writeTextFile(join(inboxPlansDir, `${planId}.md`), planContent);

      const comments = [
        "Add error handling",
        "Include test cases",
        "Specify dependencies",
      ];
      await planCommands.revise(planId, comments);

      const updatedContent = await Deno.readTextFile(join(inboxPlansDir, `${planId}.md`));

      // Verify all comments present
      for (const comment of comments) {
        assertEquals(updatedContent.includes(`⚠️ ${comment}`), true);
      }

      // Verify activity logged with correct count
      const activities = db.getRecentActivity(10);
      const revision = activities.find((a) => a.action_type === "plan.revision_requested");
      assertEquals(revision?.payload?.comment_count, 3);
    });

    it("should reject revision if no comments provided", async () => {
      await assertRejects(
        async () => await planCommands.revise("test-plan-008", []),
        Error,
        "At least one comment is required",
      );
    });

    it("should reject revision if plan does not exist", async () => {
      await assertRejects(
        async () => await planCommands.revise("nonexistent-plan", ["Some comment"]),
        Error,
        "Plan not found",
      );
    });

    it("should append to existing review comments section", async () => {
      const planId = "test-plan-009";
      const planContent = `---
trace_id: "trace-jkl"
status: needs_revision
reviewed_by: user1
reviewed_at: "2025-11-25T10:00:00Z"
---

# Test Plan

## Review Comments

⚠️ Previous comment

## Actions
Some actions
`;
      await Deno.writeTextFile(join(inboxPlansDir, `${planId}.md`), planContent);

      await planCommands.revise(planId, ["New comment"]);

      const updatedContent = await Deno.readTextFile(join(inboxPlansDir, `${planId}.md`));
      assertEquals(updatedContent.includes("⚠️ Previous comment"), true);
      assertEquals(updatedContent.includes("⚠️ New comment"), true);
    });
  });

  describe("list", () => {
    it("should list all plans with status indicators", async () => {
      // Create multiple plans
      await Deno.writeTextFile(
        join(inboxPlansDir, "plan-001.md"),
        `---
trace_id: "trace-001"
status: review
created_at: "2025-11-25T10:00:00Z"
---
# Plan 1
`,
      );

      await Deno.writeTextFile(
        join(inboxPlansDir, "plan-002.md"),
        `---
trace_id: "trace-002"
status: needs_revision
created_at: "2025-11-25T11:00:00Z"
---
# Plan 2
`,
      );

      await Deno.writeTextFile(
        join(inboxPlansDir, "plan-003.md"),
        `---
trace_id: "trace-003"
status: review
created_at: "2025-11-25T12:00:00Z"
---
# Plan 3
`,
      );

      const plans = await planCommands.list();

      assertEquals(plans.length, 3);
      assertEquals(plans[0].id, "plan-001");
      assertEquals(plans[0].status, "review");
      assertEquals(plans[1].id, "plan-002");
      assertEquals(plans[1].status, "needs_revision");
      assertEquals(plans[2].id, "plan-003");
      assertEquals(plans[2].status, "review");
    });

    it("should filter plans by status", async () => {
      await Deno.writeTextFile(
        join(inboxPlansDir, "plan-004.md"),
        `---
status: review
---
# Plan 4
`,
      );

      await Deno.writeTextFile(
        join(inboxPlansDir, "plan-005.md"),
        `---
status: needs_revision
---
# Plan 5
`,
      );

      const reviewPlans = await planCommands.list("review");
      assertEquals(reviewPlans.length, 1);
      assertEquals(reviewPlans[0].id, "plan-004");

      const revisionPlans = await planCommands.list("needs_revision");
      assertEquals(revisionPlans.length, 1);
      assertEquals(revisionPlans[0].id, "plan-005");
    });

    it("should return empty array when no plans exist", async () => {
      const plans = await planCommands.list();
      assertEquals(plans.length, 0);
    });

    it("should handle malformed frontmatter gracefully", async () => {
      await Deno.writeTextFile(
        join(inboxPlansDir, "plan-malformed.md"),
        `# Plan without frontmatter`,
      );

      const plans = await planCommands.list();
      assertEquals(plans.length, 1);
      assertEquals(plans[0].id, "plan-malformed");
      assertEquals(plans[0].status, "unknown");
    });
  });

  describe("show", () => {
    it("should display plan content with frontmatter", async () => {
      const planId = "test-plan-010";
      const planContent = `---
trace_id: "trace-show-001"
status: review
agent_id: agent-123
created_at: "2025-11-25T10:00:00Z"
---

# Test Plan

This is a test plan with some content.

## Actions
\`\`\`toml
- tool: file_write
  params:
    path: test.txt
\`\`\`
`;
      await Deno.writeTextFile(join(inboxPlansDir, `${planId}.md`), planContent);

      const result = await planCommands.show(planId);

      assertEquals(result.id, planId);
      assertEquals(result.status, "review");
      assertEquals(result.trace_id, "trace-show-001");
      assertEquals(result.content.includes("# Test Plan"), true);
      assertEquals(result.content.includes("## Actions"), true);
    });

    it("should throw error if plan does not exist", async () => {
      await assertRejects(
        async () => await planCommands.show("nonexistent-plan"),
        Error,
        "Plan not found",
      );
    });

    it("should handle plan without frontmatter", async () => {
      const planId = "test-plan-011";
      const planContent = `# Plan without frontmatter

Just some content.
`;
      await Deno.writeTextFile(join(inboxPlansDir, `${planId}.md`), planContent);

      const result = await planCommands.show(planId);

      assertEquals(result.id, planId);
      assertEquals(result.status, "unknown");
      assertEquals(result.content.includes("# Plan without frontmatter"), true);
    });
  });

  describe("user identity", () => {
    it("should capture user identity from git config", async () => {
      const planId = "test-plan-012";
      await Deno.writeTextFile(
        join(inboxPlansDir, `${planId}.md`),
        `---
trace_id: "trace-identity"
status: review
---
# Plan
`,
      );

      await planCommands.approve(planId);

      const activities = db.getRecentActivity(10);
      const approval = activities.find((a) => a.action_type === "plan.approved");
      assertExists(approval?.actor, "Actor should be captured");
      assertEquals(typeof approval?.actor, "string");
    });
  });
});
