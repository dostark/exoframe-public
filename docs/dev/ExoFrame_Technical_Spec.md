# Project ExoFrame: Technical Specification & Architecture

- **Version:** 1.11.0
- **Release Date:** 2026-01-06
- **Status:** Engineering Specification
- **Reference:** [ExoFrame White Paper](./ExoFrame_White_Paper.md)
- **Architecture:** [ExoFrame Architecture Diagrams](./ExoFrame_Architecture.md)
- **Philosophy:** Local-First, Type-Safe, Secure-by-Design

---

## Terminology Reference

- **Activity Journal:** The SQLite database logging all events
- **Portal:** A symlinked directory providing agent access to external projects
- **Request:** A markdown file in `Workspace/Requests` containing user intent
- **Plan:** An agent-generated proposal in `Workspace/Plans`
- **Active Task:** An approved request in `Workspace/Active` being executed
- **Report:** An agent-generated summary in `/Memory/Execution` after completion
- **Trace ID:** UUID linking request → plan → execution → report
- **Lease:** Exclusive lock on a file (stored in `leases` table)
- **Actor:** Entity performing action (agent name, "system", or "user")
- **Blueprint:** TOML definition of an agent (model, capabilities, prompt)
- **Flow:** TypeScript orchestration defining multi-agent workflows (Phase 7 - Flow Orchestration)
- **Request Router:** Service that routes requests to appropriate execution engine (agent vs flow)

---

## 1. System Overview

ExoFrame is a secure, daemon-based orchestration platform. It operates on the **"Files as API"** principle, utilizing a
watched folder structure to trigger typed workflows.

ExoFrame deliberately supports **four agent execution modes**:

1. **Local/Sovereign Agents** — run entirely on the user’s hardware (e.g., Ollama, deterministic scripts). They have
   unrestricted access to on-disk context within the allowed portals and do not require token-budget enforcement.
2. **Federated / Third-Party Agents** — call out to remote APIs (e.g., Claude, GPT). They inherit provider-specific
   token ceilings, rate limits, and privacy constraints that the engine enforces via the Context Loader and Capability
   pipeline.
3. **Hybrid Agents** — orchestrations that mix local + federated sub-agents inside a single trace. Hybrid mode must log
   every cross-boundary handoff and only share context slices that the blueprint explicitly authorizes.
4. **Multi-Agent Flows** — declarative workflows that coordinate multiple agents in sequence or parallel, enabled by
   flow-aware request routing (Phase 7).

**Security Upgrade:** Migrated from Bun/Node to **Deno**, leveraging its capability-based security model and codifying
permission governance across CLI, daemon, and agents.

---

## 2. Core Technical Stack

| Component        | Technology       | Justification                                                                        |
| :--------------- | :--------------- | :----------------------------------------------------------------------------------- |
| **Runtime**      | **Deno** (v2.0+) | Native TypeScript, Web Standards, and **Permission System**.                         |
| **Language**     | **TypeScript**   | No transpilation needed. Strict typing via Zod.                                      |
| **Config**       | **TOML**         | All config & metadata uses TOML. Token-efficient for LLM context.                    |
| **Journal**      | **SQLite**       | Accessible via `jsr:@db/sqlite` (WASM) or FFI for performance.                       |
| **Dependencies** | **ES Modules**   | No `node_modules`. Dependencies cached globally or in vendor dir.                    |
| **Interface**    | **TUI**, **CLI** | TUI dashboard (exoctl dashboard) for real-time cockpit; CLI for Memory Banks access. |

## 2.2. TUI Dashboard Architecture (`exoctl dashboard`)

The TUI dashboard, launched via `exoctl dashboard`, is a terminal-based cockpit for ExoFrame. It is implemented using a Deno-compatible TUI library (e.g., `cliffy` or `deno-tui`) and integrates directly with ExoFrame's file/database APIs.

**Key Features:**

- Real-time log streaming from the Activity Journal (file watcher or polling)
- Plan review/approval with diff visualization and trace navigation
- Portal management (list, add, remove, refresh, sync)
- Daemon control (start, stop, restart, status, logs)
- Agent health/status view
- Keyboard navigation, theming, notifications, and accessibility
- **Split View:** Multi-pane layout allows simultaneous display of multiple views (e.g., logs and plan review). Users can split, resize, and switch panes dynamically.

**Data Flow:**

- Reads from Activity Journal (SQLite), Workspace/Plans, Portals, and System directories
- Writes actions (approvals, portal changes, daemon control) back to the Activity Journal and relevant files
- All actions are auditable and reflected in the system log

**Extensibility:**

- Modular widget/view system for future dashboard panels
- Hooks for remote monitoring or web dashboard integration (future)

See the [Implementation Plan](./ExoFrame_Implementation_Plan.md#step-95-tui-cockpit-implementation-plan) for implementation steps and test criteria.

### 2.0.1 Supported LLM Providers

ExoFrame uses a provider-agnostic architecture via the `IModelProvider` interface. All providers implement the same
contract, enabling seamless switching between local and cloud models.

#### Anthropic (Claude)

| Model               | Context Window | Use Case                                                             |
| ------------------- | -------------- | -------------------------------------------------------------------- |
| `claude-opus-4.5`   | 200K           | Tops agentic coding/reasoning; superior Plan-Execute loops (Default) |
| `claude-3.5-sonnet` | 200K           | Previous best-in-class for coding and reasoning                      |
| `claude-3.5-haiku`  | 200K           | Fast, cost-effective                                                 |

#### OpenAI (GPT)

| Model         | Context Window | Use Case                                                             |
| ------------- | -------------- | -------------------------------------------------------------------- |
| `gpt-5.2-pro` | 200K           | Best for pro/agentic tasks; excels in multi-step workflows (Default) |
| `gpt-4o`      | 128K           | Previous generation default multimodal                               |
| `gpt-4o-mini` | 128K           | Fast, cost-effective                                                 |
| `o1`          | 200K           | Advanced reasoning                                                   |

#### Google (Gemini)

| Model              | Context Window | Use Case                                                             |
| ------------------ | -------------- | -------------------------------------------------------------------- |
| `gemini-3-pro`     | 2M             | Massive context (2M+), 78% SWE-Bench; rivals GPT-5.2 speed (Default) |
| `gemini-3-flash`   | 1M             | Fastest, lowest cost for codebase ingestion                          |
| `gemini-2.0-flash` | 1M             | Previous generation balanced model                                   |

#### Ollama (Local)

| Model       | Context Window | Use Case                    |
| ----------- | -------------- | --------------------------- |
| `llama3.2`  | Varies         | General purpose local model |
| `mistral`   | Varies         | Balanced local model        |
| `codellama` | Varies         | Specialized for coding      |

**Provider Selection (exo.config.toml):**

```toml
[models.default]
provider = "anthropic"
model = "claude-opus-4.5"

[models.fast]
provider = "openai"
model = "gpt-4o-mini"

[models.local]
provider = "ollama"
model = "llama3.2"
```

**Environment Variables:**

| Variable            | Provider           |
| ------------------- | ------------------ |
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `OPENAI_API_KEY`    | OpenAI (GPT)       |
| `GOOGLE_API_KEY`    | Google (Gemini)    |

### 2.0.2 Provider Cost Comparison

| Provider  | Previous Model             | New Model       | Input Cost (per 1M)     | Output Cost (per 1M)       | Total ~Ratio |
| --------- | -------------------------- | --------------- | ----------------------- | -------------------------- | ------------ |
| Anthropic | claude-3-5-sonnet-20241022 | claude-opus-4.5 | $3 → $5-7.50 (+67-150%) | $15 → $25-37.50 (+67-150%) | 1.7-2.5x     |
| OpenAI    | gpt-4o                     | gpt-5.2 (chat)  | $2.50 → $1.75 (-30%)    | $10 → $14 (+40%)           | ~0.9x        |
| Google    | gemini-2.0-flash           | gemini-3-flash  | $0.30 → $0.50 (+67%)    | $2.50 → $3 (+20%)          | 1.3-1.7x     |

---

## 2.1. File Format Inventory

ExoFrame uses a **hybrid format strategy** optimized for different use cases:

- **TOML** for system configuration and agent blueprints (token-efficient, robust)
- **YAML** for markdown frontmatter

### Format Selection Rationale

| Use Case             | Format | Reason                                               |
| -------------------- | ------ | ---------------------------------------------------- |
| System config        | TOML   | Token-efficient for LLM context, no indentation bugs |
| Agent blueprints     | TOML   | Complex nested structures, explicit typing           |
| Markdown frontmatter | YAML   | **Memory Banks indexing and search compatibility**   |
| Deno configuration   | JSON   | Deno runtime requirement                             |

### Complete Format Reference

| Category             | Format                      | Extension      | Location              | Purpose                                    |
| -------------------- | --------------------------- | -------------- | --------------------- | ------------------------------------------ |
| **System Config**    | TOML                        | `.toml`        | `exo.config.toml`     | Main configuration                         |
| **Deno Config**      | JSON                        | `.json`        | `deno.json`           | Runtime, imports, tasks (Deno requirement) |
| **Agent Blueprints** | TOML                        | `.toml`        | `Blueprints/Agents/`  | Agent definitions                          |
| **Flow Definitions** | TypeScript                  | `.ts`          | `Blueprints/Flows/`   | Orchestration logic                        |
| **Requests**         | Markdown + YAML frontmatter | `.md`          | `Workspace/Requests/` | User task requests                         |
| **Plans**            | Markdown + YAML frontmatter | `.md`          | `Workspace/Plans/`    | Agent proposals                            |
| **Reports**          | Markdown + JSON metadata    | `.md`, `.json` | `Memory/Execution/`   | Mission completion reports                 |
| **Memory Banks**     | Markdown + JSON             | `.md`, `.json` | `Memory/`             | Execution history and project context      |
| **Project Memory**   | Markdown                    | `.md`          | `Memory/Projects/`    | Auto-generated project context             |
| **Activity Journal** | SQLite                      | `.db`          | `System/exo.db`       | Audit log & file locks                     |
| **Migrations**       | SQL                         | `.sql`         | `migrations/`         | Database schema changes                    |

### YAML Frontmatter Format (Requests, Plans, Reports)

Request, Plan, and Report files use **YAML frontmatter** (delimited by `---`):

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

_Note: YAML is used for frontmatter to enable structured metadata for Memory Banks search and CLI filtering._

---

## 3. Directory Structure

The File System is the Single Source of Truth. Every path shown above is provisioned by `scripts/scaffold.ts`; missing
folders are treated as fatal errors during daemon startup so that watchers do not run in partially-initialized states.

```text
/ExoFrame
├── deno.json                   <-- Project Config (Import Maps, Tasks)
├── lock.json                   <-- Dependency Integrity Hash
├── exo.config.toml             <-- System Physics (Paths, Models)
├── /.exo
│   ├── journal.db              <-- SQLite: Activity Log & Locks
├── /Blueprints                 <-- "Source Code" of the Swarm
│   ├── /Agents                 <-- TOML definitions
│   └── /Flows                  <-- TS logic
├── /Workspace                      <-- The Input Layer
│   ├── /Requests               <-- User drops ideas here
│   ├── /Plans                  <-- Agents submit proposals
│   ├── /Active                 <-- Runtime State
│   └── /Archive                <-- Processed requests/plans
├── /Memory                     <-- Memory Banks (execution history & project context)
│   ├── /Context                <-- Curated reference docs
│   ├── /Reports                <-- Agent-authored reports
│   └── /Portals                <-- Auto-generated context cards
├── /Memory/README.md           <-- Memory Banks usage guide
├── /Portals                    <-- VIRTUAL OVERLAY (Symlinks)
│   └── <Alias> -> /home/user/Dev/Project_X
Note: the tree above describes the *deployed workspace* layout used at runtime. The *development repository* (the Git checkout developers work in) contains the same folders plus development-only artifacts such as `tests/`, `.github/`, `docs/`, and the full `src/` codebase. Do not treat your deployed workspace as a development checkout — deploy workspaces are intended for runtime and user data (Memory, .exo/journal.db) and are created from the development repo via the provided deploy script.
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

The `HumanActionTracker` service provides a safe, validated interface for human interactions with plans through CLI commands and TUI dashboard integration. It enforces proper validation, prevents file corruption, and ensures all actions are logged to the Activity Journal.

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

**Option 2: TUI Dashboard Integration**

- ExoFrame TUI dashboard provides interactive plan review with real-time updates
- Commands available via keyboard shortcuts: "Approve Plan", "Reject Plan", etc.
- Dashboard communicates with daemon via direct file operations

**Option 3: Plan File Direct Edit**

- Plans include clickable action metadata in frontmatter
- TUI dashboard renders these as interactive buttons
- Example: `action_buttons: ["approve", "reject", "revise"]` becomes clickable controls

### 5.3. Tracked Actions

| Human Action        | CLI Command                               | Activity Log Entry                         |
| :------------------ | :---------------------------------------- | :----------------------------------------- |
| **Approve Plan**    | `exoctl plan approve <id>`                | `plan.approved` (actor: 'human')           |
| **Reject Plan**     | `exoctl plan reject <id> --reason "..."`  | `plan.rejected` (actor: 'human')           |
| **Request Changes** | `exoctl plan revise <id> --comment "..."` | `plan.revision_requested` (actor: 'human') |
| **View Plan**       | `exoctl plan show <id>`                   | No log (read-only)                         |
| **List Plans**      | `exoctl plan list`                        | No log (read-only)                         |

### 5.4. Implementation Strategy

**CLI Interface:**

```typescript
// src/cli/exoctl.ts

import { Command } from "@cliffy/command";

const planCommand = new Command()
  .name("plan")
  .description("Manage agent plans")
  .command(
    "approve <plan-id>",
    "Approve a plan and move it to Workspace/Active for execution",
  )
  .action(async (options, planId: string) => {
    const commands = new PlanCommands(config, db);
    await commands.approve(planId);
  })
  .command(
    "reject <plan-id>",
    "Reject a plan and move it to /Workspace/Rejected",
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
   - ✓ Plan file exists in `/Workspace/Plans`
   - ✓ Frontmatter has `status: "review"`
   - ✓ Required fields present (trace_id, request_id)
   - ✓ Target path in `Workspace/Active` is available
   - ✓ Atomic file operation (rename)

2. **Plan Rejection:**
   - ✓ Reason is required and non-empty
   - ✓ Frontmatter updated with rejection metadata
   - ✓ File moved to `/Workspace/Rejected` with `_rejected.md` suffix

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

### 5.7. TUI Dashboard Integration

**Dashboard Architecture:**

```typescript
// src/tui/plan_reviewer.ts (integrated into dashboard)

export class PlanReviewer {
  constructor(
    private config: Config,
    private db: DatabaseService,
  ) {}

  async renderPlanReview(planId: string): Promise<void> {
    // 1. Display plan content with syntax highlighting
    // 2. Show approve/reject/revise action buttons
    // 3. Handle keyboard shortcuts (A=approve, R=reject, V=revise)
    // 4. Update display in real-time when actions complete
  }

  async approvePlan(planId: string): Promise<void> {
    // Delegate to CLI command implementation
    const commands = new PlanCommands(this.config, this.db);
    await commands.approve(planId);

    // Update TUI display
    this.showNotification("✓ Plan approved and moved to Workspace/Active");
    this.refreshPlanList();
  }

  async rejectPlan(planId: string): Promise<void> {
    const reason = await this.promptForReason();
    if (!reason) return;

    const commands = new PlanCommands(this.config, this.db);
    await commands.reject(planId, reason);

    this.showNotification("✗ Plan rejected");
    this.refreshPlanList();
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
- ✓ **TUI Dashboard Integration:** Real-time interface for common actions

---

## 5.8. Plan Execution Engine (Step 5.12)

### 5.8.1. Overview

The Plan Execution Engine automatically executes approved plans moved to `Workspace/Active/`. It uses an **agent-driven architecture via MCP (Model Context Protocol) server** where LLM agents connect to ExoFrame's MCP server and use standardized tools for portal operations. This eliminates fragile response parsing, provides strong security boundaries, and supports configurable security modes (sandboxed or hybrid). It consists of six sub-steps, with Detection (5.12.1) and Parsing (5.12.2) currently implemented.

**Implementation Status:**

| Sub-Step | Name                | Status         | Description                                  |
| -------- | ------------------- | -------------- | -------------------------------------------- |
| 5.12.1   | Detection           | ✅ Implemented | Monitors Workspace/Active for approved plans |
| 5.12.2   | Parsing             | ✅ Implemented | Extracts and validates plan structure        |
| 5.12.3   | Agent Orchestration | 📋 Planned     | Invokes LLM agent via MCP server with tools  |
| 5.12.4   | Changeset Registry  | 📋 Planned     | Registers changeset created by agent         |
| 5.12.5   | Status Update       | 📋 Planned     | Marks plan executed, moves to archive        |
| 5.12.6   | Error Handling      | 📋 Planned     | Handles agent/MCP/Git errors gracefully      |

### 5.8.2. Dual FileWatcher Architecture

The daemon runs two independent FileWatcher instances:

**Request Watcher (Existing):**

- Path: `Workspace/Requests/`
- Purpose: Detects new user requests
- Handler: RequestProcessor

**Plan Watcher (New - Step 5.12.1):**

- Path: `Workspace/Active/`
- Purpose: Detects approved plans ready for execution
- Handler: Plan Executor (in-progress)
- Filter: Only processes files ending in `_plan.md`

**Implementation (src/main.ts):**

```typescript
// Request watcher for new requests
const requestWatcher = new FileWatcher(config, async (event) => {
  await requestProcessor.process(event.path);
}, db);

// Plan watcher for approved plans (custom watch path)
const planWatcher = new FileWatcher(
  config,
  async (event) => {
    // Detection and parsing logic (Steps 5.12.1-5.12.2)
  },
  db,
  activePath, // Custom watch path: Workspace/Active/
);

// Start both watchers concurrently
await Promise.all([requestWatcher.start(), planWatcher.start()]);
```

### 5.8.2.1. Flow-Aware Request Processing (Step 7.6 ✅ Implemented)

**Purpose:** Enable intelligent routing of requests to either single-agent execution or multi-agent flow execution based on frontmatter configuration.

**Request Processing Flow:**

1. **File Detection:** RequestWatcher detects new `.md` file in `Workspace/Requests/`
2. **Frontmatter Parsing:** Extract YAML frontmatter with routing fields (`flow`, `agent`)
3. **Routing Decision:**
   - If `flow` field present → Route to FlowRunner (multi-agent)
   - If `agent` field present → Route to AgentRunner (single-agent)
   - If neither field → Use default agent from configuration
4. **Validation:** Validate routing target exists and is properly configured
5. **Plan Generation:** Generate appropriate execution plan
6. **Status Update:** Update request status and log to Activity Journal

**Routing Priority (Step 7.6):**

| Priority | Condition             | Action                  | Target      |
| :------- | :-------------------- | :---------------------- | :---------- |
| 1        | `flow: <id>` present  | Multi-agent execution   | FlowRunner  |
| 2        | `agent: <id>` present | Single-agent execution  | AgentRunner |
| 3        | Neither field         | Default agent execution | AgentRunner |

**Request Frontmatter Examples:**

**Flow Request (Multi-Agent):**

```yaml
---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
status: pending
flow: code-review
tags: [review, security, pr-42]
priority: high
created: "2025-12-20T10:00:00Z"
source: cli
created_by: user@example.com
---
Please perform a comprehensive security and code quality review of this pull request.
```

**Agent Request (Single-Agent):**

```yaml
---
trace_id: "550e8400-e29b-41d4-a716-446655440001"
status: pending
agent: senior-coder
tags: [implementation, auth]
priority: medium
created: "2025-12-20T10:15:00Z"
source: cli
created_by: user@example.com
---
Implement JWT-based authentication for the API endpoints.
```

**Default Agent Request:**

```yaml
---
trace_id: "550e8400-e29b-41d4-a716-446655440002"
status: pending
tags: [general, documentation]
priority: low
created: "2025-12-20T10:30:00Z"
source: cli
created_by: user@example.com
---
Help me understand the project structure and architecture.
```

**Validation Rules:**

- ✓ **Mutual Exclusion:** Request cannot specify both `flow` and `agent` fields
- ✓ **Required Field:** Request must specify either `flow` or `agent` field
- ✓ **Flow Existence:** Referenced flow must exist in `/Blueprints/Flows/`
- ✓ **Agent Existence:** Referenced agent must exist in `/Blueprints/Agents/`
- ✓ **Schema Validity:** Flow must conform to expected structure
- ✓ **Dependencies:** Flow dependencies (agents, transforms) must exist

**Activity Journal Events:**

| Event                     | Payload Fields                                | Condition                   |
| ------------------------- | --------------------------------------------- | :-------------------------- |
| `request.processing`      | `requestId, traceId, flow?, agent?, priority` | Request processing started  |
| `request.routing.flow`    | `requestId, flowId, traceId`                  | Routed to flow execution    |
| `request.routing.agent`   | `requestId, agentId, traceId`                 | Routed to agent execution   |
| `request.routing.default` | `requestId, defaultAgentId, traceId`          | Used default agent          |
| `request.routing.error`   | `requestId, error, field, value, traceId`     | Routing validation failed   |
| `flow.validation.failed`  | `requestId, flowId, error, traceId`           | Flow validation failed      |
| `request.planned`         | `requestId, planPath, flow?, agent?, traceId` | Plan successfully generated |
| `request.failed`          | `requestId, error, traceId`                   | Request processing failed   |

**Error Handling:**

- **Conflicting Fields:** `"Request cannot specify both 'flow' and 'agent' fields"`
- **Missing Routing:** `"Request must specify either 'flow' or 'agent' field"`
- **Invalid Flow ID:** `"Flow 'nonexistent-flow' not found in /Blueprints/Flows/"`
- **Invalid Agent ID:** `"Agent 'unknown-agent' not found in blueprints"`
- **Malformed Flow:** `"Flow 'broken-flow' has invalid schema: missing required field 'steps'"`

**Integration Points:**

- **RequestRouter:** Determines routing target based on frontmatter
- **FlowValidator:** Validates flow existence and schema before routing
- **AgentRunner:** Executes single-agent requests (existing)
- **FlowRunner:** Executes multi-agent flow requests (Phase 7)
- **PlanWriter:** Generates plan files for both routing types
- **EventLogger:** Records all routing decisions and validation results

### 5.8.2.2. Flow Orchestration Improvements (Phase 15 ✅ Implemented)

**Purpose:** Enhanced Flow execution with quality gates, LLM-as-a-Judge evaluation, conditional branching, and feedback loops for iterative improvement.

**New Flow Capabilities:**

| Feature                  | Description                                      | Component            |
| ------------------------ | ------------------------------------------------ | -------------------- |
| **Condition Evaluation** | Execute steps conditionally based on expressions | `ConditionEvaluator` |
| **Quality Gates**        | Evaluate output quality against thresholds       | `GateEvaluator`      |
| **LLM-as-a-Judge**       | Use LLM agents to evaluate output quality        | `JudgeEvaluator`     |
| **Feedback Loops**       | Iterative improvement via Reflexion pattern      | `FeedbackLoop`       |
| **Evaluation Criteria**  | Built-in criteria library for quality assessment | `EvaluationCriteria` |

**Flow Step Schema Extensions:**

```typescript
// New step types in FlowStepSchema
interface GateStep {
  type: "gate";
  agent: string; // Judge agent ID
  criteria: string[]; // Evaluation criteria names
  threshold: number; // Pass threshold (0-1)
  onFail: "halt" | "retry" | "continue-with-warning";
  maxRetries?: number;
}

interface BranchStep {
  type: "branch";
  condition: string; // Expression to evaluate
  trueBranch: FlowStep[];
  falseBranch?: FlowStep[];
}
```

**Condition Expressions:**

Steps can include `condition` field for conditional execution:

```typescript
{
  id: "improve",
  agent: "senior-coder",
  dependsOn: ["review"],
  condition: "results['review'].score < 0.8",  // Only run if review score low
}
```

**Quality Gate Configuration:**

```typescript
{
  id: "quality-gate",
  type: "gate",
  agent: "quality-judge",
  criteria: ["CODE_CORRECTNESS", "HAS_TESTS", "DOCUMENTATION_QUALITY"],
  threshold: 0.8,
  onFail: "retry",
  maxRetries: 2,
}
```

**Built-in Evaluation Criteria:**

| Criterion             | Description                       | Weight |
| --------------------- | --------------------------------- | ------ |
| `CODE_CORRECTNESS`    | Syntactic and logical correctness | 2.0    |
| `CODE_COMPLETENESS`   | All requirements addressed        | 1.5    |
| `HAS_TESTS`           | Test coverage present             | 1.0    |
| `NO_SECURITY_ISSUES`  | No obvious vulnerabilities        | 2.0    |
| `FOLLOWS_CONVENTIONS` | Style and naming conventions      | 0.8    |
| `ERROR_HANDLING`      | Proper error handling             | 1.0    |

**Feedback Loop Pattern:**

```typescript
const feedbackConfig = {
  maxIterations: 3,
  targetScore: 0.9,
  evaluator: "quality-judge",
  criteria: ["CODE_CORRECTNESS", "HAS_TESTS"],
  minImprovement: 0.05,
};
```

**Implementation Files:**

| File                               | Purpose                    | Tests |
| ---------------------------------- | -------------------------- | ----- |
| `src/flows/condition_evaluator.ts` | Safe expression evaluation | 21    |
| `src/flows/gate_evaluator.ts`      | Quality gate logic         | 8     |
| `src/flows/judge_evaluator.ts`     | LLM judge integration      | 14    |
| `src/flows/feedback_loop.ts`       | Reflexion pattern          | 15    |
| `src/flows/evaluation_criteria.ts` | Criteria library           | 37    |

**Total Flow Tests:** 175 (all passing)

### 5.8.3. Step 5.12.1: Detection (✅ Implemented)

**Purpose:** Detect approved plans in `Workspace/Active/` and validate required metadata.

**Detection Flow:**

1. FileWatcher detects file creation in `Workspace/Active/`
2. Filter files by `_plan.md` suffix (ignore other files)
3. Read file content
4. Parse YAML frontmatter using `@std/yaml`
5. Validate required field: `trace_id`
6. Log detection events

**Validation Checks:**

- ✓ File has YAML frontmatter (delimited by `---`)
- ✓ Frontmatter is valid YAML
- ✓ `trace_id` field exists and is non-empty

**Activity Journal Events:**

| Event                      | Condition         | Payload                  |
| -------------------------- | ----------------- | ------------------------ |
| `plan.detected`            | Plan file found   | `{trace_id, request_id}` |
| `plan.ready_for_execution` | Valid plan parsed | `{trace_id, request_id}` |
| `plan.invalid_frontmatter` | YAML parse error  | `{error}`                |
| `plan.missing_trace_id`    | No trace_id field | `{frontmatter}`          |
| `plan.detection_failed`    | Unexpected error  | `{error}`                |

**Error Handling:**

- Invalid YAML: Log error, preserve file, skip processing
- Missing trace_id: Log error, preserve file, skip processing
- File read error: Log error, retry on next watcher cycle
- All errors non-fatal: daemon continues running

### 5.8.4. Step 5.12.2: Parsing (✅ Implemented)

**Purpose:** Extract plan structure (steps, context) from approved plan body.

**Parsing Flow:**

1. Extract body section after YAML frontmatter
2. Use regex to extract all steps: `## Step (\d+): ([^\n]+)`
3. Validate step numbering is sequential (1, 2, 3...)
4. Validate all steps have non-empty titles
5. Build structured step objects
6. Log parsing results

**Step Extraction Regex:**

```typescript
const stepMatches = [...body.matchAll(
  /## Step (\d+): ([^\n]+)\n([\s\S]*?)(?=## Step \d+:|$)/g,
)];
```

**Parsed Structure:**

```typescript
interface ParsedPlan {
  context: {
    trace_id: string;
    request_id?: string;
    agent?: string;
    status?: string;
    created_at?: Date;
  };
  steps: Array<{
    number: number; // 1, 2, 3...
    title: string; // "Create User Model"
    content: string; // Full step body with tasks
  }>;
}
```

**Validation Checks:**

- ✓ Body section exists after frontmatter
- ✓ At least one step found
- ✓ Step numbering is sequential (warns if gaps detected)
- ✓ All steps have non-empty titles
- ✓ Step content can be empty (valid for title-only steps)

**Activity Journal Events:**

| Event                       | Condition            | Payload                                                               |
| --------------------------- | -------------------- | --------------------------------------------------------------------- |
| `plan.parsed`               | Successful parsing   | `{trace_id, request_id, agent, step_count, steps: ["1. Title", ...]}` |
| `plan.parsing_failed`       | No body/steps/titles | `{error, trace_id}`                                                   |
| `plan.non_sequential_steps` | Step number gaps     | `{trace_id, step_numbers: [1,3,5], expected: [1,2,3]}`                |

**Error Handling:**

- No body section: Log `plan.parsing_failed`, skip execution
- No steps found: Log `plan.parsing_failed`, skip execution
- Empty step titles: Log `plan.parsing_failed`, skip execution
- Non-sequential steps: Log warning, continue execution

### 5.8.5. Plan File Structure

Approved plans follow this standardized structure:

```markdown
---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
request_id: "implement-auth"
agent: "senior-coder"
status: "approved"
created_at: 2025-12-03T10:00:00Z
---

# Implementation Plan: User Authentication

## Background

This plan implements JWT-based user authentication.

## Step 1: Create User Model

Create the database schema and TypeScript types.

**Files to modify:**

- src/models/user.ts (create new)
- src/database/schema.sql (update)

**Tasks:**

- Define User interface
- Create migration
- Add validation

## Step 2: Implement Auth Service

Build the core authentication logic.

**Tasks:**

- Add signup function
- Add login function
- Generate JWT tokens

## Step 3: Add API Endpoints

Create REST API routes.

**Tasks:**

- POST /api/auth/signup
- POST /api/auth/login
- Add validation middleware
```

**Parsing Output:**

```typescript
{
  context: {
    trace_id: "550e8400-e29b-41d4-a716-446655440000",
    request_id: "implement-auth",
    agent: "senior-coder",
    status: "approved"
  },
  steps: [
    {
      number: 1,
      title: "Create User Model",
      content: "Create the database schema...\n\n**Files to modify:**\n..."
    },
    {
      number: 2,
      title: "Implement Auth Service",
      content: "Build the core authentication logic...\n\n**Tasks:**\n..."
    },
    {
      number: 3,
      title: "Add API Endpoints",
      content: "Create REST API routes...\n\n**Tasks:**\n..."
    }
  ]
}
```

### 5.8.6. Integration Points

**Current (Steps 5.12.1-5.12.2):**

- Detection runs on FileWatcher event
- Parsing runs immediately after successful detection
- Parsed plan structure logged to Activity Journal
- Plan remains in `Workspace/Active/` awaiting execution

**Future (Steps 5.12.3-5.12.6):**

- **MCP Server:** Start ExoFrame MCP server with portal scope, register 6 tools (read_file, write_file, list_directory, git_create_branch, git_commit, git_status)
- **Agent Orchestration:** Invoke LLM agent via MCP (stdio or SSE transport) with validated portal permissions
- **Security Modes:** Sandboxed (no file access, all via MCP) or Hybrid (read-only + audit)
- **Agent Execution:** Agent uses MCP tools to create feature branch and commit changes
- **Changeset Registry:** Record changeset with commit SHA, created_by (agent name), and trace_id
- **Status Update:** Mark executed, move to `System/Archive/`
- **Error Handling:** Catch agent/MCP/Git errors, audit unauthorized changes (hybrid mode), preserve plan state

### 5.8.7. Testing

**Unit Tests:**

- `tests/plan_executor_parsing_test.ts` - 19 test cases (detection and parsing) ✅
- `tests/mcp/server_test.ts` - 25+ test cases (MCP server, tools, resources, prompts) 📋
- `tests/mcp/tools_test.ts` - 30+ test cases (tool handlers, validation, security modes) 📋
- `tests/agent_executor_test.ts` - 20+ test cases (MCP invocation, agent integration) 📋
- `tests/portal_permissions_test.ts` - 12+ test cases (permission validation) 📋

**Integration Tests:**

- `tests/integration/14_plan_execution_parsing_test.ts` - 5 scenarios (parsing) ✅
- `tests/integration/15_plan_execution_mcp_test.ts` - Full MCP flow (request → MCP → changeset) 📋
- Sandboxed mode security enforcement tests 📋
- Hybrid mode audit detection tests 📋

**MCP Test Coverage:**

- MCP server initialization (stdio/SSE transports)
- Tool registration and invocation
- Resource discovery (portal:// URIs)
- Prompt handling (execute_plan, create_changeset)
- Permission validation (agents_allowed, operations)
- Security mode enforcement (sandboxed vs hybrid)
- Unauthorized change detection and reversion
- Error handling (invalid tools, parameters, execution errors)

### 5.8.8. MCP Server Architecture

**Purpose:** ExoFrame exposes a Model Context Protocol (MCP) server that LLM agents connect to for portal operations. This provides a standardized, secure interface with configurable security modes.

**MCP Components:**

```
┌─────────────────────────────────────────────┐
│         ExoFrame MCP Server                 │
├─────────────────────────────────────────────┤
│ Tools:      6 tools (read_file, write_file, │
│             list_directory, git_*)          │
├─────────────────────────────────────────────┤
│ Resources:  portal://PortalName/path URIs   │
├─────────────────────────────────────────────┤
│ Prompts:    execute_plan, create_changeset  │
├─────────────────────────────────────────────┤
│ Transport:  stdio or SSE (HTTP)             │
└─────────────────────────────────────────────┘
```

**MCP Tools:**

| Tool                | Description           | Inputs                  |
| ------------------- | --------------------- | ----------------------- |
| `read_file`         | Read portal file      | portal, path            |
| `write_file`        | Write portal file     | portal, path, content   |
| `list_directory`    | List portal directory | portal, path (optional) |
| `git_create_branch` | Create feature branch | portal, branch          |
| `git_commit`        | Commit changes        | portal, message, files  |
| `git_status`        | Check git status      | portal                  |

**MCP Resources:**

- Format: `portal://PortalName/path/to/file.ts`
- Dynamically discovered from portal filesystem
- Includes MIME type and description metadata
- Agent can request resource content via MCP

**MCP Prompts:**

- `execute_plan`: Execute an approved ExoFrame plan
- `create_changeset`: Create a changeset for code changes

**Security Modes:**

**Sandboxed (Recommended):**

- Agent has NO file system access
- Runs with `--allow-read=NONE --allow-write=NONE`
- All operations through MCP tools
- Impossible to bypass ExoFrame

**Hybrid (Performance):**

- Agent has read-only portal access
- Can read files directly (faster)
- MUST use MCP tools for writes
- Post-execution audit via git diff
- Unauthorized changes reverted

**Configuration:**

```toml
# exo.config.toml

[mcp]
enabled = true
transport = "stdio"  # or "sse"
server_name = "exoframe"

[[portals]]
name = "MyApp"
path = "/home/user/projects/MyApp"
agents_allowed = ["senior-coder", "code-reviewer"]
operations = ["read", "write", "git"]

[portals.MyApp.security]
mode = "sandboxed"  # or "hybrid"
audit_enabled = true
log_all_actions = true
```

**Implementation Files:**

- `src/mcp/server.ts` - MCP server implementation
- `src/mcp/tools.ts` - Tool handlers
- `src/mcp/resources.ts` - Resource handlers
- `src/mcp/prompts.ts` - Prompt templates
- `tests/mcp/server_test.ts` - Server tests
- `tests/mcp/tools_test.ts` - Tool tests

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
exoctl portal remove <alias> --keep-context  # Keep project memory in Memory/Projects

# Verify portal integrity (checks symlink, target existence, permissions)
exoctl portal verify
exoctl portal verify <alias>              # Verify specific portal

# Regenerate context card for a portal
exoctl portal refresh <alias>
exoctl portal refresh MyProject           # Re-scans project and updates context card
```

**Portal Command Behavior:**

- **add:** Creates symlink at `/Portals/<alias>`, generates project memory at `/Memory/Projects/<alias>/`, updates `exo.config.toml` with portal path, validates config, restarts daemon if running
- **list:** Shows all portals from config with status (active, broken, missing)
- **show:** Displays portal details including target path, symlink status, context card location, file permissions
- **remove:** Safely removes portal by deleting symlink, removing from config, archiving project memory to `/Memory/Projects/_archived/`
- **verify:** Checks symlink integrity, target accessibility, permission validity, reports issues
- **refresh:** Re-generates context card by scanning target directory for tech stack, file structure changes

**Activity Logging:**

All portal operations are logged to Activity Journal:

- `portal.added` - Portal created with target path and alias
- `portal.removed` - Portal removed with reason
- `portal.verified` - Verification check with results
- `portal.refreshed` - Context card regenerated
- All actions tagged with `actor='human'`, `via='cli'`

**Plan Execution Events (Step 5.12):**

- `plan.detected` - Approved plan found in Workspace/Active
- `plan.ready_for_execution` - Valid plan parsed, ready for execution
- `plan.parsed` - Plan structure successfully extracted
- `plan.invalid_frontmatter` - YAML frontmatter parsing failed
- `plan.missing_trace_id` - Required trace_id field not found
- `plan.parsing_failed` - Plan body/steps validation failed
- `plan.non_sequential_steps` - Warning for gaps in step numbering
- `plan.detection_failed` - Unexpected error during detection

### 6.2. Path Safety

- **Engine Level:** Deno prevents access outside the allowed list.
- **Logic Level:** Engine still checks `if (path.startsWith(portalRoot))` to prevent logical confusion between portals.

### 6.3. OS-Specific Notes

- **Windows:** Symlink creation requires Developer Mode or elevated PowerShell. When unavailable, `exoctl` falls back to
  NTFS junctions and records the deviation in Activity Journal.
- **macOS:** First-time portal creation triggers System Settings > Privacy prompt; instructions are logged to
  `/Memory/README.md`.
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

### 7.3 Agent Orchestration Services (Phase 16)

Phase 16 introduced advanced orchestration services that enhance agent execution
with quality improvements, reliability, and context awareness.

#### 7.3.1 Service Overview

| Service               | Purpose                            | Key File                            |
| --------------------- | ---------------------------------- | ----------------------------------- |
| **Blueprint Loader**  | Unified blueprint parsing          | `src/services/blueprint_loader.ts`  |
| **Output Validator**  | Schema validation with JSON repair | `src/services/output_validator.ts`  |
| **Retry Policy**      | Exponential backoff with jitter    | `src/services/retry_policy.ts`      |
| **Reflexive Agent**   | Self-critique improvement loop     | `src/services/reflexive_agent.ts`   |
| **Tool Reflector**    | Tool result evaluation and retry   | `src/services/tool_reflector.ts`    |
| **Session Memory**    | Memory context injection           | `src/services/session_memory.ts`    |
| **Confidence Scorer** | Output confidence assessment       | `src/services/confidence_scorer.ts` |

#### 7.3.2 Orchestration Pipeline

```
Request → Session Memory → Agent Runner → Reflexive Agent → Output Validator → Response
             ↓                  ↓               ↓                 ↓
         Memory Bank      Tool Reflector   Self-Critique      Retry Policy
```

1. **Session Memory**: Injects relevant context from past interactions
   (learnings, patterns, executions)
2. **Agent Runner**: Executes agent with enhanced context
3. **Tool Reflector**: Evaluates tool call results, retries with alternative
   parameters if needed
4. **Reflexive Agent**: Self-critiques output and refines iteratively (optional,
   for quality-critical tasks)
5. **Output Validator**: Validates against schema, auto-repairs common JSON
   errors
6. **Retry Policy**: Handles transient failures with exponential backoff
7. **Confidence Scorer**: Assesses output confidence, flags low-confidence for
   human review

#### 7.3.3 Blueprint Configuration

Orchestration features are configured in agent blueprints:

```toml
+++
agent_id = "quality-reviewer"
name = "Quality Reviewer"
model = "anthropic:claude-opus-4.5"
capabilities = ["read_file", "search_files"]

# Reflexion Pattern (Phase 16.4)
reflexive = true
max_reflexion_iterations = 3
confidence_required = 80

# Session Memory (Phase 16.6)
memory_enabled = true
+++
```

#### 7.3.4 Output Validation Schema

The `OutputValidator` supports multiple schema types:

- **plan**: Standard execution plan (PlanSchema)
- **evaluation**: Quality evaluation with verdict (pass/fail/needs_improvement)
- **analysis**: Code analysis with findings and severity
- **simpleResponse**: Basic structured response with confidence
- **toolCall**: Tool invocation with arguments
- **actionSequence**: Multi-step action workflows

JSON repair capabilities include:

- Markdown code block removal
- Trailing comma removal
- Single quote to double quote conversion
- Unquoted key handling
- Comment stripping
- Newline escaping in strings

#### 7.3.5 Retry Policy Strategy

| Attempt | Base Delay | With Jitter (0.5 factor) |
| ------- | ---------- | ------------------------ |
| 1       | 1s         | 0.5s - 1.5s              |
| 2       | 2s         | 1.0s - 3.0s              |
| 3       | 4s         | 2.0s - 6.0s              |
| 4       | 8s         | 4.0s - 12.0s             |
| 5       | 16s        | 8.0s - 24.0s             |

Retryable errors: `rate_limit_exceeded`, `service_unavailable`, `timeout`,
`connection_reset`

Non-retryable: Authentication failures, schema validation errors, permission
denied

#### 7.3.6 Confidence Scoring

Confidence scores (0-100) help determine output reliability:

| Score  | Level     | Action                      |
| ------ | --------- | --------------------------- |
| 90-100 | Very High | Auto-approve                |
| 70-89  | High      | Standard review             |
| 50-69  | Medium    | Careful review recommended  |
| 30-49  | Low       | Human verification required |
| 0-29   | Very Low  | Consider alternate approach |

## Low-confidence outputs (below `confidence_threshold`) are flagged in logs andmay trigger human review workflows.

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
    // Poll /Workspace/Plans for responses
  }

  /**
   * Translate A2A task to ExoFrame request file
   */
  private async ingestA2ATask(task: A2ATask): Promise<string> {
    const requestPath = `${this.exoRoot}/Workspace/Requests/${task.id}.md`;
    const markdown = this.toExoFrameMarkdown(task);
    await Deno.writeTextFile(requestPath, markdown);
    return task.id;
  }

  /**
   * Monitor for plan file and translate back to A2A response
   */
  private async pollForPlan(taskId: string): Promise<A2AResponse> {
    const planPath = `${this.exoRoot}/Workspace/Plans/${taskId}_plan.md`;
    const watcher = Deno.watchFs(planPath);
    // Wait for file creation, parse, return A2A response
  }
}
```

**Integration Points:**

1. **Inbound (External → ExoFrame)**:
   - External agent calls A2A endpoint
   - Adapter creates request file in `/Workspace/Requests`
   - ExoFrame agent processes normally
   - Adapter watches `/Workspace/Plans`, translates to A2A response

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

### 11.5. Model Context Protocol (MCP) Integration

**What is MCP?** Model Context Protocol is Anthropic's open standard for connecting AI assistants to external tools and data sources. It enables standardized tool calling and context sharing between AI assistants (Claude Desktop, Cline, IDE agents) and external systems.

**Why MCP Fits ExoFrame:**

Unlike A2A (which targets agent-to-agent coordination), MCP is designed for **assistant-to-tool integration** - precisely ExoFrame's use case:

- **Local-First:** MCP servers run locally via stdio transport (no network required)
- **Tool Calling:** Standardized interface for operations (`createRequest`, `approvePlan`, `queryJournal`)
- **Complementary:** MCP layer sits above file-based core, doesn't replace it
- **Ecosystem:** Works with Claude Desktop, Cline, Cursor, and other MCP clients

**Planned Architecture (Phase 10):**

```typescript
// src/mcp/server.ts
export class ExoFrameMCPServer {
  // Expose ExoFrame operations as MCP tools
  tools = [
    "exoframe_create_request", // Create request files
    "exoframe_list_plans", // Query pending plans
    "exoframe_approve_plan", // Approve plans
    "exoframe_query_journal", // Query Activity Journal
    "exoframe_list_portals", // List available portals
    "exoframe_get_blueprint", // Retrieve blueprint details
  ];

  async start() {
    // Start MCP server on stdio transport
    // Delegate to existing CLI command implementations
    // Log all operations to Activity Journal
  }
}
```

**Integration Example:**

```json
// Claude Desktop config
{
  "mcpServers": {
    "exoframe": {
      "command": "exoctl",
      "args": ["mcp", "start"]
    }
  }
}
```

**Benefits:**

- **Automation:** AI assistants can create requests, approve plans programmatically
- **Integration:** Works with any MCP-compatible client
- **Sovereignty:** All processing remains local
- **Auditability:** MCP operations logged to Activity Journal
- **Simplicity:** Standard protocol, no custom API design

**Implementation Status:** Planned for Phase 10 (see Implementation Plan)

---

_End of Technical Specification_
