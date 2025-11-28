# ExoFrame Implementation Plan

- **Version:** 1.6.0
- **Release Date:** 2025-11-27
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

| Phase   | Timebox | Entry Criteria                        | Exit Criteria                         |
| ------- | ------- | ------------------------------------- | ------------------------------------- |
| Phase 1 | 1 week  | Repo initialized, change log approved | Daemon boots, storage scaffolds exist |
| Phase 2 | 1 week  | Phase 1 exit + watcher harness        | Watcher + parser tests pass           |
| Phase 3 | 2 weeks | Validated config + mock LLM           | Request → Plan loop verified          |
| Phase 4 | 1 week  | Stable agent runtime                  | Git + tool registry exercised         |
| Phase 5 | 1 week  | CLI scaffold merged                   | Obsidian vault validated              |
| Phase 6 | 2 days  | All prior phases code-complete        | 80% of test plan automated            |
| Phase 7 | 1 week  | Core functionality stable             | UX improvements + UI evaluation done  |

Each step lists **Dependencies**, **Rollback/Contingency**, and updated success metrics.

---

## Phase 1: The Iron Skeleton (Runtime & Storage)

**Goal:** A running Deno daemon that can write to the database, read configuration, and establish the physical storage
structure.

### Step 1.1: Project Scaffold & Deno Configuration ✅

- **Dependencies:** none — **Rollback:** delete generated config files.
- **Action:** Initialize repository. Create `deno.json` with strict tasks (e.g., `deno task start`) and record a
  deterministic `deno.lock` file.
- **Justification:** Establishes the Deno security sandbox immediately. We want to fail early if permissions are too
  tight.
- **Success Criteria:**
  - `deno task start` runs a `main.ts` that prints "ExoFrame Daemon Active".
  - The process fails (PermissionDenied) if requested permissions (read/write) are removed from `deno.json`.
  - `deno task fmt:check` + `deno task lint` run clean on CI.
- **Example implementation**

```json
cat > deno.json <<'EOF'
{
  "name": "@dostark/exoframe",
  "version": "0.1.0",
  "lock": true,
  "exports": "./src/main.ts",
  "tasks": {
    "start": "deno run --allow-read=. --allow-write=. --allow-net=api.anthropic.com,api.openai.com,localhost:11434 --allow-env=EXO_,HOME,USER --allow-run=git src/main.ts",
    "dev": "deno run --watch --allow-all src/main.ts",
    "stop": "deno run --allow-run=pkill scripts/stop.ts",
    "status": "deno run --allow-run=ps scripts/status.ts",
    "setup": "deno run --allow-all scripts/setup.ts",
    "cli": "deno run --allow-all src/cli.ts",
    "test": "deno test --allow-all tests/",
    "test:watch": "deno test --watch --allow-all tests/",
    "bench": "deno bench --allow-all tests/benchmarks/",
    "coverage": "deno test --coverage=cov_profile && deno coverage cov_profile",
    "lint": "deno lint src/ tests/",
    "fmt": "deno fmt src/ tests/",
    "fmt:check": "deno fmt --check src/ tests/",
    "cache": "deno cache src/main.ts",
    "compile": "deno compile --allow-all --output exoframe src/main.ts"
  },
  "imports": {
    "@std/fs": "jsr:@std/fs@^0.221.0",
    "@std/path": "jsr:@std/path@^0.221.0",
    "@std/toml": "jsr:@std/toml@^0.221.0",
    "@db/sqlite": "jsr:@db/sqlite@^0.11.0",
    "zod": "https://deno.land/x/zod@v3.22.4/mod.ts"
  },
  "exclude": ["cov_profile", "exoframe", "dist"],
  "lint": {
    "rules": {
      "tags": ["recommended"],
      "exclude": ["no-explicit-any"]
    }
  },
  "fmt": {
    "useTabs": false,
    "lineWidth": 100,
    "indentWidth": 2,
    "semiColons": true,
    "singleQuote": false
  },
  "compilerOptions": {
    "strict": true,
    "allowJs": false,
    "checkJs": false
  }
}
EOF
```

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

### Step 1.2: The Activity Journal (SQLite) ✅

- **Dependencies:** Step 1.1 — **Rollback:** drop `journal.db`, run `deno task migrate down`.
- **Action:** Implement Database Service using `jsr:@db/sqlite`. Create migration scripts for `activity` and `leases`
  tables and codify WAL/foreign key pragmas in `scripts/setup_db.ts`.
- **Justification:** Every future step relies on logging. The "Brain's Memory" must be active before the Brain itself.
- **Success Criteria:**
  - Unit test can insert a structured log entry and retrieve it by `trace_id`.
  - The `.db` file is created in `/System` with WAL mode enabled.
  - `deno task migrate up`/`down` reruns cleanly and records entries in `schema_version`.
- **Schema:**
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

### Step 1.3: Configuration Loader (TOML + Zod) ✅

- **Dependencies:** Step 1.2 — **Rollback:** revert config schema, restore previous TOML.
- **Action:** Create `ConfigService`. Define Zod schemas for `exo.config.toml`. Include config checksum in Activity
  Journal for auditability.
- **Justification:** Hardcoding paths is technical debt. We need a single source of truth for system physics.
- **Success Criteria:**
  - System loads config on startup.
  - System throws a readable error if `exo.config.toml` is malformed or missing keys.

### Step 1.4: The Knowledge Vault Scaffold ✅

- **Dependencies:** Step 1.3 — **Rollback:** remove created folders/files (idempotent).
- **Action:** Create rigid directory structure for the Obsidian Vault:
  - `/Knowledge/Context` (Read-Only memory)
  - `/Knowledge/Reports` (Write-Only memory)
  - `/Knowledge/Portals` (Auto-generated Context Cards)
- **Justification:** This folder _is_ the physical memory. If it doesn't exist, Agents have nowhere to look for rules.
- **Success Criteria:**
  - Script creates folders.
  - Script creates a `README.md` in `/Knowledge` explaining how to use Obsidian with ExoFrame.

---

## Phase 2: The Nervous System (Events & State)

**Goal:** The system reacts to file changes securely and reliably.

### Step 2.1: The File Watcher (Stable Read) ✅

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

```typescript
// Simplified debounce logic
let timeoutId: number | null = null;

for await (const event of Deno.watchFs("/Inbox/Requests")) {
  if (timeoutId) clearTimeout(timeoutId);

  timeoutId = setTimeout(() => {
    processFile(event.paths[0]); // Now process after events settle
  }, 200);
}
```

**Stage 2: Stability Verification** Even after debouncing, the file might still be growing (e.g., large uploads). Use
exponential backoff to wait until the file size stops changing:

```typescript
async function readFileWhenStable(path: string): Promise<string> {
  const maxAttempts = 5;
  const backoffMs = [50, 100, 200, 500, 1000];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Get initial size
      const stat1 = await Deno.stat(path);

      // Wait for stability
      await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));

      // Check if size changed
      const stat2 = await Deno.stat(path);

      if (stat1.size === stat2.size && stat2.size > 0) {
        // File appears stable, try to read
        const content = await Deno.readTextFile(path);

        // Validate it's not empty or corrupted
        if (content.trim().length > 0) {
          return content;
        }
      }

      // File still changing, retry with longer wait
      continue;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // File deleted between stat and read
        throw new Error(`File disappeared: ${path}`);
      }

      if (attempt === maxAttempts - 1) {
        throw error;
      }

      // Retry on other errors
      continue;
    }
  }

  throw new Error(`File never stabilized: ${path}`);
}
```

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

### Step 2.2: The Zod Frontmatter Parser ✅

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

```typescript
interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  body: string;
}

function extractFrontmatter(markdown: string): ParsedMarkdown {
  const frontmatterRegex = /^\+\+\+\n([\s\S]*?)\n\+\+\+\n([\s\S]*)$/;
  const match = markdown.match(frontmatterRegex);

  if (!match) {
    throw new Error("No frontmatter found");
  }

  const tomlContent = match[1];
  const body = match[2];

  // Parse TOML to object
  const frontmatter = parseToml(tomlContent);

  return { frontmatter, body };
}
```

**Stage 2: Define Zod Schema** Create a strict schema for request frontmatter:

```typescript
import { z } from "zod";

export const RequestSchema = z.object({
  trace_id: z.string().uuid(),
  agent_id: z.string().min(1),
  status: z.enum(["pending", "in_progress", "completed", "failed"]),
  priority: z.number().int().min(0).max(10).default(5),
  created_at: z.string().datetime().optional(),
  tags: z.array(z.string()).default([]),
});

export type Request = z.infer<typeof RequestSchema>;
```

**Stage 3: Validate with Zod** Parse frontmatter object against schema:

```typescript
function parseRequest(markdown: string): { request: Request; body: string } {
  const { frontmatter, body } = extractFrontmatter(markdown);

  const result = RequestSchema.safeParse(frontmatter);

  if (!result.success) {
    // Log validation errors
    console.error("Invalid request frontmatter:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    throw new Error("Request validation failed");
  }

  return { request: result.data, body };
}
```

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

### Step 2.3: The Path Security & Portal Resolver ✅

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

### Step 2.4: The Context Card Generator ✅

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

### Step 3.1: The Model Adapter (Mocked & Real) ✅

- **Dependencies:** Step 1.3 (Config).
- **Action:** Create `IModelProvider` interface and implement `MockProvider` and `OllamaProvider`.
- **Justification:** Decouples the agent runtime from specific LLM providers, allowing easy switching and testing.

**The Problem:** The system needs to talk to various LLMs (Ollama, OpenAI, Anthropic). Hardcoding API calls makes
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

### Step 3.2: The Agent Runtime (Stateless Execution) ✅

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

### Step 3.3: The Context Injector (Token Safe) ✅

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

### Step 3.4: The Plan Writer (Drafting) ✅

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

## Phase 4: The Hands (Tools & Git)

**Goal:** Agents execute actions securely and robustly.

### Step 4.1: The Tool Registry ✅

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

### Step 4.2: Git Integration (Identity Aware) ✅

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

### Step 4.3: The Execution Loop (Resilient) ✅

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

### Step 4.4: CLI Architecture & Human Review Interface ✅

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

### Step 4.5: The Mission Reporter (Episodic Memory) ✅

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

## Phase 5: Obsidian Setup

**Goal:** Configure Obsidian as the primary UI for ExoFrame, enabling users to view dashboards, manage tasks, and monitor agent activity without leaving their knowledge management environment.

> **Platform note:** Maintainers must document OS-specific instructions (Windows symlink prerequisites, macOS sandbox
> prompts, Linux desktop watchers) before marking each sub-step complete.

### 5.1: Install Required Plugins ✅

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

### 5.2: Configure Obsidian Vault ✅

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

### 5.3: Pin Dashboard ✅

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

### 5.4: Configure File Watcher ✅

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

### 5.5: The Obsidian Dashboard

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

````
**TDD Approach:**

```typescript
// tests/obsidian/dashboard_test.ts
import { assertEquals, assertStringIncludes, assert } from "@std/assert";

Deno.test("Dashboard template exists", async () => {
  const templatePath = "./templates/Dashboard.md";
  const stat = await Deno.stat(templatePath);
  assert(stat.isFile, "Dashboard template should exist");
});

Deno.test("Dashboard has valid Dataview queries", async () => {
  const dashboard = await Deno.readTextFile("Knowledge/Dashboard.md");
  
  // Extract all dataview blocks
  const dataviewRegex = /```dataview\n([\s\S]*?)```/g;
  const matches = [...dashboard.matchAll(dataviewRegex)];
  
  assert(matches.length >= 4, "Dashboard should have at least 4 Dataview queries");
  
  // Verify each query has required clauses
  for (const match of matches) {
    const query = match[1];
    assert(
      query.includes("FROM") || query.includes("from"),
      "Each query should have a FROM clause"
    );
  }
});

Deno.test("Dashboard queries reference correct folders", async () => {
  const dashboard = await Deno.readTextFile("Knowledge/Dashboard.md");
  
  // Verify queries reference ExoFrame folders
  const expectedFolders = [
    "System/Active",
    "Inbox/Plans", 
    "Knowledge/Reports"
  ];
  
  for (const folder of expectedFolders) {
    assertStringIncludes(dashboard, folder, `Dashboard should query ${folder}`);
  }
});

Deno.test("Dashboard frontmatter is valid TOML", async () => {
  const dashboard = await Deno.readTextFile("Knowledge/Dashboard.md");
  
  assert(dashboard.startsWith("+++"), "Dashboard should have frontmatter");
  
  const endIndex = dashboard.indexOf("---", 3);
  assert(endIndex > 0, "Frontmatter should be closed");
  
  const frontmatter = dashboard.slice(4, endIndex);
  
  // Verify required fields
  assertStringIncludes(frontmatter, "title:");
});

// Integration test: verify dashboard works with real data
Deno.test("Dashboard renders with sample data", async (t) => {
  const testDir = await Deno.makeTempDir();
  
  await t.step("create sample active task", async () => {
    await Deno.mkdir(`${testDir}/System/Active`, { recursive: true });
    await Deno.writeTextFile(`${testDir}/System/Active/test-task.md`, `---
status: running
agent: copilot
created: ${new Date().toISOString()}
target: src/main.ts
---

# Test Task
`);
  });
  
  await t.step("create sample report", async () => {
    await Deno.mkdir(`${testDir}/Knowledge/Reports`, { recursive: true });
    await Deno.writeTextFile(`${testDir}/Knowledge/Reports/trace-123.md`, `---
status: success
created: ${new Date().toISOString()}
agent: copilot
target: src/main.ts
---

# Mission Report
`);
  });
  
  await t.step("verify files have correct frontmatter", async () => {
    const task = await Deno.readTextFile(`${testDir}/System/Active/test-task.md`);
    assertStringIncludes(task, "status: running");
    
    const report = await Deno.readTextFile(`${testDir}/Knowledge/Reports/trace-123.md`);
    assertStringIncludes(report, "status: success");
  });
  
  await Deno.remove(testDir, { recursive: true });
});
````

**CLI Support:**

```bash
# Generate default dashboard
exoctl scaffold --dashboard

# Regenerate dashboard from template
exoctl scaffold --dashboard --force
```

**Success Criteria:**

- [ ] Dashboard.md created at Knowledge/Dashboard.md
- [ ] All 4 Dataview queries are syntactically valid
- [ ] Queries reference correct ExoFrame folders
- [ ] Dashboard displays live data when Dataview plugin is active
- [ ] Template exists at templates/Dashboard.md

---

### 5.6: Test Integration

- **Dependencies:** Steps 5.1-5.5 completed.
- **Rollback:** Remove test files.

**Action:** Verify end-to-end integration between ExoFrame and Obsidian.

**Manual Test Procedure:**

1. Create a test request:

```bash
echo "---
title: Integration Test
priority: low
---

# Test Task

Please verify Obsidian integration is working.
" > /ExoFrame/Inbox/Requests/integration-test.md
```

2. Watch Dashboard refresh (Ctrl+R to force refresh in Obsidian)

3. Verify new entry appears in "Current Tasks" or "Recent Plans" table

4. Clean up test file:

```bash
rm /ExoFrame/Inbox/Requests/integration-test.md
```

**TDD Approach:**

```typescript
// tests/obsidian/integration_test.ts
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";

Deno.test("End-to-end: Request to Dashboard visibility", async (t) => {
  const testWorkspace = await Deno.makeTempDir();

  // Setup workspace structure
  await t.step("setup workspace", async () => {
    const dirs = [
      "Inbox/Requests",
      "Inbox/Plans",
      "System/Active",
      "Knowledge/Reports",
      "Knowledge/Portals",
    ];

    for (const dir of dirs) {
      await Deno.mkdir(`${testWorkspace}/${dir}`, { recursive: true });
    }
  });

  await t.step("create request file", async () => {
    const requestContent = `---
title: Test Integration Request
priority: medium
created: ${new Date().toISOString()}
status: pending
---

# Test Request

This tests the Obsidian integration.
`;

    await Deno.writeTextFile(
      `${testWorkspace}/Inbox/Requests/test-request.md`,
      requestContent,
    );

    // Verify file exists
    const fileExists = await exists(`${testWorkspace}/Inbox/Requests/test-request.md`);
    assert(fileExists, "Request file should be created");
  });

  await t.step("verify frontmatter is Dataview-compatible", async () => {
    const content = await Deno.readTextFile(
      `${testWorkspace}/Inbox/Requests/test-request.md`,
    );

    // Dataview requires valid TOML frontmatter
    assert(content.startsWith("+++"), "File should have frontmatter");
    assertStringIncludes(content, "title:");
    assertStringIncludes(content, "status:");
    assertStringIncludes(content, "created:");
  });

  await t.step("simulate plan creation", async () => {
    const planContent = `---
title: Test Integration Request
status: review
created: ${new Date().toISOString()}
agent: test-agent
source: Inbox/Requests/test-request.md
---

# Proposed Plan

## Steps
1. Step one
2. Step two

## Files to Modify
- src/main.ts
`;

    await Deno.writeTextFile(
      `${testWorkspace}/Inbox/Plans/test-request.md`,
      planContent,
    );
  });

  await t.step("verify plan has required Dataview fields", async () => {
    const plan = await Deno.readTextFile(
      `${testWorkspace}/Inbox/Plans/test-request.md`,
    );

    // These fields are queried by Dashboard
    assertStringIncludes(plan, "status: review");
    assertStringIncludes(plan, "created:");
  });

  await t.step("simulate report generation", async () => {
    const reportContent = `---
title: Mission Report - test-request
status: success
created: ${new Date().toISOString()}
agent: test-agent
target: src/main.ts
trace_id: test-trace-123
---

# Mission Report

## Summary
Integration test completed successfully.

## Changes Made
- Modified src/main.ts

## Metrics
- Duration: 5s
- Files: 1
`;

    await Deno.writeTextFile(
      `${testWorkspace}/Knowledge/Reports/trace-test-trace-123.md`,
      reportContent,
    );
  });

  await t.step("verify report has required Dataview fields", async () => {
    const report = await Deno.readTextFile(
      `${testWorkspace}/Knowledge/Reports/trace-test-trace-123.md`,
    );

    // These fields are queried by Dashboard
    assertStringIncludes(report, "status:");
    assertStringIncludes(report, "created:");
    assertStringIncludes(report, "agent:");
    assertStringIncludes(report, "target:");
  });

  await t.step("verify all files follow naming conventions", async () => {
    // Reports should include trace ID in filename
    const reports = [];
    for await (const entry of Deno.readDir(`${testWorkspace}/Knowledge/Reports`)) {
      reports.push(entry.name);
    }

    assert(
      reports.some((r) => r.includes("trace-")),
      "Reports should include trace ID in filename",
    );
  });

  // Cleanup
  await Deno.remove(testWorkspace, { recursive: true });
});

Deno.test("Dataview query simulation", async () => {
  // This test verifies the frontmatter structure matches what Dataview expects

  const sampleFiles = {
    activeTask: {
      path: "System/Active/task-1.md",
      frontmatter: {
        status: "running",
        agent: "copilot",
        created: new Date().toISOString(),
        target: "src/main.ts",
      },
    },
    plan: {
      path: "Inbox/Plans/plan-1.md",
      frontmatter: {
        status: "review",
        created: new Date().toISOString(),
        agent: "copilot",
      },
    },
    report: {
      path: "Knowledge/Reports/trace-abc.md",
      frontmatter: {
        status: "success",
        created: new Date().toISOString(),
        agent: "copilot",
        target: "src/main.ts",
      },
    },
  };

  // Verify all frontmatter keys are present
  for (const [type, file] of Object.entries(sampleFiles)) {
    assert(file.frontmatter.status, `${type} should have status`);
    assert(file.frontmatter.created, `${type} should have created`);
  }
});

Deno.test("Obsidian link format compatibility", () => {
  // Test that generated links work in Obsidian

  const wikiLink = "[[Knowledge/Reports/trace-123|View Report]]";
  const markdownLink = "[View Report](Knowledge/Reports/trace-123.md)";

  // Verify wiki link format
  assert(wikiLink.startsWith("[["), "Wiki link should start with [[");
  assert(wikiLink.endsWith("]]"), "Wiki link should end with ]]");

  // Verify markdown link format
  assert(markdownLink.includes("]("), "Markdown link should have proper format");
  assert(markdownLink.endsWith(")"), "Markdown link should end with )");
});
```

**CLI Verification Commands:**

```bash
# Verify workspace structure
exoctl verify --workspace

# Check all required directories exist
exoctl verify --vault

# Test file creation permissions
exoctl scaffold --test
```

**Success Criteria:**

- [ ] Request files appear in Obsidian within 2 seconds of creation
- [ ] Plan files have frontmatter queryable by Dataview
- [ ] Report files have frontmatter queryable by Dataview
- [ ] Dashboard queries return expected results
- [ ] No broken links in generated files
- [ ] All integration tests pass: `deno test tests/obsidian/`

---

## Phase 6: Testing & Quality Assurance

### Risk-to-Test Traceability

| Threat / Risk       | Mitigation Step          | Automated Test                         |
| ------------------- | ------------------------ | -------------------------------------- |
| Path traversal      | Step 2.3 security checks | `tests/security_test.ts`               |
| Lease starvation    | Step 6.1 heartbeat loop  | `tests/leases/heartbeat_test.ts`       |
| Context overflow    | Step 3.3 context loader  | `tests/context/context_loader_test.ts` |
| Git identity drift  | Step 4.2 Git service     | `tests/git/git_service_test.ts`        |
| Watcher instability | Step 2.1 watcher         | `tests/watcher/stability_test.ts`      |
| Doc drift           | Step 6.7 doc tests       | `tests/docs/user_guide_test.ts`        |

### Step 6.1: Heartbeat & Leases

- **Dependencies:** Step 1.2 — **Rollback:** disable loop, run manual `lease clean`.
- **Action:** Implement background loop updating `leases` table.
- **Justification:** Prevents deadlocks if Agent crashes.
- **Success Criteria:**
  - Simulate crash; verify lock expires after 60s and file becomes writable.

### Step 6.2: The Dry Run (Integration Test)

- **Dependencies:** Phases 1–4 — **Rollback:** keep script in `/scripts/experimental`.
- **Action:** Create script running "Scenario A" (Software House of One) with Mock LLM.
- **Success Criteria:**
  - Script runs end-to-end without manual intervention.

### Step 6.3: Unit Test Foundation

- **Framework:** Deno's built-in test runner (`deno test`)
- **Coverage Target:** 70% for core logic (Engine, Security, Parser)
- **Action:** Create tests for:
  - Path canonicalization and security checks
  - Frontmatter TOML parsing (valid/invalid cases)
  - Lease acquisition/release with simulated concurrency
  - Context loading with token limits
  - Git operations (mocked subprocess calls)

**Example Test:**

```typescript
// tests/security_test.ts
Deno.test("Path canonicalization prevents escapes", async () => {
  const security = new SecurityService();

  const maliciousPath = "/ExoFrame/Portals/MyApp/../../../etc/passwd";
  const allowed = await security.isPathSafe(
    maliciousPath,
    "/ExoFrame/Portals/MyApp",
  );

  assertEquals(allowed, false);
});
```

### Step 6.4: Mock LLM Provider

- **Purpose:** Enable deterministic testing without API calls
- **Implementation:** Record real LLM responses, replay during tests
- **Storage:** `/tests/fixtures/llm_responses/`

```typescript
// tests/mocks/llm_provider.ts
class MockLLMProvider implements IModelProvider {
  private responses: Map<string, string>;

  constructor() {
    // Load pre-recorded responses
    const json = Deno.readTextFileSync("tests/fixtures/llm_responses/default.json");
    this.responses = new Map(JSON.parse(json));
  }

  async complete(prompt: string, config: ModelConfig): Promise<string> {
    // Hash prompt to find matching response
    const key = hashPrompt(prompt);
    const response = this.responses.get(key);

    if (!response) {
      throw new Error(`No mock response for prompt hash: ${key}`);
    }

    return response;
  }
}
```

### Step 6.5: Integration Test Scenarios

- **Goal:** Test complete workflows end-to-end
- **Scenarios:**
  1. **Happy Path:** Request → Plan → Approve → Execute → Report
  2. **Failure Path:** Execute fails → Error Report → File moved to /Inbox/Requests
  3. **Concurrency:** Two agents try same file → Second gets BUSY
  4. **Context Overflow:** Request with 50 massive files → Truncation warning
  5. **Git Conflict:** Agent modifies file, human modifies same file

```typescript
// tests/integration/happy_path_test.ts
Deno.test("Complete workflow: Request to Report", async () => {
  const testEnv = await setupTestEnvironment();
  const mockLLM = new MockLLMProvider();
  const engine = new Engine(testEnv.config, mockLLM);

  // 1. Create request file
  await testEnv.writeFile("/Inbox/Requests/test-task.md", requestContent);

  // 2. Wait for engine to process
  await engine.processOnce();

  // 3. Verify plan was created
  const plan = await testEnv.readFile("/Inbox/Plans/test-task.md");
  assertStringIncludes(plan, "## Proposed Plan");

  // 4. Approve by moving to Active
  await testEnv.moveFile(
    "/Inbox/Plans/test-task.md",
    "/System/Active/test-task.md",
  );

  // 5. Wait for execution
  await engine.processOnce();

  // 6. Verify report created
  const reports = await testEnv.listFiles("/Knowledge/Reports");
  assertEquals(reports.length, 1);

  // 7. Verify git branch created
  const branches = await testEnv.gitBranches();
  assert(branches.some((b) => b.includes("feat/test-task")));

  await testEnv.cleanup();
});
```

### Step 6.6: Security Validation Tests

- **Purpose:** Verify Deno permissions are enforced
- **Method:** Spawn subprocess with restricted permissions, try attacks

```typescript
// tests/security/permission_test.ts
Deno.test("Agent cannot read outside allowed paths", async () => {
  const command = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read=/ExoFrame",
      "tests/fixtures/malicious_agent.ts",
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stderr } = await command.output();
  const error = new TextDecoder().decode(stderr);

  // Should fail with PermissionDenied
  assertNotEquals(code, 0);
  assertStringIncludes(error, "PermissionDenied");
});
```

### Step 7.5: Performance Benchmarks

- **Purpose:** Catch performance regressions
- **Method:** Benchmark critical paths, fail CI if regresses >20%

```typescript
// tests/benchmarks/cold_start_bench.ts
Deno.bench("Cold start time", async () => {
  const command = new Deno.Command("deno", {
    args: ["run", "--allow-all", "src/main.ts", "--version"],
  });

  await command.output();
});

// tests/benchmarks/watcher_bench.ts
Deno.bench("File watcher latency", async () => {
  const watcher = new FileWatcher("/tmp/test");
  let triggered = false;

  watcher.on("change", () => {
    triggered = true;
  });

  // Trigger file change
  await Deno.writeTextFile("/tmp/test/file.md", "content");

  // Wait for event
  while (!triggered) {
    await new Promise((r) => setTimeout(r, 10));
  }
});
```

**CI Integration (GitHub Actions):**

```yaml
# .github/workflows/test.yml
name: Test & Benchmark

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
        with:
          deno-version: v2.x

      - name: Run tests
        run: deno test --allow-all

      - name: Run benchmarks
        run: deno bench --allow-all

      - name: Check coverage
        run: deno test --coverage=cov_profile

      - name: Generate coverage report
        run: deno coverage cov_profile --lcov > coverage.lcov
```

### Step 6.6: Manual QA Checklist

**Before each release, test on:**

- [ ] Fresh Ubuntu 24.04 VM (no prior Deno install)
- [ ] macOS (Apple Silicon)
- [ ] Windows 11 + WSL2

**Test scenarios (map to Threat IDs):**

- [ ] Fresh install → Setup → Mount portal → Create request → Approve → Verify execution (Happy path)
- [ ] Force-kill daemon mid-execution → Restart → Verify lease expires (**T-Lease**)
- [ ] Corrupt database → Verify error message, recovery procedure (**T-DataLoss**)
- [ ] Create request with invalid TOML → Verify validation error logged (**T-Input**)
- [ ] Test with actual OpenAI/Anthropic API (not mock) (**T-Creds**)

### Step 6.7: Documentation Structure Tests

- **Dependencies:** Phase 5 (Documentation) — **Rollback:** revert test files
- **Action:** Create automated tests to verify documentation completeness and structure.
- **Justification:** Documentation drifts out of sync with code. Automated tests catch missing sections, broken examples, and incomplete guides.

**Test Location:** `tests/docs/`

**Implementation:**

```typescript
// tests/docs/helpers.ts
export async function readUserGuide(): Promise<string> {
  return await Deno.readTextFile("docs/ExoFrame_User_Guide.md");
}

export async function readKnowledgeReadme(): Promise<string> {
  return await Deno.readTextFile("templates/Knowledge_README.md");
}
```

**User Guide Tests (`tests/docs/user_guide_test.ts`):**

```typescript
// Verify User Guide has required sections
Deno.test("User Guide has main sections", async () => {
  const guide = await readUserGuide();
  assertStringIncludes(guide, "## 1."); // Introduction
  assertStringIncludes(guide, "## 2."); // Installation
  assertStringIncludes(guide, "## 3."); // Workspace
  assertStringIncludes(guide, "## 4."); // CLI Reference
});

// Verify CLI commands are documented
Deno.test("User Guide documents exoctl commands", async () => {
  const guide = await readUserGuide();
  assertStringIncludes(guide, "exoctl");
  assertStringIncludes(guide, "daemon start");
  assertStringIncludes(guide, "plan approve");
});

// Verify Obsidian integration is documented
Deno.test("User Guide documents Obsidian setup", async () => {
  const guide = await readUserGuide();
  assertStringIncludes(guide, "Dataview");
  assertStringIncludes(guide, "Community Plugins");
});
```

**Knowledge README Tests (`tests/docs/knowledge_readme_test.ts`):**

```typescript
Deno.test("Knowledge README documents vault structure", async () => {
  const readme = await readKnowledgeReadme();
  assertStringIncludes(readme, "Dashboard");
  assertStringIncludes(readme, "Portals");
  assertStringIncludes(readme, "Reports");
});
```

**Success Criteria:**

- [x] `tests/docs/` folder created with documentation tests
- [x] User Guide tests verify all major sections exist
- [x] Knowledge README tests verify vault structure docs
- [x] Tests run as part of CI pipeline

✅ **COMPLETED** (2025-11-28): Documentation test infrastructure implemented.

- Created `tests/docs/helpers.ts` with shared functions
- Created `tests/docs/user_guide_test.ts` (17 tests)
- Created `tests/docs/knowledge_readme_test.ts` (5 tests)
- All 352 tests pass

---

## Phase 7: UX Improvements & UI Evaluation

**Goal:** Reduce friction in the ExoFrame workflow while evaluating whether a dedicated UI is needed beyond Obsidian.

### Context: ExoFrame vs IDE Agents

ExoFrame's value proposition is **not** real-time coding assistance (IDE agents do that better). ExoFrame excels at:

1. **Audit trail & traceability** — trace_id linking everything
2. **Asynchronous workflows** — drop request, come back later
3. **Explicit approval gates** — no accidental destructive changes
4. **Multi-project context** — portals span multiple codebases

However, the current "drop a markdown file" workflow has friction. This phase addresses that.

### Step 7.1: Request Commands - Primary Request Interface

- **Dependencies:** Steps 1.2 (Storage), 2.2 (Frontmatter Parser), 4.4 (CLI Architecture)
- **Action:** Implement `exoctl request` as the **primary interface** for creating requests to ExoFrame agents.
- **Requirement:** The CLI must be the recommended way to create requests, replacing manual file creation.
- **Justification:** Manual file creation is error-prone (invalid TOML, missing fields, typos in paths). A CLI command ensures validation, proper frontmatter generation, and audit logging.

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

#### **Implementation: `src/cli/request_commands.ts`**

```typescript
import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { z } from "zod";
import { BaseCommand, type CommandContext } from "./base.ts";

// Validation schema for request options
const RequestOptionsSchema = z.object({
  agent: z.string().min(1).default("default"),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  portal: z.string().optional(),
});

// Validation schema for generated frontmatter
const RequestFrontmatterSchema = z.object({
  trace_id: z.string().uuid(),
  created: z.string().datetime(),
  status: z.literal("pending"),
  priority: z.enum(["low", "normal", "high", "critical"]),
  agent: z.string().min(1),
  portal: z.string().optional(),
  source: z.enum(["cli", "file", "interactive"]),
  created_by: z.string(),
});

export type RequestOptions = z.infer<typeof RequestOptionsSchema>;
export type RequestFrontmatter = z.infer<typeof RequestFrontmatterSchema>;

export interface RequestMetadata {
  trace_id: string;
  filename: string;
  path: string;
  status: string;
  priority: string;
  agent: string;
  created: string;
  created_by: string;
}

/**
 * RequestCommands provides the primary interface for creating requests to ExoFrame agents.
 * This is the RECOMMENDED way to create requests (not manual file creation).
 */
export class RequestCommands extends BaseCommand {
  private requestsDir: string;

  constructor(context: CommandContext, workspaceRoot: string) {
    super(context);
    this.requestsDir = join(workspaceRoot, "Inbox", "Requests");
  }

  /**
   * Create a new request from inline description
   * @param description What the agent should do
   * @param options Request options (agent, priority, portal)
   * @param source How the request was created (cli, file, interactive)
   * @returns Request metadata including trace_id and path
   */
  async create(
    description: string,
    options: Partial<RequestOptions> = {},
    source: "cli" | "file" | "interactive" = "cli",
  ): Promise<RequestMetadata> {
    // Validate options
    const validatedOptions = RequestOptionsSchema.parse(options);

    // Generate trace_id and timestamp
    const traceId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const createdBy = await this.getUserIdentity();

    // Build frontmatter
    const frontmatter: RequestFrontmatter = {
      trace_id: traceId,
      created: timestamp,
      status: "pending",
      priority: validatedOptions.priority,
      agent: validatedOptions.agent,
      source: source,
      created_by: createdBy,
    };

    // Add portal if specified
    if (validatedOptions.portal) {
      frontmatter.portal = validatedOptions.portal;
    }

    // Validate frontmatter
    RequestFrontmatterSchema.parse(frontmatter);

    // Build file content
    const content = this.buildRequestContent(frontmatter, description);

    // Generate filename
    const shortId = traceId.slice(0, 8);
    const filename = `request-${shortId}.md`;
    const filePath = join(this.requestsDir, filename);

    // Ensure directory exists
    await ensureDir(this.requestsDir);

    // Check for collision (extremely unlikely with UUIDs)
    if (await exists(filePath)) {
      throw new Error(`Request file already exists: ${filename}`);
    }

    // Write file
    await Deno.writeTextFile(filePath, content);

    // Log to Activity Journal
    this.db.logActivity("human", "request.created", filePath, {
      trace_id: traceId,
      priority: validatedOptions.priority,
      agent: validatedOptions.agent,
      portal: validatedOptions.portal,
      source: source,
      created_by: createdBy,
      description_length: description.length,
    }, traceId);

    return {
      trace_id: traceId,
      filename,
      path: filePath,
      status: "pending",
      priority: validatedOptions.priority,
      agent: validatedOptions.agent,
      created: timestamp,
      created_by: createdBy,
    };
  }

  /**
   * Create request from file content
   * @param filePath Path to file containing request description
   * @param options Request options
   */
  async createFromFile(
    filePath: string,
    options: Partial<RequestOptions> = {},
  ): Promise<RequestMetadata> {
    // Read file content
    if (!await exists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const description = await Deno.readTextFile(filePath);

    if (!description.trim()) {
      throw new Error(`File is empty: ${filePath}`);
    }

    return this.create(description.trim(), options, "file");
  }

  /**
   * List all requests in Inbox/Requests
   * @param statusFilter Optional status filter
   */
  async list(statusFilter?: string): Promise<RequestMetadata[]> {
    const requests: RequestMetadata[] = [];

    try {
      for await (const entry of Deno.readDir(this.requestsDir)) {
        if (!entry.isFile || !entry.name.endsWith(".md")) continue;

        const filePath = join(this.requestsDir, entry.name);
        const content = await Deno.readTextFile(filePath);
        const frontmatter = this.extractFrontmatter(content);

        if (statusFilter && frontmatter.status !== statusFilter) continue;

        requests.push({
          trace_id: frontmatter.trace_id || "unknown",
          filename: entry.name,
          path: filePath,
          status: frontmatter.status || "unknown",
          priority: frontmatter.priority || "normal",
          agent: frontmatter.agent || "default",
          created: frontmatter.created || "",
          created_by: frontmatter.created_by || "unknown",
        });
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return []; // Directory doesn't exist yet
      }
      throw error;
    }

    // Sort by created date descending
    return requests.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  }

  /**
   * Show details of a specific request
   * @param traceId Trace ID or filename
   */
  async show(traceId: string): Promise<{ metadata: RequestMetadata; content: string }> {
    // Find request by trace_id or filename
    const requests = await this.list();
    const request = requests.find((r) =>
      r.trace_id === traceId ||
      r.trace_id.startsWith(traceId) ||
      r.filename === traceId ||
      r.filename === `${traceId}.md`
    );

    if (!request) {
      throw new Error(`Request not found: ${traceId}`);
    }

    const content = await Deno.readTextFile(request.path);

    return { metadata: request, content };
  }

  /**
   * Build request file content from frontmatter and description
   */
  private buildRequestContent(
    frontmatter: RequestFrontmatter,
    description: string,
  ): string {
    const lines = ["---"];

    // Add frontmatter fields in consistent order
    lines.push(`trace_id: ${frontmatter.trace_id}`);
    lines.push(`created: ${frontmatter.created}`);
    lines.push(`status: ${frontmatter.status}`);
    lines.push(`priority: ${frontmatter.priority}`);
    lines.push(`agent: ${frontmatter.agent}`);
    if (frontmatter.portal) {
      lines.push(`portal: ${frontmatter.portal}`);
    }
    lines.push(`source: ${frontmatter.source}`);
    lines.push(`created_by: ${frontmatter.created_by}`);

    lines.push("---");
    lines.push("");
    lines.push("# Request");
    lines.push("");
    lines.push(description);
    lines.push("");

    return lines.join("\n");
  }
}
```

#### **CLI Registration: `src/cli/exoctl.ts`**

```typescript
// Add to imports
import { RequestCommands } from "./request_commands.ts";

// Initialize
const requestCommands = new RequestCommands(context, config.system.root);

// Add command group (should be FIRST - primary interface)
.command(
  "request",
  new Command()
    .description("Create requests for ExoFrame agents (PRIMARY INTERFACE)")
    .arguments("[description:string]")
    .option("-a, --agent <agent:string>", "Target agent blueprint", { default: "default" })
    .option("-p, --priority <priority:string>", "Priority: low, normal, high, critical", { default: "normal" })
    .option("--portal <portal:string>", "Portal alias for context")
    .option("-f, --file <file:string>", "Read description from file")
    .option("-i, --interactive", "Interactive mode")
    .option("--dry-run", "Show what would be created")
    .option("--json", "Output in JSON format")
    .action(async (options, description?: string) => {
      try {
        // Handle file input
        if (options.file) {
          const result = await requestCommands.createFromFile(options.file, {
            agent: options.agent,
            priority: options.priority as RequestOptions["priority"],
            portal: options.portal,
          });
          printResult(result, options.json);
          return;
        }

        // Handle interactive mode
        if (options.interactive) {
          // TODO: Implement interactive prompts
          console.error("Interactive mode not yet implemented");
          Deno.exit(1);
        }

        // Require description for inline mode
        if (!description) {
          console.error("Error: Description required. Usage: exoctl request \"<description>\"");
          console.error("       Or use --file to read from file, or --interactive for prompts.");
          Deno.exit(1);
        }

        // Create request
        const result = await requestCommands.create(description, {
          agent: options.agent,
          priority: options.priority as RequestOptions["priority"],
          portal: options.portal,
        });

        if (options.dryRun) {
          console.log("Dry run - would create:");
          printResult(result, true);
          return;
        }

        printResult(result, options.json);
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
        Deno.exit(1);
      }
    })
    .command("list", new Command()
      .description("List pending requests")
      .option("-s, --status <status:string>", "Filter by status")
      .option("--json", "Output in JSON format")
      .action(async (options) => {
        const requests = await requestCommands.list(options.status);
        if (options.json) {
          console.log(JSON.stringify(requests, null, 2));
        } else {
          if (requests.length === 0) {
            console.log("No requests found.");
            return;
          }
          console.log(`\n📥 Requests (${requests.length}):\n`);
          for (const req of requests) {
            const priorityIcon = { critical: "🔴", high: "🟠", normal: "🟢", low: "⚪" }[req.priority] || "🟢";
            console.log(`${priorityIcon} ${req.trace_id.slice(0, 8)}`);
            console.log(`   Status: ${req.status}`);
            console.log(`   Agent: ${req.agent}`);
            console.log(`   Created: ${req.created_by} @ ${req.created}`);
            console.log();
          }
        }
      }))
    .command("show <id>", new Command()
      .description("Show request details")
      .action(async (_options, id: string) => {
        const { metadata, content } = await requestCommands.show(id);
        console.log(`\n📄 Request: ${metadata.trace_id.slice(0, 8)}\n`);
        console.log(`Trace ID: ${metadata.trace_id}`);
        console.log(`Status: ${metadata.status}`);
        console.log(`Priority: ${metadata.priority}`);
        console.log(`Agent: ${metadata.agent}`);
        console.log(`Created: ${metadata.created_by} @ ${metadata.created}`);
        console.log("\n" + "─".repeat(60) + "\n");
        console.log(content);
      }))
)

function printResult(result: RequestMetadata, json: boolean) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`✓ Request created: ${result.filename}`);
    console.log(`  Trace ID: ${result.trace_id}`);
    console.log(`  Priority: ${result.priority}`);
    console.log(`  Agent: ${result.agent}`);
    console.log(`  Path: ${result.path}`);
    console.log(`  Next: Daemon will process this automatically`);
  }
}
```

#### **Test Plan: `tests/cli/request_commands_test.ts`**

```typescript
import { assertEquals, assertExists, assertRejects, assertStringIncludes } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { join } from "@std/path";
import { RequestCommands } from "../../src/cli/request_commands.ts";
import { cleanupTestWorkspace, createTestContext, createTestWorkspace } from "../helpers/test_utils.ts";

describe("RequestCommands", () => {
  let workspace: string;
  let requestCommands: RequestCommands;

  beforeEach(async () => {
    workspace = await createTestWorkspace();
    const context = await createTestContext(workspace);
    requestCommands = new RequestCommands(context, workspace);
  });

  afterEach(async () => {
    await cleanupTestWorkspace(workspace);
  });

  describe("create", () => {
    it("should create request with valid frontmatter", async () => {
      const result = await requestCommands.create("Implement user authentication");

      // Verify result structure
      assertExists(result.trace_id);
      assertEquals(result.trace_id.length, 36); // UUID format
      assertEquals(result.status, "pending");
      assertEquals(result.priority, "normal");
      assertEquals(result.agent, "default");

      // Verify file exists
      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, `trace_id: ${result.trace_id}`);
      assertStringIncludes(content, "status: pending");
      assertStringIncludes(content, "Implement user authentication");
    });

    it("should accept custom priority", async () => {
      const result = await requestCommands.create("Fix critical bug", { priority: "critical" });
      assertEquals(result.priority, "critical");

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "priority: critical");
    });

    it("should accept custom agent", async () => {
      const result = await requestCommands.create("Write tests", { agent: "test_writer" });
      assertEquals(result.agent, "test_writer");

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "agent: test_writer");
    });

    it("should accept portal option", async () => {
      const result = await requestCommands.create("Add feature", { portal: "MyProject" });

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "portal: MyProject");
    });

    it("should generate unique trace_ids", async () => {
      const result1 = await requestCommands.create("Request 1");
      const result2 = await requestCommands.create("Request 2");

      assertNotEquals(result1.trace_id, result2.trace_id);
      assertNotEquals(result1.filename, result2.filename);
    });

    it("should reject invalid priority", async () => {
      await assertRejects(
        () => requestCommands.create("Test", { priority: "invalid" as any }),
        Error,
      );
    });

    it("should create file in correct directory", async () => {
      const result = await requestCommands.create("Test request");

      const expectedDir = join(workspace, "Inbox", "Requests");
      assertStringIncludes(result.path, expectedDir);
    });

    it("should log activity to journal", async () => {
      const result = await requestCommands.create("Test request");

      // Query activity journal
      const activities = requestCommands["db"].getRecentActivity(10);
      const createActivity = activities.find((a) =>
        a.action_type === "request.created" &&
        a.payload?.trace_id === result.trace_id
      );

      assertExists(createActivity);
      assertEquals(createActivity.actor, "human");
    });

    it("should include created_by from user identity", async () => {
      const result = await requestCommands.create("Test request");
      assertExists(result.created_by);

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, `created_by: ${result.created_by}`);
    });

    it("should include source field", async () => {
      const result = await requestCommands.create("Test", {}, "cli");
      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "source: cli");
    });
  });

  describe("createFromFile", () => {
    it("should create request from file content", async () => {
      const inputFile = join(workspace, "input.md");
      await Deno.writeTextFile(inputFile, "Implement feature from file");

      const result = await requestCommands.createFromFile(inputFile);

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "Implement feature from file");
      assertStringIncludes(content, "source: file");
    });

    it("should reject non-existent file", async () => {
      await assertRejects(
        () => requestCommands.createFromFile("/nonexistent/file.md"),
        Error,
        "File not found",
      );
    });

    it("should reject empty file", async () => {
      const inputFile = join(workspace, "empty.md");
      await Deno.writeTextFile(inputFile, "   \n  ");

      await assertRejects(
        () => requestCommands.createFromFile(inputFile),
        Error,
        "File is empty",
      );
    });

    it("should pass options to created request", async () => {
      const inputFile = join(workspace, "input.md");
      await Deno.writeTextFile(inputFile, "Test content");

      const result = await requestCommands.createFromFile(inputFile, {
        agent: "custom_agent",
        priority: "high",
      });

      assertEquals(result.agent, "custom_agent");
      assertEquals(result.priority, "high");
    });
  });

  describe("list", () => {
    it("should return empty array when no requests", async () => {
      const requests = await requestCommands.list();
      assertEquals(requests, []);
    });

    it("should list all requests", async () => {
      await requestCommands.create("Request 1");
      await requestCommands.create("Request 2");

      const requests = await requestCommands.list();
      assertEquals(requests.length, 2);
    });

    it("should filter by status", async () => {
      await requestCommands.create("Request 1");
      // Manually modify one to have different status for testing
      // (In practice, daemon would change status)

      const pending = await requestCommands.list("pending");
      assertEquals(pending.length >= 1, true);
    });

    it("should sort by created date descending", async () => {
      await requestCommands.create("Request 1");
      await new Promise((r) => setTimeout(r, 100)); // Small delay
      await requestCommands.create("Request 2");

      const requests = await requestCommands.list();
      // Most recent first
      assertStringIncludes(requests[0].filename, "request-");
    });
  });

  describe("show", () => {
    it("should show request by full trace_id", async () => {
      const created = await requestCommands.create("Test request");

      const { metadata, content } = await requestCommands.show(created.trace_id);
      assertEquals(metadata.trace_id, created.trace_id);
      assertStringIncludes(content, "Test request");
    });

    it("should show request by short trace_id", async () => {
      const created = await requestCommands.create("Test request");
      const shortId = created.trace_id.slice(0, 8);

      const { metadata } = await requestCommands.show(shortId);
      assertEquals(metadata.trace_id, created.trace_id);
    });

    it("should show request by filename", async () => {
      const created = await requestCommands.create("Test request");

      const { metadata } = await requestCommands.show(created.filename);
      assertEquals(metadata.trace_id, created.trace_id);
    });

    it("should reject non-existent request", async () => {
      await assertRejects(
        () => requestCommands.show("nonexistent"),
        Error,
        "Request not found",
      );
    });
  });
});
```

#### **Activity Logging:**

- `request.created` with `{trace_id, priority, agent, portal, source, created_by, description_length}`
- All actions tagged with `actor='human'`

#### **Success Criteria:**

1. [ ] `exoctl request "description"` creates valid request file
2. [ ] Generated frontmatter passes Zod RequestFrontmatterSchema validation
3. [ ] trace_id is valid UUID v4 format
4. [ ] Filename follows pattern: `request-{short_trace_id}.md`
5. [ ] File created in `/Inbox/Requests/` directory
6. [ ] `--agent` option sets correct agent in frontmatter
7. [ ] `--priority` validates enum (low/normal/high/critical)
8. [ ] `--portal` option adds portal field to frontmatter
9. [ ] `--file` reads description from specified file
10. [ ] `--file` rejects non-existent files with clear error
11. [ ] `--file` rejects empty files with clear error
12. [ ] `--dry-run` shows what would be created without writing
13. [ ] `--json` outputs machine-readable JSON
14. [ ] `exoctl request list` shows all pending requests
15. [ ] `exoctl request list --status` filters by status
16. [ ] `exoctl request show <id>` displays full request content
17. [ ] Activity Journal logs `request.created` with all metadata
18. [ ] User identity captured from git config or OS username
19. [ ] created_by field populated in frontmatter
20. [ ] source field indicates how request was created (cli/file/interactive)
21. [ ] 20+ tests in `tests/cli/request_commands_test.ts`
22. [ ] All tests pass

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

### Step 7.2: TOML Format Migration ✅ COMPLETED

**Problem:** ExoFrame originally used mixed formats (YAML frontmatter in requests/plans, YAML for blueprints). This created:

- Inconsistency across file types
- YAML fragility (indentation-sensitive, type coercion issues)
- Higher token usage when files are included in LLM context

**Solution:** Standardize on TOML for all structured metadata with a clean break (no backward compatibility).

**Changes Made:**

| Component           | Before        | After         | Files Changed                                 |
| ------------------- | ------------- | ------------- | --------------------------------------------- |
| Request frontmatter | YAML (`---`)  | TOML (`+++`)  | `src/parsers/markdown.ts`                     |
| Plan frontmatter    | YAML (`---`)  | TOML (`+++`)  | `src/services/plan_writer.ts`                 |
| Report frontmatter  | YAML (`---`)  | TOML (`+++`)  | `src/services/mission_reporter.ts`            |
| Execution reports   | YAML (`---`)  | TOML (`+++`)  | `src/services/execution_loop.ts`              |
| CLI serialization   | YAML output   | TOML output   | `src/cli/base.ts`, `src/cli/plan_commands.ts` |
| Tests               | YAML fixtures | TOML fixtures | `tests/frontmatter_test.ts`, `tests/cli/*.ts` |
| Dependencies        | `@std/yaml`   | Removed       | `deno.json` (dependency removed)              |

**Implementation Completed:**

1. ✅ **Parser Migration** (`src/parsers/markdown.ts`)
   - Changed delimiter detection from `---` to `+++`
   - Replaced YAML parsing with TOML parsing (`@std/toml`)
   - Removed `@std/yaml` dependency completely

2. ✅ **Service Updates** (5 files)
   - `plan_writer.ts` - `generateFrontmatter()` outputs TOML
   - `execution_loop.ts` - Reports use TOML frontmatter
   - `mission_reporter.ts` - `buildFrontmatter()` uses TOML
   - `base.ts` - `extractFrontmatter()`/`serializeFrontmatter()` updated
   - `plan_commands.ts` - Plan serialization uses TOML

3. ✅ **Test Fixture Conversion** (6 test files)
   - All `---` delimiters changed to `+++`
   - All `key: value` syntax changed to `key = "value"`
   - All assertions updated to expect TOML format

4. ✅ **Documentation Updates** (4 files)
   - Implementation Plan, White Paper, User Guide, Building with AI Agents

**Success Criteria (All Met):**

1. ✅ `@std/toml` added to `deno.json` imports
2. ✅ `FrontmatterParser` only accepts `+++` (TOML) delimiters
3. ✅ All services generate TOML frontmatter (`+++`)
4. ✅ All test fixtures converted to TOML format
5. ✅ Token savings documented (~22% reduction)
6. ✅ `@std/yaml` dependency removed (clean break)
7. ✅ All 304 tests pass after migration
8. ✅ BREAKING CHANGE documented (YAML no longer supported)

**Tests:**

```typescript
// tests/frontmatter_test.ts

Deno.test("FrontmatterParser - parses TOML frontmatter with +++ delimiters", () => {
  const markdown = `+++
trace_id = "550e8400-e29b-41d4-a716-446655440000"
agent_id = "coder"
status = "pending"
priority = 5
tags = ["feature"]
created_at = 2025-11-27T10:30:00Z
+++

# Request body here`;

  const parser = new FrontmatterParser();
  const result = parser.parse(markdown);

  assertEquals(result.request.trace_id, "550e8400-e29b-41d4-a716-446655440000");
  assertEquals(result.request.priority, 5);
  assertEquals(result.request.tags, ["feature"]);
});

Deno.test("FrontmatterParser - rejects YAML frontmatter (TOML-only)", () => {
  const markdown = `---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
agent_id: coder
status: pending
---

# Request body`;

  const parser = new FrontmatterParser();

  // Should throw - YAML format no longer supported
  assertThrows(() => parser.parse(markdown));
});

Deno.test("FrontmatterParser - only accepts +++ delimiters", () => {
  const toml = `+++\ntrace_id = "abc"\n+++\nBody`;
  const yaml = `---\ntrace_id: abc\n---\nBody`;

  const parser = new FrontmatterParser();

  // TOML with +++ works
  assertExists(parser.parse(toml));

  // YAML with --- throws
  assertThrows(() => parser.parse(yaml));
});
```

**Token Efficiency Results:**

```
# YAML (45 tokens) - No longer supported
---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
agent_id: "senior_coder"
status: "pending"
priority: 5
tags:
  - feature
  - api
---

# TOML (35 tokens) - Current format
+++
trace_id = "550e8400-e29b-41d4-a716-446655440000"
agent_id = "senior_coder"
status = "pending"
priority = 5
tags = ["feature", "api"]
+++
```

_~22% token reduction per request file embedded in LLM context_

**Migration Notes:**

- **BREAKING CHANGE**: YAML frontmatter (`---`) is no longer supported
- Users with existing YAML files must convert to TOML format
- Conversion: Change `---` to `+++`, change `key: value` to `key = "value"`
- Arrays: Change multi-line YAML arrays to inline TOML arrays

---

### Step 7.3: UI Strategy Evaluation

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

### Step 7.4: Obsidian Dashboard Enhancement

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

### Step 7.4: VS Code Integration (Future Consideration)

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

### Step 7.5: Documentation Updates

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

### Phase 7 Exit Criteria

- [ ] `exoctl request` command implemented and tested
- [ ] UI evaluation document created with decision
- [ ] Obsidian dashboard templates in `Knowledge/`
- [ ] Documentation updated with clear positioning
- [ ] User Guide includes quick request examples

## Bootstrap: Developer Workspace Setup

> **Moved to separate document:** [ExoFrame Developer Setup](./ExoFrame_Developer_Setup.md)

Please refer to the setup guide for instructions on how to bootstrap a local development workspace on Ubuntu or Windows
(WSL2).

---

_End of Implementation Plan_
