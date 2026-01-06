/**
 * Tests for ExoFrame User Guide documentation structure and content.
 *
 * Success Criteria:
 * - Test 1: User Guide has numbered main sections (1-4+)
 * - Test 2: Has Introduction section
 * - Test 3: Documents Obsidian plugin installation and configuration
 * - Test 4: Documents exoctl CLI commands and usage
 * - Test 5: Includes installation/deployment instructions
 * - Test 6: Documents file watcher behavior
 */

import { assert, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { readUserGuide } from "./helpers.ts";

// ============================================================================
// User Guide Structure Tests
// ============================================================================

Deno.test("User Guide has main sections", async () => {
  const guide = await readUserGuide();

  // Should have numbered main sections
  assertStringIncludes(guide, "## 1.");
  assertStringIncludes(guide, "## 2.");
  assertStringIncludes(guide, "## 3.");
  assertStringIncludes(guide, "## 4.");
});

Deno.test("User Guide has Introduction section", async () => {
  const guide = await readUserGuide();
  assertStringIncludes(guide, "Introduction");
});

Deno.test("User Guide has Installation section", async () => {
  const guide = await readUserGuide();
  const lower = guide.toLowerCase();

  const hasInstall = lower.includes("installation") || lower.includes("deployment");
  assert(hasInstall, "User Guide should have Installation/Deployment section");
});

Deno.test("User Guide has CLI Reference section", async () => {
  const guide = await readUserGuide();
  assertStringIncludes(guide, "CLI Reference");
});

// ============================================================================
// Memory Banks Documentation Tests
// ============================================================================

Deno.test("User Guide documents Memory Banks", async () => {
  const guide = await readUserGuide();

  assertStringIncludes(guide, "Memory Banks");
  assertStringIncludes(guide, "Memory/");
});

Deno.test("User Guide documents Memory Banks CLI commands", async () => {
  const guide = await readUserGuide();

  assertStringIncludes(guide, "exoctl memory");
  assertStringIncludes(guide, "memory projects");
  assertStringIncludes(guide, "memory execution");
});

Deno.test("User Guide documents Memory Banks directory structure", async () => {
  const guide = await readUserGuide();

  assertStringIncludes(guide, "Memory/");
  assertStringIncludes(guide, "Execution/");
  assertStringIncludes(guide, "Projects/");
});

Deno.test("User Guide documents TUI Dashboard usage", async () => {
  const guide = await readUserGuide();
  const lower = guide.toLowerCase();

  const hasDashboardDocs = lower.includes("dashboard") &&
    lower.includes("tui");

  assert(hasDashboardDocs, "User Guide should document TUI Dashboard usage");
});

Deno.test("User Guide documents Memory Banks search functionality", async () => {
  const guide = await readUserGuide();
  const lower = guide.toLowerCase();

  const hasSearch = lower.includes("memory") && lower.includes("search");

  assert(hasSearch, "User Guide should explain Memory Banks search");
});

Deno.test("User Guide documents structured data features", async () => {
  const guide = await readUserGuide();
  const lower = guide.toLowerCase();

  const hasWorkspace = lower.includes("workspace") &&
    (lower.includes("save") || lower.includes("layout"));

  assert(hasWorkspace, "User Guide should document workspace layout saving");
});

// ============================================================================
// CLI Documentation Tests
// ============================================================================

Deno.test("User Guide documents exoctl command", async () => {
  const guide = await readUserGuide();
  assertStringIncludes(guide, "exoctl");
});

Deno.test("User Guide documents daemon commands", async () => {
  const guide = await readUserGuide();

  assertStringIncludes(guide, "daemon start");
  assertStringIncludes(guide, "daemon stop");
});

Deno.test("User Guide documents plan commands", async () => {
  const guide = await readUserGuide();

  assertStringIncludes(guide, "plan list");
  assertStringIncludes(guide, "plan approve");
});

Deno.test("User Guide documents request commands", async () => {
  const guide = await readUserGuide();
  const lower = guide.toLowerCase();

  const hasRequest = lower.includes("request") &&
    (lower.includes("exoctl") || lower.includes("command"));

  assert(hasRequest, "User Guide should document request commands");
});

// ============================================================================
// Deployment Documentation Tests
// ============================================================================

Deno.test("User Guide documents deploy script", async () => {
  const guide = await readUserGuide();
  assertStringIncludes(guide, "deploy_workspace.sh");
});

Deno.test("User Guide documents workspace structure", async () => {
  const guide = await readUserGuide();

  // Key directories should be documented
  assertStringIncludes(guide, "Workspace");
  assertStringIncludes(guide, "Memory");
  assertStringIncludes(guide, ".exo");
  assertStringIncludes(guide, "Blueprints");
  assertStringIncludes(guide, "Portals");
});

Deno.test("User Guide documents deno task commands", async () => {
  const guide = await readUserGuide();

  assertStringIncludes(guide, "deno task");
});

// ============================================================================
// File Watcher Documentation Tests (Step 5.4)
// ============================================================================

Deno.test("User Guide documents file watcher configuration", async () => {
  const guide = await readUserGuide();
  const lower = guide.toLowerCase();

  // Should mention external file changes
  const hasFileChanges = lower.includes("external") ||
    lower.includes("file change") ||
    lower.includes("auto-reload") ||
    lower.includes("watcher");

  assert(
    hasFileChanges,
    "User Guide should document external file change handling",
  );
});

Deno.test("User Guide documents platform-specific notes", async () => {
  const guide = await readUserGuide();
  const lower = guide.toLowerCase();

  // Should mention at least one platform consideration
  const hasPlatformNotes = lower.includes("linux") ||
    lower.includes("macos") ||
    lower.includes("windows") ||
    lower.includes("inotify");

  assert(
    hasPlatformNotes,
    "User Guide should have platform-specific notes",
  );
});
