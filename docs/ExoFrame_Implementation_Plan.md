# ExoFrame Implementation Plan

- **Version:** 1.7.0
- **Release Date:** 2025-12-02
- **Philosophy:** Walking Skeleton (End-to-End first, features second).
- **Runtime:** Deno.
- **Target:** Honest MVP (Personal Developer Tool supporting both local sovereign agents and federated third-party
  agents).

### Change Log

- **v1.6.0:** Clarified market positioning vs IDE agents, added Phase 7 UX improvements (quick request CLI, UI evaluation), updated Executive Summary in White Paper.
- **v1.4.0:** Introduced hybrid agent orchestration, clarified dual-mode context handling, and refreshed documentation
  references.
- **v1.3.x:** Tightened governance (owners, dependencies, rollback), clarified security/test linkages, expanded
  migration strategy, and added context-loader + watcher safeguards.
- **v1.2.x:** Initial Deno migration baseline.

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

## Execution Governance

| Phase   | Timebox | Entry Criteria                        | Exit Criteria                                        |
| ------- | ------- | ------------------------------------- | ---------------------------------------------------- |
| Phase 1 | 1 week  | Repo initialized, change log approved | Daemon boots, storage scaffolds exist                |
| Phase 2 | 1 week  | Phase 1 exit + watcher harness        | Watcher + parser tests pass                          |
| Phase 3 | 2 weeks | Validated config + mock LLM           | Request → Plan loop verified                         |
| Phase 4 | 1 week  | Stable agent runtime                  | Git + tool registry exercised                        |
| Phase 5 | 1 week  | CLI scaffold merged                   | Obsidian vault validated                             |
| Phase 6 | 2 days  | All prior phases code-complete        | Testing strategy documented                          |
| Phase 7 | 1 week  | Testing complete                      | Flow orchestration working                           |
| Phase 8 | 1 week  | Core functionality stable             | UX improvements + UI evaluation done                 |
| Phase 9 | 1 week  | System stable with Ollama             | Cloud LLM providers (Anthropic/OpenAI/Google Gemini) |

Each step lists **Dependencies**, **Rollback/Contingency**, and updated success metrics.

---

## Phase 1: The Iron Skeleton (Runtime & Storage) ✅ COMPLETED

**Goal:** A running Deno daemon that can write to the database, read configuration, and establish the physical storage
structure.

### Step 1.1: Project Scaffold & Deno Configuration ✅ COMPLETED

- **Dependencies:** none — **Rollback:** delete generated config files.
- **Action:** Initialize repository. Create `deno.json` with strict tasks (e.g., `deno task start`) and record a
  deterministic `deno.lock` file.
- **Justification:** Establishes the Deno security sandbox immediately. We want to fail early if permissions are too
  tight.

**Success Criteria:**

**Core Functionality:**

1. [x] `deno task start` runs `main.ts` and prints "ExoFrame Daemon Active"
2. [x] Process fails with PermissionDenied when required permissions removed from `deno.json`
3. [x] `deno.lock` file generated and committed to version control

**Code Quality:**
4. [x] `deno task fmt:check` passes with no formatting issues
5. [x] `deno task lint` passes with no linting errors
6. [x] CI pipeline runs both checks automatically

7. [x] Complete Deno configuration created with security sandbox and task definitions

**Implementation:** See `deno.json` in project root for complete configuration with:

- Strict permission flags (read, write, net, env, run)
- Task definitions (start, dev, test, lint, fmt)
- Import maps for dependencies (@std/fs, @std/path, @std/toml, @db/sqlite, zod)
- Compiler options with strict type checking

### Running tests (developer guide)

Use Deno's test runner to execute unit and integration tests. Tests may spawn subprocesses (`deno`, `bash`, `sqlite3`)
and inspect the deployed workspace, so grant the required permissions when running locally or in CI.

- Recommended (run all tests locally with explicit permissions):

```bash
# from the repository root
deno test --allow-run --allow-read --allow-write
```

- Preferred via task (if `deno.json` includes a `test` task):

```bash
deno task test
```

- Notes:
  - `--allow-run` is required so tests can invoke `deno`/`bash`/`sqlite3` when exercising scripts like
    `scripts/setup_db.ts` and `scripts/deploy_workspace.sh`.
  - `--allow-read` / `--allow-write` allow tests to create temporary workspaces and inspect generated files (e.g.,
    `System/journal.db`).
  - On CI, prefer adding only the minimum permissions required and run tests inside an isolated container (Ubuntu) with
    `sqlite3` installed for full schema checks. If `sqlite3` is missing, some tests will fall back to lighter checks
    (file existence / non-zero size).

Add a `deno.json` `test` task for convenience so contributors can run `deno task test` without remembering flags.

### Step 1.2: The Activity Journal (SQLite) ✅ COMPLETED

- **Dependencies:** Step 1.1 — **Rollback:** drop `journal.db`, run `deno task migrate down`.
- **Action:** Implement Database Service using `jsr:@db/sqlite`. Create migration scripts for `activity` and `leases`
  tables and codify WAL/foreign key pragmas in `scripts/setup_db.ts`.
- **Justification:** Every future step relies on logging. The "Brain's Memory" must be active before the Brain itself.

**Success Criteria:**

**Core Functionality:**

1. [x] Database file created at `/System/journal.db` with WAL mode enabled
2. [x] `activity` table with trace_id, actor, agent_id, action_type, payload, timestamp
3. [x] `leases` table for file locking with TTL expiration
4. [x] `schema_version` table for migration tracking

**Database Operations:**
5. [x] Insert structured log entry and retrieve by trace_id
6. [x] Query by actor (agent/human/system) and agent_id
7. [x] Lease acquisition and expiration working correctly

**Migration System:**
8. [x] `deno task migrate up` applies schema changes cleanly
9. [x] `deno task migrate down` reverts changes without errors
10. [x] Migration history tracked in schema_version table

**Schema:**

```sql
CREATE TABLE activity (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  actor TEXT NOT NULL,              -- 'agent', 'human', 'system'
  agent_id TEXT,                    -- Specific agent: 'senior-coder', 'security-auditor', NULL for human/system
  action_type TEXT NOT NULL,
  payload JSON NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_trace ON activity(trace_id);
CREATE INDEX idx_activity_time ON activity(timestamp);
CREATE INDEX idx_activity_actor ON activity(actor);
CREATE INDEX idx_activity_agent ON activity(agent_id);

-- File Leases: Prevents concurrent modifications
CREATE TABLE leases (
  file_path TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  heartbeat_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL      -- TTL: acquired_at + 60 seconds
);

CREATE INDEX idx_leases_expires ON leases(expires_at);

-- Schema version tracking (for migrations)
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_version (version) VALUES (1);
```

### Step 1.3: Configuration Loader (TOML + Zod) ✅ COMPLETED

- **Dependencies:** Step 1.2 — **Rollback:** revert config schema, restore previous TOML.
- **Action:** Create `ConfigService`. Define Zod schemas for `exo.config.toml`. Include config checksum in Activity
  Journal for auditability.
- **Justification:** Hardcoding paths is technical debt. We need a single source of truth for system physics.

**Success Criteria:**

**Core Functionality:**

1. [x] ConfigService loads `exo.config.toml` on system startup
2. [x] Zod schema validates all required configuration fields
3. [x] Readable error messages for malformed TOML or missing keys
4. [x] Config checksum logged to Activity Journal for auditability

**Configuration Validation:**
5. [x] System paths (Knowledge, Inbox, System, Blueprints) validated
6. [x] LLM provider settings validated (API keys, endpoints)
7. [x] Watcher settings validated (debounce_ms, file patterns)

### Step 1.4: The Knowledge Vault Scaffold ✅ COMPLETED

- **Dependencies:** Step 1.3 — **Rollback:** remove created folders/files (idempotent).
- **Action:** Create rigid directory structure for the Obsidian Vault:
  - `/Knowledge/Context` (Read-Only memory)
  - `/Knowledge/Reports` (Write-Only memory)
  - `/Knowledge/Portals` (Auto-generated Context Cards)
- **Justification:** This folder _is_ the physical memory. If it doesn't exist, Agents have nowhere to look for rules.

**Success Criteria:**

**Directory Structure:**

1. [x] `/Knowledge` directory created as vault root
2. [x] `/Knowledge/Context` directory for read-only reference files
3. [x] `/Knowledge/Reports` directory for agent-generated mission reports
4. [x] `/Knowledge/Portals` directory for auto-generated context cards

**Documentation:**
5. [x] `README.md` created in `/Knowledge` explaining Obsidian integration
6. [x] Setup script is idempotent (safe to run multiple times)

---

## Phase 2: The Nervous System (Events & State)

**Goal:** The system reacts to file changes securely and reliably.

### Step 2.1: The File Watcher (Stable Read) ✅ COMPLETED

- **Dependencies:** Phase 1 exit — **Rollback:** disable watcher service flag, fall back to manual trigger script.
- **Action:** Implement a robust file watcher using `Deno.watchFs` to monitor `/Inbox/Requests` for new request files.

**The Problem:** When a user saves a file (especially large files), the OS doesn't write it atomically. Instead:

1. The file system emits multiple events (create, modify, modify, modify...)
2. The file may be partially written for several seconds
3. If we read too early, we get incomplete or corrupted data

**The Solution (Two-Stage Protection):**

**Stage 1: Event Debouncing** Wait for a configurable delay (default: 200ms, set via `watcher.debounce_ms` in
`exo.config.toml`) after the _last_ file system event before attempting to read. This prevents processing the same file
multiple times due to rapid-fire events.

> [!NOTE]
> **Configurability:** The 200ms default is a balance between responsiveness and reliability. Increase to 500-1000ms if
> using network drives or cloud storage. The stability verification (Stage 2) acts as a safety net if debouncing alone
> is insufficient.

**Implementation Checklist:**

1. Set up `Deno.watchFs` on `/Inbox/Requests`
2. Implement debounce timer (200ms)
3. Implement `readFileWhenStable` with exponential backoff
4. Log telemetry event `watcher.file_unstable` when retries are exhausted
5. Only dispatch to the request processor when content is valid

- **Justification:** Prevents crashing or processing corrupted data when users save large files or when editors create
  temporary files during save operations.
- **Success Criteria:**
  - Test 1: Rapidly touch a file 10 times in 1 second → Watcher only processes it once
  - Test 2: Write a 10MB file in 500ms chunks (simulating slow network upload) → Watcher waits until the final chunk
    arrives before processing
  - Test 3: Delete a file immediately after creating it → Watcher handles `NotFound` error gracefully

### Step 2.2: The Zod Frontmatter Parser ✅ COMPLETED

- **Dependencies:** Step 2.1 (File Watcher) — **Rollback:** accept any markdown file, skip validation.
- **Action:** Implement a parser to extract and validate TOML frontmatter from request markdown files using Zod schemas.

**The Problem:** Request files (`.md` files in `/Inbox/Requests`) contain structured metadata in TOML frontmatter, but
arrive as plain text:

1. Frontmatter may be malformed (invalid TOML syntax)
2. Required fields may be missing (`trace_id`, `status`, `agent_id`)
3. Field types may be wrong (string instead of number, etc.)
4. If we process invalid requests, agents fail with cryptic errors

**The Solution (Three-Stage Parsing):**

**Stage 1: Extract Frontmatter** Split markdown into frontmatter (between `+++` delimiters) and body content.

**Stage 2: Define Zod Schema** Create a strict schema for request frontmatter:

**Stage 3: Validate with Zod** Parse frontmatter object against schema:

**Implementation Checklist:**

1. Create `src/parsers/markdown.ts` with frontmatter extraction
2. Create `src/schemas/request.ts` with `RequestSchema`
3. Create `FrontmatterParser` service that combines extraction + validation
4. Log validation errors to Activity Journal with `action_type: "request.validation_failed"`
5. Return typed `Request` object + body content

**Example Request File:**

```markdown
+++
trace_id = "550e8400-e29b-41d4-a716-446655440000"
agent_id = "coder-agent"
status = "pending"
priority = 8
tags = ["feature", "ui"]
+++

# Implement Login Page

Create a modern login page with:

- Email/password fields
- "Remember me" checkbox
- "Forgot password" link
```

- **Justification:** Type-safe request handling prevents runtime errors. Early validation catches malformed requests
  before they reach the agent runtime.
- **Success Criteria:**
  - Test 1: Valid frontmatter + Zod validation → Returns typed `Request` object
  - Test 2: Missing required field (`trace_id`) → Throws validation error with specific field name
  - Test 3: Invalid enum value (`status: "banana"`) → Throws error listing valid options
  - Test 4: Extra fields in frontmatter → Ignored (Zod strips unknown keys by default)
  - Test 5: No frontmatter delimiters → Throws "No frontmatter found" error

### Step 2.3: The Path Security & Portal Resolver ✅ COMPLETED

- **Dependencies:** Step 1.3 (Config) — **Rollback:** Disable security checks (dangerous, dev-only).
- **Action:** Implement a `PathResolver` service that maps "Portal Aliases" (e.g., `@MyApp`) to physical paths and
  enforces strict security boundaries.
- **Justification:** Security Critical. Prevents "Jailbreak" attempts where agents try to read/write sensitive system
  files (e.g., `/etc/passwd`, `~/.ssh`) or access projects they aren't authorized for.

**The Problem:** Agents operate on file paths provided in requests. Without validation:

1. Agents could use `../../` to escape their sandbox.
2. Agents could access files outside the designated "Portals".
3. Hardcoded absolute paths make requests non-portable between users.

**The Solution:** Create a `PathResolver` class that uses the configuration's `blueprints` (and future `portals`) to
resolve and validate paths.

```typescript
// Example Usage
const resolver = new PathResolver(config);
const safePath = resolver.resolve("@Blueprints/basic-agent.md");
// -> "/home/user/ExoFrame/Blueprints/basic-agent.md"

const unsafePath = resolver.resolve("@Blueprints/../../secret.txt");
// -> Throws SecurityError
```

**Implementation Checklist:**

1. Create `src/services/path_resolver.ts`.
2. Implement `resolve(alias: string, relativePath: string): string`.
3. Implement `validatePath(path: string, allowedRoots: string[]): string`.
4. Ensure `Deno.realPath` (or equivalent) is used to resolve symlinks and `..` segments _before_ checking against
   allowed roots.

- **Success Criteria:**
  - Test 1: Resolve valid alias path → Returns absolute system path.
  - Test 2: Path traversal attempt (`@Portal/../../secret`) → Throws `SecurityError`.
  - Test 3: Accessing file outside allowed roots → Throws `SecurityError`.
  - Test 4: Unknown alias (`@Unknown/file.txt`) → Throws error.
  - Test 5: Root path itself is valid (`@Portal/`) → Returns portal root path.

### Step 2.4: The Context Card Generator ✅ COMPLETED

- **Dependencies:** Step 1.3 (Config).
- **Action:** Implement `ContextCardGenerator` service.
- **Justification:** Links "Code" (Portal) to "Memory" (Obsidian). Agents read this card to understand the project
  context.

**The Problem:** When a user mounts a portal, agents need a "Context Card" in the Knowledge Graph to understand what
that portal is (tech stack, purpose, user notes). This card must be persistent and user-editable.

**The Solution:** Create a `ContextCardGenerator` that generates or updates markdown files in `Knowledge/Portals/`. It
must be "smart" enough to preserve user-written notes when updating metadata.

```typescript
// Example Usage
const generator = new ContextCardGenerator(config);
await generator.generate({
  alias: "MyApp",
  path: "/home/user/code/myapp",
  techStack: ["TypeScript", "Deno"],
});
```

**Implementation Checklist:**

1. Create `src/services/context_card_generator.ts`.
2. Implement `generate(info: PortalInfo): Promise<void>`.
3. Use regex or string manipulation to split "Metadata" from "User Notes" to ensure preservation.

- **Success Criteria:**
  - Test 1: Generate new card → Creates file with Header, Path, Tech Stack, and empty Notes section.
  - Test 2: Update existing card → Updates Path/Stack but **preserves** existing user notes.
  - Test 3: Handle special characters in alias → Sanitizes filename (e.g., "My App" -> "My_App.md" or keeps as is if
    valid).

---

## Phase 3: The Brain (Intelligence & Agency)

**Goal:** Connect LLMs, inject memory, and generate plans.

> **Agent Types:** ExoFrame must drive both fully local agents (Ollama, offline evaluators, scripted coders),
> third-party API agents (Claude, GPT), **and hybrid workflows** where a request spans both types. Token limits and
> privacy guarantees differ per type; design every step in this phase to detect the agent class (local, federated,
> hybrid) and apply the correct constraints automatically. Hybrid mode requires explicit data-sharing policies logged
> per hop.

### Step 3.1: The Model Adapter (Mocked & Real) ✅ COMPLETED

- **Dependencies:** Step 1.3 (Config).
- **Action:** Create `IModelProvider` interface and implement `MockProvider` and `OllamaProvider`.
- **Justification:** Decouples the agent runtime from specific LLM providers, allowing easy switching and testing.

**The Problem:** The system needs to talk to various LLMs (Ollama, OpenAI, Anthropic, Google Gemini). Hardcoding API calls makes
testing difficult and vendor lock-in easy.

**The Solution:** Define a standard `IModelProvider` interface. Implement a `MockProvider` for unit tests (returns
predictable strings). Implement an `OllamaProvider` for local inference.

```typescript
export interface IModelProvider {
  id: string;
  generate(prompt: string, options?: ModelOptions): Promise<string>;
}
```

**Implementation Checklist:**

1. Create `src/ai/providers.ts` defining `IModelProvider`.
2. Implement `MockProvider` class.
3. Implement `OllamaProvider` class using `fetch` to talk to localhost:11434.
4. Create `ModelFactory` to instantiate providers based on config.

- **Success Criteria:**
  - Test 1: `MockProvider` returns configured response.
  - Test 2: `OllamaProvider` sends correct JSON payload to `/api/generate`.
  - Test 3: `ModelFactory` returns correct provider based on config string ("mock" vs "ollama").
  - Test 4: Provider handles connection errors gracefully (throws typed error).

### Step 3.2: The Agent Runtime (Stateless Execution) ✅ COMPLETED

- **Dependencies:** Step 3.1 (Model Adapter).
- **Action:** Implement `AgentRunner` service.
- **Justification:** Core logic combining "Who I am" (Blueprint) with "What I need to do" (Request).

**The Problem:** We have a request (User intent) and a Blueprint (Agent persona), but nothing to combine them and
execute the prompt against the LLM.

**The Solution:** Create an `AgentRunner` class that:

1. Takes a `Blueprint` (System Prompt) and `ParsedRequest` (User Prompt).
2. Constructs the final prompt.
3. Delegates execution to the injected `IModelProvider`.
4. **Parses the response** to extract reasoning and content.

**Response Specification:** Agents must be instructed (via System Prompt) to structure their response as follows:

```xml
<thought>
Internal reasoning regarding the request, plan formulation, and safety checks.
</thought>
<content>
The actual user-facing response, plan, or code.
</content>
```

```typescript
// Example Usage
const runner = new AgentRunner(modelProvider);
const result = await runner.run(blueprint, request);
console.log(result.thought); // "Analyzing request..."
console.log(result.content); // "Here is the plan..."
```

**Implementation Checklist:**

1. Define `Blueprint` interface (initially just `systemPrompt`).
2. Define `AgentExecutionResult` interface (`{ thought: string; content: string; raw: string }`).
3. Create `src/services/agent_runner.ts`.
4. Implement `run(blueprint: Blueprint, request: ParsedRequest): Promise<AgentExecutionResult>`.
5. Implement regex parsing to extract `<thought>` and `<content>`.

- **Success Criteria:**
  - Test 1: `AgentRunner` combines System Prompt and User Request correctly.
  - Test 2: `AgentRunner` calls `modelProvider.generate` with the combined prompt.
  - Test 3: `AgentRunner` parses a structured response into `thought` and `content`.
  - Test 4: `AgentRunner` handles malformed responses (fallback to treating whole string as content).
  - Test 5: Handles empty blueprints or requests gracefully.

### Step 3.3: The Context Injector (Token Safe) ✅ COMPLETED

- **Dependencies:** Steps 3.1–3.2 — **Rollback:** disable loader and manually attach context bundle.
- **Action:** Implement `ContextLoader` service with configurable truncation, per-file cap overrides, and logging of
  skipped/truncated files into Activity Journal. Loader must detect whether the target agent is **local-first** (runs
  entirely on the user's machine) or **third-party API**. Local agents operate without enforced token ceilings;
  third-party agents respect provider limits.

**The Problem:** Agents need context (code files, documentation, previous reports) to make informed decisions, but LLMs
have token limits. If we blindly inject all context:

1. We exceed the model's context window and the request fails
2. We waste tokens on irrelevant files
3. We can't prioritize important context over less important context
4. Users don't know what was truncated or why

**The Solution:** Create a `ContextLoader` that intelligently loads context files within token budgets, using
configurable strategies to prioritize and truncate context.

#### Core Interfaces

```typescript
// src/services/context_loader.ts

/**
 * Configuration for context loading behavior
 */
export interface ContextConfig {
  /** Maximum tokens allowed (from model config, e.g., 200k for Claude) */
  maxTokens: number;

  /** Safety margin as percentage (0.8 = use 80% of max to leave room for response) */
  safetyMargin: number;

  /** Strategy for handling context that exceeds limits */
  truncationStrategy: "smallest-first" | "drop-largest" | "drop-oldest" | "truncate-each";

  /** Optional: per-file token cap (prevents single huge file from dominating) */
  perFileTokenCap?: number;

  /** Whether this is a local-first agent (no enforced limits) */
  isLocalAgent: boolean;
}

/**
 * Metadata about a context file
 */
export interface ContextFile {
  /** Absolute path to file */
  path: string;

  /** File content */
  content: string;

  /** File size in bytes */
  sizeBytes: number;

  /** Estimated token count */
  tokenCount: number;

  /** File modification time (for drop-oldest strategy) */
  modifiedAt: Date;

  /** Optional priority override (higher = more important) */
  priority?: number;
}

/**
 * Result of context loading operation
 */
export interface ContextLoadResult {
  /** Combined content ready to inject into prompt */
  content: string;

  /** Warning messages about truncation/skipping */
  warnings: string[];

  /** Total tokens used */
  totalTokens: number;

  /** Files that were included */
  includedFiles: string[];

  /** Files that were skipped */
  skippedFiles: string[];

  /** Files that were truncated */
  truncatedFiles: string[];
}
```

#### Token Counting

- **Strategy:** Use character-based approximation (1 token ≈ 4 chars) when provider limits apply.
- **Rationale:** Accurate token counting requires model-specific tokenizers (expensive to load and run). The 4:1 ratio
  is a safe approximation used by OpenAI and Anthropic.
- **Override:** For critical production use, consider integrating actual tokenizers like `tiktoken` (GPT) or
  `claude-tokenizer`.

```typescript
class ContextLoader {
  private tokenCounter: (text: string) => number;

  constructor(private config: ContextConfig) {
    // Simple approximation: 1 token ≈ 4 characters
    this.tokenCounter = (text) => Math.ceil(text.length / 4);
  }
}
```

#### Truncation Strategies

**1. `smallest-first` (Default)**

- Load smallest files first to maximize coverage
- Best for: Getting breadth across many files
- Example: Loading 10 small config files + 2 medium source files vs. 1 huge legacy file

**2. `drop-largest`**

- Skip files that don't fit, starting with largest
- Best for: Ensuring all critical small files are included
- Example: Skip 100KB README but include all 5KB source files

**3. `drop-oldest`**

- Skip files by modification time (oldest first)
- Best for: Prioritizing recent changes
- Example: Skip year-old docs in favor of this week's code changes

**4. `truncate-each`**

- Truncate individual files to fit within remaining budget
- Best for: Ensuring every file gets at least some representation
- Example: Include first 500 tokens of each of 20 files

#### Implementation Checklist

1. **Create `src/services/context_loader.ts`**
2. **Implement `ContextLoader` class** with:
   - `loadWithLimit(filePaths: string[]): Promise<ContextLoadResult>`
   - `estimateTokens(text: string): number`
   - `applyStrategy(files: ContextFile[]): ContextFile[]`
   - `formatContext(files: ContextFile[]): string`
3. **Handle per-file caps:** If a single file exceeds `perFileTokenCap`, truncate it before applying global strategy
4. **Generate warnings:** Track which files were skipped/truncated and why
5. **Detect agent type:** Check config to determine if enforcing limits (local vs. API agents)
6. **Log to Activity Journal:** Record context loading events with token counts and warnings

#### Error Handling

**Missing Files:**

- Log warning but continue loading other files
- Include placeholder in warnings
- Don't fail entire context load

**Permission Errors:**

- Catch `PermissionDenied` errors
- Log to Activity Journal
- Skip file and continue

**Malformed Paths:**

- Validate paths before attempting to read
- Use `PathResolver` from Step 2.3 for security

#### Success Criteria

**Test 1: Token Limit Enforcement**

```typescript
// Test: Link 10 massive files (total 500k tokens), budget 100k tokens
const files = [
  "/context/file1.txt", // 50k tokens
  "/context/file2.txt", // 50k tokens
  // ... 8 more files
];

const loader = new ContextLoader({
  maxTokens: 100000,
  safetyMargin: 0.8, // Use 80k
  truncationStrategy: "smallest-first",
  isLocalAgent: false,
});

const result = await loader.loadWithLimit(files);

// Assertions:
assertEquals(result.totalTokens <= 80000, true); // Respects safety margin
assertEquals(result.warnings.length > 0, true); // Generated warnings
assertEquals(result.skippedFiles.length > 0, true); // Some files skipped
```

**Test 2: Warning Block Generation**

```typescript
// Verify warning appears in agent's prompt
assertStringIncludes(result.content, "[System Warning: Context Truncated]");
assertStringIncludes(result.content, "Token Budget: 80000");
assertStringIncludes(result.content, "Skipped");
```

**Test 3: Agent Receives Warning**

```typescript
// Verify agent can reference the warning
const runner = new AgentRunner(mockProvider);
const blueprint = { systemPrompt: "You are a helpful assistant." };
const request = { userPrompt: "Summarize the context", context: {} };

// Inject context into request
request.context = { files: result.content };

const agentResult = await runner.run(blueprint, request);

// Agent should acknowledge truncation in response
assertStringIncludes(
  agentResult.content,
  "context was truncated" || "some files were skipped",
);
```

**Test 4: Local Agent (No Limits)**

```typescript
const localLoader = new ContextLoader({
  maxTokens: 0, // Ignored for local agents
  safetyMargin: 1.0,
  truncationStrategy: "smallest-first",
  isLocalAgent: true, // No enforcement
});

const result = await localLoader.loadWithLimit(files);

// All files should be included
assertEquals(result.skippedFiles.length, 0);
assertEquals(result.warnings.length, 0);
```

**Test 5: Truncation Strategies**

```typescript
// Test each strategy produces different ordering
const strategies = ["smallest-first", "drop-largest", "drop-oldest", "truncate-each"];

for (const strategy of strategies) {
  const loader = new ContextLoader({
    maxTokens: 50000,
    safetyMargin: 0.8,
    truncationStrategy: strategy,
    isLocalAgent: false,
  });

  const result = await loader.loadWithLimit(files);

  // Verify strategy-specific behavior
  // e.g., "smallest-first" includes more files
  // "truncate-each" has more truncatedFiles
}
```

#### Integration Notes

**With AgentRunner (Step 3.2):**

The `ContextLoader` enriches the `ParsedRequest.context` field before passing to `AgentRunner`:

```typescript
// Example integration flow
const contextLoader = new ContextLoader(contextConfig);
const contextResult = await contextLoader.loadWithLimit([
  "/Knowledge/Portals/MyApp.md",
  "/Knowledge/Reports/2024-01-15_trace123.md",
]);

const request: ParsedRequest = {
  userPrompt: "Add authentication to the login page",
  context: {
    files: contextResult.content,
    warnings: contextResult.warnings,
  },
};

const runner = new AgentRunner(modelProvider);
const result = await runner.run(blueprint, request);
```

**Activity Journal Logging:**

**Requirement:** All context loading operations must be logged to the Activity Journal for audit trail and debugging.

**Events to Log:**

1. **context.loaded** - Successful context loading operation
   ```sql
   INSERT INTO activity (action_type, entity_type, entity_id, actor, trace_id, metadata)
   VALUES (
     'context.loaded',
     'request',
     'request-123',
     'system',
     'trace-456',
     json_object(
       'total_tokens', 45000,
       'included_files_count', 5,
       'skipped_files_count', 3,
       'truncated_files_count', 1,
       'strategy', 'smallest-first',
       'is_local_agent', false
     )
   );
   ```

2. **context.file_load_error** - Failed to load a context file
   ```sql
   INSERT INTO activity (action_type, entity_type, entity_id, actor, trace_id, metadata)
   VALUES (
     'context.file_load_error',
     'file',
     '/path/to/missing_file.txt',
     'system',
     'trace-456',
     json_object(
       'error_message', 'No such file or directory',
       'error_type', 'NotFound'
     )
   );
   ```

**Implementation Requirements:**

- Add `traceId` and `requestId` optional fields to `ContextConfig`
- Call `logContextLoad()` after successful context assembly
- Call `logFileLoadError()` when file loading fails
- Log events should be async and non-blocking (don't fail if logging fails)
- Include relevant metadata for debugging (token counts, file counts, strategy used)

**Integration with ContextLoader:**

```typescript
const contextLoader = new ContextLoader({
  maxTokens: 100000,
  safetyMargin: 0.8,
  truncationStrategy: "smallest-first",
  isLocalAgent: false,
  traceId: request.traceId, // For activity logging
  requestId: request.id, // For activity logging
});

const result = await contextLoader.loadWithLimit(contextFiles);

// Result includes warnings that can be passed to plan creation
// All loading events are automatically logged to Activity Journal
```

### Step 3.4: The Plan Writer (Drafting) ✅ COMPLETED

- **Dependencies:** Steps 3.1–3.3 (Model Adapter, Agent Runner, Context Loader) — **Rollback:** output to stdout instead
  of file.
- **Action:** Implement `PlanWriter` service that takes `AgentExecutionResult` and writes formatted plan proposals to
  `/Inbox/Plans`.
- **Requirement:** Plan must include structured sections (Reasoning, Changes, Context References) and link back to
  Obsidian notes.
- **Status:** Implemented in `src/services/plan_writer.ts`, tested in `tests/plan_writer_test.ts` (22 tests passing)

**The Solution:** The `PlanWriter` service:

1. Takes an `AgentExecutionResult` and request metadata
2. Formats the content into a structured plan document with TOML frontmatter
3. Generates Obsidian-compatible wiki links to context files
4. Writes the plan to `/Inbox/Plans` with proper naming convention (`{requestId}_plan.md`)
5. Logs the plan creation to Activity Journal for audit trail

**Plan Document Structure:**

Plans follow this standardized format with:

- TOML frontmatter (trace_id, request_id, status, created_at)
- Title and Summary sections
- Reasoning section (from `<thought>` tags)
- Proposed Changes (main content)
- Context References with Obsidian wiki links
- Context Warnings (truncated/skipped files)
- Next Steps for user review and approval

**Activity Logging:**

All plan creation events are logged to `/System/journal.db` activity table with:

- `action_type`: 'plan.created'
- `trace_id`: Links request → plan → execution → report
- `metadata`: Includes plan_path, context file counts, warnings

**Note:** Activity logging uses batched non-blocking writes. Logs accumulate in memory queue and flush every 100ms or
when 100 entries accumulated. Operations return immediately without waiting for disk I/O.

#### Success Criteria

See `tests/plan_writer_test.ts` for comprehensive test coverage (22 tests):

- Filename generation: `{requestId}_plan.md` format
- Wiki link generation: Obsidian `[[filename]]` format from context files
- Frontmatter structure: Valid TOML with trace_id, request_id, status, created_at
- Reasoning section: Extracts and includes `<thought>` content
- Context warnings: Includes truncation/skipping messages
- Plan structure: Proper markdown sections (Summary, Reasoning, Proposed Changes, Context References, Next Steps)
- Activity logging: Creates activity record in `/System/journal.db`

---

## Phase 4: The Hands (Tools & Git) ✅ COMPLETED

**Goal:** Agents execute actions securely and robustly.

### Step 4.1: The Tool Registry ✅ COMPLETED

- **Dependencies:** Steps 3.1-3.4 (Model Adapter, Agent Runner, Context Loader, Plan Writer)
- **Action:** Implement tool registry that maps LLM function calls (JSON) to safe Deno operations (`read_file`,
  `write_file`, `run_command`, `list_directory`).
- **Requirement:** Tools must be sandboxed within allowed paths and enforce security policies from Step 2.3.
- **Justification:** Enables agents to execute concrete actions while maintaining security boundaries.

**The Solution:** Create a `ToolRegistry` service that:

1. Registers available tools with JSON schemas (for LLM function calling)
2. Validates tool invocations against security policies
3. Executes tools within sandboxed context (Deno permissions, path restrictions)
4. Logs all tool executions to Activity Journal
5. Returns structured results for LLM to interpret

**Core Tools:**

- `read_file(path: string)` - Read file content within allowed paths
- `write_file(path: string, content: string)` - Write/modify files
- `list_directory(path: string)` - List directory contents
- `run_command(command: string, args: string[])` - Execute shell commands (restricted)
- `search_files(pattern: string, path: string)` - Search for files/content

**Security Requirements:**

- All paths must be validated through `PathResolver` (Step 2.3)
- Commands must be whitelisted (no arbitrary shell execution)
- Tool execution must be logged with trace_id for audit (non-blocking batched writes)
- Failures must return structured errors (not raw exceptions)

**Success Criteria:**

- LLM outputting `{"tool": "read_file", "path": "Knowledge/docs.md"}` triggers file read
- Path traversal attempts (`../../etc/passwd`) are rejected
- Tool execution logged to Activity Journal with trace_id
- Restricted commands (`rm -rf /`) are blocked

### Step 4.2: Git Integration (Identity Aware) ✅ COMPLETED

- **Dependencies:** Step 4.1 (Tool Registry)
- **Action:** Implement `GitService` class for managing agent-created branches and commits.
- **Requirement:** All agent changes must be tracked in git with trace_id linking back to original request.
- **Justification:** Provides audit trail, enables rollback, and integrates with standard PR review workflow.

**The Solution:** Create a `GitService` that:

1. Auto-initializes git repository if not present
2. Auto-configures git identity (user.name, user.email) if missing
3. Creates feature branches with naming convention: `feat/{requestId}-{traceId}`
4. Commits changes with trace_id in commit message footer
5. Handles branch name conflicts (appends timestamp if needed)
6. Validates changes exist before attempting commit

**Branch Naming Convention:**

```
feat/implement-auth-550e8400
feat/fix-bug-abc12345
```

**Commit Message Format:**

```
Implement authentication system

Created login handler, JWT tokens, and user session management.

[ExoTrace: 550e8400-e29b-41d4-a716-446655440000]
```

**Error Handling:**

- Repository not initialized → auto-run `git init` + empty commit
- Identity not configured → use default bot identity (`bot@exoframe.local`)
- Branch already exists → append timestamp to make unique
- No changes to commit → throw clear error (don't create empty commit)
- Git command failures → wrap in descriptive error with command context

**Success Criteria:**

- Run in non-git directory → auto-initializes with initial commit
- Run with no git config → auto-configures bot identity
- Create branch twice with same name → second gets unique name
- Attempt commit with no changes → throws clear error
- Commit message includes trace_id footer for audit
- All git operations logged to Activity Journal

### Step 4.3: The Execution Loop (Resilient) ✅ COMPLETED

- **Dependencies:** Steps 4.1–4.2 (Tool Registry, Git Integration) — **Rollback:** pause queue processing through config
  and replay from last clean snapshot.
- **Action:** Implement execution loop that processes active tasks from `/System/Active` with comprehensive error
  handling.
- **Requirement:** All execution paths (success or failure) must be logged, and users must receive clear feedback.
- **Justification:** Ensures system resilience and user visibility into agent operations.

**The Solution:** Create an `ExecutionLoop` service that:

1. Monitors `/System/Active` for approved plans
2. Acquires lease on active task file (prevents concurrent execution)
3. Executes plan using Tool Registry and Git Service
4. Handles both success and failure paths with appropriate reporting
5. Cleans up resources (releases leases, closes connections)

**Execution Flow:**

```
Agent creates plan → /Inbox/Plans/{requestId}_plan.md (status: review)
  ↓
[HUMAN REVIEWS PLAN IN OBSIDIAN]
  ↓
  ├─ APPROVE: Move plan → /System/Active/{requestId}.md
  │   └─ Log: plan.approved (action_type, trace_id, actor: 'human')
  │
  ├─ REJECT: Move plan → /Inbox/Rejected/{requestId}_rejected.md
  │   ├─ Add frontmatter: rejection_reason, rejected_by, rejected_at
  │   └─ Log: plan.rejected (action_type, trace_id, actor: 'human', metadata: reason)
  │
  └─ REQUEST CHANGES: Add comments to plan file, keep in /Inbox/Plans
      ├─ Append "## Review Comments" section to plan
      ├─ Update frontmatter: status: 'needs_revision', reviewed_by, reviewed_at
      └─ Log: plan.revision_requested (action_type, trace_id, actor: 'human', metadata: comments)
      
      Agent responds: reads comments → generates revised plan
        ├─ Update plan in-place or create new version
        └─ Log: plan.revised (action_type, trace_id, actor: 'agent')
  ↓
/System/Active/{requestId}.md detected by ExecutionLoop
  ↓
Acquire lease (or skip if locked)
  ↓
Load plan + context
  ↓
Create git branch (feat/{requestId}-{traceId})
  ↓
Execute tools (wrapped in try/catch)
  ↓
  ├─ SUCCESS:
  │   ├─ Commit changes to branch
  │   ├─ Generate Mission Report → /Knowledge/Reports
  │   ├─ Archive plan → /Inbox/Archive
  │   └─ Log: execution.completed (trace_id, actor: 'agent', metadata: files_changed)
  │   
  │   [HUMAN REVIEWS PULL REQUEST]
  │     ↓
  │     ├─ APPROVE: Merge PR to main
  │     │   └─ Log: pr.merged (trace_id, actor: 'human', metadata: commit_sha)
  │     │
  │     └─ REJECT: Close PR without merging
  │         └─ Log: pr.rejected (trace_id, actor: 'human', metadata: reason)
  │
  └─ FAILURE:
      ├─ Rollback git changes (reset branch)
      ├─ Generate Failure Report → /Knowledge/Reports
      ├─ Move plan back → /Inbox/Requests (status: error)
      └─ Log: execution.failed (trace_id, actor: 'system', metadata: error_details)
  ↓
Release lease
```

**Human Review Actions:**

1. **Approve Plan**
   - Action: Move file from `/Inbox/Plans/{requestId}_plan.md` to `/System/Active/{requestId}.md`
   - Logging: Insert activity record with `action_type: 'plan.approved'`, `actor: 'human'`

2. **Reject Plan**
   - Action: Move file to `/Inbox/Rejected/{requestId}_rejected.md`
   - Add to frontmatter:
     ```toml
     status = "rejected"
     rejected_by = "user@example.com"
     rejected_at = "2024-11-25T15:30:00Z"
     rejection_reason = "Approach is too risky, use incremental strategy instead"
     ```
   - Logging: Insert activity record with `action_type: 'plan.rejected'`, `actor: 'human'`, `metadata: {reason: "..."}`

3. **Request Changes**
   - Action: Edit plan file in-place, append comments section:
     ```markdown
     ## Review Comments

     **Reviewed by:** user@example.com\
     **Reviewed at:** 2024-11-25T15:30:00Z

     - ❌ Don't modify the production database directly
     - ⚠️ Need to add rollback migration
     - ✅ Login handler looks good
     - 💡 Consider adding rate limiting to prevent brute force
     ```
   - Update frontmatter:
     ```toml
     status = "needs_revision"
     reviewed_by = "user@example.com"
     reviewed_at = "2024-11-25T15:30:00Z"
     ```
   - Logging: Insert activity record with `action_type: 'plan.revision_requested'`, `actor: 'human'`,
     `metadata: {comment_count: 4}`

**Activity Logging:**

All actions in the execution loop are logged using `DatabaseService.logActivity()`. The current implementation uses direct method calls for activity logging. All logs are batched and written asynchronously for performance.

**Query Examples:**

```sql
-- Get all human review actions for a trace
SELECT action_type, metadata->>'reviewed_by', timestamp
FROM activity
WHERE trace_id = '550e8400-e29b-41d4-a716-446655440000'
  AND actor = 'human'
ORDER BY timestamp;

-- Find plans awaiting human review
SELECT entity_id, timestamp
FROM activity
WHERE action_type = 'plan.created'
  AND entity_id NOT IN (
    SELECT entity_id FROM activity 
    WHERE action_type IN ('plan.approved', 'plan.rejected')
  )
ORDER BY timestamp DESC;

-- Get rejection rate
SELECT 
  COUNT(*) FILTER (WHERE action_type = 'plan.rejected') * 100.0 / COUNT(*) as rejection_rate
FROM activity
WHERE action_type IN ('plan.approved', 'plan.rejected');
```

**Failure Report Format:**

```markdown
+++
trace_id = "550e8400-e29b-41d4-a716-446655440000"
request_id = "implement-auth"
status = "failed"
failed_at = "2024-11-25T12:00:00Z"
error_type = "ToolExecutionError"
+++

# Failure Report: Implement Authentication

## Error Summary

Execution failed during tool operation: write_file

## Error Details
```

PermissionDenied: write access to /etc/passwd is not allowed at PathResolver.validatePath
(src/services/path_resolver.ts:45) at ToolRegistry.executeTool (src/services/tool_registry.ts:89)

```
## Execution Context

- Agent: senior-coder
- Branch: feat/implement-auth-550e8400
- Tools executed before failure: read_file (3), list_directory (1)
- Last successful operation: Read /Knowledge/API_Spec.md

## Next Steps

1. Review the error and adjust the request
2. Move corrected request back to /Inbox/Requests
3. System will retry execution
```

---

### Step 4.4: CLI Architecture & Human Review Interface ✅ COMPLETED

- **Dependencies:** Steps 2.1 (Database Service), 4.2 (Git Integration), 4.3 (Execution Loop)
- **Action:** Design and implement a comprehensive CLI with higher-level abstraction pattern for all human interactions with the ExoFrame system.
- **Requirement:** All human actions must be validated, atomic, and logged to Activity Journal for complete audit trail.
- **Justification:** Manual file operations are error-prone. A well-structured CLI enforces validation, provides clear feedback, ensures activity logging, and enables code review workflows.

**The Problem:**

Without proper CLI tooling, human interactions with ExoFrame are problematic:

- ❌ Users might move files to wrong directories
- ❌ Frontmatter not updated correctly
- ❌ No validation of state before operations
- ❌ Actions not logged (breaks audit trail)
- ❌ File operations might fail partially (non-atomic)
- ❌ No user identification captured
- ❌ No way to review agent-generated code changes
- ❌ Difficult to track changes by trace_id
- ❌ No daemon management interface

**The Solution: Hierarchical CLI Architecture**

Build a comprehensive CLI (`exoctl`) with four command groups, all extending a shared base class for consistency:

#### **1. Base Command Pattern** (`src/cli/base.ts`)

**Purpose:** Provide shared utilities and ensure consistent patterns across all command handlers.

**Key Components:**

- `BaseCommand` abstract class that all command handlers extend
- `CommandContext` interface: `{ config: Config, db: DatabaseService }`
- Shared methods available to all commands:
  - `getUserIdentity()`: Get user from git config or OS username
  - `extractFrontmatter()`: Parse TOML frontmatter from markdown
  - `serializeFrontmatter()`: Convert object back to TOML format
  - `updateFrontmatter()`: Merge updates into existing frontmatter
  - `validateFrontmatter()`: Ensure required fields exist
  - `formatTimestamp()`: Human-readable date formatting
  - `truncate()`: String truncation for display

**Success Criteria (Base Infrastructure):**

1. ✅ BaseCommand abstract class exists in `src/cli/base.ts`
2. ✅ CommandContext interface properly typed (config + db)
3. ✅ getUserIdentity() tries git config, falls back to OS username
4. ✅ Frontmatter methods handle edge cases (missing delimiters, malformed TOML)
5. ✅ All utility methods have consistent error handling
6. ✅ Base class is abstract (cannot be instantiated directly)

#### **2. Plan Commands** (`src/cli/plan_commands.ts`)

**Purpose:** Review and manage AI-generated plans before execution.

**Commands:**

- `exoctl plan list [--status <filter>]` - List all plans with metadata
- `exoctl plan show <id>` - Display full plan content
- `exoctl plan approve <id>` - Move to /System/Active for execution
- `exoctl plan reject <id> --reason "..."` - Move to /Inbox/Rejected with reason
- `exoctl plan revise <id> --comment "..." [--comment "..."]` - Request changes

**Operations:**

- **Approve**: Validates status='review', atomically moves to /System/Active, updates frontmatter, logs activity
- **Reject**: Requires non-empty reason, moves to /Inbox/Rejected with `_rejected.md` suffix, adds rejection metadata
- **Revise**: Appends review comments with ⚠️ prefix, sets status='needs_revision', preserves existing comments
- **List**: Returns sorted PlanMetadata[], optional status filtering
- **Show**: Returns full PlanDetails with content

**Activity Logging:**

- `plan.approved` with `{user, approved_at, via: 'cli'}`
- `plan.rejected` with `{user, reason, rejected_at, via: 'cli'}`
- `plan.revision_requested` with `{user, comment_count, reviewed_at, via: 'cli'}`

**Success Criteria (Plan Commands):**

1. ✅ PlanCommands extends BaseCommand
2. ✅ approve() validates status='review' before moving
3. ✅ approve() atomically moves file (no partial state)
4. ✅ approve() rejects if target already exists
5. ✅ reject() requires non-empty reason
6. ✅ reject() adds rejection metadata to frontmatter
7. ✅ revise() accepts multiple --comment flags
8. ✅ revise() appends to existing review section
9. ✅ list() returns sorted array by ID
10. ✅ list() filters by status when provided
11. ✅ show() returns full content including frontmatter
12. ✅ All operations log to activity journal with actor='human'
13. ✅ User identity captured from git config or OS
14. ✅ Clear error messages with resolution hints
15. ✅ 16 tests covering all operations (26 test steps)
16. ✅ Tests in tests/cli/plan_commands_test.ts

#### **3. Changeset Commands** (`src/cli/changeset_commands.ts`)

**Purpose:** Review and manage agent-generated code changes (git branches).

**Commands:**

- `exoctl changeset list [--status <filter>]` - List agent-created branches
- `exoctl changeset show <id>` - Display diff and commits
- `exoctl changeset approve <id>` - Merge branch to main
- `exoctl changeset reject <id> --reason "..."` - Delete branch without merging

**Operations:**

- **List**: Finds all `feat/*` branches, extracts trace_id, checks approval status via activity log
- **Show**: Displays commit history, full diff, file count, trace_id
- **Approve**: Validates on main branch, merges with --no-ff, logs merge commit SHA
- **Reject**: Deletes branch with `git branch -D`, requires reason, logs rejection

**Activity Logging:**

- `changeset.approved` with `{user, branch, commit_sha, files_changed, via: 'cli'}`
- `changeset.rejected` with `{user, branch, reason, files_changed, via: 'cli'}`

**Success Criteria (Changeset Commands):**

1. ✅ ChangesetCommands extends BaseCommand
2. ✅ list() finds all feat/* branches
3. ✅ list() extracts trace_id from commit messages
4. ✅ list() checks activity log for approval status
5. ✅ show() displays full diff using git diff main...branch
6. ✅ show() lists all commits with messages
7. ✅ approve() validates current branch is main
8. ✅ approve() merges with --no-ff (preserves history)
9. ✅ approve() logs merge commit SHA
10. ✅ reject() requires non-empty reason
11. ✅ reject() uses git branch -D (force delete)
12. ✅ Both operations log to activity journal
13. ✅ Clear error for merge conflicts
14. ✅ Tests to be added in tests/cli/changeset_commands_test.ts

#### **4. Git Commands** (`src/cli/git_commands.ts`)

**Purpose:** Repository operations with trace_id awareness.

**Commands:**

- `exoctl git branches [--pattern <glob>]` - List branches with metadata
- `exoctl git status` - Show working tree status
- `exoctl git log --trace <trace_id>` - Search commits by trace_id

**Operations:**

- **branches**: Lists all branches sorted by date, extracts trace_id from commits, shows current branch marker
- **status**: Uses git status --porcelain, categorizes changes (modified/added/deleted/untracked)
- **log**: Searches all commits with `git log --all --grep "Trace-Id: <id>"`, returns matching commits

**Success Criteria (Git Commands):**

1. ✅ GitCommands extends BaseCommand
2. ✅ listBranches() returns sorted by commit date
3. ✅ listBranches() extracts trace_id from commit body
4. ✅ listBranches() marks current branch
5. ✅ listBranches() accepts glob pattern filter
6. ✅ status() categorizes all file states
7. ✅ status() shows current branch
8. ✅ logByTraceId() searches all branches
9. ✅ logByTraceId() returns empty array if not found
10. ✅ diff() generates clean unified diff
11. ✅ All operations handle git errors gracefully
12. ✅ Tests to be added in tests/cli/git_commands_test.ts

#### **5. Daemon Commands** (`src/cli/daemon_commands.ts`)

**Purpose:** Control the ExoFrame background daemon.

**Commands:**

- `exoctl daemon start` - Start background daemon
- `exoctl daemon stop` - Stop gracefully (SIGTERM)
- `exoctl daemon restart` - Stop then start
- `exoctl daemon status` - Check health and uptime
- `exoctl daemon logs [--lines N] [--follow]` - View logs

**Operations:**

- **start**: Spawns daemon process, writes PID file, verifies startup
- **stop**: Sends SIGTERM, waits for clean exit (10s timeout), force kills if needed
- **restart**: Calls stop() then start() with 1s delay
- **status**: Reads PID file, checks if process alive with kill -0, gets uptime from ps
- **logs**: Uses tail command with -n and optional -f flag

**Success Criteria (Daemon Commands):**

1. ✅ DaemonCommands extends BaseCommand
2. ✅ start() writes PID file to System/daemon.pid
3. ✅ start() verifies daemon actually started
4. ✅ start() shows clear error if already running
5. ✅ stop() sends SIGTERM first (graceful)
6. ✅ stop() force kills after 10s timeout
7. ✅ stop() cleans up PID file
8. ✅ restart() has proper delay between stop/start
9. ✅ status() accurately checks process state
10. ✅ status() shows uptime from ps command
11. ✅ logs() supports --lines and --follow options
12. ✅ logs() handles missing log file gracefully
13. ✅ Tests to be added in tests/cli/daemon_commands_test.ts

#### **6. Entry Point** (`src/cli/exoctl.ts`)

**Purpose:** Single CLI binary that routes to all command groups.

**Implementation:**

- Uses @cliffy/command v1.0.0-rc.8 for CLI framework
- Initializes shared CommandContext (config + db)
- Creates all command handler instances
- Routes commands to appropriate handler
- Consistent error handling with proper exit codes
- Shebang: `#!/usr/bin/env -S deno run --allow-all --no-check`

**Success Criteria (Entry Point):**

1. ✅ Single exoctl.ts file with all command groups
2. ✅ Proper shebang for direct execution
3. ✅ CommandContext initialized once at startup
4. ✅ All handlers receive same context instance
5. ✅ Consistent error handling (try/catch, exit(1))
6. ✅ All commands accessible via exoctl <group> <command>
7. ✅ Help text available for all commands
8. ✅ Version command shows ExoFrame version
9. ✅ Can be installed globally with deno install

**Overall Success Criteria:**

1. ✅ All 5 command groups implemented (plan, changeset, git, daemon, portal)
2. ✅ All extend BaseCommand for consistency (except PortalCommands which has inline utilities)
3. ✅ All use CommandContext interface
4. ✅ All CLI tests in tests/cli/ directory
5. ✅ 278 total tests passing (31 portal tests, 35 daemon tests, 16 plan tests)
6. ✅ Activity logging for all human actions with full command line tracking
7. ✅ Clear user feedback and error messages
8. ✅ Complete documentation in User Guide
9. ✅ Type-safe with proper TypeScript typing
10. ✅ No code duplication (shared base utilities)
11. ✅ Portal commands: add, list, show, remove, verify, refresh (84.2% branch coverage)

---

### Step 4.5: The Mission Reporter (Episodic Memory) ✅ COMPLETED

- **Dependencies:** Step 4.3 (Execution Loop) — **Rollback:** rerun reporter for trace or regenerate from Activity
  Journal.
- **Action:** Generate comprehensive mission reports after successful task execution.
- **Requirement:** Reports must document what was done, why, and link back to context for future reference.
- **Justification:** Creates episodic memory for agents, enables learning from past executions, provides audit trail.
- **Status:** Implemented in `src/services/mission_reporter.ts`, tested in `tests/mission_reporter_test.ts` (28 tests passing, 83.3% branch coverage)

**The Solution:** Create a `MissionReporter` service that:

1. Generates structured report after successful execution
2. Includes git diff summary, files modified, reasoning
3. Links back to original request, plan, and context files
4. Stores reports in `/Knowledge/Reports` (becomes searchable context)
5. Logs report creation to Activity Journal

**Report Naming Convention:**

```
2024-11-25_550e8400_implement-auth.md
{date}_{traceId}_{requestId}.md
```

**Report Structure:**

```markdown
+++
trace_id = "550e8400-e29b-41d4-a716-446655440000"
request_id = "implement-auth"
status = "completed"
completed_at = "2024-11-25T14:30:00Z"
agent_id = "senior-coder"
branch = "feat/implement-auth-550e8400"
+++

# Mission Report: Implement Authentication

## Summary

Successfully implemented JWT-based authentication system with login/logout endpoints.

## Changes Made

### Files Created (3)

- `src/auth/login.ts` - Login handler with email/password validation
- `src/auth/middleware.ts` - JWT verification middleware
- `migrations/003_users.sql` - User table schema

### Files Modified (2)

- `src/routes/api.ts` - Added authentication routes
- `README.md` - Updated setup instructions

## Git Summary
```

5 files changed, 234 insertions(+), 12 deletions(-) Branch: feat/implement-auth-550e8400 Commit: abc123def

```
## Context Used

- [[Architecture_Docs]] - System design patterns
- [[API_Spec]] - Endpoint conventions
- [[Security_Guidelines]] - Password hashing requirements

## Reasoning

Chose JWT over sessions for stateless authentication. Used bcrypt for password hashing per security guidelines. Implemented rate limiting on login endpoint to prevent brute force.

## Next Steps

- Review pull request
- Test authentication flow
- Merge to main after approval
```

**Implementation Details:**

1. **Create `src/reporter/mission_reporter.ts`:**
   - `MissionReporter` class with methods: `generate()`, `buildReport()`, `analyzeChanges()`, `linkContext()`
   - Integration with `GitService` for diff analysis and commit info
   - Integration with `DatabaseService` for Activity Journal logging
   - Integration with `PlanStore` for retrieving execution plan and reasoning
   - Report template with TOML frontmatter and structured markdown sections

2. **Report Generation Flow:**
   ```typescript
   async generate(traceId: string, agentId: string): Promise<void> {
     // 1. Retrieve trace data from Activity Journal (all actions with trace_id)
     // 2. Get execution plan from PlanStore
     // 3. Analyze git changes (files created/modified/deleted, line counts)
     // 4. Extract context references from plan (wiki links, files used)
     // 5. Build reasoning section from plan decisions
     // 6. Generate report filename: {date}_{shortTraceId}_{requestId}.md
     // 7. Write report to /Knowledge/Reports/
     // 8. Log to Activity Journal (report.generated)
     // On failure: log error, preserve partial data for manual recovery
   }
   ```

3. **Git Change Analysis:**
   - Parse `git diff --stat` for file change counts
   - Categorize changes: files created, modified, deleted
   - Include commit SHA and branch name
   - Calculate insertion/deletion statistics
   - Detect renamed or moved files

4. **Context Linking:**
   - Extract `[[wiki_links]]` from original request
   - Include context cards loaded during execution
   - Link to plan file: `[[Plans/{traceId}]]`
   - Link to request file: `[[Requests/{requestId}]]`
   - Preserve references for future context loading

5. **Activity Logging Events:**
   - `report.generated` - Report created (trace_id, report_path, status)
   - `report.failed` - Generation failed (trace_id, error, partial_data)
   - `report.archived` - Old report moved to archive (report_path, reason)

**Test Coverage:**

```typescript
// tests/reporter/mission_reporter_test.ts
Deno.test("MissionReporter: generates report after successful execution", async () => {
  // Simulates completed trace, verifies report created
});

Deno.test("MissionReporter: includes git diff summary", async () => {
  // Verifies file change statistics are accurate
});

Deno.test("MissionReporter: links to context files", async () => {
  // Checks wiki links are preserved
});

Deno.test("MissionReporter: handles missing trace data gracefully", async () => {
  // Tests error handling for incomplete traces
});

Deno.test("MissionReporter: formats report with valid TOML frontmatter", async () => {
  // Validates TOML structure and required fields
});
```

**Success Criteria:**

1. ✅ After successful execution, report created in `/Knowledge/Reports/`
2. ✅ Report filename follows convention: `{date}_{traceId}_{requestId}.md`
3. ✅ Report includes git diff summary with file change counts
4. ✅ Report contains Obsidian wiki links to all context files used
5. ✅ Report frontmatter has all required fields (trace_id, status, agent_id, completed_at)
6. ✅ Report logged to Activity Journal with `action_type='report.generated'`
7. ✅ Report is searchable via Obsidian and context loading
8. ✅ Report generation errors logged but don't crash execution loop
9. ✅ Reports indexed in Activity Journal for retrieval by trace_id
10. ✅ Report includes reasoning section explaining key decisions

**Acceptance Criteria (Manual Testing):**

1. **Report Generation After Execution:**
   ```bash
   # Run task to completion
   exoctl request add "Implement user registration" --portal=MyProject
   # Wait for agent to complete

   # Verify report created
   ls -la Knowledge/Reports/
   # Expected: 2025-01-26_550e8400_implement-user-registration.md

   # Verify report structure
   cat Knowledge/Reports/2025-01-26_550e8400_implement-user-registration.md
   # Expected: Valid TOML frontmatter, Summary, Changes Made, Git Summary, Context Used, Reasoning sections
   ```

2. **Git Diff Summary Accuracy:**
   ```bash
   # After execution, compare report to actual git changes
   git diff --stat feat/implement-user-registration-550e8400

   # Verify report shows matching statistics
   grep "files changed" Knowledge/Reports/2025-01-26_*.md
   # Expected: Matches git diff output
   ```

3. **Context Linking Verification:**
   ```bash
   # Check report contains wiki links
   grep "\[\[" Knowledge/Reports/2025-01-26_*.md
   # Expected output:
   # - [[Architecture_Docs]]
   # - [[API_Spec]]
   # - [[Plans/550e8400-e29b-41d4-a716-446655440000]]
   # - [[Requests/implement-user-registration]]

   # Verify links are valid Obsidian links
   cat Knowledge/Reports/2025-01-26_*.md | grep -o "\[\[.*\]\]"
   # Expected: All referenced files exist in Knowledge/
   ```

4. **Activity Journal Logging:**
   ```bash
   # After report generation, verify logging
   sqlite3 System/journal.db <<EOF
   SELECT action_type, trace_id, payload 
   FROM activity 
   WHERE action_type = 'report.generated' 
   ORDER BY timestamp DESC 
   LIMIT 1;
   EOF

   # Expected: Logged with trace_id, report_path, status='completed'
   ```

5. **Frontmatter Validation:**
   ```bash
   # Extract and validate TOML frontmatter
   head -10 Knowledge/Reports/2025-01-26_*.md
   # Expected output:
   # +++
   # trace_id = "550e8400-e29b-41d4-a716-446655440000"
   # request_id = "implement-user-registration"
   # status = "completed"
   # completed_at = "2025-01-26T14:30:00Z"
   # agent_id = "senior-coder"
   # branch = "feat/implement-user-registration-550e8400"
   # +++

   # Verify TOML is valid
   deno eval "import {parse} from '@std/toml'; const text=Deno.readTextFileSync('Knowledge/Reports/2025-01-26_*.md'); const frontmatter = text.match(/^\+\+\+\n([\s\S]*?)\n\+\+\+/)?.[1]; console.log(parse(frontmatter));"
   # Expected: Valid TOML object
   ```

6. **Report Searchability:**
   ```bash
   # Search reports by trace_id
   grep -r "550e8400" Knowledge/Reports/
   # Expected: Report found

   # Search reports by keywords
   grep -r "authentication" Knowledge/Reports/
   # Expected: Reports mentioning authentication listed

   # Verify Obsidian can find reports
   # Open Obsidian, search "trace_id:550e8400"
   # Expected: Report appears in search results
   ```

7. **File Change Categorization:**
   ```bash
   # Verify report categorizes changes correctly
   cat Knowledge/Reports/2025-01-26_*.md
   # Expected sections:
   # ### Files Created (3)
   # - src/auth/register.ts - User registration handler
   # - migrations/004_registration.sql - Registration table
   # - tests/auth/register_test.ts - Registration tests
   #
   # ### Files Modified (2)
   # - src/routes/api.ts - Added registration route
   # - README.md - Updated setup instructions
   #
   # ### Files Deleted (0)
   ```

8. **Error Handling for Missing Data:**
   ```bash
   # Simulate missing trace data
   sqlite3 System/journal.db "DELETE FROM activity WHERE trace_id='test-trace-id';"

   # Attempt report generation
   deno run --allow-all src/reporter/mission_reporter.ts --trace-id=test-trace-id
   # Expected output:
   # ✗ Error: No trace data found for trace_id 'test-trace-id'
   # ✗ Report generation failed - check Activity Journal

   # Verify error logged
   sqlite3 System/journal.db "SELECT action_type, payload FROM activity WHERE action_type='report.failed' ORDER BY timestamp DESC LIMIT 1;"
   # Expected: Error details preserved
   ```

9. **Reasoning Section Quality:**
   ```bash
   # Verify reasoning section explains decisions
   cat Knowledge/Reports/2025-01-26_*.md | grep -A 10 "## Reasoning"
   # Expected output:
   # ## Reasoning
   #
   # Chose JWT over sessions for stateless authentication. Used bcrypt 
   # for password hashing per security guidelines. Implemented rate 
   # limiting on login endpoint to prevent brute force attacks.
   #
   # Registration flow validates email format and password strength before
   # creating user record. Email verification tokens expire after 24h.
   ```

10. **Report Retrieval by Trace ID:**
    ```bash
    # Query Activity Journal for reports by trace
    sqlite3 System/journal.db <<EOF
    SELECT json_extract(payload, '$.report_path') as report_path
    FROM activity
    WHERE action_type = 'report.generated'
      AND trace_id = '550e8400-e29b-41d4-a716-446655440000';
    EOF

    # Expected: Returns report file path
    # Then verify file exists
    # ls $(sqlite3 System/journal.db "SELECT json_extract(payload, '$.report_path') FROM activity WHERE action_type='report.generated' AND trace_id='550e8400-e29b-41d4-a716-446655440000';")
    ```

---

## Phase 5: Obsidian Setup & Runtime Integration ✅ IN PROGRESS

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

- Scaffold script creates Knowledge/{Portals,Reports,Context} directories
- Dashboard.md and README.md templates copied during deployment
- .obsidian/ added to .gitignore
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

| Metric          | Value                                                                              |
| --------------- | ---------------------------------------------------------------------------------- |
| Active Tasks    | `= length(filter(dv.pages('"System/Active"'), p => p.status = "running"))`         |
| Pending Plans   | `= length(dv.pages('"Inbox/Plans"'))`                                              |
| Today's Reports | `= length(filter(dv.pages('"Knowledge/Reports"'), p => p.created >= date(today)))` |

---

## 🔄 Current Active Tasks

```dataview
TABLE 
  status as Status, 
  agent as Agent, 
  dateformat(created, "HH:mm") as Started,
  target as Target
FROM "System/Active"
SORT created DESC
LIMIT 10
```
````

---

## 📋 Recent Plans (Awaiting Review)

```dataview
TABLE 
  status as Status,
  link(file.path, file.name) as Plan,
  dateformat(created, "yyyy-MM-dd HH:mm") as Created
FROM "Inbox/Plans"
WHERE status = "review"
SORT created DESC
LIMIT 5
```

---

## 📄 Recent Reports

```dataview
TABLE 
  status as Status, 
  dateformat(created, "yyyy-MM-dd") as Date,
  agent as Agent,
  target as Target
FROM "Knowledge/Reports"
WHERE contains(file.name, "trace")
SORT created DESC
LIMIT 10
```

---

## ⚠️ Failed Tasks (Need Attention)

```dataview
LIST
FROM "Knowledge/Reports"
WHERE status = "failed"
SORT created DESC
LIMIT 5
```

---

## 🔗 Quick Links

- [[Inbox/Requests/README|Create New Request]]
- [[Knowledge/Portals/README|Manage Portals]]
- [[docs/ExoFrame_User_Guide|User Guide]]

**CLI Support:**

```bash
# Generate default dashboard
exoctl scaffold --dashboard

# Regenerate dashboard from template
exoctl scaffold --dashboard --force
```

**Success Criteria:**

- [x] Dashboard.md created at Knowledge/Dashboard.md
- [x] All 4 Dataview queries are syntactically valid
- [x] Queries reference correct ExoFrame folders
- [x] Dashboard displays live data when Dataview plugin is active
- [x] Template exists at templates/Dashboard.md

---

### Step 5.6: Request Commands - Primary Request Interface ✅ COMPLETED

- **Dependencies:** Steps 1.2 (Storage), 2.2 (Frontmatter Parser), 4.4 (CLI Architecture)
- **Action:** Implement `exoctl request` as the **primary interface** for creating requests to ExoFrame agents.
- **Requirement:** The CLI must be the recommended way to create requests, replacing manual file creation.
- **Justification:** Manual file creation is error-prone (invalid TOML, missing fields, typos in paths). A CLI command ensures validation, proper frontmatter generation, and audit logging.
- **Status:** COMPLETED - 38 tests passing, CLI registered

**The Problem:**

Manual request creation has several issues:

- ❌ Users must remember correct TOML frontmatter format
- ❌ Users must generate UUIDs manually
- ❌ Users must remember correct file path (`/Inbox/Requests/`)
- ❌ No validation until daemon processes the file (late failure)
- ❌ Easy to create malformed requests that silently fail
- ❌ No activity logging when request is created
- ❌ Inconsistent naming conventions

**The Solution: `exoctl request` Command**

Make CLI the primary interface with these features:

1. **Auto-generation:** trace_id, timestamps, filenames
2. **Validation:** Zod schema validation before writing
3. **Flexibility:** Multiple input methods (inline, file, interactive)
4. **Audit trail:** Immediate logging to Activity Journal
5. **Feedback:** Clear confirmation with next steps

#### **Commands:**

```bash
# Primary: Inline description (most common use case)
exoctl request "Implement user authentication for the API"

# With options
exoctl request "Add rate limiting" --agent senior_coder --priority high
exoctl request "Fix login bug" --priority critical --portal MyProject

# From file (for complex/long requests)
exoctl request --file ~/requirements.md
exoctl request -f ./feature-spec.md --agent architect

# Interactive mode (prompts for all fields)
exoctl request --interactive
exoctl request -i

# List recent requests (for reference)
exoctl request list
exoctl request list --status pending

# Show request details
exoctl request show <trace-id>
```

#### **Options:**

| Option          | Short | Type   | Default   | Description                                   |
| --------------- | ----- | ------ | --------- | --------------------------------------------- |
| `--agent`       | `-a`  | string | `default` | Target agent blueprint name                   |
| `--priority`    | `-p`  | enum   | `normal`  | Priority: `low`, `normal`, `high`, `critical` |
| `--portal`      |       | string |           | Portal alias for context                      |
| `--file`        | `-f`  | path   |           | Read description from file                    |
| `--interactive` | `-i`  | flag   |           | Interactive mode with prompts                 |
| `--dry-run`     |       | flag   |           | Show what would be created without writing    |
| `--json`        |       | flag   |           | Output in JSON format                         |

#### **Activity Logging:**

- `request.created` with `{trace_id, priority, agent, portal, source, created_by, description_length}`
- All actions tagged with `actor='human'`

#### **Success Criteria:**

1. [x] `exoctl request "description"` creates valid request file
2. [x] Generated frontmatter passes Zod RequestFrontmatterSchema validation
3. [x] trace_id is valid UUID v4 format
4. [x] Filename follows pattern: `request-{short_trace_id}.md`
5. [x] File created in `/Inbox/Requests/` directory
6. [x] `--agent` option sets correct agent in frontmatter
7. [x] `--priority` validates enum (low/normal/high/critical)
8. [x] `--portal` option adds portal field to frontmatter
9. [x] `--file` reads description from specified file
10. [x] `--file` rejects non-existent files with clear error
11. [x] `--file` rejects empty files with clear error
12. [x] `--dry-run` shows what would be created without writing
13. [x] `--json` outputs machine-readable JSON
14. [x] `exoctl request list` shows all pending requests
15. [x] `exoctl request list --status` filters by status
16. [x] `exoctl request show <id>` displays full request content
17. [x] Activity Journal logs `request.created` with all metadata
18. [x] User identity captured from git config or OS username
19. [x] created_by field populated in frontmatter
20. [x] source field indicates how request was created (cli/file/interactive)
21. [x] 38 tests in `tests/cli/request_commands_test.ts`
22. [x] All tests pass

#### **Acceptance Criteria (Manual Testing):**

```bash
# 1. Basic request creation
$ exoctl request "Implement user authentication for the API"
✓ Request created: request-a1b2c3d4.md
  Trace ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Priority: normal
  Agent: default
  Path: /home/user/ExoFrame/Inbox/Requests/request-a1b2c3d4.md
  Next: Daemon will process this automatically

# 2. Verify file content
$ cat ~/ExoFrame/Inbox/Requests/request-a1b2c3d4.md
+++
trace_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
created = "2025-11-27T10:30:00.000Z"
status = "pending"
priority = "normal"
agent = "default"
source = "cli"
created_by = "user@example.com"
+++

# Request

Implement user authentication for the API

# 3. Request with options
$ exoctl request "Fix critical security bug" --priority critical --agent security_expert
✓ Request created: request-b2c3d4e5.md
  Priority: critical
  Agent: security_expert

# 4. Request from file
$ echo "Implement feature X with requirements..." > ~/requirements.md
$ exoctl request --file ~/requirements.md --agent architect
✓ Request created: request-c3d4e5f6.md

# 5. List requests
$ exoctl request list
📥 Requests (3):

🔴 a1b2c3d4
   Status: pending
   Agent: default
   Created: user@example.com @ 2025-11-27T10:30:00.000Z

🟠 b2c3d4e5
   Status: pending
   Agent: security_expert
   Created: user@example.com @ 2025-11-27T10:31:00.000Z

# 6. Show request
$ exoctl request show a1b2c3d4
📄 Request: a1b2c3d4

Trace ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
Status: pending
Priority: normal
Agent: default
Created: user@example.com @ 2025-11-27T10:30:00.000Z

────────────────────────────────────────────────────────────
[full content...]

# 7. Verify activity logging
$ sqlite3 ~/ExoFrame/System/journal.db "SELECT action_type, payload FROM activity WHERE action_type='request.created' ORDER BY timestamp DESC LIMIT 1;"
request.created|{"trace_id":"a1b2c3d4-...","priority":"normal","agent":"default","source":"cli","created_by":"user@example.com"}

# 8. JSON output
$ exoctl request "Test" --json
{
  "trace_id": "d4e5f6a7-...",
  "filename": "request-d4e5f6a7.md",
  "path": "/home/user/ExoFrame/Inbox/Requests/request-d4e5f6a7.md",
  "status": "pending",
  "priority": "normal",
  "agent": "default",
  "created": "2025-11-27T10:32:00.000Z",
  "created_by": "user@example.com"
}

# 9. Dry run
$ exoctl request "Test dry run" --dry-run
Dry run - would create:
{
  "trace_id": "e5f6a7b8-...",
  ...
}

# 10. Error handling
$ exoctl request --file /nonexistent/file.md
Error: File not found: /nonexistent/file.md

$ exoctl request
Error: Description required. Usage: exoctl request "<description>"
       Or use --file to read from file, or --interactive for prompts.
```

---

### Step 5.7: YAML Frontmatter Migration (Dataview Compatibility) ✅ COMPLETED

- **Dependencies:** Steps 5.1-5.6 completed, Dataview plugin integration.
- **Rollback:** Revert frontmatter format to TOML, update Dashboard to use `dataviewjs`.

**Problem Statement:**

ExoFrame currently uses **TOML frontmatter** (`+++` delimiters) for all markdown files (requests, plans, reports). However, **Obsidian's Dataview plugin only supports YAML frontmatter** (`---` delimiters). This causes:

- ❌ Dashboard queries show `-` (empty) for all frontmatter fields
- ❌ Users cannot filter or sort by `status`, `priority`, `agent`, etc.
- ❌ The primary UI (Obsidian Dashboard) is effectively broken for metadata display
- ❌ Workaround requires complex `dataviewjs` blocks with custom TOML parsing

**Root Cause:**

- Dataview's DQL (Dataview Query Language) parses YAML frontmatter natively
- TOML frontmatter (`+++`) is not recognized by Dataview
- The `dataviewjs` workaround requires JavaScript Queries enabled and custom parsing code

**Solution: Migrate from TOML to YAML Frontmatter**

Convert all markdown frontmatter from TOML format to YAML format:

| Before (TOML)                      | After (YAML)                    |
| ---------------------------------- | ------------------------------- |
| `+++`                              | `---`                           |
| `trace_id = "550e8400-..."`        | `trace_id: "550e8400-..."`      |
| `status = "pending"`               | `status: pending`               |
| `priority = "normal"`              | `priority: normal`              |
| `tags = ["feature", "api"]`        | `tags: [feature, api]`          |
| `created = "2025-11-28T10:30:00Z"` | `created: 2025-11-28T10:30:00Z` |
| `+++`                              | `---`                           |

**Scope of Changes:**

#### **1. Core Parser Updates**

| File                               | Change Required                                                        |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `src/cli/base.ts`                  | Update `extractFrontmatter()` and `serializeFrontmatter()` for YAML    |
| `src/parsers/markdown.ts`          | Update regex from `^\+\+\+` to `^---`, use YAML parser instead of TOML |
| `src/services/plan_writer.ts`      | Generate YAML frontmatter in plans                                     |
| `src/services/mission_reporter.ts` | Generate YAML frontmatter in reports                                   |
| `src/services/execution_loop.ts`   | Parse/generate YAML frontmatter in execution files                     |

#### **2. CLI Command Updates**

| File                          | Change Required                                       |
| ----------------------------- | ----------------------------------------------------- |
| `src/cli/request_commands.ts` | Update body extraction regex from `^\+\+\+` to `^---` |
| `src/cli/plan_commands.ts`    | Update frontmatter parsing/serialization for YAML     |

#### **3. Test Fixture Updates**

| Directory    | Files Affected | Change Required                               |
| ------------ | -------------- | --------------------------------------------- |
| `tests/cli/` | ~10 files      | Update test fixtures from TOML to YAML format |
| `tests/`     | ~5 files       | Update frontmatter assertions                 |

#### **4. Template Updates**

| File                               | Change Required                                       |
| ---------------------------------- | ----------------------------------------------------- |
| `templates/Knowledge_Dashboard.md` | Revert to simple `dataview` queries (no `dataviewjs`) |

#### **5. Documentation Updates**

| Document                          | Section to Update                            |
| --------------------------------- | -------------------------------------------- |
| `ExoFrame_Technical_Spec.md`      | Section 2.1 File Format Inventory            |
| `ExoFrame_User_Guide.md`          | Request/Plan file format examples            |
| `ExoFrame_Developer_Setup.md`     | Test fixture format notes                    |
| `ExoFrame_Implementation_Plan.md` | Step 7.2 (update from TOML to YAML decision) |

#### **6. Dependency Changes**

| Change           | Reason                                            |
| ---------------- | ------------------------------------------------- |
| Add `@std/yaml`  | YAML parsing/serialization                        |
| Keep `@std/toml` | Still needed for `exo.config.toml` and Blueprints |

**Implementation Checklist:**

1. [x] Add `@std/yaml` to `deno.json` imports
2. [x] Update `src/cli/base.ts`:
   - [x] `extractFrontmatter()`: Change regex from `^\+\+\+\n([\s\S]*?)\n\+\+\+` to `^---\n([\s\S]*?)\n---`
   - [x] `extractFrontmatter()`: Replace TOML parsing with YAML parsing
   - [x] `serializeFrontmatter()`: Generate `---` delimiters with `key: value` format
   - [x] `updateFrontmatter()`: Update body extraction regex
3. [x] Update `src/parsers/markdown.ts`:
   - [x] Change TOML regex to YAML regex
   - [x] Replace `@std/toml` parse with `@std/yaml` parse
4. [x] Update `src/services/plan_writer.ts`:
   - [x] `generateFrontmatter()`: Output YAML format
5. [x] Update `src/services/mission_reporter.ts`:
   - [x] `buildFrontmatter()`: Output YAML format
6. [x] Update `src/services/execution_loop.ts`:
   - [x] Parse YAML frontmatter in active task files
7. [x] Update `src/cli/request_commands.ts`:
   - [x] `show()` method: Update body extraction regex
8. [x] Update `src/cli/plan_commands.ts`:
   - [x] Frontmatter parsing/serialization for YAML
9. [x] Convert all test fixtures:
   - [x] `tests/cli/request_commands_test.ts`
   - [x] `tests/cli/plan_commands_test.ts`
   - [x] `tests/mission_reporter_test.ts`
   - [x] `tests/plan_writer_test.ts`
   - [x] Other affected test files
10. [x] Update `templates/Knowledge_Dashboard.md`:
    - [x] Dashboard uses simple `dataview` TABLE queries (already correct)
    - [x] No `dataviewjs` blocks needed
11. [x] Run full test suite and fix any failures
12. [ ] Update documentation (see Section 5.7.5)

**YAML Frontmatter Format Specification:**

```markdown
---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
created: 2025-11-28T10:30:00.000Z
status: pending
priority: normal
agent: default
source: cli
created_by: user@example.com
portal: MyProject
tags: [feature, api]
---

# Request

Your request description here...
```

**Key Format Rules:**

1. Delimiters: `---` (three hyphens) on separate lines
2. Key-value: `key: value` (colon + space)
3. Strings: Quotes optional for simple values, required for UUIDs with hyphens
4. Arrays: Inline `[item1, item2]` format preferred
5. Dates: ISO 8601 format without quotes (YAML parses as timestamp)
6. Booleans: `true`/`false` (lowercase, no quotes)

**Dashboard Query Compatibility:**

After migration, standard Dataview queries will work:

```dataview
TABLE 
  status AS "Status",
  priority AS "Priority",
  agent AS "Agent",
  created AS "Created"
FROM "Inbox/Requests"
WHERE status = "pending"
SORT created DESC
LIMIT 10
```

**Migration Notes:**

- **BREAKING CHANGE**: Existing TOML frontmatter files will not be auto-converted
- Users must manually convert existing files or use a migration script
- New files created via `exoctl request` will use YAML format
- Provide migration script: `scripts/migrate_toml_to_yaml.ts`

**Success Criteria:**

1. [x] All frontmatter uses `---` YAML delimiters
2. [x] Dataview queries in Dashboard show all fields correctly
3. [x] `exoctl request list` displays proper status, priority, agent
4. [x] `exoctl plan list` displays proper status, trace_id
5. [x] All 390+ tests pass after migration
6. [x] No `dataviewjs` blocks required in Dashboard

**Acceptance Testing:**

````bash
# 1. Create request with new YAML format
$ exoctl request "Test YAML format"
✓ Request created: request-abc12345.md

# 2. Verify YAML frontmatter
$ head -10 ~/ExoFrame/Inbox/Requests/request-abc12345.md
---
trace_id: "abc12345-..."
status: pending
priority: normal
```

---

# 3. Open Obsidian Dashboard
# Verify all fields display correctly (not "-")

# 4. Run Dataview query test
# In Obsidian, create test note with:
```dataview
TABLE status, priority, agent FROM "Inbox/Requests" LIMIT 1
````

# Verify fields show actual values

---

### Step 5.8: LLM Provider Selection Logic ✅ COMPLETE

- **Dependencies:** Step 3.1 (Model Adapter with IModelProvider interface), Step 6.8 (MockLLMProvider)
- **Rollback:** Remove provider selection, hardcode MockProvider
- **Action:** Implement provider selection logic in daemon startup based on environment and configuration
- **Location:** `src/ai/provider_factory.ts`, `src/main.ts`

**Implementation Summary:**

Step 5.8 has been implemented using TDD methodology:

1. **Tests Created:** `tests/provider_factory_test.ts` (23 tests)
2. **Config Schema:** `src/config/ai_config.ts` with Zod validation
3. **Factory Class:** `src/ai/provider_factory.ts` with `create()` and `getProviderInfo()`
4. **Daemon Integration:** `src/main.ts` logs provider ID at startup

**Supported Providers:**

- `mock` - MockLLMProvider for testing (default)
- `ollama` - Local Ollama server
- `anthropic` - Anthropic Claude API (requires ANTHROPIC_API_KEY)
- `openai` - OpenAI API (requires OPENAI_API_KEY)

**Configuration Priority:**

1. Environment variables (highest): `EXO_LLM_PROVIDER`, `EXO_LLM_MODEL`, `EXO_LLM_BASE_URL`, `EXO_LLM_TIMEOUT_MS`
2. Config file [ai] section
3. Defaults (MockLLMProvider)

**Manual Test:** See MT-15 in `docs/ExoFrame_Manual_Test_Scenarios.md`

**Success Criteria:** ✅ All Met

1. [x] `ProviderFactory.create()` returns correct provider based on environment
2. [x] Environment variables override config file settings
3. [x] Config file `[ai]` section parsed correctly
4. [x] Default is `MockLLMProvider` when no config/env specified
5. [x] Missing API key throws clear error for cloud providers
6. [x] Unknown provider falls back to mock with warning
7. [x] Provider ID logged at daemon startup
8. [x] `EXO_LLM_MODEL` correctly sets model for all providers
9. [x] `EXO_LLM_BASE_URL` correctly overrides endpoint
10. [x] `EXO_LLM_TIMEOUT_MS` correctly sets timeout
11. [x] Zod schema validates `[ai]` config section
12. [x] All 23 unit tests pass in `tests/provider_factory_test.ts`
13. [x] Integration test: daemon starts with each provider type
14. [x] Manual test: See [MT-15: LLM Provider Selection](./ExoFrame_Manual_Test_Scenarios.md#scenario-mt-15-llm-provider-selection)

---

### Step 5.9: Request Processor Pipeline ✅ COMPLETE

- **Dependencies:** Step 5.8 (LLM Provider Selection), Step 3.2 (AgentRunner), Step 2.2 (Frontmatter Parser)
- **Rollback:** Remove request processor, revert to TODO comment in main.ts
- **Action:** Wire up the file watcher callback to process requests and generate plans
- **Location:** `src/services/request_processor.ts`, `src/main.ts`

**Problem Statement:**

The daemon currently detects new request files but does not process them:

```typescript
// src/main.ts (current state)
const watcher = new FileWatcher(config, (event) => {
  console.log(`📥 New file ready: ${event.path}`);
  // TODO: Dispatch to request processor  <-- THIS IS THE GAP
});
```

Manual test MT-03 (Create Request) passes, but MT-04 (Plan Generation) fails because the request-to-plan pipeline is not connected.

**The Solution: Request Processor Service**

Implement a `RequestProcessor` service that:

1. Parses the detected request file (YAML frontmatter + body)
2. Validates the request against schema
3. Loads agent blueprint from `Blueprints/Agents/`
4. Calls `AgentRunner.run()` with the LLM provider
5. Writes the generated plan to `Inbox/Plans/`
6. Updates request status to `processing` → `planned`
7. Logs all activities to the Activity Journal

**Implementation Files:**

| File                                | Purpose                                         |
| ----------------------------------- | ----------------------------------------------- |
| `src/services/request_processor.ts` | RequestProcessor class                          |
| `src/main.ts`                       | Integration: call processor in watcher callback |
| `tests/request_processor_test.ts`   | TDD tests                                       |

**RequestProcessor Interface:**

```typescript
interface RequestProcessor {
  /**
   * Process a detected request file and generate a plan
   * @param filePath - Path to the request markdown file
   * @returns The generated plan file path, or null if processing failed
   */
  process(filePath: string): Promise<string | null>;
}
```

**Daemon Integration:**

```typescript
// src/main.ts (after implementation)
const requestProcessor = new RequestProcessor(config, llmProvider, dbService);

const watcher = new FileWatcher(config, async (event) => {
  console.log(`📥 New file ready: ${event.path}`);

  try {
    const planPath = await requestProcessor.process(event.path);
    if (planPath) {
      console.log(`✅ Plan generated: ${planPath}`);
    }
  } catch (error) {
    console.error(`❌ Failed to process request: ${error.message}`);
  }
});
```

**Success Criteria:**

1. [x] `RequestProcessor.process()` parses request file correctly
2. [x] Invalid requests logged and skipped (no crash)
3. [x] Agent blueprint loaded from `Blueprints/Agents/default.md`
4. [x] `AgentRunner.run()` called with correct prompt
5. [x] Plan file created in `Inbox/Plans/` with YAML frontmatter
6. [x] Plan linked to original request via `trace_id`
7. [x] Request status updated to `planned`
8. [x] Activity logged: `request.processing`, `request.planned`
9. [ ] MT-04 (Plan Generation) passes (requires real LLM test)
10. [x] All 12 unit tests pass in `tests/request_processor_test.ts`

**TDD Test Cases (12 tests in `tests/request_processor_test.ts`):**

```typescript
// Request Parsing
"should parse valid request file with TOML frontmatter";
"should return null for invalid TOML frontmatter";
"should return null for request missing trace_id";

// Plan Generation
"should generate plan using MockLLMProvider";
"should write plan to Inbox/Plans/ directory";
"should create plan with correct frontmatter";

// Request Status Update
"should update request status to 'planned'";

// Activity Logging
"should log processing start and completion";

// Error Handling
"should handle LLM errors gracefully";
"should handle missing blueprint gracefully";
"should handle file read errors";

// Blueprint Loading
"should load custom agent blueprint";
"should use default blueprint when agent is 'default'";
```

---

### Step 5.10: Unified Event Logger (Console + Activity Journal) ✅ COMPLETED

- **Dependencies:** Step 1.2 (Activity Journal), All modules using console.log
- **Rollback:** Revert to direct console.log calls
- **Action:** Create a unified logging service that writes to both console and Activity Journal
- **Location:** `src/services/event_logger.ts`, all src/ modules

**Problem Statement:**

The current codebase has inconsistent logging patterns:

1. **Console-only logs:** Many important events are printed to console but NOT registered in the Activity Journal (e.g., configuration loaded, daemon starting, LLM provider initialized)
2. **Dual logging:** Some events are logged to both console and Activity Journal, but with different message formats
3. **Audit gaps:** The Activity Journal should be the primary source for debugging and auditing, but it's missing ~40% of operational events
4. **Code duplication:** Console.log + db.logActivity calls are scattered throughout the codebase

**Examples of Missing Activity Logs:**

```typescript
// main.ts - These console logs have NO activity journal entry:
console.log(`✅ Configuration loaded (Checksum: ${checksum.slice(0, 8)})`);
console.log(`   Root: ${config.system.root}`);
console.log(`   Log Level: ${config.system.log_level}`);
console.log(`✅ LLM Provider initialized: ${providerInfo.id}`);
console.log(`✅ Request Processor initialized`);
```

**The Solution: EventLogger Service**

Create a unified `EventLogger` class that:

1. Accepts a structured event with action type, target, and payload
2. Writes to Activity Journal (database)
3. Prints formatted message to console
4. Provides consistent log levels (info, warn, error)
5. Handles database connection failures gracefully (falls back to console-only)

**Console Output Format:**

```
[timestamp] icon message
            key: value
            key: value

Examples:
✅ Configuration loaded (Checksum: d70fb81)
   Root: /home/user/ExoFrame
   Log Level: info

🚀 Daemon starting
   Provider: ollama
   Model: codellama:13b

📥 File detected: request-abc123.md
   Size: 2048 bytes

⚠️ Context truncated
   Files skipped: 3
   Token budget: 100000
```

**Migration Plan:**

| Module                  | Current Console Calls | Migration Approach                                          |
| ----------------------- | --------------------- | ----------------------------------------------------------- |
| `main.ts`               | ~15 calls             | Replace all with EventLogger (actor: "system")              |
| `request_processor.ts`  | ~8 calls              | Replace with EventLogger.child() (actor: "agent:processor") |
| `watcher.ts`            | ~6 calls              | Replace with EventLogger.child() (actor: "system")          |
| `daemon_commands.ts`    | ~12 calls             | Replace with EventLogger.child() (actor: user identity)     |
| `changeset_commands.ts` | ~10 calls             | Replace with EventLogger.child() (actor: user identity)     |
| `plan_commands.ts`      | ~5 calls              | Replace with EventLogger.child() (actor: user identity)     |
| `request_commands.ts`   | ~8 calls              | Replace with EventLogger.child() (actor: user identity)     |
| `portal_commands.ts`    | ~10 calls             | Replace with EventLogger.child() (actor: user identity)     |
| `git_commands.ts`       | ~6 calls              | Replace with EventLogger.child() (actor: user identity)     |
| `exoctl.ts`             | ~40 calls             | Display output only (list, show, status) - no DB logging    |

**CLI Logging Rules:**

CLI commands interact with ExoFrame on behalf of the user. All CLI **actions** must be logged to the Activity Journal with the **actual user identity** (email or username) for complete audit trail:

| CLI Output Type     | Example                                          | Log to Activity Journal?    |
| ------------------- | ------------------------------------------------ | --------------------------- |
| **User Actions**    | `exoctl plan approve`, `exoctl changeset reject` | ✅ YES - with user identity |
| **State Changes**   | `exoctl request create`, `exoctl portal add`     | ✅ YES - with user identity |
| **Read Operations** | `exoctl plan list`, `exoctl request show`        | ❌ NO - display only        |
| **Status Display**  | `exoctl daemon status`, `exoctl git branches`    | ❌ NO - display only        |
| **Help/Version**    | `exoctl --help`, `exoctl --version`              | ❌ NO - display only        |
| **Errors**          | Validation failures, missing files               | ✅ YES - with user identity |

**Note:** CLI commands already log some actions via `db.logActivity()` calls. The migration will unify these into EventLogger for consistency and ensure ALL actions are captured.

**Exceptions (Keep console.log only):**

1. **Read-only display:** List results, show details, status output
2. **Interactive prompts:** User input handling
3. **Help text:** Command documentation
4. **Error fallbacks:** When Activity Journal itself fails

**Implementation Files:**

| File                           | Purpose                    |
| ------------------------------ | -------------------------- |
| `src/services/event_logger.ts` | EventLogger class          |
| `tests/event_logger_test.ts`   | Unit tests                 |
| All src/ modules               | Migration from console.log |

**Success Criteria:**

1. [x] `EventLogger` class implemented with log(), info(), warn(), error() methods
2. [x] All log events written to Activity Journal with proper action types
3. [x] Console output formatted consistently with icons and indentation
4. [x] Database failures don't crash the application (fallback to console-only)
5. [x] Child loggers inherit parent defaults (traceId, actor, etc.)
6. [x] All `main.ts` startup logs migrated to EventLogger
7. [x] All service modules migrated (request_processor, watcher, etc.)
8. [x] All CLI command **actions** use EventLogger with actor='human'
9. [x] CLI read-only display uses display logger (EventLogger without DB) for consistency
10. [x] All state-changing events + user actions in Activity Journal
11. [x] Activity Journal becomes the single source of truth for debugging and audit
12. [x] AGENT_INSTRUCTIONS.md updated with EventLogger usage guidelines
13. [x] All existing tests pass after migration
14. [x] User identity resolved from git config (email) or OS username
15. [x] Activity Journal queryable by trace_id and action_type via DB methods

**TDD Test Cases:**

```typescript
// src/services/event_logger_test.ts

// Basic Logging
"should write event to Activity Journal";
"should print formatted message to console";
"should include payload values in console output";

// Log Levels
"should respect minLevel configuration";
"should use appropriate icons for each level";

// Child Loggers
"should inherit parent defaults";
"should override parent defaults when specified";

// Actor Identity
"should resolve user identity from git config email";
"should fallback to git user.name if email not set";
"should fallback to OS username if git not configured";
"should cache user identity after first resolution";

// Error Handling
"should fallback to console-only when DB unavailable";
"should not throw when DB write fails";

// Format
"should format timestamps consistently";
"should indent multi-line payloads";
```

**Activity Journal Query Benefits:**

After migration, all operational events are queryable with specific user identities:

```sql
-- Find all configuration changes
SELECT * FROM activity WHERE action_type = 'config.loaded' ORDER BY timestamp DESC;

-- Trace daemon lifecycle
SELECT * FROM activity WHERE action_type LIKE 'daemon.%' ORDER BY timestamp;

-- Debug request processing
SELECT * FROM activity WHERE trace_id = 'abc123' ORDER BY timestamp;

-- Audit all provider initializations
SELECT * FROM activity WHERE action_type = 'llm.provider.initialized';

-- Audit all actions by a specific user
SELECT action_type, target, payload, timestamp
FROM activity 
WHERE actor = 'john.doe@example.com' 
ORDER BY timestamp DESC;

-- Find all human users who have interacted with ExoFrame
SELECT DISTINCT actor, COUNT(*) as action_count
FROM activity 
WHERE actor NOT IN ('system') AND actor NOT LIKE 'agent:%'
GROUP BY actor
ORDER BY action_count DESC;

-- Find all plan approvals/rejections by user
SELECT action_type, target, json_extract(payload, '$.approved_by') as user, timestamp
FROM activity 
WHERE action_type LIKE 'plan.%' AND actor = 'human'
ORDER BY timestamp DESC;
```

---

### Step 5.11: Blueprint Creation and Management ✅ COMPLETED

- **Dependencies:** Step 5.9 (Request Processor Pipeline)
- **Rollback:** Delete created blueprint files, revert to default agent only
- **Action:** Implement CLI commands for creating, listing, and managing agent blueprints
- **Requirement:** Blueprints are **mandatory** for RequestProcessor — missing blueprint causes request to fail with "failed" status
- **Justification:** Enables users to create custom agents with specific capabilities, models, and system prompts without manual file creation

**The Problem:**

The current system requires blueprint files in `Blueprints/Agents/` but provides no tooling to create them:

- ❌ Users must manually create markdown files with correct TOML frontmatter
- ❌ No validation until runtime (when RequestProcessor fails to find blueprint)
- ❌ No way to list available agents or view blueprint details
- ❌ Blueprint format is documented but not enforced
- ❌ RequestProcessor fails silently if blueprint is missing (status="failed" but no guidance)
- ❌ Only `.gitkeep` exists in `Blueprints/Agents/` — no default blueprint

**The Solution: Blueprint CLI Commands**

Create `exoctl blueprint` commands to manage agent blueprints with validation and templates:

#### **Commands:**

```bash
# Create new blueprint from template
exoctl blueprint create <agent-id> --name "Agent Name" --model <model-id>
exoctl blueprint create senior-coder --name "Senior Coder" --model anthropic:claude-3-sonnet

# Create with full options
exoctl blueprint create security-auditor \
  --name "Security Auditor" \
  --model openai:gpt-4 \
  --description "Specialized agent for security analysis" \
  --capabilities code_review,vulnerability_scanning \
  --system-prompt-file ~/prompts/security.txt

# List all available blueprints
exoctl blueprint list
exoctl blueprint ls

# Show blueprint details
exoctl blueprint show <agent-id>
exoctl blueprint show senior-coder

# Validate blueprint file
exoctl blueprint validate <agent-id>
exoctl blueprint validate senior-coder

# Edit blueprint (opens in $EDITOR)
exoctl blueprint edit <agent-id>

# Remove blueprint (with confirmation)
exoctl blueprint remove <agent-id>
exoctl blueprint rm security-auditor --force
```

#### **Options:**

| Option                 | Short | Type   | Required | Description                              |
| ---------------------- | ----- | ------ | -------- | ---------------------------------------- |
| `--name`               | `-n`  | string | ✓        | Human-readable agent name                |
| `--model`              | `-m`  | string | ✓        | Model provider:model format              |
| `--description`        | `-d`  | string |          | Brief description of agent purpose       |
| `--capabilities`       | `-c`  | string |          | Comma-separated capability list          |
| `--system-prompt`      | `-p`  | string |          | Inline system prompt                     |
| `--system-prompt-file` | `-f`  | path   |          | Load system prompt from file             |
| `--template`           | `-t`  | string |          | Template name (default, coder, reviewer) |
| `--force`              |       | flag   |          | Skip confirmation prompts                |

#### **Blueprint File Structure:**

````markdown
+++
agent_id = "senior-coder"
name = "Senior Coder"
model = "anthropic:claude-3-sonnet"
capabilities = ["code_generation", "debugging", "refactoring"]
created = "2025-11-28T10:00:00Z"
created_by = "user@example.com"
version = "1.0.0"
+++

# Senior Coder Agent

You are a senior software engineer with expertise in multiple programming languages.

## Capabilities

- Code generation following best practices
- Debugging complex issues
- Refactoring for maintainability
- Test-driven development

## Guidelines

1. Always write tests before implementation
2. Follow language-specific style guides
3. Prioritize readability and maintainability
4. Explain reasoning in <thought> tags
5. Provide code in <content> tags

## Output Format

```xml
<thought>
Your reasoning about the problem and approach
</thought>

<content>
The code, documentation, or solution
</content>
```
````

````
#### **Templates:**

| Template     | Description                     | Model Default             | Capabilities                        |
| ------------ | ------------------------------- | ------------------------- | ----------------------------------- |
| `default`    | General-purpose agent           | `ollama:codellama:13b`    | general                             |
| `coder`      | Software development            | `anthropic:claude-sonnet` | code_generation, debugging, testing |
| `reviewer`   | Code review specialist          | `openai:gpt-4`            | code_review, security_analysis      |
| `architect`  | System design and architecture  | `anthropic:claude-opus`   | system_design, documentation        |
| `researcher` | Research and analysis           | `openai:gpt-4-turbo`      | research, analysis, summarization   |
| `gemini`     | Google's multimodal AI          | `google:gemini-2.0-flash` | general, multimodal, reasoning      |
| `mock`       | Testing and development agent   | `mock:test-model`         | testing, development                |

#### **Activity Logging:**

- `blueprint.created` with `{agent_id, name, model, template, created_by, via: 'cli'}`
- `blueprint.updated` with `{agent_id, fields_changed, updated_by, via: 'cli'}`
- `blueprint.removed` with `{agent_id, removed_by, via: 'cli'}`
- `blueprint.validated` with `{agent_id, is_valid, errors}`

#### **Validation Rules:**

1. **agent_id:**
   - Lowercase alphanumeric + hyphens only
   - Must be unique in `Blueprints/Agents/`
   - Reserved names: `system`, `default`, `test`

2. **model:**
   - Format: `provider:model-name` (e.g., `anthropic:claude-3-sonnet`, `google:gemini-2.0-flash`)
   - Provider must be configured in `exo.config.toml`

3. **name:**
   - Non-empty string
   - Max 100 characters

4. **system_prompt:**
   - Must include `<thought>` and `<content>` output format instructions
   - Min 50 characters

5. **File location:**
   - Must be in `Blueprints/Agents/` directory
   - Filename: `{agent_id}.md`

#### **Success Criteria:**

**Core Implementation:**
1. [x] Create `src/cli/blueprint_commands.ts` extending `BaseCommand`
2. [x] Define `BlueprintSchema` in `src/schemas/blueprint.ts`
3. [x] Implement `create()` method with validation
4. [x] Implement `list()` method showing all blueprints
5. [x] Implement `show()` method displaying full content
6. [x] Implement `validate()` method checking format
7. [x] Implement `edit()` method opening in $EDITOR
8. [x] Implement `remove()` method with confirmation
9. [x] Register commands in `src/cli/exoctl.ts`

**Templates & System Prompts:**
10. [x] Add template system (default, coder, reviewer, architect, researcher, mock, gemini)
11. [x] System prompt loaded from file via --system-prompt-file option
12. [x] Templates include default blueprint (used as fallback)
13. [x] Templates include mock blueprint for testing
14. [x] Blueprint frontmatter generation with validation

**CLI Functionality:**
15. [x] `exoctl blueprint create` generates valid blueprint file
16. [x] Generated blueprint passes `RequestProcessor.loadBlueprint()`
17. [x] Blueprint frontmatter validates against schema
18. [x] `--template` option applies correct defaults
19. [x] `--system-prompt-file` loads and validates file content
20. [x] `exoctl blueprint list` shows all blueprints with metadata
21. [x] `exoctl blueprint show` displays full blueprint content
22. [x] `exoctl blueprint validate` checks format and required fields
23. [x] `exoctl blueprint edit` opens blueprint in user's $EDITOR
24. [x] `exoctl blueprint remove` requires confirmation unless --force

**Validation & Error Handling:**
25. [x] Validation errors provide clear guidance on fixes
26. [x] Reserved agent_id names are rejected
27. [x] Duplicate agent_id names are rejected
28. [x] Model provider validation checks `exo.config.toml`

**Integration & Logging:**
29. [x] Add blueprint validation in `RequestProcessor.loadBlueprint()`
30. [x] Activity Journal logs all blueprint operations with user identity
31. [x] Blueprint creation adds entry with `action_type='blueprint.created'`

**Testing & Documentation:**
32. [x] Write tests in `tests/cli/blueprint_commands_test.ts` (31 tests passing)
33. [x] Write integration test in `tests/integration/11_blueprint_management_test.ts` (12 steps passing)
34. [x] Update User Guide with blueprint management section
35. [x] Update AGENT_INSTRUCTIONS.md with blueprint creation guidelines

#### **Example Usage:**

```bash
# 1. Create default blueprint
$ exoctl blueprint create default --name "Default Agent" --model ollama:codellama:13b
✓ Blueprint created: default
  Location: /home/user/ExoFrame/Blueprints/Agents/default.md
  Model: ollama:codellama:13b
  Template: default

# 2. Create mock agent for testing
$ exoctl blueprint create mock --name "Mock Agent" --model mock:test-model --template mock
✓ Blueprint created: mock
  Location: /home/user/ExoFrame/Blueprints/Agents/mock.md
  Model: mock:test-model
  Template: mock
  Note: This agent uses MockLLMProvider for deterministic testing

# 3. Create specialized agent
$ exoctl blueprint create security-auditor \
    --name "Security Auditor" \
    --model openai:gpt-4 \
    --template reviewer \
    --capabilities security_analysis,vulnerability_scanning
✓ Blueprint created: security-auditor
  Location: /home/user/ExoFrame/Blueprints/Agents/security-auditor.md

# 4. List all blueprints
$ exoctl blueprint list
📋 Blueprints (3):

🤖 default
   Name: Default Agent
   Model: ollama:codellama:13b
   Capabilities: general
   Created: system @ 2025-11-28T10:00:00Z

🧪 mock
   Name: Mock Agent
   Model: mock:test-model
   Capabilities: testing, development
   Created: system @ 2025-11-28T10:00:00Z

🔒 security-auditor
   Name: Security Auditor
   Model: openai:gpt-4
   Capabilities: security_analysis, vulnerability_scanning
   Created: user@example.com @ 2025-11-28T10:15:00Z

# 5. Show blueprint details
$ exoctl blueprint show security-auditor
📄 Blueprint: security-auditor

Agent ID: security-auditor
Name: Security Auditor
Model: openai:gpt-4
Capabilities: security_analysis, vulnerability_scanning
Created: user@example.com @ 2025-11-28T10:15:00Z

────────────────────────────────────────────────────────────
[full content including system prompt...]

# 6. Validate blueprint
$ exoctl blueprint validate security-auditor
✓ Blueprint 'security-auditor' is valid
  - Frontmatter format: OK
  - Required fields: OK
  - Model provider: OK (openai configured)
  - System prompt: OK (includes <thought> and <content> tags)

# 7. Create test request using mock agent
$ exoctl request "Test request processing pipeline" --agent mock
✓ Request created: request-x1y2z3w4.md
  Agent: mock
  Model: mock:test-model
  Note: Using MockLLMProvider for deterministic testing

# 8. Create request using custom blueprint
$ exoctl request "Audit the authentication module for vulnerabilities" \
    --agent security-auditor
✓ Request created: request-a1b2c3d4.md
  Agent: security-auditor
  Model: openai:gpt-4

# 9. Validate that RequestProcessor finds the blueprint
$ # (daemon processes request automatically)
$ cat System/journal.db | grep "blueprint.loaded"
blueprint.loaded|{"agent_id":"security-auditor","model":"openai:gpt-4"}
```

#### **Error Handling:**

```bash
# Missing required fields
$ exoctl blueprint create test-agent
Error: --name is required
Usage: exoctl blueprint create <agent-id> --name "<name>" --model "<model>"

# Invalid agent_id format
$ exoctl blueprint create Test_Agent --name "Test" --model ollama:llama2
Error: agent_id must be lowercase alphanumeric with hyphens only
Example: test-agent

# Reserved name
$ exoctl blueprint create system --name "System" --model ollama:llama2
Error: 'system' is a reserved agent_id
Reserved names: system, default, test

# Duplicate agent_id
$ exoctl blueprint create default --name "Default" --model ollama:llama2
Error: Blueprint 'default' already exists
Use 'exoctl blueprint edit default' to modify

# Invalid model provider
$ exoctl blueprint create test --name "Test" --model unknown:model
Error: Provider 'unknown' not configured in exo.config.toml
Available providers: ollama, anthropic, openai, google

# Missing system prompt output format
$ exoctl blueprint create test --name "Test" --model ollama:llama2 \
    --system-prompt "You are a helpful assistant"
Error: System prompt must include output format instructions
Required: <thought> and <content> tags
```

#### **RequestProcessor Integration:**

Update `RequestProcessor.loadBlueprint()` to provide better error messages:

```typescript
// src/services/request_processor.ts

private async loadBlueprint(agentId: string): Promise<Blueprint | null> {
  const blueprintPath = join(
    this.config.paths.blueprints,
    "Agents",
    `${agentId}.md`
  );

  try {
    const exists = await Deno.stat(blueprintPath).then(() => true).catch(() => false);
    
    if (!exists) {
      this.logger.error("blueprint.not_found", agentId, {
        path: blueprintPath,
        help: `Create blueprint with: exoctl blueprint create ${agentId} --name "Agent Name" --model <model>`,
      });
      return null;
    }

    const content = await Deno.readTextFile(blueprintPath);
    const parsed = this.parseFrontmatter(content);
    
    // Validate blueprint structure
    const validation = BlueprintSchema.safeParse(parsed.frontmatter);
    if (!validation.success) {
      this.logger.error("blueprint.invalid", agentId, {
        path: blueprintPath,
        errors: validation.error.issues,
        help: `Validate with: exoctl blueprint validate ${agentId}`,
      });
      return null;
    }

    this.logger.info("blueprint.loaded", agentId, {
      model: validation.data.model,
      capabilities: validation.data.capabilities,
    });

    return {
      agentId: validation.data.agent_id,
      name: validation.data.name,
      model: validation.data.model,
      systemPrompt: parsed.body,
      capabilities: validation.data.capabilities,
    };
  } catch (error) {
    this.logger.error("blueprint.load_error", agentId, {
      error: error.message,
      path: blueprintPath,
    });
    return null;
  }
}
```

---

## Phase 6: Testing & Quality Assurance

> **Status:** ✅ IN PROGRESS\
> **Prerequisites:** Phases 1–5 (Runtime, Events, Intelligence, Tools, Obsidian)\
> **Goal:** Validate single-agent workflows end-to-end before adding multi-agent complexity.

📄 **Full Documentation:** [`ExoFrame_Testing_Strategy.md`](./ExoFrame_Testing_Strategy.md)

### Overview

Phase 6 establishes the testing infrastructure needed to confidently ship ExoFrame. The comprehensive testing strategy is documented in a dedicated document that covers:

- **Testing Pyramid** — Unit, Integration, Security, Performance, Manual QA
- **Mock LLM Infrastructure** — Deterministic testing without API costs
- **v1.0 Testing Scope** — What's included and excluded from initial release
- **Pre-Release Checklist** — Sign-off template for each major release

### Steps Summary

| Step | Description                   | Location                                | Status      |
| ---- | ----------------------------- | --------------------------------------- | ----------- |
| 6.1  | Unit Tests (Core Services)    | `tests/*_test.ts`                       | ✅ Complete |
| 6.2  | Obsidian Integration Tests    | `tests/obsidian/`                       | ✅ Complete |
| 6.3  | CLI Command Tests             | `tests/cli/`                            | ✅ Complete |
| 6.4  | Integration Test Scenarios    | `tests/integration/`                    | ✅ Complete |
| 6.5  | Documentation Structure Tests | `tests/docs/`                           | ✅ Complete |
| 6.6  | Security Validation Tests     | `tests/security/`                       | 🔲 Planned  |
| 6.7  | Performance Benchmarks        | `tests/benchmarks/`                     | 🔲 Planned  |
| 6.8  | Mock LLM Provider             | `src/ai/providers/mock_llm_provider.ts` | ✅ Complete |
| 6.9  | Manual QA Checklist           | Testing Strategy §4                     | 🔲 Planned  |

**Note:** Lease management is integrated into `src/services/execution_loop.ts` (not a separate service).
Tests for lease acquisition/release are in `tests/execution_loop_test.ts`.

### Exit Criteria

- [x] Unit tests cover all core services (16 modules, see Testing Strategy §2.1)
- [x] Obsidian integration verified (Dataview queries work)
- [x] All 10 integration scenarios pass (44 tests, 77 steps)
- [x] Documentation tests prevent doc drift
- [ ] Security tests verify Deno permission enforcement
- [ ] Performance benchmarks meet targets
- [x] Mock LLM enables deterministic testing (30 tests, 5 strategies)
- [ ] Manual QA passes on all target platforms
- [ ] All tests run automatically on PR in CI/CD

---

## Phase 7: Flow Orchestration (Multi-Agent Coordination)

> **Status:** 📋 PLANNED\
> **Prerequisites:** Phases 1–6 (Core system validated via Testing & QA)\
> **Goal:** Enable declarative multi-agent workflows with dependency resolution, parallel execution, and result aggregation.

### Overview

Currently, ExoFrame supports **single-agent execution** via `AgentRunner`. Phase 7 introduces **Flows** — TypeScript-defined orchestrations that coordinate multiple agents working together on complex tasks.

**Use Cases:**

| Flow Pattern       | Example                                       | Execution Model          |
| ------------------ | --------------------------------------------- | ------------------------ |
| **Pipeline**       | Lint → Security → Review → Summary            | Sequential with handoffs |
| **Fan-Out/Fan-In** | Multiple researchers → Synthesizer            | Parallel then merge      |
| **Staged**         | Architect → Implementer → Tester              | Sequential with gates    |
| **Hybrid**         | Analyzer + Transformer (parallel) → Validator | Mixed                    |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FlowRunner                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Flow Parser │  │ Dependency  │  │ Parallel Executor   │  │
│  │ (TypeScript)│  │ Resolver    │  │ (Semaphore-limited) │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    AgentRunner (existing)                   │
├─────────────────────────────────────────────────────────────┤
│                    Activity Journal                         │
└─────────────────────────────────────────────────────────────┘
```

**Key Components:**

- **FlowRunner** — Orchestrates multi-step execution, manages state
- **DependencyResolver** — Topological sort, cycle detection, wave grouping
- **AgentRunner** — Existing single-agent executor (reused per step)
- **Activity Journal** — Logs all flow/step events for audit trail

---

### Step 7.1: Flow Definition Schema

- **Dependencies:** Step 3.1 (Blueprint Service)
- **Rollback:** Feature flag `ENABLE_FLOWS=false`
- **Action:** Define Zod schemas for `FlowStep` and `Flow` types
- **Location:** `src/schemas/flow.ts`

**FlowStep Fields:**

| Field               | Type     | Required | Description                                    |
| ------------------- | -------- | -------- | ---------------------------------------------- |
| `id`                | string   | ✓        | Unique step identifier                         |
| `name`              | string   | ✓        | Human-readable name                            |
| `agent`             | string   | ✓        | Blueprint reference from `/Blueprints/Agents/` |
| `dependsOn`         | string[] |          | Steps that must complete first                 |
| `input.source`      | enum     |          | `"request"`, `"step"`, or `"aggregate"`        |
| `input.stepId`      | string   |          | Source step for `"step"` source                |
| `input.transform`   | string   |          | Transform function name                        |
| `condition`         | string   |          | Skip step if evaluates false                   |
| `timeout`           | number   |          | Step timeout in ms                             |
| `retry.maxAttempts` | number   |          | Retry count (default: 1)                       |
| `retry.backoffMs`   | number   |          | Backoff delay (default: 1000)                  |

**Flow Fields:**

| Field                     | Type            | Required | Description                           |
| ------------------------- | --------------- | -------- | ------------------------------------- |
| `id`                      | string          | ✓        | Unique flow identifier                |
| `name`                    | string          | ✓        | Human-readable name                   |
| `description`             | string          | ✓        | What the flow accomplishes            |
| `version`                 | string          |          | Semver (default: "1.0.0")             |
| `steps`                   | FlowStep[]      | ✓        | Ordered step definitions              |
| `output.from`             | string/string[] | ✓        | Which step(s) produce final output    |
| `output.format`           | enum            |          | `"markdown"`, `"json"`, `"concat"`    |
| `settings.maxParallelism` | number          |          | Max concurrent agents (default: 3)    |
| `settings.failFast`       | boolean         |          | Stop on first failure (default: true) |
| `settings.timeout`        | number          |          | Global flow timeout in ms             |

**Success Criteria:**

- [ ] FlowSchema validates example flows without errors
- [ ] Invalid flows (circular deps, missing agents) rejected with clear errors
- [ ] Schema exported and usable by FlowRunner

---

### Step 7.2: Flow File Format

- **Dependencies:** Step 7.1
- **Rollback:** N/A (file format only)
- **Action:** Define TypeScript-based flow definitions in `/Blueprints/Flows/`
- **Convention:** Files named `<flow-id>.flow.ts`

**Why TypeScript (not TOML/YAML)?**

| Benefit     | Explanation                                |
| ----------- | ------------------------------------------ |
| Type Safety | IDE autocomplete, compile-time validation  |
| Flexibility | Conditional logic, dynamic step generation |
| Transforms  | Functions not string DSL                   |
| Consistency | Same language as codebase                  |

**File Structure:**

```
/Blueprints/Flows/
├── code_review.flow.ts
├── feature_development.flow.ts
├── documentation.flow.ts
└── research.flow.ts
```

**Success Criteria:**

- [ ] `defineFlow()` helper provides type safety
- [ ] Flow files loadable via dynamic import
- [ ] Example flows created for common patterns

---

### Step 7.3: Dependency Graph Resolver

- **Dependencies:** Step 7.1
- **Rollback:** Revert to sequential execution
- **Action:** Implement topological sort and cycle detection
- **Location:** `src/flows/dependency_resolver.ts`

**Responsibilities:**

1. **Cycle Detection** — DFS with visited/inStack tracking; throw `FlowValidationError` with cycle path
2. **Topological Sort** — Kahn's algorithm for valid execution order
3. **Wave Grouping** — Group steps by dependency depth for parallel execution

**Wave Resolution Example:**

```
Input:                          Output Waves:
  A (no deps)                     Wave 1: [A, B]  ← parallel
  B (no deps)                     Wave 2: [C]     ← waits for wave 1
  C (depends: A, B)               Wave 3: [D]     ← waits for wave 2
  D (depends: C)
```

**Success Criteria:**

- [ ] Cycle detection catches A→B→C→A patterns
- [ ] Topological sort produces valid execution order
- [ ] Parallel batches correctly grouped
- [ ] Unit tests cover edge cases (single step, all parallel, all sequential)

---

### Step 7.4: FlowRunner Service

- **Dependencies:** Steps 7.1–7.3, Step 3.2 (AgentRunner)
- **Rollback:** Disable flow execution, fall back to single-agent mode
- **Action:** Implement core flow execution engine
- **Location:** `src/flows/flow_runner.ts`

**Execution Algorithm:**

1. Generate `flowRunId` (UUID)
2. Log `flow.started` to Activity Journal
3. Resolve step waves via DependencyResolver
4. For each wave:
   - Execute steps in parallel (semaphore-limited)
   - Collect results into `Map<stepId, StepResult>`
   - If `failFast` and any step failed → throw `FlowExecutionError`
5. Aggregate output from designated step(s)
6. Log `flow.completed` to Activity Journal
7. Return `FlowResult` with all step results

**Activity Journal Events:**

| Event                 | Payload                                   |
| --------------------- | ----------------------------------------- |
| `flow.started`        | `{ flowRunId, stepCount }`                |
| `flow.step.started`   | `{ flowRunId, agent }`                    |
| `flow.step.completed` | `{ flowRunId, status, duration }`         |
| `flow.completed`      | `{ flowRunId, duration, stepsCompleted }` |

**Success Criteria:**

- [ ] FlowRunner executes simple sequential flow
- [ ] Parallel steps execute concurrently (verified via timing)
- [ ] Step failures handled according to `failFast` setting
- [ ] All flow/step events logged to Activity Journal
- [ ] Integration with existing AgentRunner

---

### Step 7.5: Flow CLI Commands

- **Dependencies:** Step 7.4
- **Rollback:** Remove commands from CLI
- **Action:** Add `exoctl flow` subcommands
- **Location:** `src/cli/flow_commands.ts`

**Commands:**

| Command                                    | Description                             |
| ------------------------------------------ | --------------------------------------- |
| `exoctl flow list`                         | List all flows in `/Blueprints/Flows/`  |
| `exoctl flow show <id>`                    | Display flow steps and dependency graph |
| `exoctl flow run <id> --request <req-id>`  | Execute flow for a request              |
| `exoctl flow plan <id> --request <req-id>` | Dry-run: show execution plan            |
| `exoctl flow history <id>`                 | Show past executions                    |
| `exoctl flow validate <file>`              | Validate flow definition                |

**Success Criteria:**

- [ ] `exoctl flow list` shows all flows with step counts
- [ ] `exoctl flow show` displays step graph with dependencies
- [ ] `exoctl flow plan` shows execution waves without running
- [ ] `exoctl flow run` executes flow and creates report
- [ ] `exoctl flow validate` catches schema errors

---

### Step 7.6: Flow-Aware Request Routing

- **Dependencies:** Steps 7.4, 7.5
- **Rollback:** Ignore `flow` field in requests
- **Action:** Enable requests to specify `flow:` field for multi-agent execution
- **Location:** `src/services/request_router.ts`

**Routing Logic:**

| Request Field | Behavior                        |
| ------------- | ------------------------------- |
| `flow: <id>`  | Route to FlowRunner             |
| `agent: <id>` | Route to AgentRunner (existing) |
| Neither       | Use default agent               |

**Request Frontmatter Example:**

```yaml
---
trace_id: "550e8400-..."
status: pending
flow: code-review
tags: [review, pr-42]
---
```

**Success Criteria:**

- [ ] Requests with `flow:` field routed to FlowRunner
- [ ] Requests with `agent:` field use existing AgentRunner
- [ ] Default behavior unchanged for requests without flow/agent
- [ ] Flow not found → clear error message

---

### Step 7.7: Inter-Step Communication

- **Dependencies:** Step 7.4
- **Rollback:** Steps only receive original request
- **Action:** Implement input/output passing between flow steps
- **Location:** `src/flows/transforms.ts`

**Built-in Transforms:**

| Transform         | Description                                   |
| ----------------- | --------------------------------------------- |
| `passthrough`     | Pass output directly (default)                |
| `mergeAsContext`  | Combine multiple outputs as markdown sections |
| `extractSection`  | Extract specific `## Section` from output     |
| `appendToRequest` | Combine original request with step output     |

**Custom Transforms:** Flows can define inline transform functions in their TypeScript definition.

**Success Criteria:**

- [ ] Step outputs accessible to dependent steps
- [ ] Built-in transforms cover common patterns
- [ ] Custom transforms work in flow definitions
- [ ] Transform errors produce clear messages

---

### Step 7.8: Flow Reports

- **Dependencies:** Steps 7.4, Step 3.4 (Mission Reporter)
- **Rollback:** Generate simple report without flow details
- **Action:** Generate detailed reports for flow executions
- **Location:** `src/services/flow_reporter.ts`

**Report Frontmatter Fields:**

| Field             | Description              |
| ----------------- | ------------------------ |
| `type`            | `"flow_report"`          |
| `flow`            | Flow ID                  |
| `flow_run_id`     | Execution UUID           |
| `duration_ms`     | Total execution time     |
| `steps_completed` | Count of completed steps |
| `steps_failed`    | Count of failed steps    |

**Report Body Sections:**

1. **Execution Summary** — Table of steps with status and duration
2. **Step Outputs** — Each step's output as subsection
3. **Dependency Graph** — ASCII visualization of flow structure

**Success Criteria:**

- [ ] Flow reports include all step results
- [ ] Failed steps show error details
- [ ] Duration tracked per step and total
- [ ] Report queryable via Dataview

---

### Step 7.9: Example Flows

- **Dependencies:** Steps 7.1–7.8
- **Rollback:** N/A (example files only)
- **Action:** Create example flows demonstrating common patterns

**Included Examples:**

| Flow                          | Pattern        | Steps                                   |
| ----------------------------- | -------------- | --------------------------------------- |
| `code_review.flow.ts`         | Pipeline       | Lint → Security → Review → Summary      |
| `feature_development.flow.ts` | Staged         | Architect → Implement → Test → Document |
| `documentation.flow.ts`       | Pipeline       | Analyze → Draft → Review → Format       |
| `research.flow.ts`            | Fan-Out/Fan-In | Researchers (×3) → Synthesizer          |

**Success Criteria:**

- [ ] Each example flow runs successfully with mock agents
- [ ] Examples documented with use cases
- [ ] Examples serve as templates for custom flows

---

### Phase 7 Exit Criteria

- [ ] `FlowSchema` validates flow definitions
- [ ] `DependencyResolver` correctly orders steps and detects cycles
- [ ] `FlowRunner` executes parallel and sequential flows
- [ ] CLI commands (`flow list/show/run/plan/validate`) working
- [ ] Requests can specify `flow:` instead of `agent:`
- [ ] Inter-step data passing works via transforms
- [ ] Flow reports generated with step details
- [ ] Example flows demonstrate all patterns
- [ ] All tests pass: `deno test tests/flows/`
- [ ] Documentation updated with Flow usage guide

---

## Phase 8: UX Improvements & UI Evaluation

**Goal:** Reduce friction in the ExoFrame workflow while evaluating whether a dedicated UI is needed beyond Obsidian.

### Context: ExoFrame vs IDE Agents

ExoFrame's value proposition is **not** real-time coding assistance (IDE agents do that better). ExoFrame excels at:

1. **Audit trail & traceability** — trace_id linking everything
2. **Asynchronous workflows** — drop request, come back later
3. **Explicit approval gates** — no accidental destructive changes
4. **Multi-project context** — portals span multiple codebases

However, the current "drop a markdown file" workflow has friction. This phase addresses that.

---

### Step 8.1: UI Strategy Evaluation

**Problem:** Obsidian with Dataview provides read-only dashboards, but lacks:

- Real-time status updates
- Interactive approval buttons
- Diff viewing
- Log streaming

**Evaluation Matrix:**

| Option                            | Pros                                   | Cons                                        | Effort |
| --------------------------------- | -------------------------------------- | ------------------------------------------- | ------ |
| **A. Obsidian + Dataview**        | Already integrated, no new deps        | Static, no interactivity, requires Obsidian | Low    |
| **B. Obsidian Plugin**            | Native integration, familiar UI        | Requires Obsidian, plugin maintenance       | Medium |
| **C. Web Dashboard (Fresh/Deno)** | Full interactivity, no Obsidian needed | New dependency, deployment complexity       | High   |
| **D. TUI (Terminal UI)**          | No browser, fits CLI workflow          | Limited visualization, learning curve       | Medium |
| **E. VS Code Extension**          | Integrated with dev workflow           | VS Code only, extension maintenance         | Medium |

**Recommendation:** Start with **Option A** (Obsidian + Dataview) for MVP, evaluate **Option C** (Web Dashboard) for v2.0 if users request it.

**Decision Criteria for Web UI:**

- [ ] 50% of users don't use Obsidian
- [ ] Users request real-time log streaming
- [ ] Users need mobile/remote access
- [ ] Complex approval workflows needed

**If Web UI is chosen (Future):**

```typescript
// src/ui/server.ts (Future - not in MVP)
import { Application, Router } from "jsr:@oak/oak";

const app = new Application();
const router = new Router();

router.get("/api/plans", async (ctx) => {
  const plans = await planService.list();
  ctx.response.body = plans;
});

router.post("/api/plans/:id/approve", async (ctx) => {
  await planService.approve(ctx.params.id);
  ctx.response.body = { success: true };
});

// WebSocket for real-time updates
router.get("/ws", (ctx) => {
  const socket = ctx.upgrade();
  activityJournal.subscribe((event) => {
    socket.send(JSON.stringify(event));
  });
});
```

---

### Step 8.2: Obsidian Dashboard Enhancement

**Current State:** Basic Dataview queries exist but are underdeveloped.

**Enhancements:**

1. **Status Dashboard** (`Knowledge/Dashboard.md`)

```markdown
# ExoFrame Dashboard

## Daemon Status

\`\`\`dataview
TABLE WITHOUT ID
"🟢 Running" as Status,
file.mtime as "Last Activity"
FROM "System"
WHERE file.name = "daemon.pid"
\`\`\`

## Pending Plans

\`\`\`dataview
TABLE status, created, agent
FROM "Inbox/Plans"
WHERE status = "review"
SORT created DESC
\`\`\`

## Recent Activity

\`\`\`dataview
TABLE action_type, actor, target, timestamp
FROM "System/activity_export.md"
SORT timestamp DESC
LIMIT 20
\`\`\`

## Active Portals

\`\`\`dataview
TABLE target, status
FROM "Knowledge/Portals"
SORT file.name ASC
\`\`\`
```

2. **Activity Export Script** (for Dataview consumption)

```typescript
// scripts/export_activity.ts
// Exports recent activity to markdown for Dataview queries

const activities = await db.getRecentActivity(100);
const markdown = activities.map((a) => `| ${a.action_type} | ${a.actor} | ${a.target} | ${a.timestamp} |`).join("\n");

await Deno.writeTextFile(
  "System/activity_export.md",
  `
# Activity Log

| Action | Actor | Target | Time |
|--------|-------|--------|------|
${markdown}
`,
);
```

**Limitations Accepted:**

- No real-time updates (must refresh)
- No interactive buttons (use CLI for actions)
- Requires Obsidian + Dataview plugin

---

### Step 8.3: VS Code Integration (Future Consideration)

**If VS Code extension is prioritized:**

```typescript
// vscode-exoframe/src/extension.ts (Future)
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  // Command: Create Request
  context.subscriptions.push(
    vscode.commands.registerCommand("exoframe.createRequest", async () => {
      const description = await vscode.window.showInputBox({
        prompt: "What should the agent do?",
        placeHolder: "Implement user authentication...",
      });

      if (description) {
        const terminal = vscode.window.createTerminal("ExoFrame");
        terminal.sendText(`exoctl request "${description}"`);
      }
    }),
  );

  // Status bar item
  const statusBar = vscode.window.createStatusBarItem();
  statusBar.text = "$(robot) ExoFrame";
  statusBar.command = "exoframe.showStatus";
  statusBar.show();
}
```

**Decision:** Defer to v2.0 unless strong user demand.

---

### Step 8.4: Documentation Updates

Update all docs to reflect new positioning:

1. **White Paper:** ✅ Updated Executive Summary (v1.6.0)
2. **User Guide:** Add quick request examples
3. **README:** Clarify "when to use ExoFrame vs IDE agents"

**README Update:**

```markdown
## When to Use ExoFrame

| Scenario                          | Tool                           |
| --------------------------------- | ------------------------------ |
| Quick code fix while coding       | Use IDE agent (Copilot/Cursor) |
| Interactive feature development   | Use IDE agent                  |
| **Overnight batch processing**    | **ExoFrame**                   |
| **Audit/compliance requirements** | **ExoFrame**                   |
| **Multi-project refactoring**     | **ExoFrame**                   |
| **Air-gapped environments**       | **ExoFrame**                   |

ExoFrame is not competing with IDE agents for real-time assistance.
It's an **auditable agent orchestration platform** for async workflows.
```

---

### Phase 8 Exit Criteria

- [ ] `exoctl request` command implemented and tested
- [ ] UI evaluation document created with decision
- [ ] Obsidian dashboard templates in `Knowledge/`
- [ ] Documentation updated with clear positioning
- [ ] User Guide includes quick request examples

---

## Phase 9: Third-Party LLM Providers

> **Status:** 📋 PLANNED\
> **Prerequisites:** Phases 1–8 (Core system stable with Ollama/Mock providers)\
> **Goal:** Enable production workloads with cloud LLM providers (Anthropic, OpenAI, Google).

### Overview

Phase 9 extends ExoFrame's `IModelProvider` architecture to support major cloud LLM providers. This enables users to
leverage state-of-the-art models while maintaining the same agent workflow.

**Why a Separate Phase?**

- Core system can ship with local-only (Ollama) support
- Cloud providers require API key management, rate limiting, billing tracking
- Each provider has unique authentication and payload formats
- Allows thorough testing of provider-specific edge cases

### Supported Providers & Models

#### Anthropic (Claude)

| Model                        | Context Window | Use Case                  |
| ---------------------------- | -------------- | ------------------------- |
| `claude-sonnet-4-20250514`   | 200K           | Default for complex tasks |
| `claude-3-5-sonnet-20241022` | 200K           | Balanced speed/quality    |
| `claude-3-5-haiku-20241022`  | 200K           | Fast, cost-effective      |
| `claude-3-opus-20240229`     | 200K           | Most capable (expensive)  |

#### OpenAI (GPT)

| Model         | Context Window | Use Case                          |
| ------------- | -------------- | --------------------------------- |
| `gpt-4o`      | 128K           | Default multimodal                |
| `gpt-4o-mini` | 128K           | Fast, cost-effective              |
| `gpt-4-turbo` | 128K           | Previous generation               |
| `o1`          | 200K           | Advanced reasoning                |
| `o1-mini`     | 128K           | Fast reasoning                    |
| `o3-mini`     | 200K           | Latest reasoning (when available) |

#### Google (Gemini)

| Model                   | Context Window | Use Case             |
| ----------------------- | -------------- | -------------------- |
| `gemini-2.0-flash`      | 1M             | Fast, multimodal     |
| `gemini-2.0-flash-lite` | 1M             | Fastest, lowest cost |
| `gemini-1.5-pro`        | 2M             | Largest context      |
| `gemini-1.5-flash`      | 1M             | Balanced             |

---

### Step 9.1: Anthropic Provider

- **Dependencies:** Step 3.1 (IModelProvider interface)
- **Rollback:** Fall back to Ollama/Mock
- **Action:** Implement `AnthropicProvider` class
- **Location:** `src/ai/providers/anthropic.ts`

```typescript
export class AnthropicProvider implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = "https://api.anthropic.com/v1/messages";

  constructor(options: { apiKey: string; model?: string; id?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "claude-sonnet-4-20250514";
    this.id = options.id ?? `anthropic-${this.model}`;
  }

  async generate(prompt: string, options?: ModelOptions): Promise<string> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options?.max_tokens ?? 4096,
        messages: [{ role: "user", content: prompt }],
        temperature: options?.temperature,
        top_p: options?.top_p,
        stop_sequences: options?.stop,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ProviderError(this.id, error.error?.message ?? response.statusText);
    }

    const data = await response.json();
    return data.content[0].text;
  }
}
```

**Success Criteria:**

- [ ] Sends correct headers (`x-api-key`, `anthropic-version`)
- [ ] Formats messages array correctly
- [ ] Handles rate limit (429) with retry
- [ ] Reports token usage from response

---

### Step 9.2: OpenAI Provider

- **Dependencies:** Step 3.1 (IModelProvider interface)
- **Rollback:** Fall back to Ollama/Mock
- **Action:** Implement `OpenAIProvider` class
- **Location:** `src/ai/providers/openai.ts`

```typescript
export class OpenAIProvider implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options: {
    apiKey: string;
    model?: string;
    baseUrl?: string; // For Azure OpenAI or proxies
    id?: string;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-4o";
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1/chat/completions";
    this.id = options.id ?? `openai-${this.model}`;
  }

  async generate(prompt: string, options?: ModelOptions): Promise<string> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: options?.max_tokens,
        temperature: options?.temperature,
        top_p: options?.top_p,
        stop: options?.stop,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ProviderError(this.id, error.error?.message ?? response.statusText);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
}
```

**Success Criteria:**

- [ ] Sends correct Authorization header
- [ ] Supports custom baseUrl for Azure OpenAI
- [ ] Handles rate limit (429) with retry
- [ ] Reports token usage from response

---

### Step 9.3: Google Provider (Gemini)

- **Dependencies:** Step 3.1 (IModelProvider interface)
- **Rollback:** Fall back to Ollama/Mock
- **Action:** Implement `GoogleProvider` class
- **Location:** `src/ai/providers/google.ts`

```typescript
export class GoogleProvider implements IModelProvider {
  public readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

  constructor(options: { apiKey: string; model?: string; id?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gemini-2.0-flash";
    this.id = options.id ?? `google-${this.model}`;
  }

  async generate(prompt: string, options?: ModelOptions): Promise<string> {
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: options?.max_tokens,
          temperature: options?.temperature,
          topP: options?.top_p,
          stopSequences: options?.stop,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ProviderError(this.id, error.error?.message ?? response.statusText);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }
}
```

**Success Criteria:**

- [ ] Sends API key in URL query parameter
- [ ] Formats contents/parts structure correctly
- [ ] Handles rate limit (429) with retry
- [ ] Reports token usage from response

---

### Step 9.4: Common Infrastructure

- **Dependencies:** Steps 9.1–9.3
- **Rollback:** N/A
- **Action:** Implement shared error handling, retry logic, and token tracking
- **Location:** `src/ai/providers/common.ts`

#### Error Types

| Error Type            | Cause                 | Retry?                |
| --------------------- | --------------------- | --------------------- |
| `AuthenticationError` | Invalid API key       | No                    |
| `RateLimitError`      | Too many requests     | Yes (with backoff)    |
| `QuotaExceededError`  | Billing limit reached | No                    |
| `ModelNotFoundError`  | Invalid model name    | No                    |
| `ContextLengthError`  | Prompt too long       | No (truncate context) |
| `ConnectionError`     | Network failure       | Yes                   |
| `TimeoutError`        | Request timeout       | Yes                   |

#### Retry Logic

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelayMs: number },
): Promise<T> {
  let lastError: Error;
  for (let i = 0; i < options.maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error)) throw error;
      lastError = error;
      await sleep(options.baseDelayMs * Math.pow(2, i));
    }
  }
  throw lastError!;
}
```

#### Token Usage Tracking

```typescript
export interface GenerateResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
}
```

**Success Criteria:**

- [ ] Retry logic uses exponential backoff
- [ ] Rate limit errors trigger retry
- [ ] Auth/quota errors do not retry
- [ ] Token usage logged to Activity Journal

---

### Step 9.5: Configuration & Factory Updates

- **Dependencies:** Steps 9.1–9.4
- **Rollback:** Revert config schema changes
- **Action:** Update config schema and ModelFactory
- **Location:** `src/config/schema.ts`, `src/ai/providers.ts`

#### Configuration Schema

```toml
[models.default]
provider = "anthropic"           # "anthropic" | "openai" | "google" | "ollama"
model = "claude-sonnet-4-20250514"

[models.fast]
provider = "openai"
model = "gpt-4o-mini"

[models.local]
provider = "ollama"
model = "llama3.2"

# API keys loaded from environment variables:
# ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY
```

#### Updated ModelFactory

```typescript
export class ModelFactory {
  static create(config: ModelConfig): IModelProvider {
    switch (config.provider) {
      case "mock":
        return new MockProvider(config.response ?? "Mock response");
      case "ollama":
        return new OllamaProvider({ model: config.model, baseUrl: config.baseUrl });
      case "anthropic":
        return new AnthropicProvider({
          apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? config.apiKey,
          model: config.model,
        });
      case "openai":
        return new OpenAIProvider({
          apiKey: Deno.env.get("OPENAI_API_KEY") ?? config.apiKey,
          model: config.model,
          baseUrl: config.baseUrl,
        });
      case "google":
        return new GoogleProvider({
          apiKey: Deno.env.get("GOOGLE_API_KEY") ?? config.apiKey,
          model: config.model,
        });
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }
}
```

**Success Criteria:**

- [ ] Config schema validates provider/model combinations
- [ ] ModelFactory creates correct provider from config
- [ ] Missing API key throws `AuthenticationError`
- [ ] Environment variables take precedence over config file

---

### Phase 9 Exit Criteria

- [ ] `AnthropicProvider` implemented with all models
- [ ] `OpenAIProvider` implemented with all models (+ Azure support)
- [ ] `GoogleProvider` implemented with Gemini 2.0 models
- [ ] Retry logic with exponential backoff for rate limits
- [ ] Token usage tracking logged to Activity Journal
- [ ] Config schema supports multi-provider selection
- [ ] Integration tests for each provider (with mocked HTTP)
- [ ] Documentation updated with provider setup instructions

---

## Phase 10: MCP API Integration (Future Enhancement)

**Duration:** 1-2 weeks  
**Prerequisites:** Phase 4 (CLI Architecture) complete  
**Goal:** Add Model Context Protocol (MCP) server interface for programmatic ExoFrame interaction

### Overview

Implement an MCP server that exposes ExoFrame operations as standardized tools, enabling external AI assistants (Claude Desktop, Cline, IDE agents) to interact with ExoFrame programmatically while preserving the file-based core architecture.

### Step 10.1: MCP Server Foundation

**Implementation:**

```typescript
// src/mcp/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export class ExoFrameMCPServer {
  private server: Server;
  private config: Config;
  private db: DatabaseService;

  constructor(config: Config, db: DatabaseService) {
    this.config = config;
    this.db = db;
    this.server = new Server(
      {
        name: "exoframe",
        version: "1.7.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "exoframe_create_request",
          description: "Create a new request for ExoFrame agents",
          inputSchema: {
            type: "object",
            properties: {
              description: { type: "string" },
              agent: { type: "string", default: "default" },
              context: { type: "array", items: { type: "string" } },
            },
            required: ["description"],
          },
        },
        {
          name: "exoframe_list_plans",
          description: "List pending plans awaiting approval",
          inputSchema: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["pending", "approved", "rejected"] },
            },
          },
        },
        {
          name: "exoframe_approve_plan",
          description: "Approve a pending plan",
          inputSchema: {
            type: "object",
            properties: {
              plan_id: { type: "string" },
            },
            required: ["plan_id"],
          },
        },
        {
          name: "exoframe_query_journal",
          description: "Query the Activity Journal for recent events",
          inputSchema: {
            type: "object",
            properties: {
              trace_id: { type: "string" },
              limit: { type: "number", default: 50 },
            },
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "exoframe_create_request":
          return await this.createRequest(args);
        case "exoframe_list_plans":
          return await this.listPlans(args);
        case "exoframe_approve_plan":
          return await this.approvePlan(args);
        case "exoframe_query_journal":
          return await this.queryJournal(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
```

**Success Criteria:**

1. [ ] MCP server starts via `exoctl mcp start`
2. [ ] Server exposes standard MCP capabilities
3. [ ] Stdio transport for local connections
4. [ ] Server metadata includes name and version
5. [ ] Graceful shutdown on SIGTERM

### Step 10.2: Tool Implementations

**Request Creation Tool:**

```typescript
private async createRequest(args: any) {
  const requestCmd = new RequestCommands(
    { config: this.config, db: this.db },
    this.config.system.root
  );
  
  const result = await requestCmd.create(
    args.description,
    args.agent || "default",
    args.context || []
  );
  
  return {
    content: [
      {
        type: "text",
        text: `Request created: ${result.path}\nTrace ID: ${result.trace_id}`,
      },
    ],
  };
}
```

**Plan Listing Tool:**

```typescript
private async listPlans(args: any) {
  const planCmd = new PlanCommands(
    { config: this.config, db: this.db },
    this.config.system.root
  );
  
  const plans = await planCmd.list(args.status);
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(plans, null, 2),
      },
    ],
  };
}
```

**Journal Query Tool:**

```typescript
private async queryJournal(args: any) {
  const activities = args.trace_id
    ? await this.db.getActivitiesByTraceId(args.trace_id)
    : await this.db.getRecentActivities(args.limit || 50);
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(activities, null, 2),
      },
    ],
  };
}
```

**Success Criteria:**

1. [ ] `exoframe_create_request` creates request files
2. [ ] `exoframe_list_plans` returns pending plans
3. [ ] `exoframe_approve_plan` approves plans
4. [ ] `exoframe_query_journal` queries Activity Journal
5. [ ] All operations logged to Activity Journal
6. [ ] Error responses follow MCP error schema

### Step 10.3: Client Integration Examples

**Claude Desktop Configuration:**

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "exoframe": {
      "command": "exoctl",
      "args": ["mcp", "start"],
      "env": {
        "EXOFRAME_ROOT": "/Users/alice/ExoFrame"
      }
    }
  }
}
```

**Cline Integration:**

```json
// .vscode/settings.json
{
  "cline.mcpServers": {
    "exoframe": {
      "command": "exoctl",
      "args": ["mcp", "start"]
    }
  }
}
```

**Success Criteria:**

1. [ ] Documentation for Claude Desktop setup
2. [ ] Documentation for Cline/IDE integration
3. [ ] Example prompts for using MCP tools
4. [ ] Troubleshooting guide for MCP connections

### Step 10.4: Testing & Documentation

**Test Coverage:**

```typescript
// tests/mcp/server_test.ts
Deno.test("MCP Server - create request tool", async () => {
  const server = new ExoFrameMCPServer(config, db);
  const result = await server.createRequest({
    description: "Test request",
    agent: "default",
  });
  
  assert(result.content[0].text.includes("Request created"));
});

Deno.test("MCP Server - list plans tool", async () => {
  const server = new ExoFrameMCPServer(config, db);
  const result = await server.listPlans({ status: "pending" });
  
  const plans = JSON.parse(result.content[0].text);
  assert(Array.isArray(plans));
});
```

**Documentation Updates:**

- User Guide: New "MCP Integration" section
- Technical Spec: MCP architecture diagram
- Examples: Common MCP workflows

**Success Criteria:**

1. [ ] Unit tests for all MCP tools
2. [ ] Integration test with MCP client
3. [ ] Documentation in User Guide
4. [ ] Architecture diagram updated
5. [ ] Example repository with MCP configurations

### Phase 10 Benefits

**For Users:**

- Automate ExoFrame workflows from AI assistants
- Integrate with existing IDE agents
- Programmatic access without learning CLI

**For Developers:**

- Standard MCP protocol (no custom API)
- Local-first (no cloud dependencies)
- Full audit trail in Activity Journal
- Complements file-based architecture

**For Ecosystem:**

- ExoFrame becomes MCP-compatible tool
- Works with any MCP client (Claude, Cline, etc.)
- Positions ExoFrame as infrastructure layer

### Phase 10 Exit Criteria

- [ ] MCP server implemented with stdio transport
- [ ] All core tools implemented (create, list, approve, query)
- [ ] Activity Journal logging for all MCP operations
- [ ] Integration tests with MCP client
- [ ] Documentation for Claude Desktop setup
- [ ] Documentation for IDE integration
- [ ] Example configurations repository
- [ ] User Guide updated with MCP section

---

_End of Implementation Plan_
````
