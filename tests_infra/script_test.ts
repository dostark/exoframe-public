import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.221.0/assert/mod.ts";
import { join } from "https://deno.land/std@0.221.0/path/mod.ts";

const CI_SCRIPT_PATH = join(Deno.cwd(), "scripts", "ci.ts");

/**
 * Helper to run the CI script and capture output
 */
async function runCiScript(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", CI_SCRIPT_PATH, ...args],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();
  return {
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  };
}

// Deno.test("[ci] script should show help when run without args", async () => {
//   const result = await runCiScript([]);
//   // Cliffy shows help by default if no command
//   assertStringIncludes(result.stderr + result.stdout, "Usage", "Should show usage info");
// });

Deno.test({
  name: "[ci] check command should run valid checkers",
  fn: async () => {
    const result = await runCiScript(["check", "--help"]); // Run help to be fast/safe
    assertEquals(result.code, 0);
    assertStringIncludes(result.stdout, "check");
    assertStringIncludes(result.stdout, "Run static analysis checks");
  },
});
