/**
 * Tests for ExoFrame Agent Examples (Step 6.10)
 */

import { assertExists } from "jsr:@std/assert@^1.0.0";
import { exists } from "@std/fs";
import { join } from "@std/path";

Deno.test("Agent Examples - Files Exist", async () => {
  const examplesDir = "./Blueprints/Agents/examples";
  const templatesDir = "./Blueprints/Agents/templates";

  // Check example files
  const exampleFiles = [
    "code-reviewer.md",
    "feature-developer.md",
    "api-documenter.md",
    "security-auditor.md",
    "research-synthesizer.md",
    "README.md",
  ];

  for (const file of exampleFiles) {
    const filePath = join(examplesDir, file);
    assertExists(await exists(filePath), `Example file ${file} should exist`);
  }

  // Check template files
  const templateFiles = [
    "pipeline-agent.md.template",
    "collaborative-agent.md.template",
  ];

  for (const file of templateFiles) {
    const filePath = join(templatesDir, file);
    assertExists(await exists(filePath), `Template file ${file} should exist`);
  }
});
