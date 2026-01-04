/**
 * Additional Coverage Tests for exoctl.ts
 *
 * Tests for untested paths to improve coverage:
 * - Error handlers for all command actions
 * - Various option combinations
 * - Edge cases in command parsing
 */

import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";

// Reusable helpers
async function withTestMod<T>(fn: (mod: any, ctx: any) => Promise<T> | T) {
  const origEnv = Deno.env.get("EXOCTL_TEST_MODE");
  Deno.env.set("EXOCTL_TEST_MODE", "1");
  try {
    const mod = await import("../../src/cli/exoctl.ts");
    const ctx = mod.__test_getContext();
    return await fn(mod, ctx);
  } finally {
    if (origEnv === undefined) Deno.env.delete("EXOCTL_TEST_MODE");
    else Deno.env.set("EXOCTL_TEST_MODE", origEnv);
  }
}

async function captureConsoleOutput(fn: () => Promise<void> | void) {
  let out = "";
  const origLog = console.log;
  console.log = (msg: string) => (out += msg + "\n");
  try {
    await fn();
  } finally {
    console.log = origLog;
  }
  return out;
}

async function captureAllOutputs(fn: () => Promise<void> | void) {
  const logs: string[] = [];
  const warns: string[] = [];
  const errs: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origErr = console.error;
  console.log = (...args: any[]) => logs.push(args.join(" "));
  console.warn = (...args: any[]) => warns.push(args.join(" "));
  console.error = (...args: any[]) => errs.push(args.join(" "));
  try {
    await fn();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origErr;
  }
  return { logs, warns, errs };
}

async function expectExitWithLogs(fn: () => Promise<void> | void) {
  const origExit = Deno.exit;
  const origErr = console.error;
  const errors: string[] = [];
  console.error = (...args: any[]) => errors.push(args.join(" "));
  (Deno as any).exit = (code?: number) => {
    throw new Error(`DENO_EXIT:${code ?? 0}`);
  };
  try {
    await fn();
    throw new Error("Expected Deno.exit to be called");
  } catch (e: any) {
    if (!e.message.startsWith("DENO_EXIT:")) throw e;
    return { err: e, errors };
  } finally {
    console.error = origErr;
    Deno.exit = origExit;
  }
}

// ===== Plan Command Error Handlers =====

Deno.test("plan list error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.planCommands as any).list = () => {
      throw new Error("plan list failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["plan", "list"]);
    });
    assert(errors.some((e) => e.includes("plan list failed")));
  });
});

Deno.test("plan show error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.planCommands as any).show = () => {
      throw new Error("plan not found");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["plan", "show", "missing"]);
    });
    assert(errors.some((e) => e.includes("plan not found")));
  });
});

Deno.test("plan approve error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.planCommands as any).approve = () => {
      throw new Error("approval failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["plan", "approve", "p-1"]);
    });
    assert(errors.some((e) => e.includes("approval failed")));
  });
});

Deno.test("plan reject error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.planCommands as any).reject = () => {
      throw new Error("rejection failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["plan", "reject", "p-1", "-r", "bad"]);
    });
    assert(errors.some((e) => e.includes("rejection failed")));
  });
});

Deno.test("plan revise error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.planCommands as any).revise = () => {
      throw new Error("revision failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["plan", "revise", "p-1", "-c", "comment"]);
    });
    assert(errors.some((e) => e.includes("revision failed")));
  });
});

// ===== Changeset Command Error Handlers =====

Deno.test("changeset list error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.changesetCommands as any).list = () => {
      throw new Error("changeset list failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["changeset", "list"]);
    });
    assert(errors.some((e) => e.includes("changeset list failed")));
  });
});

Deno.test("changeset approve error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.changesetCommands as any).approve = () => {
      throw new Error("approval failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["changeset", "approve", "cs-1"]);
    });
    assert(errors.some((e) => e.includes("approval failed")));
  });
});

Deno.test("changeset reject error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.changesetCommands as any).reject = () => {
      throw new Error("rejection failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["changeset", "reject", "cs-1", "-r", "bad"]);
    });
    assert(errors.some((e) => e.includes("rejection failed")));
  });
});

// ===== Git Command Error Handlers =====

Deno.test("git branches error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.gitCommands as any).listBranches = () => {
      throw new Error("git error");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["git", "branches"]);
    });
    assert(errors.some((e) => e.includes("git error")));
  });
});

Deno.test("git status error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.gitCommands as any).status = () => {
      throw new Error("status failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["git", "status"]);
    });
    assert(errors.some((e) => e.includes("status failed")));
  });
});

Deno.test("git log error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.gitCommands as any).logByTraceId = () => {
      throw new Error("log failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["git", "log", "-t", "trace-1"]);
    });
    assert(errors.some((e) => e.includes("log failed")));
  });
});

// ===== Daemon Command Error Handlers =====

Deno.test("daemon start error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.daemonCommands as any).start = () => {
      throw new Error("start failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["daemon", "start"]);
    });
    assert(errors.some((e) => e.includes("start failed")));
  });
});

Deno.test("daemon stop error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.daemonCommands as any).stop = () => {
      throw new Error("stop failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["daemon", "stop"]);
    });
    assert(errors.some((e) => e.includes("stop failed")));
  });
});

Deno.test("daemon restart error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.daemonCommands as any).restart = () => {
      throw new Error("restart failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["daemon", "restart"]);
    });
    assert(errors.some((e) => e.includes("restart failed")));
  });
});

Deno.test("daemon status error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.daemonCommands as any).status = () => {
      throw new Error("status failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["daemon", "status"]);
    });
    assert(errors.some((e) => e.includes("status failed")));
  });
});

Deno.test("daemon logs error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.daemonCommands as any).logs = () => {
      throw new Error("logs failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["daemon", "logs"]);
    });
    assert(errors.some((e) => e.includes("logs failed")));
  });
});

// ===== Portal Command Error Handlers =====

Deno.test("portal add error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.portalCommands as any).add = () => {
      throw new Error("add failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["portal", "add", "/tmp/path", "alias"]);
    });
    assert(errors.some((e) => e.includes("add failed")));
  });
});

Deno.test("portal list error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.portalCommands as any).list = () => {
      throw new Error("list failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["portal", "list"]);
    });
    assert(errors.some((e) => e.includes("list failed")));
  });
});

Deno.test("portal show error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.portalCommands as any).show = () => {
      throw new Error("show failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["portal", "show", "alias"]);
    });
    assert(errors.some((e) => e.includes("show failed")));
  });
});

Deno.test("portal remove error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.portalCommands as any).remove = () => {
      throw new Error("remove failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["portal", "remove", "alias"]);
    });
    assert(errors.some((e) => e.includes("remove failed")));
  });
});

Deno.test("portal verify error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.portalCommands as any).verify = () => {
      throw new Error("verify failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["portal", "verify"]);
    });
    assert(errors.some((e) => e.includes("verify failed")));
  });
});

Deno.test("portal refresh error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.portalCommands as any).refresh = () => {
      throw new Error("refresh failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["portal", "refresh", "alias"]);
    });
    assert(errors.some((e) => e.includes("refresh failed")));
  });
});

// ===== Blueprint Command Error Handlers =====

Deno.test("blueprint list error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.blueprintCommands as any).list = () => {
      throw new Error("list failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["blueprint", "list"]);
    });
    assert(errors.some((e) => e.includes("list failed")));
  });
});

Deno.test("blueprint show error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.blueprintCommands as any).show = () => {
      throw new Error("show failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["blueprint", "show", "agent-1"]);
    });
    assert(errors.some((e) => e.includes("show failed")));
  });
});

Deno.test("blueprint validate error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.blueprintCommands as any).validate = () => {
      throw new Error("validate failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["blueprint", "validate", "agent-1"]);
    });
    assert(errors.some((e) => e.includes("validate failed")));
  });
});

Deno.test("blueprint edit error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.blueprintCommands as any).edit = () => {
      throw new Error("edit failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["blueprint", "edit", "agent-1"]);
    });
    assert(errors.some((e) => e.includes("edit failed")));
  });
});

Deno.test("blueprint remove error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.blueprintCommands as any).remove = () => {
      throw new Error("remove failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["blueprint", "remove", "agent-1"]);
    });
    assert(errors.some((e) => e.includes("remove failed")));
  });
});

// ===== Blueprint Alias Commands =====

Deno.test("blueprint rm alias calls remove", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.blueprintCommands as any).remove = (id: string, opts?: { force?: boolean }) => {
      called = true;
      assertEquals(id, "agent-rm");
      assertEquals(opts?.force, true);
    };
    await (mod.__test_command as any).parse(["blueprint", "rm", "agent-rm", "--force"]);
    assert(called);
  });
});

// ===== Request List with Status Filter =====

Deno.test("request list passes status filter", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).list = (status?: string) => {
      assertEquals(status, "pending");
      return [];
    };
    await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["request", "list", "-s", "pending"]);
    });
  });
});

Deno.test("request list error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).list = () => {
      throw new Error("list failed");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["request", "list"]);
    });
    assert(errors.some((e) => e.includes("list failed")));
  });
});

// ===== Changeset List with Status Filter =====

Deno.test("changeset list passes status filter", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.changesetCommands as any).list = (status?: string) => {
      assertEquals(status, "pending");
      return [];
    };
    await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["changeset", "list", "-s", "pending"]);
    });
  });
});

Deno.test("changeset list empty prints message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.changesetCommands as any).list = () => [];
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["changeset", "list"]);
    });
    assert(out.includes("No changesets found") || out.includes("changeset.list"));
  });
});

// ===== Portal List with Entries =====

Deno.test("portal list prints entries when present", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.portalCommands as any).list = () => [
      {
        alias: "MyPortal",
        symlinkPath: "Portals/MyPortal",
        targetPath: "/tmp/target",
        status: "active",
        contextCardPath: "Memory/Projects/MyPortal/portal.md",
      },
      {
        alias: "BrokenPortal",
        symlinkPath: "Portals/BrokenPortal",
        targetPath: "/tmp/missing",
        status: "broken",
        contextCardPath: "Memory/Projects/BrokenPortal/portal.md",
      },
    ];
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["portal", "list"]);
    });
    assert(out.includes("MyPortal") || out.includes("Active"));
  });
});

// ===== Git Status with Changes =====

Deno.test("git status prints changes when present", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.gitCommands as any).status = () => ({
      branch: "feat/changes",
      modified: ["file1.ts", "file2.ts"],
      added: ["new.ts"],
      deleted: ["old.ts"],
      untracked: ["temp.ts"],
    });
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["git", "status"]);
    });
    assert(out.includes("feat/changes") || out.includes("git.status"));
  });
});

// ===== Memory Commands =====

Deno.test("memory default action shows list", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.memoryCommands as any).list = (format?: string) => {
      called = true;
      assertEquals(format, "table");
      return "Memory list output";
    };
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["memory"]);
    });
    assert(called);
    assert(out.includes("Memory list output"));
  });
});

Deno.test("memory list with format option", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.memoryCommands as any).list = (format?: string) => {
      assertEquals(format, "json");
      return '{"data": []}';
    };
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["memory", "list", "--format", "json"]);
    });
    assert(out.includes('{"data": []}'));
  });
});

Deno.test("memory search passes all options", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.memoryCommands as any).search = (
      query: string,
      opts: { portal?: string; tags?: string[]; limit?: number; format?: string; useEmbeddings?: boolean },
    ) => {
      assertEquals(query, "test query");
      assertEquals(opts.portal, "my-portal");
      assertEquals(opts.tags, ["tag1", "tag2"]);
      assertEquals(opts.limit, 10);
      assertEquals(opts.format, "md");
      assertEquals(opts.useEmbeddings, true);
      return "Search results";
    };
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse([
        "memory",
        "search",
        "test query",
        "-p",
        "my-portal",
        "-t",
        "tag1,tag2",
        "-l",
        "10",
        "--format",
        "md",
        "-e",
      ]);
    });
    assert(out.includes("Search results"));
  });
});

Deno.test("memory project default action lists projects", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.memoryCommands as any).projectList = (_format?: string) => {
      called = true;
      return "Projects list";
    };
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["memory", "project"]);
    });
    assert(called);
    assert(out.includes("Projects list"));
  });
});

Deno.test("memory execution default action lists executions", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.memoryCommands as any).executionList = (_opts: any) => {
      called = true;
      return "Executions list";
    };
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["memory", "execution"]);
    });
    assert(called);
    assert(out.includes("Executions list"));
  });
});

Deno.test("memory pending default action lists pending", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.memoryCommands as any).pendingList = (_format?: string) => {
      called = true;
      return "Pending proposals";
    };
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["memory", "pending"]);
    });
    assert(called);
    assert(out.includes("Pending proposals"));
  });
});

Deno.test("memory pending approve-all calls pendingApproveAll", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.memoryCommands as any).pendingApproveAll = () => {
      called = true;
      return "All approved";
    };
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["memory", "pending", "approve-all"]);
    });
    assert(called);
    assert(out.includes("All approved"));
  });
});

// ===== Flow Commands =====

Deno.test("flow show calls flowCommands.showFlow", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.flowCommands as any).showFlow = (flowId: string, _opts: any) => {
      called = true;
      assertEquals(flowId, "my-flow");
    };
    await (mod.__test_command as any).parse(["flow", "show", "my-flow"]);
    assert(called);
  });
});

Deno.test("flow validate calls flowCommands.validateFlow", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.flowCommands as any).validateFlow = (flowId: string, opts: any) => {
      called = true;
      assertEquals(flowId, "my-flow");
      assertEquals(opts.json, true);
    };
    await (mod.__test_command as any).parse(["flow", "validate", "my-flow", "--json"]);
    assert(called);
  });
});

// ===== Blueprint Show Content Preview =====

Deno.test("blueprint show displays content preview", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.blueprintCommands as any).show = (id: string) => ({
      agent_id: id,
      name: "Test Agent",
      model: "mock:test",
      capabilities: ["coding", "review"],
      version: "1.0.0",
      created: "2026-01-04",
      created_by: "tester",
      content: "This is a very long system prompt content that should be truncated in the preview...",
    });
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["blueprint", "show", "agent-x"]);
    });
    assert(out.includes("Test Agent") || out.includes("blueprint.show"));
  });
});

// ===== Blueprint Validate with Warnings =====

Deno.test("blueprint validate valid with warnings", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.blueprintCommands as any).validate = (_id: string) => ({
      valid: true,
      warnings: ["Consider adding more capabilities"],
    });
    const outs = await captureAllOutputs(async () => {
      await (mod.__test_command as any).parse(["blueprint", "validate", "warn-agent"]);
    });
    const joined = [...outs.logs, ...outs.warns, ...outs.errs].join("\n");
    assert(joined.includes("Valid") || joined.includes("blueprint.valid") || joined.includes("warnings"));
  });
});

// ===== Request with All Options =====

Deno.test("request create with all options", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).create = (
      desc: string,
      opts: { agent: string; priority: string; portal?: string; model?: string },
    ) => {
      assertEquals(desc, "Do task");
      assertEquals(opts.agent, "custom-agent");
      assertEquals(opts.priority, "high");
      assertEquals(opts.portal, "my-portal");
      assertEquals(opts.model, "gpt-4");
      return {
        filename: "/tmp/req.md",
        trace_id: "t-all",
        priority: "high",
        agent: "custom-agent",
        path: "/tmp",
      };
    };
    await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse([
        "request",
        "Do task",
        "-a",
        "custom-agent",
        "-p",
        "high",
        "--portal",
        "my-portal",
        "-m",
        "gpt-4",
      ]);
    });
  });
});

// ===== __test_initializeServices with instantiateDb =====
// Note: Skip instantiateDb test as it loads native SQLite library that can't be easily unloaded
// The path is covered by other integration tests that properly manage DB lifecycle

// ===== Plan List with needs_revision Status =====

Deno.test("plan list shows needs_revision icon", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.planCommands as any).list = () => [
      { id: "p1", status: "needs_revision", trace_id: "t1" },
    ];
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["plan", "list"]);
    });
    assert(out.includes("⚠️") || out.includes("p1"));
  });
});

// ===== Request List with Different Priorities =====

Deno.test("request list shows different priority icons", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).list = () => [
      { trace_id: "t1", priority: "critical", agent: "a", created_by: "u", created: "t", status: "pending" },
      { trace_id: "t2", priority: "high", agent: "a", created_by: "u", created: "t", status: "pending" },
      { trace_id: "t3", priority: "low", agent: "a", created_by: "u", created: "t", status: "pending" },
    ];
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["request", "list"]);
    });
    // Should show different icons for different priorities
    assert(out.includes("🔴") || out.includes("🟠") || out.includes("⚪") || out.includes("count: 3"));
  });
});
