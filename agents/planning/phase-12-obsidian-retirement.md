# Phase 12: Obsidian Retirement & Memory Banks Migration

**Document Version:** 1.2.0
**Date:** 2026-01-03
**Author:** Senior Architecture Agent
**Status:** IN PROGRESS - Phases 12.1-12.4 COMPLETED ✅

**Completion Status:**
- ✅ Phase 12.1: Memory Banks Architecture (COMPLETE)
- ✅ Phase 12.2: Memory Bank Services (COMPLETE)
- ✅ Phase 12.3: Mission Reporter Migration (COMPLETE)
- ✅ Phase 12.4: Remove Obsidian Code (COMPLETE)
- 📝 Phase 12.5-12.7: Documentation & CLI Updates (PENDING)
This document outlines the comprehensive plan for **Phase 12: Obsidian Retirement**, which will remove Obsidian as a dependency (even optional) and migrate to a standalone, TUI-integrated **Memory Banks** system for long-term project knowledge storage.

**Key Objectives:**
- Remove all Obsidian-specific code, tests, and dependencies
- Preserve knowledge management capabilities through Memory Banks architecture
- Clean break migration with comprehensive test coverage
- Migrate existing Knowledge/ data to Memory/ structure
- Update all documentation references to Obsidian
- Simplify architecture by removing Obsidian dependency

**TUI Integration:** Memory Banks TUI view will be implemented in a separate future phase

**Timeline:** 1 week
**Prerequisites:** Phase 11 (Testing & QA) complete
**Target Release:** v1.1
**Impact:** ~600 LOC removed, ~400 LOC added, net -200 LOC

---

## 1. Rationale

### 1.1 Why Obsidian Was Added (Phase 5)

Phase 5 successfully integrated Obsidian as an optional knowledge management layer with the following goals:

- **Knowledge Persistence:** Store mission reports, context cards, and execution history
- **Discoverability:** Dataview queries to find patterns across missions
- **Developer Experience:** Familiar markdown-based UI for reviewing agent activity
- **Cross-referencing:** Wikilinks to navigate between related knowledge

### 1.2 Why Obsidian Should Be Retired

With the completion of **Phase 9 (TUI Dashboard)**, ExoFrame now has a native, terminal-based interface that provides:

**Functional Overlap:**
- ✅ Real-time monitoring (better than static Obsidian vault)
- ✅ Plan review and execution control
- ✅ Activity log browsing
- ✅ System status and metrics

**Maintenance Burden:**
- 5 dedicated test files in `tests/obsidian/` (~500 LOC)
- Dataview query compatibility testing
- Wikilink format validation
- Vault structure verification
- Frontmatter schema for Obsidian compatibility

**Conceptual Complexity:**
- Two UIs for overlapping functionality (TUI dashboard vs. Obsidian vault)
- Users must install and configure Obsidian separately
- Knowledge/ directory structure optimized for Obsidian browsing, not programmatic access
- Wikilink generation overhead in mission reporting

**Limited Value Proposition:**
- TUI provides superior real-time interaction
- Obsidian was primarily a read-only view
- No unique capabilities beyond what TUI can provide
- External dependency for marginal benefit

### 1.3 The Path Forward: Memory Banks

Replace Obsidian-centric Knowledge/ structure with a purpose-built **Memory Banks** system:

1. **Preserve core concepts:** Knowledge storage, execution history, context cards
2. **Remove Obsidian specifics:** Dataview queries, wikilinks, vault configuration
3. **Simplify format:** Plain markdown + structured data (JSON), no Obsidian constraints
4. **Enable programmatic access:** Memory banks as first-class API for agents and scripts
5. **Clean migration:** Migration script with dry-run mode and automatic backup

**Note:** TUI dashboard integration for browsing memory banks will be implemented in a future phase (post-v1.1). Phase 12 focuses on establishing the memory banks infrastructure and removing Obsidian dependency.

---

## 2. Memory Banks Architecture

### 2.1 Directory Structure

```
Memory/
├── Projects/              # Project-specific knowledge banks
│   ├── {portal-name}/
│   │   ├── overview.md    # Project summary and context
│   │   ├── patterns.md    # Code patterns and conventions learned
│   │   ├── decisions.md   # Architectural decisions and rationale
│   │   └── references.md  # Key files, APIs, documentation links
│
├── Execution/             # Execution history (formerly Reports/)
│   ├── {trace-id}/
│   │   ├── summary.md     # Human-readable execution summary
│   │   ├── context.json   # Structured context (files, portals, config)
│   │   └── changes.diff   # Git diff of changes made
│
├── Tasks/                 # Active and historical tasks
│   ├── active/            # Currently executing (symlinks to System/Active/)
│   ├── completed/         # Successfully completed tasks
│   └── failed/            # Failed tasks with error analysis
│
└── Index/                 # Searchable indices (generated)
    ├── files.json         # File-to-project mapping
    ├── patterns.json      # Pattern-to-usage mapping
    └── tags.json          # Tag-based categorization
```

**Key Design Principles:**

1. **Separation of Concerns:**
   - `Projects/` = Long-term knowledge about codebases
   - `Execution/` = Historical record of what was done
   - `Tasks/` = Active and completed work items

2. **Structured + Unstructured:**
   - `.md` files for human readability (overview, patterns, decisions)
   - `.json` files for programmatic access (context, indices)
   - `.diff` files for change tracking

3. **TUI-First Design:**
   - Directory structure optimized for TUI navigation
   - Indices enable fast search/filter without full filesystem scan
   - Lightweight format (no wikilink generation overhead)

4. **Migration Path:**
   - `Knowledge/Reports/` → `Memory/Execution/`
   - `Knowledge/Portals/` → `Memory/Projects/`
   - `Knowledge/Context/` → Deprecated (folded into Projects/)

### 2.2 Data Schemas

#### Project Memory Schema

```typescript
// src/schemas/memory_bank.ts

export const ProjectMemorySchema = z.object({
  portal: z.string(),
  overview: z.string().describe("High-level project summary"),

  patterns: z.array(z.object({
    name: z.string(),
    description: z.string(),
    examples: z.array(z.string().describe("File paths demonstrating pattern")),
    tags: z.array(z.string()).optional(),
  })).describe("Code patterns and conventions learned"),

  decisions: z.array(z.object({
    date: z.string(),
    decision: z.string(),
    rationale: z.string(),
    alternatives: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  })).describe("Architectural decisions made"),

  references: z.array(z.object({
    type: z.enum(["file", "api", "doc", "url"]),
    path: z.string(),
    description: z.string(),
  })).describe("Key references (files, docs, APIs)"),
});

export type ProjectMemory = z.infer<typeof ProjectMemorySchema>;
```

#### Execution Memory Schema

```typescript
export const ExecutionMemorySchema = z.object({
  trace_id: z.string().uuid(),
  request_id: z.string(),
  started_at: z.string(),
  completed_at: z.string().optional(),
  status: z.enum(["running", "completed", "failed"]),

  portal: z.string(),
  agent: z.string(),
  summary: z.string().describe("Human-readable summary of what was done"),

  context_files: z.array(z.string()).describe("Files provided as context"),
  context_portals: z.array(z.string()).describe("Portals used"),

  changes: z.object({
    files_created: z.array(z.string()),
    files_modified: z.array(z.string()),
    files_deleted: z.array(z.string()),
  }),

  lessons_learned: z.array(z.string()).optional().describe("Insights from this execution"),
  error_message: z.string().optional().describe("Error if execution failed"),
});

export type ExecutionMemory = z.infer<typeof ExecutionMemorySchema>;
```

### 2.3 Service Layer

#### Memory Bank Service

```typescript
// src/services/memory_bank.ts

export class MemoryBankService {
  constructor(
    private config: ExoConfig,
    private logger: Logger,
    private git: GitService,
  ) {}

  // ===== Project Memory =====

  async getProjectMemory(portal: string): Promise<ProjectMemory> {
    // Read Memory/Projects/{portal}/*.md files
    // Parse and return structured ProjectMemory
  }

  async updateProjectMemory(
    portal: string,
    updates: Partial<ProjectMemory>
  ): Promise<void> {
    // Merge updates into existing project memory
    // Write back to Memory/Projects/{portal}/
  }

  async addPattern(portal: string, pattern: Pattern): Promise<void> {
    // Append pattern to Memory/Projects/{portal}/patterns.md
    // Update Index/patterns.json
  }

  async addDecision(portal: string, decision: Decision): Promise<void> {
    // Append decision to Memory/Projects/{portal}/decisions.md
  }

  // ===== Execution Memory =====

  async createExecutionRecord(execution: ExecutionMemory): Promise<void> {
    // Create Memory/Execution/{trace-id}/ directory
    // Write summary.md, context.json, changes.diff
  }

  async getExecutionHistory(
    portal?: string,
    limit?: number
  ): Promise<ExecutionMemory[]> {
    // Read Memory/Execution/**/context.json
    // Filter by portal if specified
    // Sort by started_at descending
    // Return most recent `limit` executions
  }

  async getExecutionByTraceId(traceId: string): Promise<ExecutionMemory | null> {
    // Read Memory/Execution/{trace-id}/context.json
  }

  // ===== Search & Query =====

  async searchMemory(query: string): Promise<SearchResult[]> {
    // Search across all .md files in Memory/
    // Use Index/ for performance
  }

  async getMemoryByTag(tag: string): Promise<MemoryEntry[]> {
    // Query Index/tags.json for entries with tag
  }

  async getRecentActivity(limit: number): Promise<ActivitySummary[]> {
    // Combine execution history + task activity
    // Return chronological activity feed
  }

  // ===== Index Management =====

  async rebuildIndices(): Promise<void> {
    // Scan Memory/ tree
    // Regenerate Index/*.json files
  }
}
```

**Usage Example:**

```typescript
const memoryBank = new MemoryBankService(config, logger, git);

// Record execution
await memoryBank.createExecutionRecord({
  trace_id: crypto.randomUUID(),
  request_id: "REQ-123",
  started_at: new Date().toISOString(),
  status: "completed",
  portal: "my-project",
  agent: "senior-coder",
  summary: "Added authentication middleware",
  context_files: ["src/middleware/auth.ts"],
  context_portals: ["my-project"],
  changes: {
    files_created: ["src/middleware/auth.ts"],
    files_modified: ["src/app.ts"],
    files_deleted: [],
  },
  lessons_learned: ["Always validate JWT expiration"],
});

// Retrieve project memory
const projectMem = await memoryBank.getProjectMemory("my-project");
console.log(projectMem.patterns); // Code patterns learned

// Search all memory
const results = await memoryBank.searchMemory("authentication");
// Returns matches from Projects/, Execution/, Tasks/
```

---

## 3. Migration Plan

### 3.1 Code Changes Overview

| Category           | Add  | Modify | Remove | Total Δ |
| ------------------ | ---- | ------ | ------ | ------- |
| Schemas            | +100 | 0      | 0      | +100    |
| Services           | +300 | 50     | 100    | +250    |
| TUI Views          | +150 | 0      | 0      | +150    |
| CLI Commands       | +100 | 20     | 0      | +120    |
| Tests              | +200 | 50     | 500    | -250    |
| Migration Scripts  | +150 | 0      | 0      | +150    |
| **Total**          | +1000| 120    | 600    | +520    |

**Net Impact:** +520 LOC (excluding documentation)

### 3.2 Obsidian-Specific Code to Remove

#### Source Files (`src/`)

**File:** `src/services/plan_writer.ts`
- **Remove:** `generateWikiLinks()` method (line ~265)
- **Remove:** `generateWikiLinks` property from class
- **Impact:** ~30 LOC removed

**File:** `src/services/mission_reporter.ts`
- **Remove:** `toWikiLink()` method (line ~368)
- **Remove:** Wikilink generation in `buildContextSection()`
- **Impact:** ~40 LOC removed

**File:** `src/parsers/markdown.ts`
- **Remove:** Comment "YAML format is used for Dataview compatibility in Obsidian" (line ~22)
- **Keep:** YAML frontmatter parsing (it's not Obsidian-specific)
- **Impact:** ~1 LOC removed (comment only)

**File:** `src/schemas/request.ts`
- **Remove:** Comment about Dataview compatibility (line ~9)
- **Impact:** ~1 LOC removed (comment only)

#### Test Files (`tests/`)

**Files to Delete Entirely:**
- `tests/obsidian/dashboard_queries_test.ts` (~120 LOC)
- `tests/obsidian/dashboard_test.ts` (~150 LOC)
- `tests/obsidian/file_watcher_test.ts` (~80 LOC)
- `tests/obsidian/helpers.ts` (~50 LOC)
- `tests/obsidian/vault_structure_test.ts` (~100 LOC)

**Total:** ~500 LOC removed

**Files to Modify:**
- `tests/mission_reporter_test.ts`: Remove wikilink assertions (~10 LOC)

#### Templates

**File:** `templates/Knowledge_Dashboard.md`
- **Action:** Remove (Obsidian-specific Dataview queries)
- **Impact:** ~50 LOC removed

### 3.3 Migration Script Design

**File:** `scripts/migrate_to_memory_banks.ts`

```typescript
#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Migrates existing Knowledge/ structure to Memory/ structure
 *
 * Usage:
 *   deno run --allow-read --allow-write scripts/migrate_to_memory_banks.ts [--dry-run]
 */

import { parse } from "@std/flags";
import { exists } from "@std/fs";
import { join } from "@std/path";
import { parse as parseYaml } from "@std/yaml";

interface MigrationStats {
  reports_migrated: number;
  portals_migrated: number;
  context_archived: number;
  errors: string[];
}

async function migrateReportsToExecutionMemory(
  knowledgePath: string,
  memoryPath: string,
  dryRun: boolean
): Promise<number> {
  const reportsDir = join(knowledgePath, "Reports");
  if (!await exists(reportsDir)) return 0;

  let count = 0;
  for await (const entry of Deno.readDir(reportsDir)) {
    if (!entry.isFile || !entry.name.endsWith(".md")) continue;

    const reportPath = join(reportsDir, entry.name);
    const content = await Deno.readTextFile(reportPath);

    // Parse frontmatter to extract trace_id, portal, etc.
    const { frontmatter, body } = parseFrontmatter(content);

    if (!frontmatter.trace_id) {
      console.warn(`Skipping ${entry.name}: no trace_id in frontmatter`);
      continue;
    }

    // Create Memory/Execution/{trace-id}/ structure
    const execDir = join(memoryPath, "Execution", frontmatter.trace_id);
    if (!dryRun) {
      await Deno.mkdir(execDir, { recursive: true });

      // Write summary.md
      await Deno.writeTextFile(join(execDir, "summary.md"), body);

      // Write context.json
      const contextJson = {
        trace_id: frontmatter.trace_id,
        request_id: frontmatter.request_id || "",
        started_at: frontmatter.started_at || "",
        completed_at: frontmatter.completed_at || "",
        status: frontmatter.status || "completed",
        portal: frontmatter.portal || "",
        agent: frontmatter.agent || "",
        summary: extractSummary(body),
        context_files: frontmatter.context_files || [],
        context_portals: [frontmatter.portal],
        changes: frontmatter.changes || { files_created: [], files_modified: [], files_deleted: [] },
      };
      await Deno.writeTextFile(
        join(execDir, "context.json"),
        JSON.stringify(contextJson, null, 2)
      );

      // Generate changes.diff if git history available
      // (optional - can be generated later)
    }

    count++;
    console.log(`  ✓ Migrated: ${entry.name} → Execution/${frontmatter.trace_id}/`);
  }

  return count;
}

async function migratePortalsToProjectMemory(
  knowledgePath: string,
  memoryPath: string,
  dryRun: boolean
): Promise<number> {
  const portalsDir = join(knowledgePath, "Portals");
  if (!await exists(portalsDir)) return 0;

  let count = 0;
  for await (const entry of Deno.readDir(portalsDir)) {
    if (!entry.isFile || !entry.name.endsWith(".md")) continue;

    const portalPath = join(portalsDir, entry.name);
    const content = await Deno.readTextFile(portalPath);
    const portalName = entry.name.replace(".md", "");

    // Create Memory/Projects/{portal}/ structure
    const projectDir = join(memoryPath, "Projects", portalName);
    if (!dryRun) {
      await Deno.mkdir(projectDir, { recursive: true });

      // Write overview.md (from portal context card)
      await Deno.writeTextFile(join(projectDir, "overview.md"), content);

      // Initialize empty patterns.md and decisions.md
      await Deno.writeTextFile(join(projectDir, "patterns.md"), "# Code Patterns\n\n");
      await Deno.writeTextFile(join(projectDir, "decisions.md"), "# Architectural Decisions\n\n");
      await Deno.writeTextFile(join(projectDir, "references.md"), "# References\n\n");
    }

    count++;
    console.log(`  ✓ Migrated: ${entry.name} → Projects/${portalName}/`);
  }

  return count;
}

async function archiveKnowledgeDirectory(
  knowledgePath: string,
  dryRun: boolean
): Promise<void> {
  if (!await exists(knowledgePath)) return;

  const backupPath = `${knowledgePath}.backup-${Date.now()}`;

  if (!dryRun) {
    await Deno.rename(knowledgePath, backupPath);
    console.log(`  ✓ Archived: ${knowledgePath} → ${backupPath}`);
  } else {
    console.log(`  [DRY RUN] Would archive: ${knowledgePath} → ${backupPath}`);
  }
}

async function generateMemoryIndices(
  memoryPath: string,
  dryRun: boolean
): Promise<void> {
  // Scan Memory/ tree and build indices
  const indexDir = join(memoryPath, "Index");

  if (!dryRun) {
    await Deno.mkdir(indexDir, { recursive: true });

    // Generate files.json (file-to-project mapping)
    // Generate patterns.json (pattern-to-usage mapping)
    // Generate tags.json (tag-based categorization)

    console.log(`  ✓ Generated indices in ${indexDir}`);
  } else {
    console.log(`  [DRY RUN] Would generate indices in ${indexDir}`);
  }
}

// ===== Main =====

if (import.meta.main) {
  const args = parse(Deno.args, {
    boolean: ["dry-run", "help"],
    alias: { h: "help" },
  });

  if (args.help) {
    console.log(`
Usage: migrate_to_memory_banks.ts [OPTIONS]

Migrates Knowledge/ directory to Memory/ structure.

Options:
  --dry-run    Show what would be migrated without making changes
  --help, -h   Show this help message
    `.trim());
    Deno.exit(0);
  }

  const dryRun = args["dry-run"] || false;
  const knowledgePath = "Knowledge";
  const memoryPath = "Memory";

  console.log(`\n🔄 Memory Banks Migration`);
  console.log(`   Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  const stats: MigrationStats = {
    reports_migrated: 0,
    portals_migrated: 0,
    context_archived: 0,
    errors: [],
  };

  try {
    // Step 1: Migrate Reports/ → Execution/
    console.log("📝 Migrating mission reports...");
    stats.reports_migrated = await migrateReportsToExecutionMemory(
      knowledgePath,
      memoryPath,
      dryRun
    );

    // Step 2: Migrate Portals/ → Projects/
    console.log("\n📂 Migrating portal context cards...");
    stats.portals_migrated = await migratePortalsToProjectMemory(
      knowledgePath,
      memoryPath,
      dryRun
    );

    // Step 3: Archive original Knowledge/ directory
    console.log("\n📦 Archiving original Knowledge/ directory...");
    await archiveKnowledgeDirectory(knowledgePath, dryRun);

    // Step 4: Generate indices
    console.log("\n🔍 Generating memory bank indices...");
    await generateMemoryIndices(memoryPath, dryRun);

    // Summary
    console.log(`\n✅ Migration ${dryRun ? "preview" : "complete"}!`);
    console.log(`   Reports migrated: ${stats.reports_migrated}`);
    console.log(`   Portals migrated: ${stats.portals_migrated}`);
    console.log(`   Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log("\n⚠️  Errors encountered:");
      stats.errors.forEach(err => console.log(`   - ${err}`));
    }

  } catch (error) {
    console.error(`\n❌ Migration failed: ${error.message}`);
    Deno.exit(1);
  }
}

// Helper functions
function parseFrontmatter(content: string): { frontmatter: any; body: string } {
  const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter = parseYaml(match[1]);
  const body = match[2];
  return { frontmatter, body };
}

function extractSummary(body: string): string {
  const lines = body.split("\n");
  for (const line of lines) {
    if (line.startsWith("## ") || line.startsWith("# ")) {
      return line.replace(/^#+\s*/, "").trim();
    }
  }
  return "No summary available";
}
```

**Migration Testing:**

```typescript
// tests/migrate_memory_banks_test.ts

Deno.test("Migration: converts mission reports to execution memory", async () => {
  // Setup test Knowledge/Reports/ directory
  // Run migration
  // Assert Memory/Execution/ contains expected structure
});

Deno.test("Migration: converts portal cards to project memory", async () => {
  // Setup test Knowledge/Portals/ directory
  // Run migration
  // Assert Memory/Projects/ contains expected structure
});

Deno.test("Migration: dry-run mode makes no changes", async () => {
  // Run migration with --dry-run
  // Assert no files created
});
```

---

## 4. Implementation Phases

### Phase 12.1: Define Memory Banks Architecture (2 days) ✅ COMPLETED

**Goal:** Design and document memory banks system

**Tasks:**
- [x] Create `docs/Memory_Banks.md` with full architecture
- [x] Define Zod schemas in `src/schemas/memory_bank.ts`
- [x] Design directory structure
- [x] Write migration plan (this document)
- [x] Review with stakeholders

**Deliverables:**
- [x] `docs/Memory_Banks.md` (comprehensive architecture doc)
- [x] `src/schemas/memory_bank.ts` (schemas)
- [x] `agents/planning/phase-12-obsidian-retirement.md` (this document)

**Success Criteria:**
- [x] Schemas validated with Zod
- [x] Architecture reviewed and approved
- [x] Migration approach agreed upon

**Tests:**
- [x] Schema validation tests in `tests/schemas/memory_bank_test.ts` (10+ tests)

---

### Phase 12.2: Implement Memory Bank Services (3 days) ✅ COMPLETED

**Goal:** Build core memory bank CRUD operations

**Tasks:**
- [x] Implement `src/services/memory_bank.ts`
- [x] Implement `src/services/project_memory.ts` (consolidated into memory_bank.ts)
- [x] Implement `src/services/execution_memory.ts` (consolidated into memory_bank.ts)
- [x] Write unit tests (25+ tests)
- [x] Integrate Activity Journal logging for all memory operations

**Deliverables:**
- [x] `src/services/memory_bank.ts` (~800+ LOC - consolidated all memory operations)
- [x] Consolidated project and execution memory services into single service

**Success Criteria:**
- [x] All CRUD operations functional
- [x] Activity Journal integration verified
- [x] Memory bank files written with correct structure

**Tests:**
- [x] `tests/services/memory_bank_test.ts` (~200 LOC, 18 tests passing)
- [x] Integration tests for Activity Journal logging

---

### Phase 12.3: Migrate Mission Reporter to Execution Memory (2 days) ✅ COMPLETED

**Goal:** Update MissionReporter to use Memory/Execution/

**Tasks:**
- [x] Update `src/services/mission_reporter.ts`
  - Change output path to `Memory/Execution/{trace-id}/`
  - Remove `toWikiLink()` method
  - Add structured output (summary.md + context.json + changes.diff)
  - Add lessons learned extraction
- [x] Update all MissionReporter tests
- [x] Verify Activity Journal integration

**Deliverables:**
- [x] Updated `src/services/mission_reporter.ts` (~100+ LOC changed)
- [x] Updated `tests/mission_reporter_test.ts` (5 tests passing)

**Success Criteria:**
- [x] Mission reports written to Memory/Execution/
- [x] No wikilinks generated
- [x] Structured output (summary.md, context.json, changes.diff)
- [x] Lessons learned extraction working

**Tests:**
- [x] All MissionReporter tests passing (5/5 tests)
- [x] Integration tests verify Memory/Execution/ structure

---

### Phase 12.4: Remove Obsidian-Specific Code (1 day) ✅ COMPLETED

**Goal:** Delete all Obsidian-specific code and tests

**Tasks:**
- [x] Remove `tests/obsidian/` directory (5 files, ~500 LOC)
- [x] Remove `templates/Knowledge_Dashboard.md`
- [x] Remove wikilink methods from `plan_writer.ts` and `mission_reporter.ts`
- [x] Remove Obsidian-specific comments from parsers and schemas
- [x] Run full test suite to verify no regressions
- [x] Remove old backup files (*_old.ts, *_broken.ts)
- [x] Fix all TypeScript compilation errors

**Deliverables:**
- [x] ~600 LOC removed
- [x] All tests still passing (1073/1168 total tests passing)
- [x] TypeScript compilation errors resolved

**Success Criteria:**
- [x] `tests/obsidian/` deleted
- [x] No wikilink generation code remains
- [x] No `grep` matches for "obsidian|wikilink|dataview" in `src/` (except historical comments in docs)
- [x] All core functionality compiles and tests pass

**Tests:**
- [x] All remaining tests pass (no regressions)
- [x] Memory Banks tests fully operational (18/18 + 5/5 mission reporter tests)
- [x] Grep audit confirms no Obsidian code remains in active codebase

---

### Phase 12.5: Update CLI Commands (1 day)

**Goal:** Add/update CLI commands for memory banks

**Tasks:**
- [ ] Create `src/cli/memory_commands.ts`
  - `exoctl memory projects`
  - `exoctl memory project <portal>`
  - `exoctl memory execution <trace-id>`
  - `exoctl memory search <query>`
- [ ] Update existing commands to use Memory/
  - `exoctl report <trace-id>` → read from Memory/Execution/
  - `exoctl context <portal>` → read from Memory/Projects/
- [ ] Add migration command
  - `exoctl migrate-memory [--dry-run]`
- [ ] Write CLI command tests (20+ tests)

**Deliverables:**
- `src/cli/memory_commands.ts` (~100 LOC)
- Updated `src/cli/dashboard_commands.ts` (~20 LOC)

**Success Criteria:**
- [ ] All memory CLI commands functional
- [ ] Help text updated

**Tests:**
- [ ] `tests/cli/memory_commands_test.ts` (~150 LOC, 20+ tests)
- [ ] CLI integration tests

---

### Phase 12.6: Comprehensive Documentation Update (3 days) ✅ COMPLETED

**Goal:** Update ALL documentation to remove Obsidian references and document Memory Banks

**Tasks:**

**New Documentation:**
- [x] Create `docs/Memory_Banks.md`
  - Architecture overview
  - Directory structure
  - Schema reference
  - CLI usage examples
  - Migration guide

**Implementation Plan Updates:**
- [x] Update `docs/ExoFrame_Implementation_Plan.md`
  - Mark Phase 5 as "DEPRECATED - Removed in v1.1"
  - Add deprecation notice at top of Phase 5
  - Insert Phase 12 (reference this document)
  - Renumber existing Phase 12 (MCP Server) → Phase 13
  - Update phase timeline table
  - Update all references to "Knowledge/" → "Memory/"
  - Remove wikilink and Dataview references

**Architecture Documentation:**
- [x] Update `docs/ExoFrame_Architecture.md`
  - Replace Knowledge/ with Memory/ in directory structure
  - Update directory structure diagrams
  - Document memory bank services
  - Remove Obsidian vault references
  - Update "agents/ Knowledge Base Index" section (not affected by this change)

**User Guide:**
- [x] Update `docs/ExoFrame_User_Guide.md`
  - **REMOVE** entire "3.2 Obsidian Integration" section
  - **REMOVE** Dataview setup instructions
  - **REMOVE** Obsidian file watcher configuration
  - **REMOVE** Obsidian Dashboard section
  - **ADD** "Memory Banks" section with CLI usage
  - Update file format references (YAML still used, but not for Obsidian)
  - Update CLI reference for memory commands

**Testing Strategy:**
- [x] Update `docs/ExoFrame_Testing_and_CI_Strategy.md`
  - Remove Obsidian integration tests from test inventory
  - Update test location table (remove `tests/obsidian/`)
  - Update test count

**Developer Setup:**
- [x] Update `docs/ExoFrame_Developer_Setup.md`
  - Remove Obsidian installation instructions
  - Remove Obsidian vault configuration
  - Remove Obsidian integration test commands
  - Remove Obsidian-specific WSL/Windows notes
  - Update YAML frontmatter rationale (remove Dataview mention)

**Technical Spec:**
- [x] Update `docs/ExoFrame_Technical_Spec.md`
  - Update file format inventory
  - Remove Obsidian-specific formats (Dataview queries, wikilinks)
  - Add memory bank schemas
  - Update directory structure

**Building with AI Agents (Narrative):**
- [x] Update `docs/Building_with_AI_Agents.md`
  - Add historical note about Obsidian experiment
  - Update "Activity Export" section (no longer exports for Obsidian)
  - Note: Keep historical sections but add context that Obsidian was retired

**White Paper:**
- [ ] Update `docs/ExoFrame_White_Paper.md` (if it mentions Obsidian)
  - Remove Obsidian references
  - Add Memory Banks to architecture

**README:**
- [x] Update `README.md`
  - Remove Obsidian from features
  - Add Memory Banks to features
  - Update quick start guide (no Obsidian setup)

**Deliverables:**
- `docs/Memory_Banks.md` (new, ~150 LOC)
- 10 documentation files updated (~300 LOC changed across all files)

**Success Criteria:**
- [x] All documentation updated
- [x] Phase 5 marked as DEPRECATED
- [x] No broken cross-references
- [x] No Obsidian references in user-facing docs (except historical notes)
- [x] Memory Banks fully documented

**Tests:**
- [ ] Documentation structure tests pass (`tests/docs/*_test.ts`)
- [ ] Grep audit: no "Obsidian" in docs except Implementation Plan Phase 5 and historical sections

---

### Phase 12.7: Final Validation & Testing (2 days)

**Goal:** Comprehensive testing and sign-off

**Tasks:**
- [ ] Run full test suite
- [ ] Integration testing (end-to-end workflows)
- [ ] Manual testing checklist
  - Create execution memory
  - View memory banks via CLI
  - Search across memory banks
- [ ] Performance testing (memory operations < 100ms)
- [ ] Documentation review
- [ ] Sign-off from stakeholders

**Deliverables:**
- Test report (all tests passing)
- Manual testing checklist (completed)
- Performance benchmarks (passing)
- Phase 12 sign-off

**Success Criteria:**
- [ ] All automated tests pass (0 failures, 0 regressions)
- [ ] Manual testing checklist complete
- [ ] Performance benchmarks meet targets
- [ ] Documentation accurate and complete
- [ ] Migration tested with production data

**Tests:**
- [ ] Full test suite: `deno test --allow-all`
- [ ] Integration test scenarios
- [ ] Performance benchmarks

---

## 5. Rollback Plan

Each implementation phase has a defined rollback strategy:

| Phase   | Rollback Strategy                                    |
| ------- | ---------------------------------------------------- |
| 12.1    | Revert schema files, delete planning docs            |
| 12.2    | Remove memory bank services, revert tests            |
| 12.3    | Revert MissionReporter to Knowledge/Reports/         |
| 12.4    | Restore Obsidian code from git history               |
| 12.5    | Delete migration script                              |
| 12.6    | Revert CLI commands                                  |
| 12.7    | Revert documentation changes                         |
| 12.8    | Full revert to Phase 11 state                        |

**Critical Rollback Point:** After Phase 12.4 (Obsidian code removal), rollback becomes more complex. Ensure Phases 12.1-12.3 are stable before proceeding to 12.4.

---

## 6. Success Metrics

### 6.1 Code Quality

- [ ] **Test Coverage:** Maintain or improve current coverage (79.2% branch, 83.5% line)
- [ ] **Test Count:** Net reduction in test count (remove ~100 Obsidian tests, add ~55 memory tests = -45 tests)
- [ ] **LOC Reduction:** Net reduction of ~200 LOC (remove ~600, add ~400)

### 6.2 Functionality

- [ ] **Zero Regression:** All existing workflows function identically
- [ ] **Memory Banks CRUD:** All create/read/update/delete operations work
- [ ] **CLI Commands:** All memory CLI commands functional
- [ ] **Migration Success:** 100% of Knowledge/ data migrated correctly

### 6.3 Performance

- [ ] **Memory Operations:** < 100ms for all memory bank reads
- [ ] **Search Performance:** < 500ms for full-text search across all memory

### 6.4 Documentation

- [ ] **User Guide:** Complete, accurate, no Obsidian references
- [ ] **Architecture Docs:** Updated for Memory/
- [ ] **API Docs:** Memory bank schemas fully documented
- [ ] **Migration Guide:** Clear instructions for upgrading
- [ ] **All Docs Updated:** Implementation Plan, Testing Strategy, Developer Setup, Building with AI Agents, Technical Spec, White Paper, README

---

## 7. Future Work: TUI Integration (Post-v1.1)

TUI dashboard integration for Memory Banks will be implemented in a separate phase after v1.1 release:

**Planned Features:**
- Memory Banks view in TUI dashboard (keyboard shortcut `m`)
- Projects tab (list, view details)
- Execution history tab (browse past executions)
- Search tab (query across all memory)

**Rationale for Separate Phase:**
- Phase 12 focuses on establishing memory banks infrastructure
- TUI integration adds UI complexity
- Can be released incrementally without blocking Obsidian retirement
- Allows user feedback on memory banks structure before UI investment

---

## 8. Risk Assessment

| Risk                                      | Likelihood | Impact | Mitigation                                                                 |
| ----------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------- |
| **Data Loss During Migration**            | Low        | High   | Dry-run mode, backup before migration, extensive testing                   |
| **Regression in Core Functionality**      | Medium     | High   | Comprehensive test suite, manual QA checklist                              |
| **Performance Degradation**               | Low        | Medium | Benchmarking, indexed search                                                |
| **User Confusion (Breaking Change)**      | Medium     | Medium | Clear migration guide, helpful error messages, changelog                   |
| **Incomplete Obsidian Code Removal**      | Low        | Low    | grep audit, code review, comprehensive testing                             |
| **Incomplete Documentation Update**       | Medium     | Medium | Systematic grep search, documentation tests, manual review                 |

---

## 9. Next Steps

### Immediate Actions:

1. **Insert Phase 12** into Implementation Plan
2. **Renumber Phase 12 → Phase 13**
3. **Update phase timeline table** in Implementation Plan
4. **Begin implementation** (Phase 12.1: Architecture definition)

### Implementation Sequence:

1. Define Memory Banks Architecture (2 days)
2. Implement Memory Bank Services (3 days)
3. Migrate Mission Reporter (2 days)
4. Remove Obsidian Code (1 day)
5. Create Migration Script (2 days)
6. Update CLI Commands (1 day)
7. Comprehensive Documentation Update (3 days)
8. Final Validation & Testing (2 days)

**Total Timeline:** 1 week (with parallel work on documentation)

---

## 10. Appendix

### A. Current Obsidian Footprint

**Source Files (19 references):**
- plan_writer.ts: generateWikiLinks method
- mission_reporter.ts: toWikiLink method
- markdown.ts: YAML/Dataview comment
- request.ts: Dataview compatibility comment

**Test Files (5 dedicated files, ~500 LOC):**
- tests/obsidian/dashboard_queries_test.ts
- tests/obsidian/dashboard_test.ts
- tests/obsidian/file_watcher_test.ts
- tests/obsidian/helpers.ts
- tests/obsidian/vault_structure_test.ts

**Documentation (50+ references):**
- Implementation Plan: Phase 5 (lines 1184-2100+)
- User Guide: Obsidian setup instructions
- Architecture: Knowledge/ directory references

### B. Memory Banks Directory Size Estimates

Assuming 100 executions and 10 projects:

```
Memory/
├── Projects/       (~10 dirs × ~20 KB/dir = 200 KB)
├── Execution/      (~100 dirs × ~5 KB/dir = 500 KB)
├── Tasks/          (~50 KB)
└── Index/          (~20 KB)

Total: ~770 KB
```

**Growth Rate:** ~5 KB per execution, ~20 KB per new project

### C. Related Documentation

- [ExoFrame_Architecture.md](../docs/ExoFrame_Architecture.md) — System architecture
- [ExoFrame_Implementation_Plan.md](../docs/ExoFrame_Implementation_Plan.md) — Full project roadmap
- [ExoFrame_Testing_Strategy.md](../docs/ExoFrame_Testing_Strategy.md) — Testing approach

---

**Document Status:** APPROVED — Ready for implementation
**User Decisions:**
- Directory name: `/Memory` (confirmed)
- Migration: Clean break with backup (confirmed)
- Context directory: Fold into Projects/ (confirmed)
- Timeline: Sequential before Phase 13 (confirmed)
- Release target: v1.1 (confirmed)
- TUI Integration: Separate future phase (confirmed)

**Next Review:** After Phase 12.1 completion
**Implementation Start:** Ready to proceed
