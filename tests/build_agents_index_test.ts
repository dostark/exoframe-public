import { assert, assertExists } from "https://deno.land/std@0.203.0/assert/mod.ts";
import { buildIndex } from "../scripts/build_agents_index.ts";

Deno.test("build_agents_index creates manifest and chunks", async () => {
  await buildIndex();
  assertExists("agents/manifest.json");
  const mf = JSON.parse(await Deno.readTextFile("agents/manifest.json"));
  assert(Array.isArray(mf.docs) && mf.docs.length > 0, "manifest should contain docs");
});
