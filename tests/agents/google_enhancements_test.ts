import { assert, assertEquals } from "https://deno.land/std@0.221.0/assert/mod.ts";
import { parse } from "https://deno.land/std@0.221.0/yaml/mod.ts";

Deno.test("Google enhancements: verify sections in google.md", async () => {
  const content = await Deno.readTextFile("agents/providers/google.md");
  assert(content.includes("Key points"));
  assert(content.includes("Canonical prompt (short):"));
  assert(content.includes("Examples"));
  assert(content.includes("Do / Don't"));
});

Deno.test("Google enhancements: verify sections in google-long-context.md", async () => {
  const content = await Deno.readTextFile("agents/providers/google-long-context.md");
  assert(content.includes("Key points"));
  assert(content.includes("Canonical prompt (short):"));
  assert(content.includes("Examples"));
  assert(content.includes("Do / Don't"));
});

Deno.test("Google enhancements: verify frontmatter schema", async () => {
  for (const path of ["agents/providers/google.md", "agents/providers/google-long-context.md"]) {
    const content = await Deno.readTextFile(path);
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    assert(fmMatch, `Frontmatter not found in ${path}`);

    const fm = parse(fmMatch[1]) as Record<string, unknown>;
    assertEquals(fm.agent, "google");
    assertEquals(fm.scope, "dev");
    assert(fm.short_summary);
    assert((fm.short_summary as string).length <= 200, `Short summary too long in ${path}`);
  }
});

Deno.test("Google enhancements: verify prompt templates", async () => {
  for (const path of ["agents/prompts/google-quickstart.md", "agents/prompts/google-tdd-workflow.md"]) {
    const content = await Deno.readTextFile(path);
    assert(content.includes("agent: google"), `Agent tag missing in ${path}`);
    assert(content.includes("Key points"), `Key points missing in ${path}`);
    assert(content.includes("Canonical prompt (short):"), `Canonical prompt missing in ${path}`);
    assert(content.includes("Examples"), `Examples missing in ${path}`);
  }
});
