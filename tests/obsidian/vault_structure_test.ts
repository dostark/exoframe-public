/**
 * Tests for Obsidian vault structure configuration.
 * Part of Step 5.2: Configure Obsidian Vault
 *
 * TDD Approach:
 * 1. RED: Tests fail initially (missing directories, gitignore entries)
 * 2. GREEN: Create required structure, update gitignore
 * 3. REFACTOR: Improve scaffold script if needed
 *
 * Note: Knowledge/ is gitignored for user data. Templates are in templates/
 * The scaffold script creates the structure during deployment.
 */

import { assert, assertStringIncludes } from "jsr:@std/assert@^1.0.0";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a template file exists for the Knowledge folder
 */
async function templateExists(filename: string): Promise<boolean> {
  try {
    await Deno.stat(`templates/Knowledge_${filename}`);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Vault Structure Tests
// ============================================================================

Deno.test("Scaffold script creates Knowledge/Portals directory", async () => {
  const scaffold = await Deno.readTextFile("scripts/scaffold.sh");

  // Verify scaffold creates Portals directory
  assertStringIncludes(scaffold, "Knowledge/Portals");
});

Deno.test("Scaffold script creates Knowledge/Reports directory", async () => {
  const scaffold = await Deno.readTextFile("scripts/scaffold.sh");

  // Verify scaffold creates Reports directory
  assertStringIncludes(scaffold, "Knowledge/Reports");
});

Deno.test("Scaffold script creates Knowledge/Context directory", async () => {
  const scaffold = await Deno.readTextFile("scripts/scaffold.sh");

  // Verify scaffold creates Context directory for agent context cards
  assertStringIncludes(scaffold, "Knowledge/Context");
});

Deno.test("Dashboard.md template exists", async () => {
  const exists = await templateExists("Dashboard.md");
  assert(exists, "templates/Knowledge_Dashboard.md should exist");
});

Deno.test("Knowledge README template exists", async () => {
  const exists = await templateExists("README.md");
  assert(exists, "templates/Knowledge_README.md should exist");
});

// ============================================================================
// Gitignore Tests
// ============================================================================

Deno.test(".obsidian directory is gitignored", async () => {
  const gitignore = await Deno.readTextFile(".gitignore");

  // Should ignore .obsidian in any location
  const hasObsidian = gitignore.includes(".obsidian") ||
    gitignore.includes("**/.obsidian");

  assert(hasObsidian, ".gitignore should include .obsidian");
});

Deno.test("Knowledge directory is gitignored (user data)", async () => {
  const gitignore = await Deno.readTextFile(".gitignore");

  // Knowledge folder should be ignored (it's user-specific data)
  assertStringIncludes(gitignore, "Knowledge");
});

// ============================================================================
// Scaffold Integration Tests
// ============================================================================

Deno.test("Scaffold copies Dashboard.md to Knowledge folder", async () => {
  const scaffold = await Deno.readTextFile("scripts/scaffold.sh");

  // Should copy Dashboard template
  assertStringIncludes(scaffold, "Knowledge_Dashboard.md");
  assertStringIncludes(scaffold, "Knowledge/Dashboard.md");
});

Deno.test("Scaffold copies README.md to Knowledge folder", async () => {
  const scaffold = await Deno.readTextFile("scripts/scaffold.sh");

  // Should copy README template
  assertStringIncludes(scaffold, "Knowledge_README.md");
  assertStringIncludes(scaffold, "Knowledge/README.md");
});

Deno.test("Scaffold creates .gitkeep files for empty directories", async () => {
  const scaffold = await Deno.readTextFile("scripts/scaffold.sh");

  // Should create .gitkeep to preserve empty directories
  assertStringIncludes(scaffold, ".gitkeep");
});

// ============================================================================
// Vault Documentation Tests
// ============================================================================

Deno.test("Knowledge README documents vault structure", async () => {
  const readme = await Deno.readTextFile("templates/Knowledge_README.md");

  // Should document the vault structure
  assertStringIncludes(readme, "Dashboard");
  assertStringIncludes(readme, "Portals");
  assertStringIncludes(readme, "Reports");
});

Deno.test("Knowledge README documents Obsidian setup", async () => {
  const readme = await Deno.readTextFile("templates/Knowledge_README.md");

  // Should mention Obsidian
  assertStringIncludes(readme, "Obsidian");
});
