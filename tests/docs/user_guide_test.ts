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
// Obsidian Integration Documentation Tests
// ============================================================================

Deno.test("User Guide documents Dataview plugin requirement", async () => {
  const guide = await readUserGuide();

  assertStringIncludes(guide, "Dataview");
  assertStringIncludes(guide, "Community Plugins");
});

Deno.test("User Guide documents plugin installation steps", async () => {
  const guide = await readUserGuide();

  assertStringIncludes(guide, "Obsidian Settings");
  assertStringIncludes(guide, "Safe Mode");
  assertStringIncludes(guide, "Install and Enable");
});

Deno.test("User Guide lists required vs optional plugins", async () => {
  const guide = await readUserGuide();

  // Required plugins
  assertStringIncludes(guide, "Dataview");

  // Optional plugins
  assertStringIncludes(guide, "Templater");
});

Deno.test("User Guide documents Dashboard usage", async () => {
  const guide = await readUserGuide();
  const lower = guide.toLowerCase();

  const hasDashboardDocs = lower.includes("dashboard") &&
    (lower.includes("obsidian") || lower.includes("dataview"));

  assert(hasDashboardDocs, "User Guide should document Dashboard usage");
});

Deno.test("User Guide documents how to pin Dashboard", async () => {
  const guide = await readUserGuide();
  const lower = guide.toLowerCase();

  const hasPinning = lower.includes("pin") && lower.includes("dashboard");

  assert(hasPinning, "User Guide should explain how to pin Dashboard");
});

Deno.test("User Guide documents workspace layout saving", async () => {
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
  assertStringIncludes(guide, "Inbox");
  assertStringIncludes(guide, "Knowledge");
  assertStringIncludes(guide, "System");
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
