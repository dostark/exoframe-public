# Project ExoFrame: Technical Specification & Architecture

- **Version:** 1.6.0
- **Release Date:** 2025-11-27
- **Status:** Engineering Specification
- **Reference:** [ExoFrame White Paper](./ExoFrame_White_Paper.md)
- **Philosophy:** Local-First, Type-Safe, Secure-by-Design

---

## Terminology Reference

- **Activity Journal:** The SQLite database logging all events
- **Portal:** A symlinked directory providing agent access to external projects
- **Request:** A markdown file in `/Inbox/Requests` containing user intent
- **Plan:** An agent-generated proposal in `/Inbox/Plans`
- **Active Task:** An approved request in `/System/Active` being executed
- **Report:** An agent-generated summary in `/Knowledge/Reports` after completion
- **Trace ID:** UUID linking request → plan → execution → report
- **Lease:** Exclusive lock on a file (stored in `leases` table)
- **Actor:** Entity performing action (agent name, "system", or "user")
- **Blueprint:** TOML definition of an agent (model, capabilities, prompt)

---

## 1. System Overview

ExoFrame is a secure, daemon-based orchestration platform. It operates on the **"Files as API"** principle, utilizing a
watched folder structure to trigger typed workflows.

ExoFrame deliberately supports **three agent execution modes**:

1. **Local/Sovereign Agents** — run entirely on the user’s hardware (e.g., Ollama, deterministic scripts). They have
   unrestricted access to on-disk context within the allowed portals and do not require token-budget enforcement.
2. **Federated / Third-Party Agents** — call out to remote APIs (e.g., Claude, GPT). They inherit provider-specific
   token ceilings, rate limits, and privacy constraints that the engine enforces via the Context Loader and Capability
   pipeline.
3. **Hybrid Agents** — orchestrations that mix local + federated sub-agents inside a single trace. Hybrid mode must log
   every cross-boundary handoff and only share context slices that the blueprint explicitly authorizes.

**Security Upgrade:** Migrated from Bun/Node to **Deno**, leveraging its capability-based security model and codifying
permission governance across CLI, daemon, and agents.

---

## 2. Core Technical Stack

| Component        | Technology       | Justification                                                     |
| :--------------- | :--------------- | :---------------------------------------------------------------- |
| **Runtime**      | **Deno** (v2.0+) | Native TypeScript, Web Standards, and **Permission System**.      |
| **Language**     | **TypeScript**   | No transpilation needed. Strict typing via Zod.                   |
| **Config**       | **TOML**         | All config & metadata uses TOML. Token-efficient for LLM context. |
| **Journal**      | **SQLite**       | Accessible via `jsr:@db/sqlite` (WASM) or FFI for performance.    |
| **Dependencies** | **ES Modules**   | No `node_modules`. Dependencies cached globally or in vendor dir. |
| **Interface**    | **Obsidian**     | Viewer for Markdown files and Dashboard.                          |

---

## 2.1. File Format Inventory

ExoFrame uses a **hybrid format strategy** optimized for different use cases:

- **TOML** for system configuration and agent blueprints (token-efficient, robust)
- **YAML** for markdown frontmatter (Dataview compatibility in Obsidian)

### Format Selection Rationale

| Use Case             | Format | Reason                                                     |
| -------------------- | ------ | ---------------------------------------------------------- |
| System config        | TOML   | Token-efficient for LLM context, no indentation bugs       |
| Agent blueprints     | TOML   | Complex nested structures, explicit typing                 |
| Markdown frontmatter | YAML   | **Dataview plugin compatibility** (required for Dashboard) |
| Deno configuration   | JSON   | Deno runtime requirement                                   |

### Complete Format Reference

| Category                 | Format                      | Extension | Location             | Purpose                                    |
| ------------------------ | --------------------------- | --------- | -------------------- | ------------------------------------------ |
| **System Config**        | TOML                        | `.toml`   | `exo.config.toml`    | Main configuration                         |
| **Deno Config**          | JSON                        | `.json`   | `deno.json`          | Runtime, imports, tasks (Deno requirement) |
| **Agent Blueprints**     | TOML                        | `.toml`   | `Blueprints/Agents/` | Agent definitions                          |
| **Flow Definitions**     | TypeScript                  | `.ts`     | `Blueprints/Flows/`  | Orchestration logic                        |
| **Requests**             | Markdown + YAML frontmatter | `.md`     | `Inbox/Requests/`    | User task requests                         |
| **Plans**                | Markdown + YAML frontmatter | `.md`     | `Inbox/Plans/`       | Agent proposals                            |
| **Reports**              | Markdown + YAML frontmatter | `.md`     | `Knowledge/Reports/` | Mission completion reports                 |
| **Knowledge**            | Markdown                    | `.md`     | `Knowledge/`         | Reference docs                             |
| **Portal Context Cards** | Markdown                    | `.md`     | `Knowledge/Portals/` | Auto-generated project context             |
| **Activity Journal**     | SQLite                      | `.db`     | `System/exo.db`      | Audit log & file locks                     |
| **Migrations**           | SQL                         | `.sql`    | `migrations/`        | Database schema changes                    |

### YAML Frontmatter Format (Requests, Plans, Reports)

Request, Plan, and Report files use **YAML frontmatter** (delimited by `---`) for Obsidian Dataview compatibility:

```markdown
---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
created: 2025-11-28T10:30:00.000Z
status: pending
priority: normal
agent: default
source: cli
created_by: user@example.com
tags: [feature, api]
---

# Request

Implement user authentication for the API...
```

**Why YAML for frontmatter?**

- **Dataview compatibility**: Obsidian's Dataview plugin only parses YAML frontmatter natively
- **Dashboard functionality**: Enables live TABLE queries with filtering and sorting
- **Standard format**: Most markdown tools expect YAML frontmatter (`---` delimiters)

**YAML Frontmatter Rules:**

| Rule                       | Example                                        |
| -------------------------- | ---------------------------------------------- |
| Delimiters                 | `---` (three hyphens) on separate lines        |
| Key-value syntax           | `key: value` (colon + space)                   |
| Strings with special chars | `trace_id: "550e8400-e29b-41d4-..."` (quoted)  |
| Simple strings             | `status: pending` (no quotes needed)           |
| Arrays                     | `tags: [feature, api]` (inline format)         |
| Dates                      | `created: 2025-11-28T10:30:00.000Z` (ISO 8601) |
| Booleans                   | `approved: true` (lowercase)                   |

### TOML Format (Config & Blueprints)

System configuration and agent blueprints use **TOML** for robustness and token efficiency:

```toml
# exo.config.toml
[system]
root = "/home/user/ExoFrame"
log_level = "info"

[watcher]
debounce_ms = 200
extensions = ["md"]

[models.default]
provider = "ollama"
model = "llama3.2"
```

**Why TOML for config/blueprints?**

- **Token efficiency**: ~22% fewer tokens than YAML when embedded in LLM context
- **Robustness**: No indentation sensitivity, no type coercion surprises
- **Explicit typing**: Clear distinction between strings, numbers, arrays

### Token Comparison (for reference)

| Format | Tokens (typical request) | Notes                       |
| ------ | ------------------------ | --------------------------- |
| YAML   | ~45 tokens               | Quotes, colons, indentation |
| JSON   | ~55 tokens               | Braces, quotes, commas      |
| TOML   | ~35 tokens               | Minimal punctuation         |

_Note: YAML is used for frontmatter despite token overhead because Dataview compatibility is essential for the Dashboard UI._

---

## 3. Directory Structure

The File System is the Single Source of Truth. Every path shown above is provisioned by `scripts/scaffold.ts`; missing
folders are treated as fatal errors during daemon startup so that watchers do not run in partially-initialized states.

```text
/ExoFrame
├── deno.json                   <-- Project Config (Import Maps, Tasks)
├── lock.json                   <-- Dependency Integrity Hash
├── exo.config.toml             <-- System Physics (Paths, Models)
├── /System
│   ├── journal.db              <-- SQLite: Activity Log & Locks
│   ├── /Active                 <-- Runtime State
│   └── /Archive                <-- Completed task artifacts
├── /Blueprints                 <-- "Source Code" of the Swarm
│   ├── /Agents                 <-- TOML definitions
│   └── /Flows                  <-- TS logic
├── /Inbox                      <-- The Input Layer
│   ├── /Requests               <-- User drops ideas here
│   ├── /Plans                  <-- Agents submit proposals
│   └── /Archive                <-- Processed requests/plans
├── /Knowledge                  <-- User Content (Obsidian Vault)
│   ├── /Context                <-- Curated reference docs
│   ├── /Reports                <-- Agent-authored reports
│   └── /Portals                <-- Auto-generated context cards
├── /Knowledge/README.md        <-- Obsidian usage guide
├── /Portals                    <-- VIRTUAL OVERLAY (Symlinks)
│   └── <Alias> -> /home/user/Dev/Project_X
Note: the tree above describes the *deployed workspace* layout used at runtime. The *development repository* (the Git checkout developers work in) contains the same folders plus development-only artifacts such as `tests/`, `.github/`, `docs/`, and the full `src/` codebase. Do not treat your deployed workspace as a development checkout — deploy workspaces are intended for runtime and user data (Knowledge, System/journal.db) and are created from the development repo via the provided deploy script.
```

---

## 4. The Engine (Deno Orchestrator)

The Engine is a state machine running as a background daemon.

### 4.1. Security Primitives (The Deno Advantage)

Instead of building custom path validation logic (which is error-prone), we use Deno's startup flags to enforce
boundaries at the OS process level.

**Startup Command:**

```bash
deno run \
  --allow-read="./ExoFrame" \
  --allow-write="./ExoFrame" \
  --allow-net="api.anthropic.com,api.openai.com,localhost:11434" \
  --allow-env="EXO_*" \
  --allow-run="git" \
  src/main.ts
```

**Impact:** If a rogue agent tries to `fetch('evil.com')` or `Deno.readTextFile('/etc/passwd')`, the Deno runtime throws
a `PermissionDenied` error immediately. The agent code _cannot_ bypass this.

### 4.2. Runtime Interface (`IExoRuntime`)

Even though we use Deno, we abstract operations to allow for mocking in tests.

```typescript
interface IExoRuntime {
  // Filesystem (Uses Deno.readTextFile)
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;

  // Security (Uses Deno.realPath to resolve symlinks)
  resolvePath(path: string): Promise<string>;

  // Processes (Uses Deno.Command)
  spawn(cmd: string, args: string[]): Promise<Result>;
}
```

---

## 5. Human Action Tracker

### 5.1. Purpose

The `HumanActionTracker` service provides a safe, validated interface for human interactions with plans through CLI commands and Obsidian UI integration. It enforces proper validation, prevents file corruption, and ensures all actions are logged to the Activity Journal.

### 5.2. User Interface Options

**Option 1: CLI Commands (Primary)**

```bash
# Approve a plan
exoctl plan approve implement-auth

# Reject a plan with reason
exoctl plan reject implement-auth --reason "Approach too risky"

# Request revisions with comments
exoctl plan revise implement-auth --comment "Add error handling" --comment "Include tests"

# List pending plans
exoctl plan list --status=review
```

**Option 2: Obsidian Command Palette Integration**

- ExoFrame provides an Obsidian plugin that adds commands to the Command Palette
- Commands appear when viewing plan files: "ExoFrame: Approve Plan", "ExoFrame: Reject Plan", etc.
- Plugin communicates with daemon via Unix socket or HTTP API

**Option 3: Plan File Action Buttons**

- Plans include clickable dataview buttons in Obsidian
- Buttons execute CLI commands via Obsidian's shell integration
- Example: `[Approve](exoctl://plan/approve/implement-auth)` becomes clickable link

### 5.3. Tracked Actions

| Human Action        | CLI Command                               | Activity Log Entry                         |
| :------------------ | :---------------------------------------- | :----------------------------------------- |
| **Approve Plan**    | `exoctl plan approve <id>`                | `plan.approved` (actor: 'human')           |
| **Reject Plan**     | `exoctl plan reject <id> --reason "..."`  | `plan.rejected` (actor: 'human')           |
| **Request Changes** | `exoctl plan revise <id> --comment "..."` | `plan.revision_requested` (actor: 'human') |
| **View Plan**       | `exoctl plan show <id>`                   | No log (read-only)                         |
| **List Plans**      | `exoctl plan list`                        | No log (read-only)                         |

### 5.4. Implementation Strategy

**CLI Command Handler:**

```typescript
// src/cli/plan_commands.ts

export class PlanCommands {
  constructor(
    private config: Config,
    private db: DatabaseService,
  ) {}

  async approve(planId: string): Promise<void> {
    // 1. Validate plan exists in /Inbox/Plans
    const planPath = join(this.config.system.root, "Inbox", "Plans", `${planId}_plan.md`);
    if (!await exists(planPath)) {
      throw new Error(`Plan not found: ${planId}`);
    }

    // 2. Parse and validate frontmatter
    const plan = await this.parsePlan(planPath);
    if (plan.status !== "review") {
      throw new Error(`Plan cannot be approved (status: ${plan.status})`);
    }

    // 3. Move to /System/Active (atomic operation)
    const activePath = join(this.config.system.root, "System", "Active", `${planId}.md`);
    await Deno.rename(planPath, activePath);

    // 4. Log approval action
    this.db.logActivity(
      "human",
      "plan.approved",
      planId,
      {
        approved_by: await this.getUserIdentity(),
        approved_at: new Date().toISOString(),
      },
      plan.trace_id,
      null,
    );

    console.log(`✓ Plan '${planId}' approved and moved to /System/Active`);
  }

  async reject(planId: string, reason: string): Promise<void> {
    // 1. Validate and parse plan
    const planPath = join(this.config.system.root, "Inbox", "Plans", `${planId}_plan.md`);
    const plan = await this.parsePlan(planPath);

    // 2. Update frontmatter with rejection details
    const updatedContent = await this.addRejectionMetadata(
      await Deno.readTextFile(planPath),
      reason,
    );

    // 3. Move to /Inbox/Rejected
    const rejectedPath = join(this.config.system.root, "Inbox", "Rejected", `${planId}_rejected.md`);
    await Deno.writeTextFile(rejectedPath, updatedContent);
    await Deno.remove(planPath);

    // 4. Log rejection
    this.db.logActivity(
      "human",
      "plan.rejected",
      planId,
      {
        rejected_by: await this.getUserIdentity(),
        rejection_reason: reason,
        rejected_at: new Date().toISOString(),
      },
      plan.trace_id,
      null,
    );

    console.log(`✗ Plan '${planId}' rejected: ${reason}`);
  }

  async revise(planId: string, comments: string[]): Promise<void> {
    // 1. Validate and parse plan
    const planPath = join(this.config.system.root, "Inbox", "Plans", `${planId}_plan.md`);
    const plan = await this.parsePlan(planPath);

    // 2. Append review comments section
    const updatedContent = await this.addReviewComments(
      await Deno.readTextFile(planPath),
      comments,
    );

    // 3. Update frontmatter status
    const finalContent = updatedContent.replace(
      /status: "review"/,
      'status: "needs_revision"',
    );

    await Deno.writeTextFile(planPath, finalContent);

    // 4. Log revision request
    this.db.logActivity(
      "human",
      "plan.revision_requested",
      planId,
      {
        reviewed_by: await this.getUserIdentity(),
        comment_count: comments.length,
        reviewed_at: new Date().toISOString(),
      },
      plan.trace_id,
      null,
    );

    console.log(`⚠ Revision requested for '${planId}' (${comments.length} comments)`);
  }
}
```

**CLI Interface:**

```typescript
// src/cli/exoctl.ts

import { Command } from "@cliffy/command";

const planCommand = new Command()
  .name("plan")
  .description("Manage agent plans")
  .command(
    "approve <plan-id>",
    "Approve a plan and move it to /System/Active for execution",
  )
  .action(async (options, planId: string) => {
    const commands = new PlanCommands(config, db);
    await commands.approve(planId);
  })
  .command(
    "reject <plan-id>",
    "Reject a plan and move it to /Inbox/Rejected",
  )
  .option("-r, --reason <reason:string>", "Rejection reason (required)", { required: true })
  .action(async ({ reason }, planId: string) => {
    const commands = new PlanCommands(config, db);
    await commands.reject(planId, reason);
  })
  .command(
    "revise <plan-id>",
    "Request revisions to a plan",
  )
  .option("-c, --comment <comment:string>", "Add review comment (can be used multiple times)", {
    collect: true,
    required: true,
  })
  .action(async ({ comment }, planId: string) => {
    const commands = new PlanCommands(config, db);
    await commands.revise(planId, comment);
  })
  .command(
    "list",
    "List all plans",
  )
  .option("-s, --status <status:string>", "Filter by status (review, needs_revision, active)")
  .action(async ({ status }) => {
    const commands = new PlanCommands(config, db);
    await commands.list(status);
  })
  .command(
    "show <plan-id>",
    "Display plan details",
  )
  .action(async (options, planId: string) => {
    const commands = new PlanCommands(config, db);
    await commands.show(planId);
  });
```

**Action Validation:**

1. **Plan Approval:**
   - ✓ Plan file exists in `/Inbox/Plans`
   - ✓ Frontmatter has `status: "review"`
   - ✓ Required fields present (trace_id, request_id)
   - ✓ Target path in `/System/Active` is available
   - ✓ Atomic file operation (rename)

2. **Plan Rejection:**
   - ✓ Reason is required and non-empty
   - ✓ Frontmatter updated with rejection metadata
   - ✓ File moved to `/Inbox/Rejected` with `_rejected.md` suffix

3. **Revision Request:**
   - ✓ At least one comment required
   - ✓ Comments formatted properly in markdown
   - ✓ Frontmatter status updated to `needs_revision`
   - ✓ Original file preserved (edit in place)

### 5.5. Activity Journal Schema

```sql
-- Human action log example
INSERT INTO activity (
  id, trace_id, actor, agent_id, action_type, target, payload, timestamp
) VALUES (
  'uuid-generated',
  '550e8400-e29b-41d4-a716-446655440000',
  'human',
  NULL,  -- agent_id is NULL for human actions
  'plan.approved',
  'implement-auth',
  '{"approved_by": "user@example.com", "approved_at": "2024-11-25T15:30:00Z", "via": "cli"}',
  '2024-11-25T15:30:00Z'
);
```

### 5.6. User Identification

CLI commands automatically capture user identity:

- Primary: Read git config (`git config user.email`)
- Fallback: OS username (`Deno.env.get("USER")`)
- Stored in `payload.approved_by`, `payload.rejected_by`, or `payload.reviewed_by`
- Multi-user support built-in (each user's actions tagged with their identity)

### 5.7. Obsidian Plugin Integration

**Plugin Architecture:**

```typescript
// obsidian-plugin/main.ts (separate repo)

import { Notice, Plugin } from "obsidian";

export default class ExoFramePlugin extends Plugin {
  async onload() {
    // Add command: Approve Plan
    this.addCommand({
      id: "approve-plan",
      name: "Approve Plan",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (file?.path.includes("/Inbox/Plans/")) {
          if (!checking) {
            this.approvePlan(file.basename);
          }
          return true;
        }
        return false;
      },
    });

    // Add command: Reject Plan
    this.addCommand({
      id: "reject-plan",
      name: "Reject Plan",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (file?.path.includes("/Inbox/Plans/")) {
          if (!checking) {
            this.rejectPlan(file.basename);
          }
          return true;
        }
        return false;
      },
    });
  }

  async approvePlan(planId: string) {
    const result = await this.executeCommand(`exoctl plan approve ${planId}`);
    new Notice(result.success ? "✓ Plan approved" : `✗ Error: ${result.error}`);
  }

  async rejectPlan(planId: string) {
    const reason = await this.promptForReason();
    if (!reason) return;

    const result = await this.executeCommand(`exoctl plan reject ${planId} --reason "${reason}"`);
    new Notice(result.success ? "✗ Plan rejected" : `✗ Error: ${result.error}`);
  }

  private async executeCommand(cmd: string): Promise<{ success: boolean; error?: string }> {
    // Option 1: Execute CLI via child process (requires Obsidian permissions)
    // Option 2: Call daemon HTTP API directly
    // Option 3: Write to Unix socket
  }
}
```

**Benefits of CLI/UI Approach:**

- ✓ **Validation:** CLI checks plan status, file existence, required fields
- ✓ **Atomic Operations:** File moves are transactional (no partial states)
- ✓ **Error Handling:** Clear error messages guide users
- ✓ **User Identity:** Automatic capture of who performed action
- ✓ **Activity Logging:** Guaranteed log entry (no detection heuristics)
- ✓ **Type Safety:** CLI validates arguments before execution
- ✓ **Auditability:** All actions go through single code path
- ✓ **Obsidian Integration:** Plugin provides GUI for common actions

---

## 6. Storage Architecture

### Tier 1: The Activity Journal (SQLite)

- **Implementation:** Uses `jsr:@db/sqlite`.
- **Concurrency:** Uses WAL mode to handle concurrent writes from the Daemon and Agents.

### Tier 2: The Content Store

- **Format:** Markdown.
- **Watcher:** `Deno.watchFs()` is used instead of `chokidar` (reducing dependencies).
  - _Debounce Strategy:_ The engine implements a 200ms debounce buffer to handle OS-level rapid-fire events.

---

## 6. Feature: The Portal System & Safety

### 6.1. Mechanism

1. **Mounting:** User runs `deno task mount <target> <alias>`.
2. **Linking:** Deno creates the symlink using `Deno.symlink`.
3. **Permissioning:** _Crucial Step_ — `exoctl portal add` patches `exo.config.toml`, regenerates `deno.json` permission
   lists, and runs `deno task config validate`. Only if validation succeeds do we restart the daemon (or hot-reload
   permissions on supported OSes). If any sub-step fails, the symlink is deleted and configuration rollback is performed
   automatically.
4. **Verification:** After restart, `exoctl portal list --json` is executed and compared with the expected allow-list;
   mismatches block agent access and surface an actionable error.

```bash
# exoctl portal add ~/Dev/MyProject MyProject
# 1. Creates symlink
# 2. Updates exo.config.toml to add path
# 3. Regenerates deno.json with new permissions
# 4. Restarts daemon automatically
```

**Portal CLI Commands:**

```bash
# Add a new portal (creates symlink, generates context card, updates config)
exoctl portal add <target-path> <alias>
exoctl portal add ~/Dev/MyProject MyProject

# List all configured portals with their status
exoctl portal list
exoctl portal list --json                 # Machine-readable output

# Show detailed information about a specific portal
exoctl portal show <alias>
exoctl portal show MyProject              # Shows path, status, context card location

# Remove a portal (deletes symlink, removes from config, archives context card)
exoctl portal remove <alias>
exoctl portal remove MyProject
exoctl portal remove <alias> --keep-card  # Keep context card in Knowledge/Portals

# Verify portal integrity (checks symlink, target existence, permissions)
exoctl portal verify
exoctl portal verify <alias>              # Verify specific portal

# Regenerate context card for a portal
exoctl portal refresh <alias>
exoctl portal refresh MyProject           # Re-scans project and updates context card
```

**Portal Command Behavior:**

- **add:** Creates symlink at `/Portals/<alias>`, generates context card at `/Knowledge/Portals/<alias>.md`, updates `exo.config.toml` with portal path, validates config, restarts daemon if running
- **list:** Shows all portals from config with status (active, broken, missing)
- **show:** Displays portal details including target path, symlink status, context card location, file permissions
- **remove:** Safely removes portal by deleting symlink, removing from config, moving context card to `/Knowledge/Portals/_archived/`
- **verify:** Checks symlink integrity, target accessibility, permission validity, reports issues
- **refresh:** Re-generates context card by scanning target directory for tech stack, file structure changes

**Activity Logging:**

All portal operations are logged to Activity Journal:

- `portal.added` - Portal created with target path and alias
- `portal.removed` - Portal removed with reason
- `portal.verified` - Verification check with results
- `portal.refreshed` - Context card regenerated
- All actions tagged with `actor='human'`, `via='cli'`

### 6.2. Path Safety

- **Engine Level:** Deno prevents access outside the allowed list.
- **Logic Level:** Engine still checks `if (path.startsWith(portalRoot))` to prevent logical confusion between portals.

### 6.3. OS-Specific Notes

- **Windows:** Symlink creation requires Developer Mode or elevated PowerShell. When unavailable, `exoctl` falls back to
  NTFS junctions and records the deviation in Activity Journal.
- **macOS:** First-time portal creation triggers System Settings > Privacy prompt; instructions are logged to
  `/Knowledge/README.md`.
- **Linux:** Ensure `inotify` watch limits (`fs.inotify.max_user_watches`) include portal paths; setup script adjusts
  when possible.

---

## 7. Agentic Architecture

**Example Blueprint:** `/Blueprints/Agents/senior_coder.toml`

```toml
name = "Senior Coder"
runtime = "deno"  # Explicitly marks runtime requirement
model = "claude-3-5-sonnet"

# PERMISSIONS
# Deno allows us to be very granular via sub-process flags
[capabilities.filesystem]
allow_write = ["portal:*"]

[capabilities.shell]
allow = ["git", "npm"]  # Mapped to --allow-run
```

### 7.1 Capability Enforcement Pipeline

1. **Blueprint Parsing:** `BlueprintService` validates TOML against Zod schema and resolves macros (e.g., `portal:*`).
2. **Permission Compilation:** At agent launch, requested capabilities are intersected with daemon-wide policy,
   producing concrete Deno flags (`--allow-read`, `--allow-run`, `--allow-net`) plus internal guards (tool registry
   filters, command allowlist).
3. **Runtime Guardrails:** Even when Deno permits an API, the Tool Registry double-checks that the caller’s capability
   bit is set before dispatching commands.
4. **Audit:** Granted permissions are recorded in the Activity Journal’s payload, and `exoctl log query --trace` shows
   what the agent actually received.
5. **Violation Handling:** Attempts to exceed declared capabilities raise a `CapabilityViolationError`, halt the agent,
   and trigger Mission Reporter warnings.

### 7.2 Local vs Federated vs Hybrid Agents

| Attribute           | Local/Sovereign                         | Third-Party / Federated                  | Hybrid                                      |
| ------------------- | --------------------------------------- | ---------------------------------------- | ------------------------------------------- |
| Execution           | Runs on user hardware (Ollama, scripts) | Calls remote API (Claude, GPT)           | Mixed chain of local + remote sub-agents    |
| Context Limits      | Unlimited (bounded by disk)             | Enforced via Context Loader token budget | Local hops unrestricted; remote hops capped |
| Network Permissions | Typically none                          | Requires explicit `--allow-net`          | Only remote segments get net perms; logged  |
| Privacy Guarantees  | Data never leaves machine               | Subject to provider ToS                  | Per-hop consent + redaction lists required  |
| Blueprint Hint      | `runtime_mode: local`                   | `runtime_mode: remote`                   | `runtime_mode: hybrid` + `handoff_policy`   |

When `runtime_mode` is `local`, the Context Loader bypasses token truncation and streams all resolved files (subject to
optional soft caps). When `runtime_mode` is `remote`, the loader enforces the model’s context window and emits
`[System Warning]` entries if truncation occurs. For `runtime_mode: hybrid`, the loader splits context into local vs
exportable segments based on `handoff_policy`, and every remote hop logs the exact files shared.

---

## 8. Security & Trust

### 8.1. Threat Model (v1.2 - Hardened)

- **Scope:** Personal Productivity.
- **Mitigation:**
  - **Runtime Sandbox:** Deno enforces file/net/env boundaries.
  - **Supply Chain:** No `node_modules`. Dependencies are imported via HTTPS URLs with integrity hashes (`lock.json`).
  - **Path Traversal:** Deno throws `PermissionDenied` if code attempts to read `../outside`.

### 8.2. Secret Management

- **Storage:** Secrets stored in OS Keyring (Keychain/DPAPI).
- **Access:** Deno accesses keyring via FFI plugin (e.g., `deno_keyring`) only when needed. Secrets are never printed to
  stdout/logs.
- **Verification:** Each threat in Section 8 maps to a regression test listed in the Implementation Plan’s Phase 7 risk
  matrix; CI fails if any mitigation test regresses.

---

## 9. Concurrency & Locking

### 9.1. The Lease Protocol

- **Heartbeat:** Agents run a `setInterval` loop updating the SQLite `leases` table every 30s.
- **Failure:** If the Deno process crashes, the lease expires in 60s.

### 9.2. Conflict Resolution

- **Git:** Agents utilize Feature Branches.
- **User:** User merges branches manually via Git CLI or VS Code.

---

## 10. Performance KPIs

Targets based on Reference Hardware (**Mac Mini M4 / Linux x64**). Benchmarks are planned but not yet published.

| Metric                   | Target       | Notes                                                            |
| ------------------------ | ------------ | ---------------------------------------------------------------- |
| **Cold Start**           | < 80 ms      | Measured via `deno bench cold_start_bench.ts` once harness lands |
| **Watcher Latency**      | < 100 ms     | Slow-write scenario to be profiled in CI                         |
| **Memory Footprint**     | < 150 MB     | Idle daemon including Activity Journal cache                     |
| **Plan Loop Throughput** | ≥ 10 req/min | Scenario A dry run with mock provider                            |

---

## 11. Future: External Agent Interoperability

### 11.1. Agent2Agent (A2A) Protocol

**What is Agent2Agent?** Google's Agent2Agent (A2A) is an open standard protocol (now under Linux Foundation) for
inter-agent communication. It enables agents from different vendors and frameworks to discover, communicate, and
coordinate tasks using JSON-RPC 2.0 over HTTP(S).

**Key Features:**

- **Agent Discovery**: Standardized Agent Cards at `/.well-known/agent.json`
- **Task Lifecycle**: Structured task states (submitted, working, completed)
- **Communication**: JSON-RPC 2.0 over HTTP(S) with Server-Sent Events (SSE) for streaming
- **Platform-Agnostic**: Works across frameworks and vendors
- **Complementary to MCP**: While MCP handles tool/context sharing, A2A handles agent-to-agent coordination

### 11.2. Why ExoFrame Doesn't Use A2A Currently

**Design Philosophy Mismatch:**

ExoFrame's core architecture is **file-based and local-first**:

- Agents communicate via markdown files in watched directories
- No network infrastructure required for local agents
- Security through Deno's capability system and filesystem boundaries
- All coordination happens via file movements

A2A is **network-based and distributed**:

- Requires HTTP servers and exposed endpoints
- Necessitates network permissions and authentication
- Designed for cross-platform, cross-network agent meshes

**Current Coverage:**

ExoFrame already supports multi-agent scenarios through its file-based protocol:

- **Local Agents**: Coordinate via shared filesystem (no network)
- **Federated Agents**: Call out to third-party APIs when needed
- **Hybrid Agents**: Mix local and remote execution with logged handoffs

### 11.3. Future Bridge Architecture (If Needed)

If ExoFrame needs to interoperate with external agent systems, we can implement an **A2A Adapter Layer** without
changing the core architecture:

```typescript
// src/adapters/a2a_adapter.ts

/**
 * Bridges ExoFrame's file-based protocol to Agent2Agent HTTP protocol
 * Enables external agents to invoke ExoFrame agents via A2A
 */
class A2AAdapter {
  constructor(
    private exoRoot: string,
    private port: number = 8080,
  ) {}

  /**
   * Start HTTP server exposing A2A endpoints
   * Permissions: Requires --allow-net=0.0.0.0:8080
   */
  async start(): Promise<void> {
    // Serve Agent Card at /.well-known/agent.json
    // Handle POST /tasks for task submission
    // Poll /Inbox/Plans for responses
  }

  /**
   * Translate A2A task to ExoFrame request file
   */
  private async ingestA2ATask(task: A2ATask): Promise<string> {
    const requestPath = `${this.exoRoot}/Inbox/Requests/${task.id}.md`;
    const markdown = this.toExoFrameMarkdown(task);
    await Deno.writeTextFile(requestPath, markdown);
    return task.id;
  }

  /**
   * Monitor for plan file and translate back to A2A response
   */
  private async pollForPlan(taskId: string): Promise<A2AResponse> {
    const planPath = `${this.exoRoot}/Inbox/Plans/${taskId}_plan.md`;
    const watcher = Deno.watchFs(planPath);
    // Wait for file creation, parse, return A2A response
  }
}
```

**Integration Points:**

1. **Inbound (External → ExoFrame)**:
   - External agent calls A2A endpoint
   - Adapter creates request file in `/Inbox/Requests`
   - ExoFrame agent processes normally
   - Adapter watches `/Inbox/Plans`, translates to A2A response

2. **Outbound (ExoFrame → External)**:
   - ExoFrame agent specifies A2A-compatible remote in blueprint
   - Adapter translates request file to A2A task
   - Posts to external agent's A2A endpoint
   - Receives response, creates plan file

**Security Considerations:**

- A2A adapter runs as **separate Deno process** with `--allow-net` permission
- Core ExoFrame daemon remains network-isolated for local agents
- Adapter uses Unix socket or named pipe to communicate with main daemon
- All A2A traffic logged to Activity Journal with external agent metadata

**Deployment Model:**

```bash
# Core daemon (no network)
deno run --allow-read=./ExoFrame --allow-write=./ExoFrame src/main.ts

# Optional A2A adapter (when external integration needed)
deno run --allow-read=./ExoFrame --allow-write=./ExoFrame \
  --allow-net=0.0.0.0:8080 src/adapters/a2a_adapter.ts
```

### 11.4. Decision Criteria for A2A Integration

Implement A2A bridge only if one or more of these requirements emerge:

1. **External System Integration**: Need to invoke agents in other frameworks (LangChain, AutoGen, etc.)
2. **Multi-Instance Coordination**: Multiple ExoFrame deployments need to collaborate across machines
3. **Agent Marketplace**: ExoFrame agents need to be discoverable/invokable by third-party systems
4. **Enterprise Requirements**: Organization requires standardized agent protocols

**Current Recommendation**: Defer A2A implementation. File-based protocol is simpler, more secure, and sufficient for
current use cases.

---

_End of Technical Specification_
