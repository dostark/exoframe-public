import { assert, assertEquals } from "https://deno.land/std@0.221.0/assert/mod.ts";
import { parse } from "https://deno.land/std@0.221.0/yaml/mod.ts";
import { join } from "@std/path";
import { getDefaultPaths } from "../../src/config/paths.ts";

const paths = getDefaultPaths(".");
const providersDir = join(paths.blueprints, "../.copilot/providers");
const promptsDir = join(paths.blueprints, "../.copilot/prompts");

Deno.test("Google enhancements: verify sections in google.md", async () => {
  const content = await Deno.readTextFile(join(providersDir, "google.md"));
  assert(content.includes("Key points"));
  assert(content.includes("Canonical prompt (short):"));
  assert(content.includes("Examples"));
  assert(content.includes("Do / Don't"));
});

Deno.test("Google enhancements: verify sections in google-long-context.md", async () => {
  const content = await Deno.readTextFile(join(providersDir, "google-long-context.md"));
  assert(content.includes("Key points"));
  assert(content.includes("Canonical prompt (short):"));
  assert(content.includes("Examples"));
  assert(content.includes("Do / Don't"));
});

Deno.test("Google enhancements: verify frontmatter schema", async () => {
  for (const relPath of ["google.md", "google-long-context.md"]) {
    const content = await Deno.readTextFile(join(providersDir, relPath));
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    assert(fmMatch, `Frontmatter not found in ${relPath}`);

    const fm = parse(fmMatch[1]) as Record<string, unknown>;
    assertEquals(fm.agent, "google");
    assertEquals(fm.scope, "dev");
    assert(fm.short_summary);
    assert((fm.short_summary as string).length <= 200, `Short summary too long in ${relPath}`);
  }
});

Deno.test("Google enhancements: verify prompt templates", async () => {
  for (const relPath of ["google-quickstart.md", "google-tdd-workflow.md"]) {
    const content = await Deno.readTextFile(join(promptsDir, relPath));
    assert(content.includes("agent: google"), `Agent tag missing in ${relPath}`);
    assert(content.includes("Key points"), `Key points missing in ${relPath}`);
    assert(content.includes("Canonical prompt (short):"), `Canonical prompt missing in ${relPath}`);
    assert(content.includes("Examples"), `Examples missing in ${relPath}`);
  }
});
