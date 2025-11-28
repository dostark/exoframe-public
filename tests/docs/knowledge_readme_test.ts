/**
 * Tests for Knowledge README template documentation.
 *
 * Tests verify:
 * - Knowledge README template exists
 * - Documents vault structure
 * - Documents Obsidian setup
 */

import { assert, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { readKnowledgeReadme, templateExists } from "./helpers.ts";

// ============================================================================
// Template Existence Tests
// ============================================================================

Deno.test("Knowledge README template exists", async () => {
  const exists = await templateExists("Knowledge_README.md");
  assert(exists, "templates/Knowledge_README.md should exist");
});

// ============================================================================
// Knowledge README Content Tests
// ============================================================================

Deno.test("Knowledge README documents vault structure", async () => {
  const readme = await readKnowledgeReadme();

  assertStringIncludes(readme, "Dashboard");
  assertStringIncludes(readme, "Portals");
  assertStringIncludes(readme, "Reports");
});

Deno.test("Knowledge README documents Obsidian setup", async () => {
  const readme = await readKnowledgeReadme();
  assertStringIncludes(readme, "Obsidian");
});

Deno.test("Knowledge README has main title", async () => {
  const readme = await readKnowledgeReadme();

  assert(
    readme.startsWith("# ") || readme.includes("\n# "),
    "Knowledge README should have a main title",
  );
});

Deno.test("Knowledge README documents folder purposes", async () => {
  const readme = await readKnowledgeReadme();
  const lower = readme.toLowerCase();

  // Should explain what each folder is for
  const hasContext = lower.includes("context") || lower.includes("card");
  const hasReports = lower.includes("report");

  assert(hasContext || hasReports, "README should document folder purposes");
});
