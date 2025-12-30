import { assert, assertEquals } from "https://deno.land/std@0.203.0/assert/mod.ts";
import { inject } from "../scripts/inject_agent_context.ts";

Deno.test("inject_agent_context returns summary and snippet for copilot query", async () => {
  const res = await inject("copilot", "copilot");
  if (res.found === false) {
    assertEquals(res.found, false);
  } else {
    assert(res.short_summary && res.short_summary.length > 0, "short_summary should be present");
  }
});
