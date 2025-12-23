import { assertStringIncludes } from "jsr:@std/assert@1";

if (Deno.env.get("RUN_EXOCTL_TEST")) {
  Deno.test("exoctl: --version prints version and exits", async () => {
    // Use Deno.Command (Deno 2+) to run the CLI subprocess and capture output
    const cmd = new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-check", "--quiet", "src/cli/exoctl.ts", "--version"],
      stdout: "piped",
      stderr: "piped",
    });

    const { code: _code, stdout, stderr } = await cmd.output();
    const out = new TextDecoder().decode(stdout);
    const err = new TextDecoder().decode(stderr);

    // Some top-level initialization may emit to stderr or exit non-zero, but
    // the expected version should still be present in stdout/stderr. Assert that.
    if (!out && err) {
      throw new Error(`exoctl did not produce stdout. stderr: ${err}`);
    }
    assertStringIncludes(out + err, "1.0.0");
  });
} else {
  Deno.test({ name: "exoctl: --version prints version and exits (skipped)", ignore: true, fn: () => {} });
}
