/**
 * Tests for ExoFrame Agent Examples (Step 6.10)
 */

import { assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { exists } from "@std/fs";
import { join } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import { BlueprintFrontmatterSchema } from "../../src/schemas/blueprint.ts";

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

Deno.test("Agent Examples - Validate Blueprints", async () => {
  const examplesDir = "./Blueprints/Agents/examples";
  const exampleFiles = [
    "code-reviewer.md",
    "feature-developer.md",
    "api-documenter.md",
    "security-auditor.md",
    "research-synthesizer.md",
  ];

  for (const file of exampleFiles) {
    const filePath = join(examplesDir, file);
    const content = await Deno.readTextFile(filePath);

    // Extract frontmatter
    const yamlRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
    const match = content.match(yamlRegex);
    assertExists(match, `File ${file} should have frontmatter`);

    const yamlContent = match[1];
    const frontmatter = parseYaml(yamlContent);

    // Validate against schema
    const result = BlueprintFrontmatterSchema.safeParse(frontmatter);
    if (!result.success) {
      console.error(`Validation failed for ${file}:`, result.error);
    }
    assertEquals(result.success, true, `Blueprint ${file} should be valid`);
  }
});
