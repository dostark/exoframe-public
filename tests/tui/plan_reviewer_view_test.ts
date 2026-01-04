import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  DbLikePlanServiceAdapter,
  MinimalPlanServiceMock,
  PlanCommandsServiceAdapter,
  PlanReviewerTuiSession,
  PlanReviewerView,
} from "../../src/tui/plan_reviewer_view.ts";
import { createPlanReviewerSession } from "./helpers.ts";
import { PlanCommands } from "../../src/cli/plan_commands.ts";

function yamlFrontmatter(obj: Record<string, string>): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(obj)) {
    lines.push(`${k}: "${v}"`);
  }
  lines.push("---\n");
  return lines.join("\n");
}

class MockDB {
  logs: Array<any> = [];
  logActivity(actor: string, action: string, target: string, payload: Record<string, unknown> = {}, traceId?: string) {
    this.logs.push({ actor, action, target, payload, traceId });
  }
}

async function setupWorkspace(planId: string, frontmatter: Record<string, string>, body = "") {
  const root = await Deno.makeTempDir();
  const inbox = `${root}/Inbox/Plans`;
  await Deno.mkdir(inbox, { recursive: true });
  const content = yamlFrontmatter(frontmatter) + body;
  await Deno.writeTextFile(`${inbox}/${planId}.md`, content);
  return root;
}

Deno.test("lists pending plans via PlanCommands", async () => {
  const planId = "p1";
  const root = await setupWorkspace(planId, { status: "pending", title: "Add login" }, "# Plan Body\n");
  const db = new MockDB();
  const context: any = { config: {} as any, db };
  const cmd = new PlanCommands(context, root);
  const view = new PlanReviewerView(new PlanCommandsServiceAdapter(cmd));
  const pending = await view.listPending();
  assertEquals(pending.length, 1);
  // Cleanup
  await Deno.remove(root, { recursive: true });
});

Deno.test("returns plan content as diff via PlanCommands", async () => {
  const planId = "p2";
  const body = "- old\n+ new\n";
  const root = await setupWorkspace(planId, { status: "pending", title: "Change README" }, body);
  const db = new MockDB();
  const context: any = { config: {} as any, db };
  const cmd = new PlanCommands(context, root);
  const view = new PlanReviewerView(new PlanCommandsServiceAdapter(cmd));
  const diff = await view.getDiff(planId);
  assertEquals(diff.includes("+ new"), true);
  await Deno.remove(root, { recursive: true });
});

Deno.test("approve moves plan and logs activity via PlanCommands", async () => {
  const planId = "p3";
  const root = await setupWorkspace(planId, { status: "review", title: "Refactor" }, "# Body\n");
  const db = new MockDB();
  const context: any = { config: {} as any, db };
  const cmd = new PlanCommands(context, root);
  const view = new PlanReviewerView(new PlanCommandsServiceAdapter(cmd));
  const ok = await view.approve(planId, "reviewer-1");
  assert(ok);
  // Check that plan file moved to System/Active
  try {
    const activePath = `${root}/System/Active/${planId}.md`;
    const exists = await Deno.stat(activePath).then(() => true).catch(() => false);
    assertEquals(exists, true);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("DB-like path logs reviewer and reason", async () => {
  const logs: any[] = [];
  const dbLike = {
    getPendingPlans: () => [{ id: "p", title: "T" }],
    getPlanDiff: () => "diff",
    updatePlanStatus: (_id: string, _status: string) => {},
    logActivity: (evt: Record<string, unknown>) => {
      logs.push(evt);
    },
  };
  const view = new PlanReviewerView(new DbLikePlanServiceAdapter(dbLike));
  await view.approve("p", "alice@example.com");
  await view.reject("p", "alice@example.com", "too risky");
  const approveLog = logs.find((l) => l.action_type === "plan.approve");
  const rejectLog = logs.find((l) => l.action_type === "plan.reject");
  assert(approveLog && approveLog.reviewer === "alice@example.com");
  assert(rejectLog && rejectLog.reviewer === "alice@example.com" && rejectLog.reason === "too risky");
});

Deno.test("reject moves plan to Inbox/Rejected and logs reason via PlanCommands", async () => {
  const planId = "p4";
  const root = await setupWorkspace(planId, { status: "pending", title: "WIP" }, "# Body\n");
  const db = new MockDB();
  const context: any = { config: {} as any, db };
  const cmd = new PlanCommands(context, root);
  const view = new PlanReviewerView(new PlanCommandsServiceAdapter(cmd));
  const ok = await view.reject(planId, "reviewer-2", "needs changes");
  assert(ok);
  try {
    const rejectedPath = `${root}/Inbox/Rejected/${planId}_rejected.md`;
    const exists = await Deno.stat(rejectedPath).then(() => true).catch(() => false);
    assertEquals(exists, true);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("handles very large plan content via PlanCommands", async () => {
  const planId = "p5";
  const large = "a".repeat(100_000);
  const root = await setupWorkspace(planId, { status: "pending", title: "Big change" }, large);
  const db = new MockDB();
  const context: any = { config: {} as any, db };
  const cmd = new PlanCommands(context, root);
  const view = new PlanReviewerView(new PlanCommandsServiceAdapter(cmd));
  const diff = await view.getDiff(planId);
  assertEquals(diff.length, large.length);
  await Deno.remove(root, { recursive: true });
});

Deno.test("PlanReviewerTuiSession: error handling in #triggerAction (service throws)", async () => {
  let called = false;
  const plans = [{ id: "p1", title: "T1" }];
  const session = new PlanReviewerTuiSession(plans, {
    listPending: () => Promise.resolve([]),
    getDiff: () => Promise.resolve(""),
    approve: () => {
      called = true;
      throw new Error("fail-approve");
    },
    reject: () => {
      throw new Error("fail-reject");
    },
  });
  session.setSelectedIndex(0);

  // Press 'a' to show dialog, then confirm
  await session.handleKey("a");
  await session.handleKey("enter"); // confirm
  assertEquals(session.getStatusMessage(), "Error: fail-approve");

  // Press 'r' to show dialog, then confirm
  await session.handleKey("r");
  await session.handleKey("enter"); // confirm
  assertEquals(session.getStatusMessage(), "Error: fail-reject");
  assert(called);
});

Deno.test("PlanReviewerView: reject throws if reason missing", async () => {
  // Do not provide getPendingPlans so PlanCommands path is used
  const view = new PlanReviewerView({
    listPending: () => Promise.resolve([]),
    getDiff: () => Promise.resolve(""),
    approve: () => Promise.resolve(true),
    reject: (_id, _r, reason?: string) => {
      if (!reason) return Promise.reject(new Error("Rejection reason is required"));
      return Promise.resolve(true);
    },
  });
  let threw = false;
  try {
    await view.reject("pid", "reviewer");
  } catch (e) {
    threw = true;
    if (e instanceof Error) {
      assertEquals(e.message, "Rejection reason is required");
    } else {
      throw e;
    }
  }
  assert(threw);
});

Deno.test("PlanReviewerView: renderPlanList and renderDiff", () => {
  const view = new PlanReviewerView(new MinimalPlanServiceMock());
  const plans = [
    { id: "p1", title: "T1", status: "pending" },
    { id: "p2", title: "T2", status: "approved" },
  ];
  const list = view.renderPlanList(plans);
  assert(list.includes("p1 T1 [pending]"));
  assert(list.includes("p2 T2 [approved]"));
  const diff = view.renderDiff("SOME_DIFF");
  assertEquals(diff, "SOME_DIFF");
});

Deno.test("PlanReviewerTuiSession: edge cases (no plans, invalid selection)", () => {
  const { session } = createPlanReviewerSession([]);
  session.handleKey("down"); // should not throw
  session.setSelectedIndex(-1);
  assertEquals(session.getSelectedIndex(), 0);
});

Deno.test("PlanReviewerView: works with DB-like service", async () => {
  let updated = false, logged = false;
  const dbLike = {
    getPendingPlans: () => [{ id: "p", title: "T" }],
    getPlanDiff: (id: string) => `diff-${id}`,
    updatePlanStatus: () => {
      updated = true;
    },
    logActivity: () => {
      logged = true;
    },
  };
  const view = new PlanReviewerView(new DbLikePlanServiceAdapter(dbLike));
  const pending = await view.listPending();
  assertEquals(pending.length, 1);
  const diff = await view.getDiff("p");
  assertEquals(diff, "diff-p");
  await view.approve("p", "r");
  await view.reject("p", "r", "reason");
  assert(updated && logged);
});

// PlanReviewerTuiSession keyboard interaction tests
Deno.test("PlanReviewerTuiSession keyboard navigation - down arrow", async () => {
  const plans = [
    { id: "plan1", title: "Plan 1" },
    { id: "plan2", title: "Plan 2" },
    { id: "plan3", title: "Plan 3" },
  ];
  const { session } = createPlanReviewerSession(plans);

  // Start at index 0
  assertEquals(session.getSelectedIndex(), 0);

  // Press down - should go to index 1
  await session.handleKey("down");
  assertEquals(session.getSelectedIndex(), 1);

  // Press down again - should go to index 2
  await session.handleKey("down");
  assertEquals(session.getSelectedIndex(), 2);

  // Press down at end - should stay at index 2
  await session.handleKey("down");
  assertEquals(session.getSelectedIndex(), 2);
});

Deno.test("PlanReviewerTuiSession keyboard navigation - up arrow", async () => {
  const plans = [
    { id: "plan1", title: "Plan 1" },
    { id: "plan2", title: "Plan 2" },
    { id: "plan3", title: "Plan 3" },
  ];
  const { session } = createPlanReviewerSession(plans);

  // Start at index 2
  session.setSelectedIndex(2);
  assertEquals(session.getSelectedIndex(), 2);

  // Press up - should go to index 1
  await session.handleKey("up");
  assertEquals(session.getSelectedIndex(), 1);

  // Press up again - should go to index 0
  await session.handleKey("up");
  assertEquals(session.getSelectedIndex(), 0);

  // Press up at beginning - should stay at index 0
  await session.handleKey("up");
  assertEquals(session.getSelectedIndex(), 0);
});

Deno.test("PlanReviewerTuiSession keyboard navigation - end key", async () => {
  const plans = [
    { id: "plan1", title: "Plan 1" },
    { id: "plan2", title: "Plan 2" },
    { id: "plan3", title: "Plan 3" },
  ];
  const { session } = createPlanReviewerSession(plans);

  // Start at index 0
  assertEquals(session.getSelectedIndex(), 0);

  // Press end - should go to last index (2)
  await session.handleKey("end");
  assertEquals(session.getSelectedIndex(), 2);
});

Deno.test("PlanReviewerTuiSession keyboard navigation - home key", async () => {
  const plans = [
    { id: "plan1", title: "Plan 1" },
    { id: "plan2", title: "Plan 2" },
    { id: "plan3", title: "Plan 3" },
  ];
  const { session } = createPlanReviewerSession(plans);

  // Navigate to end first
  await session.handleKey("end");

  // Press home - with tree view, navigates to first tree node
  await session.handleKey("home");
  const homeIndex = session.getSelectedIndex();
  assert(homeIndex >= 0, "Home should navigate to valid index");
});

Deno.test("PlanReviewerTuiSession keyboard actions - a (approve plan)", async () => {
  let approvedPlan = "";
  const plans = [
    { id: "plan1", title: "Plan 1" },
    { id: "plan2", title: "Plan 2" },
  ];
  const mockService = new MinimalPlanServiceMock();
  mockService.approve = (planId: string) => {
    approvedPlan = planId;
    return Promise.resolve(true);
  };
  mockService.listPending = () => Promise.resolve(plans);

  const session = new PlanReviewerTuiSession(plans, mockService);

  // Select first plan and press a (shows dialog)
  session.setSelectedIndex(0);
  await session.handleKey("a");
  await session.handleKey("enter"); // confirm
  assertEquals(approvedPlan, "plan1");
});

Deno.test("PlanReviewerTuiSession keyboard actions - r (reject plan)", async () => {
  let rejectedPlan = "";
  const plans = [
    { id: "plan1", title: "Plan 1" },
    { id: "plan2", title: "Plan 2" },
  ];
  const mockService = new MinimalPlanServiceMock();
  mockService.reject = (planId: string) => {
    rejectedPlan = planId;
    return Promise.resolve(true);
  };
  mockService.listPending = () => Promise.resolve(plans);

  const session = new PlanReviewerTuiSession(plans, mockService);

  // Select first plan and press r (shows dialog)
  session.setSelectedIndex(0);
  await session.handleKey("r");
  await session.handleKey("enter"); // confirm
  assertEquals(rejectedPlan, "plan1");
});

Deno.test("PlanReviewerTuiSession keyboard actions - error handling", async () => {
  const plans = [{ id: "plan1", title: "Plan 1" }];
  const mockService = new MinimalPlanServiceMock();
  mockService.approve = () => {
    throw new Error("Failed to approve plan");
  };
  mockService.listPending = () => Promise.resolve(plans);

  const session = new PlanReviewerTuiSession(plans, mockService);

  // Try to approve plan (shows dialog first)
  await session.handleKey("a");
  await session.handleKey("enter"); // confirm
  assertEquals(session.getStatusMessage(), "Error: Failed to approve plan");
});

Deno.test("PlanReviewerTuiSession keyboard actions - no plans", async () => {
  const session = new PlanReviewerTuiSession([], new MinimalPlanServiceMock());

  // Keyboard actions should be ignored when no plans
  await session.handleKey("down");
  await session.handleKey("up");
  await session.handleKey("a");
  await session.handleKey("r");

  // Should remain at index 0
  assertEquals(session.getSelectedIndex(), 0);
});

Deno.test("PlanReviewerTuiSession keyboard actions - invalid keys ignored", async () => {
  const plans = [{ id: "plan1", title: "Plan 1" }];
  const session = new PlanReviewerTuiSession(plans, new MinimalPlanServiceMock());

  const initialIndex = session.getSelectedIndex();

  // Invalid keys should be ignored
  await session.handleKey("invalid");
  await session.handleKey("x");
  await session.handleKey("y");
  await session.handleKey("z");

  // Selection should remain unchanged
  assertEquals(session.getSelectedIndex(), initialIndex);
});

// ============================================================
// Phase 13.4 Enhanced Plan Reviewer Tests
// ============================================================

Deno.test("Phase 13.4: Plan tree is built with status groups", () => {
  const plans = [
    { id: "p1", title: "Plan 1", status: "pending" },
    { id: "p2", title: "Plan 2", status: "approved" },
    { id: "p3", title: "Plan 3", status: "rejected" },
    { id: "p4", title: "Plan 4", status: "pending" },
  ];
  const session = new PlanReviewerTuiSession(plans, new MinimalPlanServiceMock());

  const tree = session.getPlanTree();
  assert(tree.length > 0, "Tree should have groups");

  // Find pending group
  const pendingGroup = tree.find((n) => n.id === "pending-group");
  assert(pendingGroup, "Should have pending group");
  assertEquals(pendingGroup.children.length, 2, "Pending group should have 2 plans");

  // Find approved group
  const approvedGroup = tree.find((n) => n.id === "approved-group");
  assert(approvedGroup, "Should have approved group");
  assertEquals(approvedGroup.children.length, 1, "Approved group should have 1 plan");

  // Find rejected group
  const rejectedGroup = tree.find((n) => n.id === "rejected-group");
  assert(rejectedGroup, "Should have rejected group");
  assertEquals(rejectedGroup.children.length, 1, "Rejected group should have 1 plan");
});

Deno.test("Phase 13.4: Plan tree rendering", () => {
  const plans = [
    { id: "p1", title: "Plan 1", status: "pending" },
    { id: "p2", title: "Plan 2", status: "approved" },
  ];
  const session = new PlanReviewerTuiSession(plans, new MinimalPlanServiceMock());

  const lines = session.renderPlanTree();
  assert(Array.isArray(lines), "Should return array of lines");
  assert(lines.length > 0, "Should have rendered content");
  assert(lines.some((l) => l.includes("Pending")), "Should show Pending group");
});

Deno.test("Phase 13.4: Help screen toggle", async () => {
  const plans = [{ id: "p1", title: "Plan 1" }];
  const session = new PlanReviewerTuiSession(plans, new MinimalPlanServiceMock());

  // Initially help is hidden
  assertEquals(session.isHelpVisible(), false, "Help should be hidden initially");

  // Press ? to show help
  await session.handleKey("?");
  assertEquals(session.isHelpVisible(), true, "Help should be visible after ?");

  // Press ? to hide help
  await session.handleKey("?");
  assertEquals(session.isHelpVisible(), false, "Help should be hidden after second ?");
});

Deno.test("Phase 13.4: Help screen rendering", () => {
  const plans = [{ id: "p1", title: "Plan 1" }];
  const session = new PlanReviewerTuiSession(plans, new MinimalPlanServiceMock());

  const helpLines = session.renderHelp();
  assert(Array.isArray(helpLines), "Help should be an array");
  assert(helpLines.length > 0, "Help should have content");
  assert(helpLines.some((l) => l.includes("Navigation")), "Should have Navigation section");
  assert(helpLines.some((l) => l.includes("Actions")), "Should have Actions section");
});

Deno.test("Phase 13.4: Confirm dialog for approve", async () => {
  const plans = [{ id: "p1", title: "Plan 1" }];
  let approveTriggered = false;
  const mockService = new MinimalPlanServiceMock();
  mockService.approve = () => {
    approveTriggered = true;
    return Promise.resolve(true);
  };
  mockService.listPending = () => Promise.resolve([]);

  const session = new PlanReviewerTuiSession(plans, mockService);

  // Press a - should show confirm dialog, not immediately approve
  await session.handleKey("a");
  assertEquals(session.hasActiveDialog(), true, "Should have dialog open");
  assertEquals(approveTriggered, false, "Approve should not trigger yet");

  // Cancel the dialog
  await session.handleKey("escape");
  assertEquals(session.hasActiveDialog(), false, "Dialog should be closed");
  assertEquals(approveTriggered, false, "Approve should not trigger after cancel");
});

Deno.test("Phase 13.4: Confirm dialog for reject", async () => {
  const plans = [{ id: "p1", title: "Plan 1" }];
  let rejectTriggered = false;
  const mockService = new MinimalPlanServiceMock();
  mockService.reject = () => {
    rejectTriggered = true;
    return Promise.resolve(true);
  };
  mockService.listPending = () => Promise.resolve([]);

  const session = new PlanReviewerTuiSession(plans, mockService);

  // Press r - should show confirm dialog
  await session.handleKey("r");
  assertEquals(session.hasActiveDialog(), true, "Should have dialog open");
  assertEquals(rejectTriggered, false, "Reject should not trigger yet");

  // Confirm the dialog
  await session.handleKey("enter");
  assertEquals(rejectTriggered, true, "Reject should trigger after confirm");
});

Deno.test("Phase 13.4: Diff view toggle", async () => {
  const plans = [{ id: "p1", title: "Plan 1" }];
  const mockService = new MinimalPlanServiceMock();
  mockService.getDiff = () => Promise.resolve("+ added line\n- removed line");

  const session = new PlanReviewerTuiSession(plans, mockService);

  // Initially diff is hidden
  assertEquals(session.isDiffVisible(), false);

  // Press enter to view diff
  await session.handleKey("enter");
  assertEquals(session.isDiffVisible(), true, "Diff should be visible after enter");
  assert(session.getDiffContent().includes("+ added line"), "Diff content should include added line");

  // Press escape to close diff
  await session.handleKey("escape");
  assertEquals(session.isDiffVisible(), false, "Diff should be hidden after escape");
});

Deno.test("Phase 13.4: Diff rendering", async () => {
  const plans = [{ id: "p1", title: "Plan 1" }];
  const mockService = new MinimalPlanServiceMock();
  mockService.getDiff = () => Promise.resolve("+ added\n- removed\n@@ context @@");

  const session = new PlanReviewerTuiSession(plans, mockService);
  await session.handleKey("enter");

  const diffLines = session.renderDiff();
  assert(diffLines.length > 0, "Should have diff lines");
  assert(diffLines.some((l) => l.includes("DIFF VIEWER")), "Should have diff header");
});

Deno.test("Phase 13.4: Expand/Collapse all", async () => {
  const plans = [
    { id: "p1", title: "Plan 1", status: "pending" },
    { id: "p2", title: "Plan 2", status: "approved" },
    { id: "p3", title: "Plan 3", status: "rejected" },
  ];
  const session = new PlanReviewerTuiSession(plans, new MinimalPlanServiceMock());

  // Collapse all
  await session.handleKey("c");
  const collapsedTree = session.getPlanTree();
  const allCollapsed = collapsedTree.every((n) => !n.expanded);
  assertEquals(allCollapsed, true, "All groups should be collapsed after 'c'");

  // Expand all
  await session.handleKey("e");
  const expandedTree = session.getPlanTree();
  const allExpanded = expandedTree.every((n) => n.expanded);
  assertEquals(allExpanded, true, "All groups should be expanded after 'e'");
});

Deno.test("Phase 13.4: Approve all pending", async () => {
  const plans = [
    { id: "p1", title: "Plan 1", status: "pending" },
    { id: "p2", title: "Plan 2", status: "pending" },
    { id: "p3", title: "Plan 3", status: "approved" },
  ];
  const approved: string[] = [];
  const mockService = new MinimalPlanServiceMock();
  mockService.approve = (planId: string) => {
    approved.push(planId);
    return Promise.resolve(true);
  };
  mockService.listPending = () => Promise.resolve([]);

  const session = new PlanReviewerTuiSession(plans, mockService);

  // Press A to approve all pending
  await session.handleKey("A");

  // Should have approved 2 plans
  assertEquals(approved.length, 2, "Should approve 2 pending plans");
  assert(approved.includes("p1"), "Should include p1");
  assert(approved.includes("p2"), "Should include p2");
});

Deno.test("Phase 13.4: Refresh view with R key", async () => {
  const plans = [{ id: "p1", title: "Plan 1", status: "pending" }];
  let listCalled = false;
  const mockService = new MinimalPlanServiceMock();
  mockService.listPending = () => {
    listCalled = true;
    return Promise.resolve([
      { id: "p1", title: "Plan 1", status: "pending" },
      { id: "p2", title: "Plan 2", status: "pending" },
    ]);
  };

  const session = new PlanReviewerTuiSession(plans, mockService);

  await session.handleKey("R");
  assertEquals(listCalled, true, "Should call listPending on R");
});

Deno.test("Phase 13.4: Loading state management", async () => {
  const plans = [{ id: "p1", title: "Plan 1" }];
  let resolvePromise: () => void;
  const slowPromise = new Promise<string>((resolve) => {
    resolvePromise = () => resolve("diff content");
  });
  const mockService = new MinimalPlanServiceMock();
  mockService.getDiff = () => slowPromise;

  const session = new PlanReviewerTuiSession(plans, mockService);

  // Initial state
  assertEquals(session.isLoading(), false, "Should not be loading initially");

  // Start operation (don't await)
  const opPromise = session.handleKey("enter");

  // Should be loading now
  assertEquals(session.isLoading(), true, "Should be loading during operation");
  assert(session.getLoadingMessage().includes("Loading diff"), "Loading message should mention diff");

  // Complete the operation
  resolvePromise!();
  await opPromise;

  // Should be done loading
  assertEquals(session.isLoading(), false, "Should not be loading after completion");
});

Deno.test("Phase 13.4: Action buttons include help shortcut", () => {
  const plans = [{ id: "p1", title: "Plan 1" }];
  const session = new PlanReviewerTuiSession(plans, new MinimalPlanServiceMock());

  const buttons = session.renderActionButtons();
  assert(buttons.includes("Help"), "Should include Help in action buttons");
  assert(buttons.includes("?"), "Should show ? shortcut");
  assert(buttons.includes("Approve all"), "Should show Approve all");
});

Deno.test("Phase 13.4: View name getter", () => {
  const session = new PlanReviewerTuiSession([], new MinimalPlanServiceMock());
  assertEquals(session.getViewName(), "Plan Reviewer");
});

Deno.test("Phase 13.4: Key bindings are defined", () => {
  const session = new PlanReviewerTuiSession([], new MinimalPlanServiceMock());

  const bindings = session.getKeyBindings();
  assert(Array.isArray(bindings), "Should return array of bindings");
  assert(bindings.length > 0, "Should have bindings");

  const keys = bindings.map((b) => b.key);
  assert(keys.includes("up"), "Should have up key");
  assert(keys.includes("down"), "Should have down key");
  assert(keys.includes("a"), "Should have a key (approve)");
  assert(keys.includes("r"), "Should have r key (reject)");
  assert(keys.includes("A"), "Should have A key (approve all)");
  assert(keys.includes("?"), "Should have ? key");
});

Deno.test("Phase 13.4: Empty plan list creates empty tree", () => {
  const session = new PlanReviewerTuiSession([], new MinimalPlanServiceMock());

  const tree = session.getPlanTree();
  assertEquals(tree.length, 0, "Empty plans should create empty tree");
});

Deno.test("Phase 13.4: Get active dialog when none", () => {
  const session = new PlanReviewerTuiSession([], new MinimalPlanServiceMock());

  const dialog = session.getActiveDialog();
  assertEquals(dialog, null, "Should return null when no dialog");
  assertEquals(session.hasActiveDialog(), false, "hasActiveDialog should be false");
});

Deno.test("Phase 13.4: Update plans rebuilds tree", () => {
  const plans = [{ id: "p1", title: "Plan 1", status: "pending" }];
  const session = new PlanReviewerTuiSession(plans, new MinimalPlanServiceMock());

  assertEquals(session.getPlanTree().length, 1, "Should have 1 group initially");

  // Update with more plans
  session.updatePlans([
    { id: "p1", title: "Plan 1", status: "pending" },
    { id: "p2", title: "Plan 2", status: "approved" },
  ]);

  const newTree = session.getPlanTree();
  assertEquals(newTree.length, 2, "Should have 2 groups after update");
});

Deno.test("Phase 13.4: Focusable elements", () => {
  const session = new PlanReviewerTuiSession([], new MinimalPlanServiceMock());

  const focusables = session.getFocusableElements();
  assert(Array.isArray(focusables), "Should be array");
  assert(focusables.includes("plan-list"), "Should include plan-list");
  assert(focusables.includes("action-buttons"), "Should include action-buttons");
});

Deno.test("Phase 13.4: Left arrow collapses expanded group", async () => {
  const plans = [
    { id: "p1", title: "Plan 1", status: "pending" },
    { id: "p2", title: "Plan 2", status: "pending" },
  ];
  const session = new PlanReviewerTuiSession(plans, new MinimalPlanServiceMock());

  // Expand all first
  await session.handleKey("e");

  // Navigate to pending group (home)
  await session.handleKey("home");

  const treeBefore = session.getPlanTree();
  const pendingGroupBefore = treeBefore.find((n) => n.id === "pending-group");
  assertEquals(pendingGroupBefore?.expanded, true, "Should be expanded");

  // Press left to collapse
  await session.handleKey("left");

  const treeAfter = session.getPlanTree();
  const pendingGroupAfter = treeAfter.find((n) => n.id === "pending-group");
  assertEquals(pendingGroupAfter?.expanded, false, "Should be collapsed after left");
});

Deno.test("Phase 13.4: createTuiSession accepts useColors parameter", () => {
  const mockService = new MinimalPlanServiceMock();
  const view = new PlanReviewerView(mockService);
  const plans = [{ id: "p1", title: "Plan 1" }];

  // Create with colors
  const tuiWithColors = view.createTuiSession(plans, true);
  assert(tuiWithColors, "Should create TUI with colors");

  // Create without colors
  const tuiWithoutColors = view.createTuiSession(plans, false);
  assert(tuiWithoutColors, "Should create TUI without colors");
});
