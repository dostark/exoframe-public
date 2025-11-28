/**
 * Tests for Obsidian plugin requirements and Dataview syntax validation.
 * Part of Step 5.1: Install Required Plugins
 *
 * TDD Approach:
 * 1. RED: These tests will fail initially (missing docs/Dashboard.md, incomplete User Guide)
 * 2. GREEN: Create Dashboard.md with valid Dataview queries, update User Guide
 * 3. REFACTOR: Improve Dataview queries and documentation as needed
 */

import { assert, assertStringIncludes } from "jsr:@std/assert@^1.0.0";

// ============================================================================
// User Guide Documentation Tests
// ============================================================================

Deno.test("User Guide should document Dataview plugin requirement", async () => {
  const readme = await Deno.readTextFile("docs/ExoFrame_User_Guide.md");

  assertStringIncludes(readme, "Dataview");
  assertStringIncludes(readme, "Community Plugins");
});

Deno.test("User Guide should document plugin installation steps", async () => {
  const readme = await Deno.readTextFile("docs/ExoFrame_User_Guide.md");

  // Should have step-by-step installation instructions
  assertStringIncludes(readme, "Obsidian Settings");
  assertStringIncludes(readme, "Safe Mode");
  assertStringIncludes(readme, "Install and Enable");
});

Deno.test("User Guide should list required vs optional plugins", async () => {
  const readme = await Deno.readTextFile("docs/ExoFrame_User_Guide.md");

  // Required plugins
  assertStringIncludes(readme, "Dataview");

  // Optional plugins should be mentioned
  assertStringIncludes(readme, "Templater");
});

// ============================================================================
// Dashboard Dataview Syntax Tests
// ============================================================================

Deno.test("Dashboard.md should exist in Knowledge folder", async () => {
  const stat = await Deno.stat("Knowledge/Dashboard.md");
  assert(stat.isFile, "Dashboard.md should exist as a file");
});

Deno.test("Dashboard should have at least 3 Dataview queries", async () => {
  const dashboard = await Deno.readTextFile("Knowledge/Dashboard.md");

  const dataviewBlocks = dashboard.match(/```dataview[\s\S]*?```/g) ?? [];
  assert(
    dataviewBlocks.length >= 3,
    `Dashboard should have at least 3 Dataview queries, found ${dataviewBlocks.length}`,
  );
});

Deno.test("Dashboard should use valid Dataview query types", async () => {
  const dashboard = await Deno.readTextFile("Knowledge/Dashboard.md");

  const dataviewBlocks = dashboard.match(/```dataview[\s\S]*?```/g) ?? [];

  for (const block of dataviewBlocks) {
    const hasValidType = block.includes("TABLE") ||
      block.includes("LIST") ||
      block.includes("TASK") ||
      block.includes("CALENDAR");

    assert(
      hasValidType,
      `Each Dataview block should use TABLE, LIST, TASK, or CALENDAR. Found: ${block.substring(0, 100)}...`,
    );
  }
});

Deno.test("Dashboard should query Inbox/Requests for pending requests", async () => {
  const dashboard = await Deno.readTextFile("Knowledge/Dashboard.md");

  // Dashboard should have a query for pending requests
  assertStringIncludes(dashboard, "Inbox/Requests");
  assertStringIncludes(dashboard, "status");
});

Deno.test("Dashboard should have properly closed code blocks", async () => {
  const dashboard = await Deno.readTextFile("Knowledge/Dashboard.md");

  const openBlocks = (dashboard.match(/```dataview/g) ?? []).length;

  // Count all closing triple backticks (not followed by a word character)
  const allCloseBlocks = (dashboard.match(/```(?!\w)/g) ?? []).length;

  assert(
    openBlocks <= allCloseBlocks,
    `Unclosed Dataview blocks: ${openBlocks} opened, ${allCloseBlocks} closed`,
  );
});

// ============================================================================
// Dashboard Content Structure Tests
// ============================================================================

Deno.test("Dashboard should have a title and sections", async () => {
  const dashboard = await Deno.readTextFile("Knowledge/Dashboard.md");

  // Should have a title
  assert(
    dashboard.startsWith("# ") || dashboard.includes("\n# "),
    "Dashboard should have a main heading",
  );

  // Should have multiple sections
  const headings = dashboard.match(/^##\s+.+$/gm) ?? [];
  assert(
    headings.length >= 2,
    `Dashboard should have at least 2 sections, found ${headings.length}`,
  );
});

Deno.test("Dashboard should include sections for requests, plans, and activity", async () => {
  const dashboard = await Deno.readTextFile("Knowledge/Dashboard.md");
  const lowerDashboard = dashboard.toLowerCase();

  // Should cover key ExoFrame concepts
  const hasRequests = lowerDashboard.includes("request");
  const hasPlans = lowerDashboard.includes("plan");
  const hasActivity = lowerDashboard.includes("recent") ||
    lowerDashboard.includes("activity") ||
    lowerDashboard.includes("history");

  assert(hasRequests, "Dashboard should have a requests section");
  assert(hasPlans, "Dashboard should reference plans");
  assert(hasActivity, "Dashboard should show recent activity");
});
