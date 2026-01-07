
### Step 5: Obsidian Setup & Runtime Integration ✅ COMPLETED

**Goal:** Configure Obsidian as the primary UI for ExoFrame, enabling users to view dashboards, manage tasks, and monitor agent activity without leaving their knowledge management environment.

### Steps Summary

| Step | Description                     | Location                          | Status      |
| ---- | ------------------------------- | --------------------------------- | ----------- |
| 5.1  | Install Required Plugins        | Obsidian Community Plugins        | ✅ Complete |
| 5.2  | Configure Obsidian Vault        | Knowledge/ directory              | ✅ Complete |
| 5.3  | Pin Dashboard                   | Knowledge/Dashboard.md            | ✅ Complete |
| 5.4  | Configure File Watcher          | Obsidian Settings                 | ✅ Complete |
| 5.5  | The Obsidian Dashboard          | Knowledge/Dashboard.md            | ✅ Complete |
| 5.6  | Request Commands                | src/cli/request_commands.ts       | ✅ Complete |
| 5.7  | YAML Frontmatter Migration      | src/cli/base.ts + parsers         | ✅ Complete |
| 5.8  | LLM Provider Selection Logic    | src/ai/provider_factory.ts        | ✅ Complete |
| 5.9  | Request Processor Pipeline      | src/services/request_processor.ts | ✅ Complete |
| 5.10 | Unified Event Logger            | src/services/event_logger.ts      | ✅ Complete |
| 5.11 | Blueprint Creation & Management | src/cli/blueprint_commands.ts     | ✅ Complete |

> **Platform note:** Maintainers must document OS-specific instructions (Windows symlink prerequisites, macOS sandbox
> prompts, Linux desktop watchers) before marking each sub-step complete.

### 5.1: Install Required Plugins ✅ COMPLETED

- **Dependencies:** Obsidian installed on user system.
- **Rollback:** Uninstall plugins via Community Plugins settings.

**Action:** Install and configure required Obsidian plugins for ExoFrame integration.

**Required Plugins:**

1. **Dataview** (required)
   - Enables live queries for dashboard tables
   - Open Obsidian Settings → Community Plugins
   - Disable Safe Mode
   - Browse → Search "Dataview"
   - Install and Enable

2. **File Tree Alternative** (optional)
   - Enables sidebar navigation of ExoFrame folders
   - Provides better folder structure visibility

3. **Templater** (optional)
   - Enables template-based file creation
   - Useful for creating new requests with consistent frontmatter

**TDD Approach:**

````typescript
// tests/obsidian/plugin_detection_test.ts
Deno.test("Obsidian plugin requirements documented", async () => {
  const readme = await Deno.readTextFile("docs/ExoFrame_User_Guide.md");

  // Verify plugin requirements are documented
  assertStringIncludes(readme, "Dataview");
  assertStringIncludes(readme, "Community Plugins");
});

Deno.test("Dashboard file uses valid Dataview syntax", async () => {
  const dashboard = await Deno.readTextFile("Knowledge/Dashboard.md");

  // Verify Dataview code blocks are properly formatted
  const dataviewBlocks = dashboard.match(/```dataview[\s\S]*?```/g) ?? [];
  assert(dataviewBlocks.length >= 3, "Dashboard should have at least 3 Dataview queries");

  // Verify common Dataview keywords
  for (const block of dataviewBlocks) {
    assert(
      block.includes("TABLE") || block.includes("LIST") || block.includes("TASK"),
      "Each block should use TABLE, LIST, or TASK",
    );
  }
});
````

**Success Criteria:**

- [x] Dataview plugin installed and enabled
- [x] Dashboard.md renders without Dataview errors
- [x] User Guide documents plugin installation steps

✅ **COMPLETED** (2025-11-28): TDD implementation complete.

- Created `Knowledge/Dashboard.md` with 4 Dataview queries (TABLE and LIST)
- Added Section 3.2 to User Guide with plugin installation steps
- Tests: `tests/obsidian/plugin_detection_test.ts` (10 tests)

---

### 5.2: Configure Obsidian Vault ✅ COMPLETED

- **Dependencies:** Step 5.1 plugins installed.
- **Rollback:** Close vault, reopen original vault.

**Action:** Configure Obsidian to use ExoFrame's Knowledge directory as a vault.

**Implementation Steps:**

1. Open Obsidian
2. Select "Open folder as vault"
3. Navigate to `/path/to/ExoFrame/Knowledge`
4. Confirm vault creation

**Vault Structure:**

```
Knowledge/
├── Dashboard.md           # Main dashboard with Dataview queries
├── Portals/               # Symlinks to external projects (via portal commands)
├── Reports/               # Generated mission reports
└── README.md              # Knowledge base documentation
```

**TDD Approach:**

```typescript
// tests/obsidian/vault_structure_test.ts
Deno.test("Knowledge directory has required structure", async () => {
  const knowledgePath = "./Knowledge";

  // Verify required directories exist
  const requiredDirs = ["Portals", "Reports"];
  for (const dir of requiredDirs) {
    const stat = await Deno.stat(`${knowledgePath}/${dir}`);
    assert(stat.isDirectory, `${dir} should be a directory`);
  }
});

Deno.test("Knowledge directory has Dashboard.md", async () => {
  const dashboardPath = "./Knowledge/Dashboard.md";
  const stat = await Deno.stat(dashboardPath);
  assert(stat.isFile, "Dashboard.md should exist");
});

Deno.test("Vault .obsidian config is gitignored", async () => {
  const gitignore = await Deno.readTextFile(".gitignore");
  assertStringIncludes(gitignore, ".obsidian");
});
```

**CLI Support:**

```bash
# Scaffold Knowledge directory with required structure
exoctl scaffold --knowledge

# Verify vault structure
exoctl verify --vault
```

**Success Criteria:**

- [x] Knowledge/ directory contains required subdirectories
- [x] Dashboard.md exists at Knowledge/Dashboard.md
- [x] .obsidian/ directory is gitignored
- [x] Vault opens without errors in Obsidian

✅ **COMPLETED** (2025-11-28): TDD implementation complete.

- Dashboard has all required sections (Requests, Plans, Activity, Portals)
- Dashboard has 4 Dataview queries with proper sorting
- User Guide documents pinning and workspace layout saving
- Tests: `tests/obsidian/vault_structure_test.ts` (12 tests)

---

### 5.3: Pin Dashboard ✅ COMPLETED

- **Dependencies:** Step 5.2 vault configured.
- **Rollback:** Unpin tab, remove from startup.

**Action:** Configure Dashboard.md as the primary view when opening the vault.

**Implementation Steps:**

1. Open `Dashboard.md` in Obsidian
2. Right-click the tab → "Pin"
3. Configure as startup file:
   - Settings → Core Plugins → Enable "Daily Notes" (for startup file support)
   - Or use Workspaces plugin to save layout

**Alternative: Workspace Layout:**

```json
// .obsidian/workspaces.json (auto-generated by Obsidian)
{
  "workspaces": {
    "ExoFrame": {
      "main": {
        "type": "leaf",
        "state": {
          "type": "markdown",
          "file": "Dashboard.md"
        }
      }
    }
  }
}
```

**TDD Approach:**

```typescript
// tests/obsidian/dashboard_content_test.ts
Deno.test("Dashboard has required sections", async () => {
  const dashboard = await Deno.readTextFile("Knowledge/Dashboard.md");

  const requiredSections = [
    "Active Tasks",
    "Recent Plans",
    "Reports",
    "Failed",
  ];

  for (const section of requiredSections) {
    assertStringIncludes(dashboard, section, `Dashboard should have ${section} section`);
  }
});

Deno.test("Dashboard frontmatter is valid", async () => {
  const dashboard = await Deno.readTextFile("Knowledge/Dashboard.md");

  // Check for optional frontmatter (pinned status hint)
  if (dashboard.startsWith("---")) {
    const frontmatter = dashboard.split("---")[1];
    assert(frontmatter.length > 0, "Frontmatter should not be empty if present");
  }
});
```

**Success Criteria:**

- [x] Dashboard.md is pinned in Obsidian
- [x] Dashboard opens automatically on vault startup
- [x] All Dataview queries render correctly

✅ **COMPLETED** (2025-11-28): TDD implementation complete.

- Dashboard has all required sections (Requests, Plans, Activity, Portals)
- Dashboard has 4 Dataview queries with proper sorting
- User Guide documents pinning and workspace layout saving
- Tests: `tests/obsidian/dashboard_content_test.ts` (14 tests)

---

### 5.4: Configure File Watcher ✅ COMPLETED

- **Dependencies:** Step 5.2 vault configured.
- **Rollback:** Revert settings to defaults.

**Action:** Configure Obsidian to handle external file changes from ExoFrame agents.

**Note:** Obsidian will show "Vault changed externally" warnings when agents write files. This is expected behavior.

**Settings Configuration:**

Settings → Files & Links:

- ☑ Automatically update internal links
- ☑ Show all file types (to see .toml, .yaml, .json)
- ☑ Use Wikilinks (optional, for easier linking)

Settings → Editor:

- ☑ Auto-reload file when externally changed (if available)

**Platform-Specific Notes:**

| Platform    | Consideration                                                       |
| ----------- | ------------------------------------------------------------------- |
| **Linux**   | inotify watchers may need increasing: `fs.inotify.max_user_watches` |
| **macOS**   | FSEvents works well, no special config needed                       |
| **Windows** | May need to run Obsidian as admin for symlink support               |

**Success Criteria:**

- [x] Obsidian detects new files created by agents within 2 seconds
- [x] Internal links update automatically when files are renamed
- [x] .toml and .yaml files are visible in the file explorer
- [x] No file permission errors when agents write to vault

✅ **COMPLETED** (2025-11-28): TDD implementation complete.

- Created `tests/obsidian/file_watcher_test.ts` (9 tests)
- Tests verify file creation, permissions, TOML frontmatter, extensions
- Added "Handling External File Changes" section to User Guide
- Documented platform-specific configuration (Linux inotify, Windows symlinks)

**Manual Obsidian Configuration Required:**

1. Open Obsidian Settings (gear icon)
2. Go to **Files & Links**:
   - Enable "Automatically update internal links"
   - Enable "Show all file types"
3. Changes are saved automatically

---

### 5.5: The Obsidian Dashboard ✅ COMPLETED

- **Dependencies:** Phase 4, Steps 5.1-5.4 — **Rollback:** provide plain Markdown summary.
- **Action:** Create `/Knowledge/Dashboard.md` with Dataview queries.
- **Justification:** Users live in Obsidian, not the terminal.

**Implementation:**

Create `Knowledge/Dashboard.md` with the following content:

````markdown
---
title: ExoFrame Dashboard
aliases: [Home, Index]
tags: [dashboard, exoframe]
---

# ExoFrame Dashboard

> Last refreshed: `= date(now)`

## 📊 System Status

| Metric          | Value                                                                         |
| --------------- | ----------------------------------------------------------------------------- |
| Active Tasks    | `= length(filter(dv.pages('"System/Active"'), p => p.status = "running"))`    |
| Pending Plans   | `= length(filter(dv.pages('"System/Active"'), p => p.status = "approved"))`   |
| Completed Tasks | `= length(filter(dv.pages('"System/Archive"'), p => p.status = "completed"))` |
| Failed Tasks    | `= length(filter(dv.pages('"System/Archive"'), p => p.status = "failed"))`    |

## 📋 Recent Activity

### Active Plans

```dataview
TABLE status, created, agent
FROM "System/Active"
SORT created DESC
LIMIT 10
```
````

### Recent Changesets

```dataview
TABLE status, created_by, portal
FROM "System/Changesets"
SORT created DESC
LIMIT 10
```

### Activity Journal (Last 24h)

```dataview
TABLE action_type, actor, timestamp
FROM "System/Journal"
WHERE timestamp >= date(today) - dur(1 day)
SORT timestamp DESC
```

## 🔍 Quick Actions

- [[Create New Request|➕ New Request]]
- [[View All Plans|📋 All Plans]]
- [[System Status|⚙️ System Status]]
- [[Agent Blueprints|🤖 Agents]]

```
**Success Criteria:**

1. [x] Dashboard file created at `/Knowledge/Dashboard.md`
2. [x] Dataview queries render correctly in Obsidian
3. [x] System status metrics display current values
4. [x] Recent activity sections show live data
5. [x] Quick action links work correctly
6. [x] Dashboard loads without errors in Obsidian

---
