import { assert, assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";

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

// ---- Basic module export sanity tests ----
Deno.test("exoctl exposes test context when EXOCTL_TEST_MODE=1", async () => {
  await withTestMod((mod, _ctx) => {
    assertExists(mod.__test_getContext);
    const c = mod.__test_getContext();
    assertEquals(c.IN_TEST_MODE, true);
    assertExists(c.requestCommands);
    assertExists(c.planCommands);
    assertExists(c.flowCommands);
  });
});

// ---- Parse-based command tests (merged from existing test suite) ----
Deno.test("plan approve calls planCommands.approve", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.planCommands as any).approve = (id: string) => {
      called = true;
      assertEquals(id, "plan-123");
    };
    await (mod.__test_command as any).parse(["plan", "approve", "plan-123"]);
    assert(called);
  });
});

Deno.test("changeset reject calls changesetCommands.reject", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.changesetCommands as any).reject = (id: string, reason: string) => {
      called = true;
      assertEquals(id, "cs-1");
      assertEquals(reason, "not-good");
    };
    await (mod.__test_command as any).parse(["changeset", "reject", "cs-1", "-r", "not-good"]);
    assert(called);
  });
});

Deno.test("portal add invokes portalCommands.add", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.portalCommands as any).add = (target: string, alias: string) => {
      called = true;
      assertEquals(alias, "MyAlias");
      assert(target.includes("/tmp"));
    };
    await (mod.__test_command as any).parse(["portal", "add", "/tmp/some/path", "MyAlias"]);
    assert(called);
  });
});

Deno.test("git branches prints list (calls gitCommands.listBranches)", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.gitCommands as any).listBranches = (_pattern?: string) => [
      { name: "main", is_current: true, last_commit: "abc123", last_commit_date: Date.now(), trace_id: null },
    ];
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["git", "branches"]);
    });
    assert(out.includes("main"));
  });
});

Deno.test("daemon status prints info (calls daemonCommands.status)", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.daemonCommands as any).status = () => ({ version: "v1", running: true, pid: 999, uptime: "1m" });
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["daemon", "status"]);
    });
    assert(out.includes("daemon"));
  });
});

Deno.test("blueprint remove calls blueprintCommands.remove", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.blueprintCommands as any).remove = (id: string, opts?: any) => {
      called = true;
      assertEquals(id, "agent-x");
      assertEquals(opts?.force, true);
    };
    await (mod.__test_command as any).parse(["blueprint", "remove", "agent-x", "--force"]);
    assert(called);
  });
});

Deno.test("request list shows 'No requests found' when empty", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).list = () => [];
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["request", "list"]);
    });
    assert(out.includes("No requests found") || out.includes("count: 0"));
  });
});

Deno.test("request list prints entries when present", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).list = () => [
      {
        trace_id: "abcd1234efgh5678",
        priority: "critical",
        agent: "agent-x",
        created_by: "tester",
        created: "now",
        status: "pending",
      },
    ];
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["request", "list"]);
    });
    assert(out.includes("🔴") || out.includes("abcd1234"));
  });
});

Deno.test("request show prints content when request exists", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).show = (id: string) => ({
      metadata: {
        trace_id: id,
        status: "pending",
        priority: "normal",
        agent: "agent",
        created_by: "tester",
        created: "time",
      },
      content: "Hello world",
    });

    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["request", "show", "trace-1"]);
    });
    assert(out.includes("Hello world"));
  });
});

Deno.test("plan list shows entries and status icons", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.planCommands as any).list = () => [{ id: "p1", status: "review", trace_id: "t1" }];
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["plan", "list"]);
    });
    assert(out.includes("🔍") || out.includes("p1"));
  });
});

Deno.test("changeset list prints entries when present", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.changesetCommands as any).list =
      () => [{ request_id: "req-1", branch: "feat/x", files_changed: 2, created_at: Date.now(), trace_id: "trace-1" }];
    const out = await captureConsoleOutput(async () => await (mod.__test_command as any).parse(["changeset", "list"]));
    assert(out.includes("feat/x") || out.includes("req-1"));
  });
});

Deno.test("git log prints commits when present", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.gitCommands as any).logByTraceId = (
      _t: string,
    ) => [{ sha: "deadbeef1234", message: "Fix", author: "me", date: Date.now() }];
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["git", "log", "-t", "deadbeef"]);
    });
    assert(out.includes("deadbeef") || out.includes("Fix"));
  });
});

Deno.test("git status prints clean state when empty arrays", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.gitCommands as any).status = () => ({ branch: "main", modified: [], added: [], deleted: [], untracked: [] });
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["git", "status"]);
    });
    assert(out.includes("main") && out.includes("clean") || out.includes("git.status"));
  });
});

Deno.test("portal list prints hint when empty", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.portalCommands as any).list = () => [];
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["portal", "list"]);
    });
    assert(out.includes("Add a portal") || out.includes("count: 0"));
  });
});

Deno.test("portal show prints details", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.portalCommands as any).show = (_alias: string) => ({
      alias: "MyPortal",
      targetPath: "/tmp/portal-target",
      symlinkPath: "Portals/MyPortal",
      status: "active",
      contextCardPath: "Knowledge/Portals/MyPortal.md",
      permissions: ["read"],
      created: "now",
      lastVerified: "never",
    });
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["portal", "show", "MyPortal"]);
    });
    assert(out.includes("MyPortal") && out.includes("/tmp/portal-target"));
  });
});

Deno.test("blueprint list prints hint when empty and list when present", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.blueprintCommands as any).list = () => [];
    const emptyOut = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["blueprint", "list"]);
    });
    assert(emptyOut.includes("Create a blueprint"));
    (ctx.blueprintCommands as any).list =
      () => [{ agent_id: "a1", name: "A", model: "mock", capabilities: ["c1"], created: "now" }];
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["blueprint", "list"]);
    });
    assert(out.includes("a1") || out.includes("A"));
  });
});

Deno.test("blueprint validate invalid triggers exit", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.blueprintCommands as any).validate = (_id: string) => ({ valid: false, errors: ["bad"] });
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["blueprint", "validate", "bad-agent"]);
    });
    assert(errors.some((e) => e.includes("Invalid")));
  });
});

Deno.test("request --file outputs JSON when --json specified", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).createFromFile = (_file: string, _opts?: any) => ({
      filename: "/tmp/exo-test/request-1.md",
      trace_id: "trace-1234",
      priority: "normal",
      agent: "default",

      path: "/tmp",
    });
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["request", "--file", "/tmp/some.md", "--json"]);
    });
    assert(out.includes("{") && out.includes('"trace_id"') && out.includes("trace-1234"));
  });
});

Deno.test("request --file prints human output when no --json", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).createFromFile = (_file: string, _opts?: any) => ({
      filename: "/tmp/exo-test/request-2.md",
      trace_id: "trace-5678",
      priority: "high",
      agent: "tester",
      path: "/tmp",
    });
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["request", "--file", "/tmp/some.md"]);
    });
    assert(out.includes("request.created") || out.includes("trace-5678"));
  });
});

Deno.test("request inline create handles create errors and exits", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).create = (_desc: string, _opts?: any) => {
      throw new Error("create failed");
    };

    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["request", "Do something"]);
    });
    assert(errors.some((e) => e.includes("create failed")));
  });
});

Deno.test("request show handles not found and exits", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).show = (_id: string) => {
      throw new Error("not found");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["request", "show", "missing"]);
    });
    assert(errors.some((e) => e.includes("not found")));
  });
});

Deno.test("portal verify summarizes healthy and broken portals", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.portalCommands as any).verify = () => [{ alias: "A", issues: [] }, { alias: "B", issues: ["missing"] }];
    const outs = await captureAllOutputs(async () => {
      await (mod.__test_command as any).parse(["portal", "verify"]);
    });
    const joined = [...outs.logs, ...outs.warns, ...outs.errs].join("\n");
    assert(joined.includes("healthy") || joined.includes("broken"));
  });
});

Deno.test("plan show prints content", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.planCommands as any).show = (id: string) => ({ id, status: "review", content: "Plan details here" });
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["plan", "show", "plan-1"]);
    });
    assert(out.includes("Plan details here"));
  });
});

Deno.test("changeset show prints commits and diff", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.changesetCommands as any).show = (_id: string) => ({
      request_id: "req-1",
      branch: "feat/x",
      files_changed: 1,
      commits: [{ sha: "abcdef123456", message: "Initial" }],
      diff: "---a\n+++b\n",
    });
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["changeset", "show", "cs-1"]);
    });

    assert(out.includes("abcdef12") && out.includes("---a"));
  });
});

Deno.test("request inline --dry-run logs dry_run and creates file", async () => {
  await withTestMod(async (mod, ctx) => {
    let created = false;
    (ctx.requestCommands as any).create = (_desc: string, _opts?: any) => {
      created = true;
      return { filename: "/tmp/req.md", trace_id: "t1", priority: "normal", agent: "a", path: "/tmp" };
    };
    const { logs, warns, errs } = await captureAllOutputs(async () => {
      await (mod.__test_command as any).parse(["request", "Inline-dry", "--dry-run"]);
    });
    const joined = logs.concat(warns, errs).join("\n");
    assert(created);
    assert(joined.includes("cli.dry_run") || joined.includes("would_create"));
  });
});

Deno.test("blueprint ls alias calls blueprintCommands.list", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.blueprintCommands as any).list = () => {
      called = true;
      return [];
    };
    await (mod.__test_command as any).parse(["blueprint", "ls"]);
    assert(called);
  });
});

Deno.test("flow list calls flowCommands.listFlows", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.flowCommands as any).listFlows = (_opts?: any) => {
      called = true;
    };
    await (mod.__test_command as any).parse(["flow", "list"]);
    assert(called);
  });
});

Deno.test("dashboard show calls dashboardCommands.show", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.dashboardCommands as any).show = () => {
      called = true;
    };
    await (mod.__test_command as any).parse(["dashboard"]);
    assert(called);
  });
});

if (Deno.env.get("RUN_EXOCTL_TEST")) {
  Deno.test("exoctl: --version prints version and exits", async () => {
    const cmd = new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-check", "--quiet", "src/cli/exoctl.ts", "--version"],
      stdout: "piped",
      stderr: "piped",
    });
    const { stdout, stderr } = await cmd.output();
    const out = new TextDecoder().decode(stdout);
    const err = new TextDecoder().decode(stderr);
    if (!out && err) throw new Error(`exoctl did not produce stdout. stderr: ${err}`);
    assertStringIncludes(out + err, "1.0.0");
  });
} else {
  Deno.test({ name: "exoctl: --version prints version and exits (skipped)", ignore: true, fn: () => {} });
}

Deno.test("request without description exits with error", async () => {
  await withTestMod(async (mod, _ctx) => {
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["request"]);
    });
    assert(errors.some((e) => e.includes("Description required")));
  });
});

Deno.test("request list --json outputs JSON", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).list = (_s?: string) => [
      { trace_id: "t1", priority: "normal", agent: "a", created_by: "u", created: "t", status: "pending" },
    ];
    const outs = await captureAllOutputs(async () => {
      await (mod.__test_command as any).parse(["request", "list", "--json"]);
    });
    assert(outs.logs.some((l) => l.includes('"trace_id"') || l.includes("cli.output")));
  });
});

Deno.test("plan revise passes comments to planCommands.revise", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.planCommands as any).revise = (id: string, comments: string[]) => {
      called = true;
      assertEquals(id, "p-1");
      assertEquals(comments, ["c1", "c2"]);
    };
    await (mod.__test_command as any).parse(["plan", "revise", "p-1", "-c", "c1", "-c", "c2"]);
    assert(called);
  });
});

Deno.test("git log prints no commits when none found", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.gitCommands as any).logByTraceId = (_t: string) => [];
    const outs = await captureAllOutputs(async () => {
      await (mod.__test_command as any).parse(["git", "log", "-t", "nope"]);
    });
    assert(outs.logs.some((l) => l.includes("No commits found") || l.includes("git.log")));
  });
});

Deno.test("portal remove --keep-card preserves context card", async () => {
  await withTestMod(async (mod, ctx) => {
    let called = false;
    (ctx.portalCommands as any).remove = (alias: string, opts?: any) => {
      called = true;
      assertEquals(alias, "KeepMe");
      assertEquals(opts?.keepCard, true);
    };
    await (mod.__test_command as any).parse(["portal", "remove", "KeepMe", "--keep-card"]);
    assert(called);
  });
});

Deno.test("daemon logs supports --follow option", async () => {
  await withTestMod(async (mod, ctx) => {
    let calledWithFollow = false;
    (ctx.daemonCommands as any).logs = (_lines: number, follow: boolean) => {
      calledWithFollow = follow === true;
    };
    await (mod.__test_command as any).parse(["daemon", "logs", "--follow"]);
    assert(calledWithFollow);
  });
});

Deno.test("blueprint create error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.blueprintCommands as any).create = (_id: string, _opts: any) => {
      throw new Error("boom");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse([
        "blueprint",
        "create",
        "agent-x",
        "-n",
        "Name",
        "-m",
        "mock:test",
      ]);
    });
    assert(errors.some((e) => e.includes("boom")));
  });
});

Deno.test("request inline --json prints JSON output", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).create = (_desc: string, _opts?: any) => {
      return { filename: "/tmp/r.md", trace_id: "t-json", priority: "normal", agent: "a", path: "/tmp" };
    };
    const outs = await captureAllOutputs(async () => {
      await (mod.__test_command as any).parse(["request", "make json", "--json"]);
    });
    assert(outs.logs.some((l) => l.includes('"trace_id"') || l.includes("cli.output")));
  });
});

Deno.test("plan list empty prints hint", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.planCommands as any).list = (_s?: string) => [];
    const outs = await captureAllOutputs(async () => {
      await (mod.__test_command as any).parse(["plan", "list"]);
    });
    assert(outs.logs.some((l) => l.includes("No plans found") || l.includes("plan.list")));
  });
});

Deno.test("git branches passes pattern option to listBranches", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.gitCommands as any).listBranches = (pattern?: string) => {
      assertEquals(pattern, "feat/*");
      return [];
    };
    await (mod.__test_command as any).parse(["git", "branches", "--pattern", "feat/*"]);
  });
});

Deno.test("changeset show error exits with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.changesetCommands as any).show = (_id: string) => {
      throw new Error("not found");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["changeset", "show", "cs-1"]);
    });
    assert(errors.some((e) => e.includes("not found")));
  });
});

Deno.test("portal verify with alias invokes portalCommands.verify", async () => {
  await withTestMod(async (mod, ctx) => {
    let calledWithAlias = false;
    (ctx.portalCommands as any).verify = (alias?: string) => {
      calledWithAlias = alias === "MyPortal";
      return [];
    };
    await (mod.__test_command as any).parse(["portal", "verify", "MyPortal"]);
    assert(calledWithAlias);
  });
});

Deno.test("blueprint create successful prints created message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.blueprintCommands as any).create = (id: string, opts: any) => ({
      agent_id: id,
      name: opts.name,
      model: opts.model,
      path: "/tmp",
    });
    const outs = await captureAllOutputs(async () => {
      await (mod.__test_command as any).parse(["blueprint", "create", "agent-y", "-n", "N", "-m", "mock:test"]);
    });
    assert(outs.logs.some((l) => l.includes("blueprint.created") || l.includes("agent-y")));
  });
});

// ---- Additional focused tests to improve coverage for src/cli/exoctl.ts ----

Deno.test("exoctl: --version prints version and exits (in-process)", async () => {
  await withTestMod(async (mod, _ctx) => {
    const origExit = Deno.exit;
    const origLog = console.log;
    let out = "";
    console.log = (msg: string) => (out += msg + "\n");
    (Deno as any).exit = (code?: number) => {
      throw new Error(`DENO_EXIT:${code ?? 0}`);
    };
    try {
      await (mod.__test_command as any).parse(["--version"]);
    } catch (e: any) {
      if (!e.message.startsWith("DENO_EXIT:")) throw e;
    } finally {
      (Deno as any).exit = origExit;
      console.log = origLog;
    }
    assertStringIncludes(out, "1.0.0");
  });
});

Deno.test("request --file --dry-run prints human output", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).createFromFile = (_file: string, _opts?: any) => ({
      filename: "/tmp/exo-test/request-file.md",
      trace_id: "trace-file-1",
      priority: "normal",
      agent: "file-agent",
      path: "/tmp",
    });
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["request", "--file", "/tmp/some.md", "--dry-run"]);
    });
    assert(out.includes("request.created") || out.includes("trace-file-1"));
  });
});

Deno.test("request --file --json --dry-run prints JSON output", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).createFromFile = (_file: string, _opts?: any) => ({
      filename: "/tmp/exo-test/request-file2.md",
      trace_id: "trace-file-2",
      priority: "high",
      agent: "file-agent",
      path: "/tmp",
    });
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["request", "--file", "/tmp/some.md", "--json", "--dry-run"]);
    });
    assert(out.includes('"trace_id"') || out.includes("trace-file-2"));
  });
});

Deno.test("request --file errors exit with message", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).createFromFile = (_file: string, _opts?: any) => {
      throw new Error("file missing");
    };
    const { errors } = await expectExitWithLogs(async () => {
      await (mod.__test_command as any).parse(["request", "--file", "/tmp/missing.md"]);
    });
    assert(errors.some((e) => e.includes("file missing")));
  });
});

Deno.test("request inline --dry-run with --json prefers dry-run", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.requestCommands as any).create = (_desc: string, _opts?: any) => ({
      filename: "/tmp/req.md",
      trace_id: "t-dry",
      priority: "normal",
      agent: "a",
      path: "/tmp",
    });
    const outs = await captureAllOutputs(async () => {
      await (mod.__test_command as any).parse(["request", "Do something", "--dry-run", "--json"]);
    });
    const joined = [...outs.logs, ...outs.warns, ...outs.errs].join("\n");
    assert(joined.includes("cli.dry_run") && !joined.includes('"trace_id"'));
  });
});

Deno.test("plan list passes status filter to planCommands.list", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.planCommands as any).list = (status?: string) => {
      assertEquals(status, "review");
      return [{ id: "p-filter", status: "review", trace_id: "t" }];
    };
    const out = await captureConsoleOutput(async () => {
      await (mod.__test_command as any).parse(["plan", "list", "--status", "review"]);
    });
    assert(out.includes("p-filter"));
  });
});

Deno.test("blueprint validate valid prints success", async () => {
  await withTestMod(async (mod, ctx) => {
    (ctx.blueprintCommands as any).validate = (_id: string) => ({ valid: true, warnings: [] });
    const outs = await captureAllOutputs(async () => {
      await (mod.__test_command as any).parse(["blueprint", "validate", "good-agent"]);
    });
    const joined = [...outs.logs, ...outs.warns, ...outs.errs].join("\n");
    assert(joined.includes("valid") || joined.includes("✅") || joined.includes("blueprint.valid"));
  });
});

// Test the initialization logic used in non-test runtime (success and fallback paths)
Deno.test("__test_initializeServices succeeds when environment allows", async () => {
  await withTestMod(async (mod) => {
    const res = await mod.__test_initializeServices();
    assertEquals(res.success, true);
    assertExists(res.config);
    assertExists(res.provider);
  });
});

Deno.test("__test_initializeServices returns fallback when simulated failure", async () => {
  await withTestMod(async (mod) => {
    const res = await mod.__test_initializeServices({ simulateFail: true });
    assertEquals(res.success, false);
    assertStringIncludes(res.error, "simulate-failure");
    assertEquals(res.config.paths.knowledge, "Knowledge");
  });
});
