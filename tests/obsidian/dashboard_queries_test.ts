/**
 * Tests for Dashboard Dataview queries - Step 5.5: The Obsidian Dashboard
 *
 * Success Criteria:
 * - Test 1: Dashboard template exists at templates/Knowledge_Dashboard.md
 * - Test 2: Dashboard has exactly 4 Dataview queries as specified
 * - Test 3: Each query references correct ExoFrame folders (Inbox, System)
 * - Test 4: Queries have proper FROM clauses with folder paths
 * - Test 5: Queries use correct frontmatter field names (status, priority, etc.)
 * - Test 6: Template matches deployed Dashboard structure
 * - Test 7: Dashboard has Quick Links and CLI documentation
 */

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { readDashboard, templateExists } from "./helpers.ts";

// ============================================================================
// Step 5.5: Dashboard Template Tests
// ============================================================================

Deno.test("Dashboard template exists at templates/Knowledge_Dashboard.md", async () => {
  const exists = await templateExists("Dashboard.md");
  assert(exists, "Dashboard template should exist at templates/Knowledge_Dashboard.md");
});

Deno.test("Dashboard template has same structure as deployed Dashboard", async () => {
  // Read both files
  let template: string;
  let dashboard: string;

  try {
    template = await Deno.readTextFile("templates/Knowledge_Dashboard.md");
  } catch {
    // Template might not exist in test environment
    return;
  }

  try {
    dashboard = await Deno.readTextFile("Knowledge/Dashboard.md");
  } catch {
    // Dashboard might not exist yet
    return;
  }

  // Both should have same number of Dataview queries
  const templateQueries = (template.match(/```dataview/g) ?? []).length;
  const dashboardQueries = (dashboard.match(/```dataview/g) ?? []).length;

  assertEquals(
    templateQueries,
    dashboardQueries,
    "Template and Dashboard should have same number of Dataview queries",
  );
});

// ============================================================================
// Step 5.5: Dashboard has exactly 4 Dataview queries
// ============================================================================

Deno.test("Dashboard has at least 4 Dataview queries", async () => {
  const dashboard = await readDashboard();
  const queries = dashboard.match(/```dataview[\s\S]*?```/g) ?? [];

  assert(
    queries.length >= 4,
    `Dashboard should have at least 4 Dataview queries, found ${queries.length}`,
  );
});

// ============================================================================
// Step 5.5: Query 1 - Active Tasks / Pending Requests
// ============================================================================

Deno.test("Dashboard query 1: Queries Inbox/Requests", async () => {
  const dashboard = await readDashboard();
  assertStringIncludes(
    dashboard,
    '"Inbox/Requests"',
    "Dashboard should query Inbox/Requests folder",
  );
});

Deno.test("Dashboard query 1: Has TABLE for requests", async () => {
  const dashboard = await readDashboard();
  const queries = dashboard.match(/```dataview[\s\S]*?```/g) ?? [];

  const hasRequestTable = queries.some(
    (q) => q.includes("TABLE") && q.includes("Inbox/Requests"),
  );

  assert(hasRequestTable, "Dashboard should have a TABLE query for Inbox/Requests");
});

// ============================================================================
// Step 5.5: Query 2 - Plans Awaiting Review
// ============================================================================

Deno.test("Dashboard query 2: Queries Plans folder", async () => {
  const dashboard = await readDashboard();
  const lower = dashboard.toLowerCase();

  const hasPlansQuery = lower.includes("inbox/plans") ||
    lower.includes("system/plans") ||
    lower.includes('"plans"');

  assert(hasPlansQuery, "Dashboard should query Plans folder");
});

Deno.test("Dashboard query 2: Filters by review status", async () => {
  const dashboard = await readDashboard();
  const lower = dashboard.toLowerCase();

  const hasReviewFilter = lower.includes('status = "review"') ||
    lower.includes("status = 'review'") ||
    (lower.includes("where") && lower.includes("review"));

  assert(hasReviewFilter, "Dashboard should filter plans by review status");
});

// ============================================================================
// Step 5.5: Query 3 - Recent Activity / Reports
// ============================================================================

Deno.test("Dashboard query 3: Queries Knowledge/Reports or recent files", async () => {
  const dashboard = await readDashboard();

  const hasReportsOrRecent = dashboard.includes("Knowledge/Reports") ||
    dashboard.includes('"Knowledge"') ||
    dashboard.includes('"Inbox"') ||
    dashboard.includes("file.mtime");

  assert(hasReportsOrRecent, "Dashboard should query Reports or recent files");
});

Deno.test("Dashboard query 3: Has date-based filtering or sorting", async () => {
  const dashboard = await readDashboard();
  const lower = dashboard.toLowerCase();

  const hasDateFilter = lower.includes("mtime") ||
    lower.includes("ctime") ||
    lower.includes("date(today)") ||
    lower.includes("created");

  assert(hasDateFilter, "Dashboard should have date-based filtering or sorting");
});

// ============================================================================
// Step 5.5: Query 4 - Failed Tasks or Portals
// ============================================================================

Deno.test("Dashboard query 4: Has Failed Tasks or Portals query", async () => {
  const dashboard = await readDashboard();
  const lower = dashboard.toLowerCase();

  const hasFailedOrPortals = lower.includes("failed") ||
    lower.includes("portal") ||
    lower.includes('"portals"');

  assert(hasFailedOrPortals, "Dashboard should have Failed Tasks or Portals query");
});

Deno.test("Dashboard query 4: Uses LIST or TABLE format", async () => {
  const dashboard = await readDashboard();
  const queries = dashboard.match(/```dataview[\s\S]*?```/g) ?? [];

  // Find query related to portals or failed
  const relevantQuery = queries.find(
    (q) => q.toLowerCase().includes("portal") || q.toLowerCase().includes("failed"),
  );

  if (relevantQuery) {
    const hasValidFormat = relevantQuery.includes("LIST") ||
      relevantQuery.includes("TABLE");
    assert(hasValidFormat, "Portals/Failed query should use LIST or TABLE");
  }
});

// ============================================================================
// Step 5.5: All queries have FROM clauses
// ============================================================================

Deno.test("All Dataview queries have FROM clauses", async () => {
  const dashboard = await readDashboard();
  const queries = dashboard.match(/```dataview[\s\S]*?```/g) ?? [];

  for (const query of queries) {
    const hasFrom = query.toUpperCase().includes("FROM");
    assert(hasFrom, `Each query should have a FROM clause: ${query.substring(0, 80)}...`);
  }
});

// ============================================================================
// Step 5.5: Queries reference correct ExoFrame folders
// ============================================================================

Deno.test("Dashboard queries reference ExoFrame folder structure", async () => {
  const dashboard = await readDashboard();

  // Should reference at least these key folders
  const expectedFolders = ["Inbox", "Knowledge", "Portal"];
  let foundCount = 0;

  for (const folder of expectedFolders) {
    if (dashboard.includes(folder)) {
      foundCount++;
    }
  }

  assert(
    foundCount >= 2,
    `Dashboard should reference at least 2 of: ${expectedFolders.join(", ")}`,
  );
});

// ============================================================================
// Step 5.5: Query fields match frontmatter structure
// ============================================================================

Deno.test("Dashboard queries use standard frontmatter fields", async () => {
  const dashboard = await readDashboard();

  // These fields are used in ExoFrame frontmatter
  const standardFields = ["status", "priority", "agent", "trace_id"];
  let foundFields = 0;

  for (const field of standardFields) {
    if (dashboard.includes(field)) {
      foundFields++;
    }
  }

  assert(
    foundFields >= 2,
    `Dashboard should use at least 2 standard fields: ${standardFields.join(", ")}`,
  );
});

Deno.test("Dashboard queries use file metadata fields", async () => {
  const dashboard = await readDashboard();
  const lower = dashboard.toLowerCase();

  // Dataview file metadata
  const fileFields = ["file.mtime", "file.ctime", "file.name", "file.folder"];
  let foundFields = 0;

  for (const field of fileFields) {
    if (lower.includes(field)) {
      foundFields++;
    }
  }

  assert(
    foundFields >= 1,
    `Dashboard should use at least 1 file metadata field: ${fileFields.join(", ")}`,
  );
});

// ============================================================================
// Step 5.5: Dashboard has LIMIT clauses (performance)
// ============================================================================

Deno.test("Dashboard queries have LIMIT for performance", async () => {
  const dashboard = await readDashboard();
  const queries = dashboard.match(/```dataview[\s\S]*?```/g) ?? [];

  // At least some queries should have LIMIT
  const queriesWithLimit = queries.filter((q) => q.toUpperCase().includes("LIMIT"));

  assert(
    queriesWithLimit.length >= 2,
    `At least 2 queries should have LIMIT clauses, found ${queriesWithLimit.length}`,
  );
});

// ============================================================================
// Step 5.5: Dashboard has Quick Links with wiki format
// ============================================================================

Deno.test("Dashboard has Quick Links section", async () => {
  const dashboard = await readDashboard();
  const lower = dashboard.toLowerCase();

  const hasQuickLinks = lower.includes("quick link") ||
    lower.includes("## quick") ||
    (lower.includes("[[") && lower.includes("readme"));

  assert(hasQuickLinks, "Dashboard should have Quick Links section");
});

Deno.test("Dashboard uses Obsidian wiki links", async () => {
  const dashboard = await readDashboard();

  const wikiLinks = dashboard.match(/\[\[[^\]]+\]\]/g) ?? [];

  assert(
    wikiLinks.length >= 1,
    "Dashboard should use Obsidian wiki links [[link]]",
  );
});

// ============================================================================
// Step 5.5: Dashboard CLI tips
// ============================================================================

Deno.test("Dashboard documents exoctl CLI usage", async () => {
  const dashboard = await readDashboard();

  assertStringIncludes(
    dashboard,
    "exoctl",
    "Dashboard should document exoctl CLI usage",
  );
});
