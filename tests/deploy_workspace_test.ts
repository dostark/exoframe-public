import { assert } from "https://deno.land/std@0.201.0/testing/asserts.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.201.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.201.0/fs/mod.ts";

const __dirname = dirname(fromFileUrl(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

Deno.test("deploy_workspace.sh --no-run creates deploy files", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "exoframe-deploy-test-" });
  try {
    const deployScript = join(REPO_ROOT, "scripts", "deploy_workspace.sh");

    const cmd = new Deno.Command("bash", {
      args: [deployScript, "--no-run", tmp],
      cwd: REPO_ROOT,
      stdout: "piped",
      stderr: "piped",
    });
    const res = await cmd.output();
    const out = new TextDecoder().decode(res.stdout || new Uint8Array());
    const err = new TextDecoder().decode(res.stderr || new Uint8Array());
    if (res.code !== 0) {
      console.error("deploy failed stdout:\n", out);
      console.error("deploy failed stderr:\n", err);
    }

    assert(res.code === 0, `deploy_workspace.sh exited with code ${res.code}`);

    // Basic expectations: README.md exists and scripts/setup_db.ts was copied
    const readme = join(tmp, "README.md");
    const setupScript = join(tmp, "scripts", "setup_db.ts");

    const readmeStat = await Deno.stat(readme);
    assert(readmeStat.isFile, "README.md not created in deployed workspace");

    const setupStat = await Deno.stat(setupScript);
    assert(setupStat.isFile, "setup_db.ts not copied to deployed workspace/scripts");

    // Verify migrate_db.ts was copied (required for setup_db.ts)
    const migrateScript = join(tmp, "scripts", "migrate_db.ts");
    assert(
      await exists(migrateScript),
      "migrate_db.ts not copied to deployed workspace/scripts",
    );

    // Verify migrations folder was copied
    const migrationsDir = join(tmp, "migrations");
    assert(
      await exists(migrationsDir),
      "migrations folder not copied to deployed workspace",
    );

    // Verify at least one migration file exists
    const initMigration = join(tmp, "migrations", "001_init.sql");
    assert(
      await exists(initMigration),
      "001_init.sql not copied to deployed workspace/migrations",
    );
  } finally {
    await Deno.remove(tmp, { recursive: true }).catch(() => {});
  }
});
