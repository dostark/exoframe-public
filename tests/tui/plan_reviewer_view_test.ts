import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  DbLikePlanServiceAdapter,
  MinimalPlanServiceMock,
  PlanCommandsServiceAdapter,
  PlanReviewerTuiSession,
  PlanReviewerView,
} from "../../src/tui/plan_reviewer_view.ts";
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

Deno.test("PlanReviewerTuiSession: error handling in #triggerAction (service throws)", () => {
  let called = false;
  const plans = [{ id: "p1", title: "T1" }];
  const _service = {
    listPending: () => [],
    getDiff: () => "",
    approve: () => {
      called = true;
      throw new Error("fail-approve");
    },
    reject: () => {
      throw new Error("fail-reject");
    },
  };
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
  session.handleKey("a");
  assertEquals(session.getStatusMessage(), "Error: fail-approve");
  session.handleKey("r");
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
  const session = new PlanReviewerTuiSession([], new MinimalPlanServiceMock());
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
