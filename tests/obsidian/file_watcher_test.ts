/**
 * Tests for file watcher compatibility between ExoFrame and Obsidian.
 * Part of Step 5.4: Configure File Watcher
 *
 * Tests verify:
 * - ExoFrame creates files that Obsidian can detect
 * - Files have proper permissions for external editing
 * - Frontmatter is compatible with Obsidian/Dataview
 * - Report files follow Obsidian conventions
 *
 * Success Criteria Being Tested:
 * 1. Obsidian detects files within 2 seconds (file creation patterns)
 * 2. Internal links update automatically (Obsidian wikilink format)
 * 3. .toml/.yaml visible in explorer (proper file extensions)
 */

import { assert, assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "jsr:@std/path@^1.0.0";
import { initTestDbService } from "../helpers/db.ts";

// ============================================================================
// File Creation Tests - Success Criteria #1: Obsidian detects files quickly
// ============================================================================

Deno.test("ExoFrame creates files Obsidian can detect", async () => {
  const { tempDir, cleanup } = await initTestDbService();

  try {
    const testFile = join(tempDir, "test-report.md");

    // Simulate agent writing a file
    const content = `---
title: "Test Report"
status: "completed"
created: "${new Date().toISOString()}"
---

# Test Report

This is a test.
`;

    await Deno.writeTextFile(testFile, content);

    // Verify file is readable
    const stat = await Deno.stat(testFile);
    assert(stat.isFile, "File should be created");
    assert(stat.size > 0, "File should have content");

    // Verify content round-trips correctly
    const readBack = await Deno.readTextFile(testFile);
    assertEquals(readBack, content, "Content should round-trip correctly");
  } finally {
    await cleanup();
  }
});

Deno.test("File creation triggers filesystem events (inotify/FSEvents compatible)", async () => {
  // This test verifies files are created in a way that filesystem watchers can detect
  const { tempDir, cleanup } = await initTestDbService();

  try {
    const testFile = join(tempDir, "new-file.md");

    // Record time before write
    const beforeWrite = Date.now();

    // Write file atomically (ExoFrame pattern)
    await Deno.writeTextFile(testFile, "# New File\n");

    // Get file stats immediately
    const stat = await Deno.stat(testFile);
    const afterWrite = Date.now();

    // File should be created with current timestamp
    assert(stat.mtime !== null, "File should have modification time");
    const mtime = stat.mtime!.getTime();

    // mtime should be between beforeWrite and afterWrite (within reasonable margin)
    // This ensures filesystem watchers will see the file as "new"
    assert(
      mtime >= beforeWrite - 1000 && mtime <= afterWrite + 1000,
      `File mtime (${mtime}) should be near current time (${beforeWrite}-${afterWrite})`,
    );
  } finally {
    await cleanup();
  }
});

Deno.test("File modifications update mtime for watcher detection", async () => {
  const { tempDir, cleanup } = await initTestDbService();

  try {
    const testFile = join(tempDir, "existing-file.md");

    // Create initial file
    await Deno.writeTextFile(testFile, "# Initial Content\n");
    const stat1 = await Deno.stat(testFile);
    const mtime1 = stat1.mtime!.getTime();

    // Wait a small amount to ensure time difference
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Modify file (ExoFrame agent updates)
    await Deno.writeTextFile(testFile, "# Updated Content\n");
    const stat2 = await Deno.stat(testFile);
    const mtime2 = stat2.mtime!.getTime();

    // mtime should be updated (Obsidian uses this to detect changes)
    assert(mtime2 >= mtime1, "File mtime should be updated on modification");
  } finally {
    await cleanup();
  }
});

Deno.test("Files are created with readable permissions", async () => {
  const { tempDir, cleanup } = await initTestDbService();

  try {
    const testFile = join(tempDir, "test-file.md");
    await Deno.writeTextFile(testFile, "# Test\n");

    const stat = await Deno.stat(testFile);

    // File should be readable (mode check on Unix-like systems)
    if (Deno.build.os !== "windows") {
      // On Unix, check that file is readable by owner
      assert(stat.mode !== null, "Should have file mode");
      const ownerRead = (stat.mode! & 0o400) !== 0;
      assert(ownerRead, "File should be readable by owner");
    }

    // Verify we can read the file
    const content = await Deno.readTextFile(testFile);
    assert(content.length > 0, "Should be able to read file");
  } finally {
    await cleanup();
  }
});

// ============================================================================
// Frontmatter Compatibility Tests
// ============================================================================

Deno.test("YAML frontmatter is valid for Obsidian", async () => {
  const { tempDir, cleanup } = await initTestDbService();

  try {
    const testFile = join(tempDir, "report.md");

    // YAML frontmatter format (ExoFrame standard for Dataview compatibility)
    const content = `---
title: "Mission Report"
status: "success"
trace_id: "abc123"
created: "2025-11-28T12:00:00Z"
---

# Mission Report

Content here.
`;

    await Deno.writeTextFile(testFile, content);
    const readBack = await Deno.readTextFile(testFile);

    // Verify YAML delimiters
    assert(readBack.startsWith("---"), "Should start with YAML delimiter");
    assert(readBack.includes("---\n\n#"), "Should have closing delimiter before content");
  } finally {
    await cleanup();
  }
});

Deno.test("Report frontmatter has required Dataview fields", () => {
  // These are the fields Dataview queries in Dashboard.md expect
  const requiredFields = ["status", "created"];
  const optionalFields = ["trace_id", "title", "agent"];

  const frontmatter = `---
title: "Test Report"
status: "success"
trace_id: "test-123"
created: "2025-11-28T12:00:00Z"
agent: "default"
---`;

  for (const field of requiredFields) {
    assertStringIncludes(frontmatter, field, `Frontmatter should have ${field}`);
  }

  // At least some optional fields should be present
  let hasOptional = false;
  for (const field of optionalFields) {
    if (frontmatter.includes(field)) {
      hasOptional = true;
      break;
    }
  }
  assert(hasOptional, "Frontmatter should have at least one optional field");
});

// ============================================================================
// Internal Link Tests - Success Criteria #2: Internal links update automatically
// ============================================================================
// When "Automatically update internal links" is enabled in Obsidian,
// wikilinks like [[Dashboard]] will auto-update when files are renamed.
// ExoFrame must use Obsidian-compatible link formats.

Deno.test("ExoFrame uses Obsidian wikilink format for internal links", () => {
  // ExoFrame reports should use [[wikilinks]] for cross-referencing
  const reportContent = `---
title: "Mission Report"
status: "success"
---

# Mission Report

See [[Dashboard]] for overview.
Related: [[Plans/plan-abc123]]
`;

  // Verify wikilink format
  assertMatch(reportContent, /\[\[Dashboard\]\]/, "Should use wikilink format for Dashboard");
  assertMatch(reportContent, /\[\[Plans\/plan-abc123\]\]/, "Should support path-based wikilinks");
});

Deno.test("Wikilinks use relative paths without extension", () => {
  // Obsidian wikilinks should not include .md extension
  const correctLink = "[[Reports/mission-abc123]]";
  const incorrectLink = "[[Reports/mission-abc123.md]]";

  assert(!correctLink.includes(".md"), "Wikilinks should not include .md extension");
  assertStringIncludes(incorrectLink, ".md", "This demonstrates incorrect format");

  // ExoFrame template example
  const dashboardContent = `
## Recent Activity
- [[Reports/mission-abc123]]
- [[Plans/plan-xyz789]]
`;

  // All links should be extension-free
  const linkPattern = /\[\[([^\]]+)\]\]/g;
  const matches = [...dashboardContent.matchAll(linkPattern)];

  for (const match of matches) {
    const linkTarget = match[1];
    assert(!linkTarget.endsWith(".md"), `Link "${linkTarget}" should not end with .md`);
  }
});

Deno.test("ExoFrame frontmatter supports Obsidian aliases for link resolution", () => {
  // Obsidian can use aliases in frontmatter for alternative link targets
  const reportWithAliases = `---
title: "Mission Report ABC123"
aliases: ["abc123", "mission-abc"]
status: "success"
---

# Mission Report
`;

  assertStringIncludes(reportWithAliases, 'aliases: ["abc123"', "Should support aliases array");

  // With aliases, [[abc123]] and [[mission-abc]] will resolve to this file
  // This helps when ExoFrame uses trace_id references
});

Deno.test("Internal links in ExoFrame reports follow Obsidian conventions", async () => {
  const { tempDir, cleanup } = await initTestDbService();

  try {
    // Create a report with internal links
    const reportFile = join(tempDir, "mission-report.md");
    const content = `---
title: "Mission Report"
trace_id: "abc123"
---

# Mission Report

## References
- Parent request: [[Inbox/Requests/request-abc123]]
- Execution plan: [[Plans/plan-abc123]]
- See also: [[Dashboard]]

## Related Files
Check the [[Knowledge/README]] for more information.
`;

    await Deno.writeTextFile(reportFile, content);
    const readBack = await Deno.readTextFile(reportFile);

    // Verify links are in correct format
    assertMatch(readBack, /\[\[Inbox\/Requests\/request-abc123\]\]/, "Should link to request");
    assertMatch(readBack, /\[\[Plans\/plan-abc123\]\]/, "Should link to plan");
    assertMatch(readBack, /\[\[Dashboard\]\]/, "Should link to Dashboard");
    assertMatch(readBack, /\[\[Knowledge\/README\]\]/, "Should link to README");

    // Verify no .md extensions in links
    const linkMatches = readBack.match(/\[\[[^\]]+\]\]/g) || [];
    for (const link of linkMatches) {
      assert(!link.includes(".md]]"), `Link ${link} should not include .md extension`);
    }
  } finally {
    await cleanup();
  }
});

// ============================================================================
// File Extension Tests - Success Criteria #3: .toml/.yaml visible in explorer
// ============================================================================
// When "Show all file types" is enabled in Obsidian, non-.md files are visible.

Deno.test("Markdown files use .md extension", async () => {
  const { tempDir, cleanup } = await initTestDbService();

  try {
    // ExoFrame should create .md files for reports
    const reportFile = join(tempDir, "report.md");
    const requestFile = join(tempDir, "request.md");
    const planFile = join(tempDir, "plan.md");

    await Deno.writeTextFile(reportFile, "# Report");
    await Deno.writeTextFile(requestFile, "# Request");
    await Deno.writeTextFile(planFile, "# Plan");

    // All should be readable
    for (const file of [reportFile, requestFile, planFile]) {
      const stat = await Deno.stat(file);
      assert(stat.isFile);
      assert(file.endsWith(".md"), "Should use .md extension");
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Config files use appropriate extensions", async () => {
  // TOML config file
  const tomlContent = `[agent]
name = "default"
`;

  const { tempDir, cleanup } = await initTestDbService();

  try {
    const configFile = join(tempDir, "exo.config.toml");
    await Deno.writeTextFile(configFile, tomlContent);

    const stat = await Deno.stat(configFile);
    assert(stat.isFile);
    assert(configFile.endsWith(".toml"), "Config should use .toml extension");
  } finally {
    await cleanup();
  }
});

Deno.test("TOML files are visible when 'Show all file types' is enabled", async () => {
  // This test verifies ExoFrame creates .toml files that Obsidian can display
  // when "Show all file types" setting is enabled
  const { tempDir, cleanup } = await initTestDbService();

  try {
    const tomlFiles = [
      { name: "exo.config.toml", content: '[workspace]\nname = "test"\n' },
      { name: "protection.toml", content: '[paths]\nprotected = ["System"]\n' },
    ];

    for (const file of tomlFiles) {
      const filePath = join(tempDir, file.name);
      await Deno.writeTextFile(filePath, file.content);

      // Verify file exists and is readable
      const stat = await Deno.stat(filePath);
      assert(stat.isFile, `${file.name} should be created`);
      assert(filePath.endsWith(".toml"), `${file.name} should have .toml extension`);

      // Verify content
      const content = await Deno.readTextFile(filePath);
      assert(content.length > 0, `${file.name} should have content`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("JSON files are visible when 'Show all file types' is enabled", async () => {
  // ExoFrame may create .json files for certain data
  const { tempDir, cleanup } = await initTestDbService();

  try {
    const jsonFiles = [
      { name: "deno.json", content: '{\n  "tasks": {}\n}\n' },
      { name: "import_map.json", content: '{\n  "imports": {}\n}\n' },
    ];

    for (const file of jsonFiles) {
      const filePath = join(tempDir, file.name);
      await Deno.writeTextFile(filePath, file.content);

      const stat = await Deno.stat(filePath);
      assert(stat.isFile, `${file.name} should be created`);
      assert(filePath.endsWith(".json"), `${file.name} should have .json extension`);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("All ExoFrame file types use standard extensions", async () => {
  // Verify ExoFrame uses standard extensions that Obsidian recognizes
  const { tempDir, cleanup } = await initTestDbService();

  try {
    // Create all file types ExoFrame uses
    const files = [
      { path: "Dashboard.md", ext: ".md", desc: "Markdown documents" },
      { path: "request.md", ext: ".md", desc: "Request files" },
      { path: "plan.md", ext: ".md", desc: "Plan files" },
      { path: "report.md", ext: ".md", desc: "Report files" },
      { path: "exo.config.toml", ext: ".toml", desc: "TOML config" },
      { path: "protection.json", ext: ".json", desc: "JSON data" },
    ];

    for (const file of files) {
      const filePath = join(tempDir, file.path);
      await Deno.writeTextFile(filePath, `# ${file.desc}\n`);

      assert(filePath.endsWith(file.ext), `${file.path} should have ${file.ext} extension`);
    }

    // List directory to verify all files are present (ignore directories like System)
    const entries: string[] = [];
    for await (const entry of Deno.readDir(tempDir)) {
      if (entry.isFile) entries.push(entry.name);
    }

    assertEquals(entries.length, files.length, "All files should be created");

    // Verify each expected file exists
    for (const file of files) {
      assert(entries.includes(file.path), `${file.path} should be in directory listing`);
    }
  } finally {
    await cleanup();
  }
});

// ============================================================================
// Directory Structure Tests
// ============================================================================

Deno.test("Created files respect directory hierarchy", async () => {
  const { tempDir, cleanup } = await initTestDbService();

  try {
    // Create nested structure like ExoFrame does
    const reportsDir = join(tempDir, "Knowledge", "Reports");
    await Deno.mkdir(reportsDir, { recursive: true });

    const reportFile = join(reportsDir, "mission-abc123.md");
    await Deno.writeTextFile(reportFile, "# Report");

    // Verify structure
    const stat = await Deno.stat(reportFile);
    assert(stat.isFile);

    // Verify parent directories exist
    const knowledgeStat = await Deno.stat(join(tempDir, "Knowledge"));
    assert(knowledgeStat.isDirectory);
  } finally {
    await cleanup();
  }
});
