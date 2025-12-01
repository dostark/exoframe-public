/**
 * Tests for Obsidian vault structure and scaffold configuration.
 * Part of Step 5.2: Configure Obsidian Vault
 *
 * Success Criteria:
 * - Test 1: Scaffold creates Knowledge/Portals directory
 * - Test 2: Scaffold creates Knowledge/Reports directory
 * - Test 3: Scaffold creates Knowledge/Context directory
 * - Test 4: Dashboard template exists and is copied during deployment
 * - Test 5: Gitignore includes .obsidian directory
 * - Test 6: Scaffold creates .gitkeep files for empty directories
 *
 * Note: Template content tests are in tests/docs/
 */

import { assert, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { templateExists } from "./helpers.ts";

// ============================================================================
// Scaffold Directory Structure Tests
// ============================================================================

Deno.test("Scaffold script creates Knowledge/Portals directory", async () => {
  const scaffold = await Deno.readTextFile("scripts/scaffold.sh");
  assertStringIncludes(scaffold, "Knowledge/Portals");
});

Deno.test("Scaffold script creates Knowledge/Reports directory", async () => {
  const scaffold = await Deno.readTextFile("scripts/scaffold.sh");
  assertStringIncludes(scaffold, "Knowledge/Reports");
});

Deno.test("Scaffold script creates Knowledge/Context directory", async () => {
  const scaffold = await Deno.readTextFile("scripts/scaffold.sh");
  assertStringIncludes(scaffold, "Knowledge/Context");
});

// ============================================================================
// Template Existence Tests
// ============================================================================

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

  const hasObsidian = gitignore.includes(".obsidian") ||
    gitignore.includes("**/.obsidian");

  assert(hasObsidian, ".gitignore should include .obsidian");
});

Deno.test("Knowledge directory is gitignored (user data)", async () => {
  const gitignore = await Deno.readTextFile(".gitignore");
  assertStringIncludes(gitignore, "Knowledge");
});

// ============================================================================
// Scaffold Template Copy Tests
// ============================================================================

Deno.test("Scaffold copies Dashboard.md to Knowledge folder", async () => {
  const scaffold = await Deno.readTextFile("scripts/scaffold.sh");

  assertStringIncludes(scaffold, "Knowledge_Dashboard.md");
  assertStringIncludes(scaffold, "Knowledge/Dashboard.md");
});

Deno.test("Scaffold copies README.md to Knowledge folder", async () => {
  const scaffold = await Deno.readTextFile("scripts/scaffold.sh");

  assertStringIncludes(scaffold, "Knowledge_README.md");
  assertStringIncludes(scaffold, "Knowledge/README.md");
});

Deno.test("Scaffold creates .gitkeep files for empty directories", async () => {
  const scaffold = await Deno.readTextFile("scripts/scaffold.sh");
  assertStringIncludes(scaffold, ".gitkeep");
});
