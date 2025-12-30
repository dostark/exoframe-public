import { Command } from "jsr:@cliffy/command@^1.0.0-rc.8";

/**
 * Runner helper to execute a command and return promise
 */
async function run(cmd: string[], description: string): Promise<boolean> {
  console.log(`\n⏳ Starting: ${description}...`);
  const start = Date.now();

  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "inherit",
    stderr: "inherit",
  });

  const { code } = await command.output();
  const duration = Date.now() - start;

  if (code === 0) {
    console.log(`✅ Completed: ${description} in ${duration}ms`);
    return true;
  } else {
    console.error(`❌ Failed: ${description} (Exit code: ${code})`);
    return false;
  }
}

async function runParallel(tasks: Array<{ cmd: string[]; desc: string }>): Promise<boolean> {
  const results = await Promise.all(tasks.map((t) => run(t.cmd, t.desc)));
  return results.every((r) => r === true);
}

const checkCommand = new Command()
  .description("Run static analysis checks (fmt, lint, type-check)")
  .action(async () => {
    const success = await runParallel([
      { cmd: ["deno", "task", "fmt:check"], desc: "Formatting Check" },
      { cmd: ["deno", "task", "lint"], desc: "Linting" },
      { cmd: ["deno", "check", "src/main.ts"], desc: "Type Checking" },
    ]);
    if (!success) Deno.exit(1);
  });

const testCommand = new Command()
  .description("Run tests")
  .option("--quick", "Skip slow integration tests")
  .action(async (options) => {
    if (options.quick) {
      // Example of how we might filter.
      // For now, let's just assume we run all if not specified otherwise
      console.log("ℹ️ Quick mode enabled (placeholder)");
    }

    // Run security tests in parellel with standard tests if possible,
    // but usually standard test includes everything.
    // Let's run security explicitly to be safe + standard suite.

    const success = await runParallel([
      { cmd: ["deno", "task", "test"], desc: "Unit & Integration Tests" },
      { cmd: ["deno", "task", "test:security"], desc: "Security Regression Tests" },
    ]);
    if (!success) Deno.exit(1);
  });

const buildCommand = new Command()
  .description("Build binaries")
  .action(async () => {
    const success = await run(["deno", "task", "compile"], "Compiling Binary");
    if (!success) Deno.exit(1);
  });

const allCommand = new Command()
  .description("Run full CI pipeline")
  .action(async () => {
    console.log("🚀 Starting Full CI Pipeline");
    const start = Date.now();

    // 1. Checks (Parallel)
    console.log("\n--- Phase 1: Static Checks ---");
    if (
      !await runParallel([
        { cmd: ["deno", "task", "fmt:check"], desc: "Formatting" },
        { cmd: ["deno", "task", "lint"], desc: "Linting" },
        { cmd: ["deno", "check", "src/main.ts"], desc: "Type Check" },
      ])
    ) Deno.exit(1);

    // 2. Tests (Parallel)
    console.log("\n--- Phase 2: Testing ---");
    if (
      !await runParallel([
        { cmd: ["deno", "task", "test"], desc: "test suite" },
      ])
    ) Deno.exit(1);

    // 3. Build
    console.log("\n--- Phase 3: Build ---");
    if (!await run(["deno", "task", "compile"], "Build")) Deno.exit(1);

    console.log(`\n🎉 CI Pipeline Completed Successfully in ${Date.now() - start}ms`);
  });

await new Command()
  .name("exo-ci")
  .version("0.1.0")
  .description("ExoFrame Unified CI Pipeline Pipeline")
  .command("check", checkCommand)
  .command("test", testCommand)
  .command("build", buildCommand)
  .command("all", allCommand)
  .parse(Deno.args);
