/**
 * Tests for Dashboard content, Dataview queries, and structure.
 * Consolidates tests from Steps 5.1 and 5.3.
 *
 * Tests verify:
 * - Dashboard exists and has required sections
 * - Dataview queries are valid and well-formed
 * - Dashboard structure (title, separators, frontmatter)
 */

import { assert, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { dashboardExists, readDashboard } from "./helpers.ts";

// ============================================================================
// Dashboard Existence Tests
// ============================================================================

Deno.test("Dashboard.md should exist (template or Knowledge folder)", async () => {
  const exists = await dashboardExists();
  assert(exists, "Dashboard.md should exist in Knowledge/ or templates/");
});

// ============================================================================
// Dashboard Required Sections Tests
// ============================================================================

Deno.test("Dashboard has Pending Requests section", async () => {
  const dashboard = await readDashboard();
  const lower = dashboard.toLowerCase();

  const hasRequests = lower.includes("pending request") ||
    lower.includes("active request") ||
    (lower.includes("request") && lower.includes("pending"));

  assert(hasRequests, "Dashboard should have a Pending Requests section");
});

Deno.test("Dashboard has Plans section", async () => {
  const dashboard = await readDashboard();
  const lower = dashboard.toLowerCase();

  const hasPlans = lower.includes("plan") &&
    (lower.includes("review") || lower.includes("awaiting") || lower.includes("pending"));

  assert(hasPlans, "Dashboard should have a Plans section");
});

Deno.test("Dashboard has Recent Activity section", async () => {
  const dashboard = await readDashboard();
  const lower = dashboard.toLowerCase();

  const hasActivity = lower.includes("recent") ||
    lower.includes("activity") ||
    lower.includes("history");

  assert(hasActivity, "Dashboard should have a Recent Activity section");
});

Deno.test("Dashboard has Reports or Portals section", async () => {
  const dashboard = await readDashboard();
  const lower = dashboard.toLowerCase();

  const hasReportsOrPortals = lower.includes("report") || lower.includes("portal");

  assert(hasReportsOrPortals, "Dashboard should have Reports or Portals section");
});

// ============================================================================
// Dashboard Dataview Query Tests
// ============================================================================

Deno.test("Dashboard should have at least 3 Dataview queries", async () => {
  const dashboard = await readDashboard();

  const dataviewBlocks = dashboard.match(/```dataview[\s\S]*?```/g) ?? [];
  assert(
    dataviewBlocks.length >= 3,
    `Dashboard should have at least 3 Dataview queries, found ${dataviewBlocks.length}`,
  );
});

Deno.test("Dashboard should use valid Dataview query types", async () => {
  const dashboard = await readDashboard();

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

Deno.test("Dashboard queries Inbox/Requests folder", async () => {
  const dashboard = await readDashboard();
  assertStringIncludes(dashboard, "Inbox/Requests");
});

Deno.test("Dashboard queries include status field", async () => {
  const dashboard = await readDashboard();
  assertStringIncludes(dashboard, "status");
});

Deno.test("Dashboard has sorting (most recent first)", async () => {
  const dashboard = await readDashboard();
  const lower = dashboard.toLowerCase();

  const hasSorting = lower.includes("sort") && lower.includes("desc");

  assert(hasSorting, "Dashboard should sort items (most recent first)");
});

Deno.test("Dashboard should have properly closed code blocks", async () => {
  const dashboard = await readDashboard();

  const openBlocks = (dashboard.match(/```dataview/g) ?? []).length;
  const allCloseBlocks = (dashboard.match(/```(?!\w)/g) ?? []).length;

  assert(
    openBlocks <= allCloseBlocks,
    `Unclosed Dataview blocks: ${openBlocks} opened, ${allCloseBlocks} closed`,
  );
});

// ============================================================================
// Dashboard Structure Tests
// ============================================================================

Deno.test("Dashboard has main title", async () => {
  const dashboard = await readDashboard();

  assert(
    dashboard.startsWith("# ") || dashboard.match(/^---[\s\S]*?---\s*\n# /) ||
      dashboard.match(/^\+\+\+[\s\S]*?\+\+\+\s*\n# /),
    "Dashboard should have a main title",
  );
});

Deno.test("Dashboard has multiple sections (## headings)", async () => {
  const dashboard = await readDashboard();

  const headings = dashboard.match(/^##\s+.+$/gm) ?? [];
  assert(
    headings.length >= 2,
    `Dashboard should have at least 2 sections, found ${headings.length}`,
  );
});

Deno.test("Dashboard has horizontal separators between sections", async () => {
  const dashboard = await readDashboard();

  const separators = dashboard.match(/^---$/gm) ?? [];

  assert(
    separators.length >= 2,
    `Dashboard should have at least 2 section separators, found ${separators.length}`,
  );
});

Deno.test("Dashboard has Quick Links or Tips section", async () => {
  const dashboard = await readDashboard();
  const lower = dashboard.toLowerCase();

  const hasHelp = lower.includes("quick link") ||
    lower.includes("tip") ||
    lower.includes("exoctl") ||
    lower.includes("getting started");

  assert(hasHelp, "Dashboard should have Quick Links or Tips section");
});

// ============================================================================
// Dashboard Frontmatter Tests (Optional)
// ============================================================================

Deno.test("Dashboard frontmatter is valid if present", async () => {
  const dashboard = await readDashboard();

  // TOML frontmatter (+++)
  if (dashboard.startsWith("+++")) {
    const endIndex = dashboard.indexOf("+++", 3);
    assert(endIndex > 3, "TOML frontmatter should be properly closed");

    const frontmatter = dashboard.substring(3, endIndex).trim();
    if (frontmatter.length > 0) {
      assert(
        frontmatter.includes("=") || frontmatter.includes("["),
        "TOML frontmatter should have valid syntax",
      );
    }
  } // YAML frontmatter (---)
  else if (dashboard.startsWith("---")) {
    const endIndex = dashboard.indexOf("---", 3);
    assert(endIndex > 3, "YAML frontmatter should be properly closed");
  }
  // No frontmatter is also valid
});
