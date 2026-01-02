import { assert } from "jsr:@std/assert@^1.0.0";

Deno.test("Agent docs: testing.md documents CI pitfalls", async () => {
  const md = await Deno.readTextFile("agents/tests/testing.md");

  assert(md.includes("CI (GitHub Actions)"), "testing.md should have a CI section");
  assert(md.includes("CI=true"), "CI section should mention CI=true behavior");
  assert(md.includes("tests/helpers/env.ts"), "CI section should reference shared env helpers");
  assert(md.includes("EXO_ENABLE_PAID_LLM"), "CI section should mention paid LLM opt-in");
  assert(md.includes("Deno.execPath()"), "CI section should describe running exoctl via Deno.execPath()");
});
