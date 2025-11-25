# ExoFrame Implementation Plan

- **Version:** 1.5.0
- **Release Date:** 2025-11-23
- **Philosophy:** Walking Skeleton (End-to-End first, features second).
- **Runtime:** Deno.
- **Target:** Honest MVP (Personal Developer Tool supporting both local sovereign agents and federated third-party
  agents).

### Change Log

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
- **Blueprint:** YAML definition of an agent (model, capabilities, prompt)

---

## Execution Governance

| Phase   | Timebox | Entry Criteria                        | Exit Criteria                         |
| ------- | ------- | ------------------------------------- | ------------------------------------- |
| Phase 1 | 1 week  | Repo initialized, change log approved | Daemon boots, storage scaffolds exist |
| Phase 2 | 1 week  | Phase 1 exit + watcher harness        | Watcher + parser tests pass           |
| Phase 3 | 2 weeks | Validated config + mock LLM           | Request → Plan loop verified          |
| Phase 4 | 1 week  | Stable agent runtime                  | Git + tool registry exercised         |
| Phase 5 | 1 week  | CLI scaffold merged                   | CLI + dashboard smoke tests           |
| Phase 6 | 2 days  | Knowledge tree exists                 | Obsidian vault validated              |
| Phase 7 | Ongoing | All prior phases code-complete        | 80% of test plan automated            |

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
    "@std/yaml": "jsr:@std/yaml@^0.221.0",
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
- **Action:** Implement a parser to extract and validate YAML frontmatter from request markdown files using Zod schemas.

**The Problem:** Request files (`.md` files in `/Inbox/Requests`) contain structured metadata in YAML frontmatter, but
arrive as plain text:

1. Frontmatter may be malformed (invalid YAML syntax)
2. Required fields may be missing (`trace_id`, `status`, `agent_id`)
3. Field types may be wrong (string instead of number, etc.)
4. If we process invalid requests, agents fail with cryptic errors

**The Solution (Three-Stage Parsing):**

**Stage 1: Extract Frontmatter** Split markdown into frontmatter (between `---` delimiters) and body content.

```typescript
interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  body: string;
}

function extractFrontmatter(markdown: string): ParsedMarkdown {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = markdown.match(frontmatterRegex);

  if (!match) {
    throw new Error("No frontmatter found");
  }

  const yamlContent = match[1];
  const body = match[2];

  // Parse YAML to object
  const frontmatter = parseYaml(yamlContent);

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
---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
agent_id: "coder-agent"
status: "pending"
priority: 8
tags: ["feature", "ui"]
---

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
2. Formats the content into a structured plan document with YAML frontmatter
3. Generates Obsidian-compatible wiki links to context files
4. Writes the plan to `/Inbox/Plans` with proper naming convention (`{requestId}_plan.md`)
5. Logs the plan creation to Activity Journal for audit trail

**Plan Document Structure:**

Plans follow this standardized format with:

- YAML frontmatter (trace_id, request_id, status, created_at)
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
- Frontmatter structure: Valid YAML with trace_id, request_id, status, created_at
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
     ```yaml
     status: "rejected"
     rejected_by: "user@example.com"
     rejected_at: "2024-11-25T15:30:00Z"
     rejection_reason: "Approach is too risky, use incremental strategy instead"
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
     ```yaml
     status: "needs_revision"
     reviewed_by: "user@example.com"
     reviewed_at: "2024-11-25T15:30:00Z"
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
---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
request_id: "implement-auth"
status: "failed"
failed_at: "2024-11-25T12:00:00Z"
error_type: "ToolExecutionError"
---

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

### Step 4.4: Plan Review CLI Commands ✅ 

**Status:** COMPLETED
- ✅ PlanCommands service implemented (`src/cli/plan_commands.ts`)
- ✅ 16 comprehensive tests passing (26 test steps total)
- ✅ CLI entry point created (`src/cli/exoctl.ts`)
- ✅ All 24 success criteria met
- ✅ Activity logging verified for all commands

- **Dependencies:** Steps 2.1 (Database Service), 4.3 (Execution Loop) — **Rollback:** users manually move files (error-prone)
- **Action:** Implement CLI commands (`exoctl plan approve/reject/revise`) that provide validated, logged interface for human plan reviews.
- **Requirement:** All human review actions must be validated, atomic, and logged to Activity Journal for complete audit trail.
- **Justification:** Manual file operations are error-prone (wrong directories, malformed frontmatter, incomplete moves). CLI commands enforce validation, provide clear feedback, and guarantee activity logging.

**The Problem:** The Execution Loop (Step 4.3) expects plans in `/System/Active`, but relying on users to manually move files is problematic:

- ❌ Users might move files to wrong directory
- ❌ Frontmatter status not updated correctly
- ❌ No validation of plan state before approval
- ❌ Actions not logged (breaks audit trail)
- ❌ File moves might fail partially (non-atomic)
- ❌ No user identification captured

**The Solution:** Provide CLI commands that handle plan reviews properly:

**The Solution:** Implement CLI commands in `exoctl` that:

1. **Validate** plan state before executing action:
   - Plan exists in expected location
   - Frontmatter has correct status
   - Required fields (trace_id, request_id) present
   - Target location is available

2. **Execute** file operations atomically:
   - `exoctl plan approve <id>` - Move to `/System/Active`, update frontmatter
   - `exoctl plan reject <id> --reason "..."` - Move to `/Inbox/Rejected`, add rejection metadata
   - `exoctl plan revise <id> --comment "..."` - Add review comments, set status to `needs_revision`

3. **Log** actions to Activity Journal with:
   - `actor: 'human'` (distinguishes from agent/system actions)
   - `agent_id: NULL` (not performed by any agent)
   - `trace_id` from plan frontmatter
   - User identity (from git config or OS username)
   - Action-specific metadata (reason, comment count, etc.)

4. **Provide feedback** to user:
   - Success messages with next steps
   - Clear error messages with resolution hints
   - List pending plans awaiting review

**Implementation:**

```typescript
// src/cli/plan_commands.ts

import { join } from "@std/path";
import { parse as parseYaml } from "@std/yaml";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "../services/db.ts";

export interface PlanCommandsConfig {
  config: Config;
  db: DatabaseService;
}

interface PlanFrontmatter {
  trace_id: string;
  request_id: string;
  status: string;
  [key: string]: unknown;
}

export class PlanCommands {
  private config: Config;
  private db: DatabaseService;

  constructor(options: PlanCommandsConfig) {
    this.config = options.config;
    this.db = options.db;
  }

  /**
   * Approve a plan - move to /System/Active for execution
   */
  async approve(planId: string): Promise<void> {
    // 1. Validate plan exists
    const planPath = join(
      this.config.system.root,
      "Inbox",
      "Plans",
      `${planId}_plan.md`,
    );

    let planStat;
    try {
      planStat = await Deno.stat(planPath);
    } catch {
      throw new Error(
        `Plan '${planId}' not found in /Inbox/Plans\nRun 'exoctl plan list' to see available plans`,
      );
    }

    if (!planStat.isFile) {
      throw new Error(`${planPath} is not a file`);
    }

    // 2. Parse and validate frontmatter
    const content = await Deno.readTextFile(planPath);
    const plan = this.parsePlanFrontmatter(content, planPath);

    if (plan.status !== "review") {
      throw new Error(
        `Plan cannot be approved (current status: ${plan.status})\nOnly plans with status='review' can be approved`,
      );
    }

    // 3. Check target path is available
    const activePath = join(
      this.config.system.root,
      "System",
      "Active",
      `${planId}.md`,
    );

    try {
      await Deno.stat(activePath);
      throw new Error(
        `Target path already exists: ${activePath}\nAnother plan may be executing with this ID`,
      );
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }

    // 4. Ensure Active directory exists
    await Deno.mkdir(join(this.config.system.root, "System", "Active"), {
      recursive: true,
    });

    // 5. Atomic move operation
    await Deno.rename(planPath, activePath);

    // 6. Log approval action
    const userIdentity = await this.getUserIdentity();
    this.db.logActivity(
      "human",
      "plan.approved",
      planId,
      {
        approved_by: userIdentity,
        approved_at: new Date().toISOString(),
        via: "cli",
      },
      plan.trace_id,
      null, // agent_id is null for human actions
    );

    console.log(`✓ Plan '${planId}' approved by ${userIdentity}`);
    console.log(`  Moved to: /System/Active/${planId}.md`);
    console.log(`  Trace ID: ${plan.trace_id}`);
    console.log(`\nNext: ExecutionLoop will process this plan automatically`);
  }

  /**
   * Reject a plan - move to /Inbox/Rejected with reason
   */
  async reject(planId: string, reason: string): Promise<void> {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Rejection reason is required\nUse: exoctl plan reject <id> --reason "your reason"');
    }

    // 1. Validate and parse plan
    const planPath = join(
      this.config.system.root,
      "Inbox",
      "Plans",
      `${planId}_plan.md`,
    );

    try {
      await Deno.stat(planPath);
    } catch {
      throw new Error(`Plan '${planId}' not found in /Inbox/Plans`);
    }

    const content = await Deno.readTextFile(planPath);
    const plan = this.parsePlanFrontmatter(content, planPath);

    // 2. Update frontmatter with rejection metadata
    const userIdentity = await this.getUserIdentity();
    const updatedContent = this.addRejectionMetadata(content, reason, userIdentity);

    // 3. Ensure Rejected directory exists
    const rejectedDir = join(this.config.system.root, "Inbox", "Rejected");
    await Deno.mkdir(rejectedDir, { recursive: true });

    // 4. Write updated content to Rejected directory
    const rejectedPath = join(rejectedDir, `${planId}_rejected.md`);
    await Deno.writeTextFile(rejectedPath, updatedContent);

    // 5. Remove original plan
    await Deno.remove(planPath);

    // 6. Log rejection
    this.db.logActivity(
      "human",
      "plan.rejected",
      planId,
      {
        rejected_by: userIdentity,
        rejection_reason: reason,
        rejected_at: new Date().toISOString(),
        via: "cli",
      },
      plan.trace_id,
      null,
    );

    console.log(`✗ Plan '${planId}' rejected by ${userIdentity}`);
    console.log(`  Reason: ${reason}`);
    console.log(`  Moved to: /Inbox/Rejected/${planId}_rejected.md`);
    console.log(`  Trace ID: ${plan.trace_id}`);
  }

  /**
   * Request revisions - add review comments to plan
   */
  async revise(planId: string, comments: string[]): Promise<void> {
    if (!comments || comments.length === 0) {
      throw new Error(
        'At least one comment is required\nUse: exoctl plan revise <id> --comment "your comment"',
      );
    }

    // 1. Validate and parse plan
    const planPath = join(
      this.config.system.root,
      "Inbox",
      "Plans",
      `${planId}_plan.md`,
    );

    try {
      await Deno.stat(planPath);
    } catch {
      throw new Error(`Plan '${planId}' not found in /Inbox/Plans`);
    }

    const content = await Deno.readTextFile(planPath);
    const plan = this.parsePlanFrontmatter(content, planPath);

    // 2. Add review comments section
    const userIdentity = await this.getUserIdentity();
    const updatedContent = this.addReviewComments(content, comments, userIdentity);

    // 3. Update frontmatter status to needs_revision
    const finalContent = this.updateFrontmatterStatus(
      updatedContent,
      "needs_revision",
      userIdentity,
    );

    // 4. Write updated plan
    await Deno.writeTextFile(planPath, finalContent);

    // 5. Log revision request
    this.db.logActivity(
      "human",
      "plan.revision_requested",
      planId,
      {
        reviewed_by: userIdentity,
        comment_count: comments.length,
        reviewed_at: new Date().toISOString(),
        via: "cli",
      },
      plan.trace_id,
      null,
    );

    console.log(`⚠ Revision requested for '${planId}' by ${userIdentity}`);
    console.log(`  Comments added: ${comments.length}`);
    comments.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
    console.log(`  Trace ID: ${plan.trace_id}`);
    console.log(`\nNext: Agent will review comments and update the plan`);
  }

  /**
   * List plans with optional status filter
   */
  async list(statusFilter?: string): Promise<void> {
    const plansDir = join(this.config.system.root, "Inbox", "Plans");

    try {
      await Deno.stat(plansDir);
    } catch {
      console.log("No plans directory found");
      return;
    }

    const plans: Array<{ id: string; status: string; trace_id: string }> = [];

    for await (const entry of Deno.readDir(plansDir)) {
      if (!entry.isFile || !entry.name.endsWith("_plan.md")) continue;

      const planPath = join(plansDir, entry.name);
      const content = await Deno.readTextFile(planPath);

      try {
        const frontmatter = this.parsePlanFrontmatter(content, planPath);
        const planId = entry.name.replace("_plan.md", "");

        if (!statusFilter || frontmatter.status === statusFilter) {
          plans.push({
            id: planId,
            status: frontmatter.status,
            trace_id: frontmatter.trace_id,
          });
        }
      } catch {
        // Skip invalid plans
        continue;
      }
    }

    if (plans.length === 0) {
      console.log(statusFilter ? `No plans found with status: ${statusFilter}` : "No plans found in /Inbox/Plans");
      return;
    }

    console.log(`\nFound ${plans.length} plan(s):\n`);
    plans.forEach((p) => {
      const statusIcon = p.status === "review" ? "📋" : p.status === "needs_revision" ? "⚠️" : "📄";
      console.log(`${statusIcon} ${p.id}`);
      console.log(`   Status: ${p.status}`);
      console.log(`   Trace: ${p.trace_id.substring(0, 8)}...`);
      console.log();
    });
  }

  /**
   * Show plan details
   */
  async show(planId: string): Promise<void> {
    const planPath = join(
      this.config.system.root,
      "Inbox",
      "Plans",
      `${planId}_plan.md`,
    );

    try {
      await Deno.stat(planPath);
    } catch {
      throw new Error(`Plan '${planId}' not found in /Inbox/Plans`);
    }

    const content = await Deno.readTextFile(planPath);
    const plan = this.parsePlanFrontmatter(content, planPath);

    console.log(`\nPlan: ${planId}`);
    console.log(`Status: ${plan.status}`);
    console.log(`Trace ID: ${plan.trace_id}`);
    console.log(`Request ID: ${plan.request_id}`);
    console.log(`\n--- Plan Content ---\n`);
    console.log(content);
  }

  /**
   * Parse plan frontmatter and validate required fields
   */
  private parsePlanFrontmatter(content: string, filePath: string): PlanFrontmatter {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      throw new Error(`Invalid plan format: missing frontmatter in ${filePath}`);
    }

    const frontmatter = parseYaml(match[1]) as PlanFrontmatter;

    if (!frontmatter.trace_id) {
      throw new Error(`Invalid plan: missing trace_id in ${filePath}`);
    }
    if (!frontmatter.request_id) {
      throw new Error(`Invalid plan: missing request_id in ${filePath}`);
    }
    if (!frontmatter.status) {
      throw new Error(`Invalid plan: missing status in ${filePath}`);
    }

    return frontmatter;
  }

  /**
   * Get user identity from git config or OS username
   */
  private async getUserIdentity(): Promise<string> {
    // Try git config first
    try {
      const gitCmd = new Deno.Command("git", {
        args: ["config", "user.email"],
        stdout: "piped",
        stderr: "piped",
      });
      const { stdout, success } = await gitCmd.output();

      if (success) {
        const email = new TextDecoder().decode(stdout).trim();
        if (email) return email;
      }
    } catch {
      // Git not available or no email configured
    }

    // Fallback to OS username
    return Deno.env.get("USER") || Deno.env.get("USERNAME") || "unknown";
  }

  /**
   * Add rejection metadata to plan frontmatter
   */
  private addRejectionMetadata(
    content: string,
    reason: string,
    rejectedBy: string,
  ): string {
    const frontmatterEnd = content.indexOf("---", 3) + 3;
    const frontmatter = content.substring(0, frontmatterEnd);
    const body = content.substring(frontmatterEnd);

    const updatedFrontmatter = frontmatter.replace(
      /status: ".*?"/,
      'status: "rejected"',
    );

    const rejectionMetadata = `rejected_by: "${rejectedBy}"\nrejected_at: "${
      new Date().toISOString()
    }"\nrejection_reason: "${reason}"\n`;

    return updatedFrontmatter.replace(
      /---$/,
      `${rejectionMetadata}---`,
    ) + body;
  }

  /**
   * Add review comments section to plan
   */
  private addReviewComments(
    content: string,
    comments: string[],
    reviewedBy: string,
  ): string {
    const reviewSection = [
      "\n\n## Review Comments\n",
      `**Reviewed by:** ${reviewedBy}  `,
      `**Reviewed at:** ${new Date().toISOString()}\n`,
      ...comments.map((c) => `- ⚠️ ${c}`),
      "",
    ].join("\n");

    // Check if review section already exists
    if (content.includes("## Review Comments")) {
      // Append to existing section
      return content.replace(
        /## Review Comments\n/,
        `## Review Comments\n\n### Previous Reviews\n(See above)\n\n### Latest Review (${new Date().toISOString()})\n`,
      ) + reviewSection;
    }

    return content + reviewSection;
  }

  /**
   * Update plan frontmatter status
   */
  private updateFrontmatterStatus(
    content: string,
    newStatus: string,
    reviewedBy: string,
  ): string {
    let updated = content.replace(/status: ".*?"/, `status: "${newStatus}"`);

    // Add reviewed_by and reviewed_at if not present
    const frontmatterMatch = updated.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const fm = frontmatterMatch[1];
      if (!fm.includes("reviewed_by:")) {
        updated = updated.replace(
          /---$/m,
          `reviewed_by: "${reviewedBy}"\nreviewed_at: "${new Date().toISOString()}"\n---`,
        );
      }
    }

    return updated;
  }
}
```

**CLI Interface (exoctl):**

```typescript
// src/cli/exoctl.ts

import { Command } from "@cliffy/command";
import { PlanCommands } from "./plan_commands.ts";
import { loadConfig } from "../config/service.ts";
import { DatabaseService } from "../services/db.ts";

const config = await loadConfig();
const db = DatabaseService.getInstance();

const planCommand = new Command()
  .name("plan")
  .description("Manage agent plans - approve, reject, or request revisions")
  .command(
    "approve <plan-id:string>",
    "Approve a plan and move it to /System/Active for execution",
  )
  .action(async (_options, planId: string) => {
    const commands = new PlanCommands({ config, db });
    try {
      await commands.approve(planId);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      Deno.exit(1);
    }
  })
  .command(
    "reject <plan-id:string>",
    "Reject a plan and move it to /Inbox/Rejected",
  )
  .option("-r, --reason <reason:string>", "Rejection reason (required)", {
    required: true,
  })
  .action(async ({ reason }, planId: string) => {
    const commands = new PlanCommands({ config, db });
    try {
      await commands.reject(planId, reason);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      Deno.exit(1);
    }
  })
  .command(
    "revise <plan-id:string>",
    "Request revisions to a plan by adding review comments",
  )
  .option(
    "-c, --comment <comment:string>",
    "Add review comment (can be used multiple times)",
    {
      collect: true,
      required: true,
    },
  )
  .action(async ({ comment }, planId: string) => {
    const commands = new PlanCommands({ config, db });
    try {
      await commands.revise(planId, comment);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      Deno.exit(1);
    }
  })
  .command("list", "List all plans in /Inbox/Plans")
  .option(
    "-s, --status <status:string>",
    "Filter by status (review, needs_revision)",
  )
  .action(async ({ status }) => {
    const commands = new PlanCommands({ config, db });
    try {
      await commands.list(status);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      Deno.exit(1);
    }
  })
  .command("show <plan-id:string>", "Display plan details and content")
  .action(async (_options, planId: string) => {
    const commands = new PlanCommands({ config, db });
    try {
      await commands.show(planId);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      Deno.exit(1);
    }
  });

await new Command()
  .name("exoctl")
  .version("1.0.0")
  .description("ExoFrame CLI - Control your agent swarm")
  .command("plan", planCommand)
  .parse(Deno.args);
```

}

/**

- Handle file creation (potential approval/rejection)
  */
  private async handleFileCreation(path: string): Promise<void> {
  if (path.includes("/System/Active/")) {
  await this.detectPlanApproval(path);
  } else if (path.includes("/Inbox/Rejected/")) {
  await this.detectPlanRejection(path);
  }

  this.fileStates.set(path, {
  path,
  lastEvent: "create",
  timestamp: Date.now(),
  });

}

/**

- Handle file modification (potential revision request)
  */
  private async handleFileModification(path: string): Promise<void> {
  if (path.includes("/Inbox/Plans/") && path.endsWith(".md")) {
  await this.detectRevisionRequest(path);
  }

  this.fileStates.set(path, {
  path,
  lastEvent: "modify",
  timestamp: Date.now(),
  });

}

/**

- Handle file removal (track for approval/rejection detection)
  */
  private async handleFileRemoval(path: string): Promise<void> {
  this.fileStates.set(path, {
  path,
  lastEvent: "remove",
  timestamp: Date.now(),
  });
  }

/**

- Detect plan approval (file moved to /System/Active)
  */
  private async detectPlanApproval(activePath: string): Promise<void> {
  try {
  const content = await Deno.readTextFile(activePath);
  const traceId = this.extractTraceId(content);

  if (!traceId) return;

  const filename = activePath.split("/").pop()!;
  const plansPath = join(
  this.config.system.root,
  "Inbox",
  "Plans",
  filename.replace(".md", "_plan.md"),
  );

  // Check if this file was recently removed from Plans directory
  const planState = this.fileStates.get(plansPath);
  const timeSinceRemoval = planState ? Date.now() - planState.timestamp : Infinity;

  // If file was removed from Plans within last 2 seconds, it's an approval
  if (planState?.lastEvent === "remove" && timeSinceRemoval < 2000) {
  this.db.logActivity(
  "human",
  "plan.approved",
  filename.replace(".md", ""),
  {
  moved_from: plansPath,
  moved_to: activePath,
  approved_at: new Date().toISOString(),
  },
  traceId,
  null, // agent_id is null for human actions
  );

  console.log(`[HumanActionTracker] Logged plan.approved for ${filename}`);
  }
  } catch (error) {
  console.error("[HumanActionTracker] Failed to detect approval:", error);
  }
  }

/**

- Detect plan rejection (file moved to /Inbox/Rejected)
  */
  private async detectPlanRejection(rejectedPath: string): Promise<void> {
  try {
  const content = await Deno.readTextFile(rejectedPath);
  const traceId = this.extractTraceId(content);
  const reason = this.extractRejectionReason(content);

  if (!traceId) return;

  const filename = rejectedPath.split("/").pop()!;

  this.db.logActivity(
  "human",
  "plan.rejected",
  filename.replace("_rejected.md", "").replace(".md", ""),
  {
  moved_to: rejectedPath,
  rejection_reason: reason || "No reason provided",
  rejected_at: new Date().toISOString(),
  },
  traceId,
  null,
  );

  console.log(`[HumanActionTracker] Logged plan.rejected for ${filename}`);
  } catch (error) {
  console.error("[HumanActionTracker] Failed to detect rejection:", error);
  }
  }

/**

- Detect revision request (plan modified with review comments)
  */
  private async detectRevisionRequest(planPath: string): Promise<void> {
  try {
  const content = await Deno.readTextFile(planPath);

  // Check if file contains review comments section
  if (!content.includes("## Review Comments")) return;

  const traceId = this.extractTraceId(content);
  if (!traceId) return;

  const filename = planPath.split("/").pop()!;
  const commentCount = this.countReviewComments(content);

  this.db.logActivity(
  "human",
  "plan.revision_requested",
  filename.replace("_plan.md", "").replace(".md", ""),
  {
  plan_path: planPath,
  comment_count: commentCount,
  reviewed_at: new Date().toISOString(),
  },
  traceId,
  null,
  );

  console.log(
  `[HumanActionTracker] Logged plan.revision_requested for ${filename}`,
  );
  } catch (error) {
  console.error("[HumanActionTracker] Failed to detect revision request:", error);
  }
  }

/**

- Extract trace_id from plan frontmatter
  _/
  private extractTraceId(content: string): string | null {
  const match = content.match(/^---\n([\s\S]_?)\n---/);
  if (!match) return null;

  try {
  const frontmatter = parseYaml(match[1]) as any;
  return frontmatter.trace_id || null;
  } catch {
  return null;
  }

}

/**

- Extract rejection reason from frontmatter
  _/
  private extractRejectionReason(content: string): string | null {
  const match = content.match(/^---\n([\s\S]_?)\n---/);
  if (!match) return null;

  try {
  const frontmatter = parseYaml(match[1]) as any;
  return frontmatter.rejection_reason || null;
  } catch {
  return null;
  }

}

/**

- Count review comment items in content
  */
  private countReviewComments(content: string): number {
  const commentsSection = content.split("## Review Comments")[1];
  if (!commentsSection) return 0;

  // Count lines starting with - ❌, - ⚠️, - ✅, - 💡

**Usage Examples:**

```bash
# List all pending plans
$ exoctl plan list
Found 2 plan(s):

📋 implement-auth
   Status: review
   Trace: 550e8400...

⚠️ add-logging
   Status: needs_revision
   Trace: 770e8400...

# Approve a plan
$ exoctl plan approve implement-auth
✓ Plan 'implement-auth' approved by user@example.com
  Moved to: /System/Active/implement-auth.md
  Trace ID: 550e8400-e29b-41d4-a716-446655440000

Next: ExecutionLoop will process this plan automatically

# Reject a plan with reason
$ exoctl plan reject risky-feature --reason "Approach too risky, use incremental rollout"
✗ Plan 'risky-feature' rejected by user@example.com
  Reason: Approach too risky, use incremental rollout
  Moved to: /Inbox/Rejected/risky-feature_rejected.md
  Trace ID: 660e8400-e29b-41d4-a716-446655440001

# Request revisions with multiple comments
$ exoctl plan revise add-tests \
    --comment "Need integration tests, not just unit tests" \
    --comment "Add error handling for edge cases" \
    --comment "Include performance benchmarks"
⚠ Revision requested for 'add-tests' by user@example.com
  Comments added: 3
    1. Need integration tests, not just unit tests
    2. Add error handling for edge cases
    3. Include performance benchmarks
  Trace ID: 880e8400-e29b-41d4-a716-446655440003

Next: Agent will review comments and update the plan

# Show plan details
$ exoctl plan show implement-auth

Plan: implement-auth
Status: review
Trace ID: 550e8400-e29b-41d4-a716-446655440000
Request ID: implement-auth

--- Plan Content ---
...
```

**Activity Logging Examples:**

```typescript
// Plan Approved (via CLI)
db.logActivity(
  "human",
  "plan.approved",
  "implement-auth",
  {
    approved_by: "user@example.com",
    approved_at: "2024-11-25T15:30:00Z",
    via: "cli",
  },
  "550e8400-e29b-41d4-a716-446655440000",
  null,
);

// Plan Rejected (via CLI)
db.logActivity(
  "human",
  "plan.rejected",
  "risky-change",
  {
    rejected_by: "user@example.com",
    rejection_reason: "Approach is too risky, use incremental strategy instead",
    rejected_at: "2024-11-25T15:35:00Z",
    via: "cli",
  },
  "660e8400-e29b-41d4-a716-446655440001",
  null,
);

// Revision Requested (via CLI)
db.logActivity(
  "human",
  "plan.revision_requested",
  "add-logging",
  {
    reviewed_by: "user@example.com",
    comment_count: 3,
    reviewed_at: "2024-11-25T16:00:00Z",
    via: "cli",
  },
  "770e8400-e29b-41d4-a716-446655440002",
  null,
);
```

**Query Examples:**

```sql
-- Get all human actions for a trace
SELECT action_type, payload, timestamp
FROM activity
WHERE trace_id = '550e8400-e29b-41d4-a716-446655440000'
  AND actor = 'human'
ORDER BY timestamp;

-- Find plans awaiting human review (no approval/rejection logged)
SELECT 
  a1.target as plan_id,
  a1.timestamp as created_at
FROM activity a1
WHERE a1.action_type = 'plan.created'
  AND NOT EXISTS (
    SELECT 1 FROM activity a2
    WHERE a2.trace_id = a1.trace_id
      AND a2.action_type IN ('plan.approved', 'plan.rejected')
  )
ORDER BY a1.timestamp DESC;

-- Calculate approval/rejection rate by user
SELECT 
  payload->>'approved_by' as user,
  COUNT(*) FILTER (WHERE action_type = 'plan.approved') as approved,
  COUNT(*) FILTER (WHERE action_type = 'plan.rejected') as rejected,
  COUNT(*) FILTER (WHERE action_type = 'plan.revision_requested') as revisions
FROM activity
WHERE actor = 'human'
GROUP BY payload->>'approved_by';
```

**Success Criteria:**

1. ✅ **`exoctl plan approve <id>`** validates plan exists before approving
2. ✅ **`exoctl plan approve <id>`** checks plan status (only 'review' plans can be approved)
3. ✅ **`exoctl plan approve <id>`** moves plan atomically to /System/Active
4. ✅ **`exoctl plan approve <id>`** logs approval with user identity and trace_id
5. ✅ **`exoctl plan reject <id> --reason`** validates reason is required and non-empty
6. ✅ **`exoctl plan reject <id> --reason`** updates frontmatter with rejection metadata
7. ✅ **`exoctl plan reject <id> --reason`** moves plan to /Inbox/Rejected with _rejected.md suffix
8. ✅ **`exoctl plan reject <id> --reason`** logs rejection with reason and trace_id
9. ✅ **`exoctl plan revise <id> --comment`** validates at least one comment is provided
10. ✅ **`exoctl plan revise <id> --comment`** supports multiple comments (--comment flag repeatable)
11. ✅ **`exoctl plan revise <id> --comment`** appends "## Review Comments" section to plan
12. ✅ **`exoctl plan revise <id> --comment`** updates frontmatter status to 'needs_revision'
13. ✅ **`exoctl plan revise <id> --comment`** logs revision request with comment count
14. ✅ **`exoctl plan list`** displays all plans in /Inbox/Plans with status indicators
15. ✅ **`exoctl plan list --status=<filter>`** filters plans by status (review, needs_revision)
16. ✅ **`exoctl plan show <id>`** displays plan frontmatter and full content
17. ✅ **All commands** capture user identity automatically (git config or OS username)
18. ✅ **All commands** perform atomic file operations (no partial states)
19. ✅ **All commands** provide clear error messages with resolution hints
20. ✅ **All commands** include success messages with next steps
21. ✅ **All commands** log actions with `actor: 'human'`, `agent_id: NULL`, `via: 'cli'`
22. ✅ **All commands** extract and validate trace_id from plan frontmatter
23. ✅ **Activity queries** can track approval/rejection/revision rates by user
24. ✅ **Activity queries** can find plans awaiting review (no approval/rejection logged)

---

### Step 4.5: The Mission Reporter (Episodic Memory)

- **Dependencies:** Step 4.3 (Execution Loop) — **Rollback:** rerun reporter for trace or regenerate from Activity
  Journal.
- **Action:** Generate comprehensive mission reports after successful task execution.
- **Requirement:** Reports must document what was done, why, and link back to context for future reference.
- **Justification:** Creates episodic memory for agents, enables learning from past executions, provides audit trail.

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
---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
request_id: "implement-auth"
status: "completed"
completed_at: "2024-11-25T14:30:00Z"
agent_id: "senior-coder"
branch: "feat/implement-auth-550e8400"
---

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

**Success Criteria:**

- After successful execution, report created in /Knowledge/Reports
- Report filename follows convention: `{date}_{traceId}_{requestId}.md`
- Report includes git diff summary and file changes
- Report contains Obsidian wiki links to context files
- Report logged to Activity Journal with trace_id
- Report is searchable for future context loading

---

## Phase 5: Usability & Polish

**Goal:** Human usability and system stability.

### Step 5.1: CLI (exoctl)

- **Dependencies:** Phase 4 exit — **Rollback:** hide commands behind `EXOCLI_EXPERIMENTAL`.
- **Action:** Create `cli.ts` implementing `mount`, `status`, `log`.
- **Justification:** Manual SQLite queries are painful.
- **Success Criteria:**
  - `exoctl status` shows running agents.
  - `exoctl portal add` creates symlink and context card.

### Step 5.2: Heartbeat & Leases

- **Dependencies:** Step 1.2 — **Rollback:** disable loop, run manual `lease clean`.
- **Action:** Implement background loop updating `leases` table.
- **Justification:** Prevents deadlocks if Agent crashes.
- **Success Criteria:**
  - Simulate crash; verify lock expires after 60s and file becomes writable.

### Step 5.3: The Dry Run (Integration Test)

- **Dependencies:** Phases 1–4 — **Rollback:** keep script in `/scripts/experimental`.
- **Action:** Create script running "Scenario A" (Software House of One) with Mock LLM.
- **Success Criteria:**
  - Script runs end-to-end without manual intervention.

### Step 5.4: The Obsidian Dashboard

- **Dependencies:** Step 5.1 — **Rollback:** provide plain Markdown summary.
- **Action:** Create `/Knowledge/Dashboard.md` with Dataview queries.
- **Justification:** Users live in Obsidian, not the terminal.
- **Success Criteria:**
  - Opening Dashboard shows live list of Active tasks.

- **Example implementation**

  ## /Knowledge/Dashboard.md

  \`\`\`dataview TABLE status as Status, date(created) as Created, agent as Agent, target as Target FROM "Reports" WHERE
  contains(file.name, "trace") SORT created DESC LIMIT 10 \`\`\`

  ## Current Active Tasks

  \`\`\`dataview TABLE status, agent, date(created) as Started FROM "System/Active" SORT created DESC \`\`\`

  ## Recent Plans

  \`\`\`dataview TABLE status as Status, link(file.path, "Open") as File FROM "Inbox/Plans" WHERE status = "review" SORT
  created DESC LIMIT 5 \`\`\`

  ## Failed Tasks (Need Attention)

  \`\`\`dataview LIST FROM "Reports" WHERE status = "failed" SORT created DESC \`\`\`

## Phase 6: Obsidian Setup

> **Platform note:** Maintainers must document OS-specific instructions (Windows symlink prerequisites, macOS sandbox
> prompts, Linux desktop watchers) before marking each sub-step complete.

### 6.1: Install Required Plugins

**Dataview:**

1. Open Obsidian Settings → Community Plugins
2. Disable Safe Mode
3. Browse → Search "Dataview"
4. Install and Enable

**File Tree Alternative (Optional):**

- Enables sidebar navigation of ExoFrame folders

### 6.2: Configure Obsidian Vault

Point Obsidian to `/ExoFrame/Knowledge`:

1. Open Obsidian
2. "Open folder as vault"
3. Select `/home/user/ExoFrame/Knowledge`

### 6.3: Pin Dashboard

1. Open `Dashboard.md`
2. Right-click tab → Pin
3. Set as default start page (Settings → Core Plugins → Daily Notes)

### 6.4: Configure File Watcher

**Note:** Obsidian will show "Vault changed externally" warnings when agents write files. This is normal.

Settings → Files & Links:

- ☑ Automatically update internal links
- ☑ Detect all file extensions (to see .toml/.yaml)

### 6.5: Test Integration

1. Create a test request:

```bash
echo "Test task" > /ExoFrame/Inbox/Requests/test.md
```

2. Watch Dashboard refresh (Ctrl+R to force)

3. Should see new entry appear in "Current Tasks" table

---

## Phase 7: Testing & Quality Assurance

### Risk-to-Test Traceability

| Threat / Risk       | Mitigation Step          | Automated Test                         |
| ------------------- | ------------------------ | -------------------------------------- |
| Path traversal      | Step 2.3 security checks | `tests/security_test.ts`               |
| Lease starvation    | Step 5.2 heartbeat loop  | `tests/leases/heartbeat_test.ts`       |
| Context overflow    | Step 3.3 context loader  | `tests/context/context_loader_test.ts` |
| Git identity drift  | Step 4.2 Git service     | `tests/git/git_service_test.ts`        |
| Watcher instability | Step 2.1 watcher         | `tests/watcher/stability_test.ts`      |

### Step 7.1: Unit Test Foundation

- **Framework:** Deno's built-in test runner (`deno test`)
- **Coverage Target:** 70% for core logic (Engine, Security, Parser)
- **Action:** Create tests for:
  - Path canonicalization and security checks
  - Frontmatter YAML parsing (valid/invalid cases)
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

### Step 7.2: Mock LLM Provider

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

### Step 7.3: Integration Test Scenarios

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

### Step 7.4: Security Validation Tests

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

### Step 7.6: Manual QA Checklist

**Before each release, test on:**

- [ ] Fresh Ubuntu 24.04 VM (no prior Deno install)
- [ ] macOS (Apple Silicon)
- [ ] Windows 11 + WSL2

**Test scenarios (map to Threat IDs):**

- [ ] Fresh install → Setup → Mount portal → Create request → Approve → Verify execution (Happy path)
- [ ] Force-kill daemon mid-execution → Restart → Verify lease expires (**T-Lease**)
- [ ] Corrupt database → Verify error message, recovery procedure (**T-DataLoss**)
- [ ] Create request with invalid YAML → Verify validation error logged (**T-Input**)
- [ ] Test with actual OpenAI/Anthropic API (not mock) (**T-Creds**)

## Bootstrap: Developer Workspace Setup

> **Moved to separate document:** [ExoFrame Developer Setup](./ExoFrame_Developer_Setup.md)

Please refer to the setup guide for instructions on how to bootstrap a local development workspace on Ubuntu or Windows
(WSL2).

---

_End of Implementation Plan_
