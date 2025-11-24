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

### Step 1.1: Project Scaffold & Deno Configuration

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

### Step 1.2: The Activity Journal (SQLite)

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
    actor TEXT NOT NULL,
    action_type TEXT NOT NULL,
    payload JSON NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX idx_activity_trace ON activity(trace_id);
  CREATE INDEX idx_activity_time ON activity(timestamp);
  CREATE INDEX idx_activity_actor ON activity(actor);

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

### Step 1.3: Configuration Loader (TOML + Zod)

- **Dependencies:** Step 1.2 — **Rollback:** revert config schema, restore previous TOML.
- **Action:** Create `ConfigService`. Define Zod schemas for `exo.config.toml`. Include config checksum in Activity
  Journal for auditability.
- **Justification:** Hardcoding paths is technical debt. We need a single source of truth for system physics.
- **Success Criteria:**
  - System loads config on startup.
  - System throws a readable error if `exo.config.toml` is malformed or missing keys.

### Step 1.4: The Knowledge Vault Scaffold

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

### Step 2.1: The File Watcher (Stable Read)

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

### Step 2.2: The Zod Frontmatter Parser

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

### Step 2.3: The Path Security & Portal Resolver

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

### Step 2.4: The Context Card Generator

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

### Step 3.1: The Model Adapter (Mocked & Real)

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

### Step 3.2: The Agent Runtime (Stateless Execution)

- **Action:** Implement `AgentRunner`. Compiles Blueprint + Request into a System Prompt; for `runtime_mode: hybrid`,
  auto-splits prompts per agent type, sharing only the approved context slices and logging each hop.
- **Justification:** Core logic combining "Who I am" (Blueprint) with "What I need to do" (Request).
- **Success Criteria:**
  - System can read Request, send to LLM, and receive text response.

### Step 3.3: The Context Injector (Token Safe)

- **Dependencies:** Steps 3.1–3.2 — **Rollback:** disable loader and manually attach context bundle.
- **Action:** Implement `ContextLoader` service with configurable truncation, per-file cap overrides, and logging of
  skipped/truncated files into Activity Journal. Loader must detect whether the target agent is **local-first** (runs
  entirely on the user’s machine) or **third-party API**. Local agents operate without enforced token ceilings;
  third-party agents respect provider limits.
- **Token Counting:** Use character-based approximation (1 token ≈ 4 chars) when provider limits apply.
- **Strategy:** Load smallest files first to maximize coverage (default). Provide fallback strategies `drop-largest`,
  `drop-oldest`, `truncate-each`, and handle "no file fits" by truncating each file to the configured per-file cap.
- **Warning:** Inject `[System Warning]` block if truncation occurs, including the token budget and files impacted.
  Local agents skip this warning unless manually capped.
- **Success Criteria:**
  - Link 10 massive files (total 500k tokens)
  - Verify only first N files loaded up to 80% of context limit
  - Verify warning appears in agent's prompt
  - Verify agent receives warning and can reference it

- **Logic:**
  1. Resolve links to `/Knowledge/Context`.
  2. **Partial implementation:**

  ```typescript
  // src/services/context.ts

  interface ContextConfig {
    maxTokens: number; // From model config (e.g., 200k for Claude)
    safetyMargin: number; // Percentage (0.8 = use 80% max)
    truncationStrategy: "drop-largest" | "drop-oldest" | "truncate-each";
  }

  class ContextLoader {
    private tokenCounter: (text: string) => number;

    constructor() {
      // Simple approximation: 1 token ≈ 4 characters
      this.tokenCounter = (text) => Math.ceil(text.length / 4);
    }

    async loadWithLimit(
      filePaths: string[],
      config: ContextConfig,
    ): Promise<{ content: string; warnings: string[] }> {
      const limit = config.maxTokens * config.safetyMargin;
      const warnings: string[] = [];
      let totalTokens = 0;
      const chunks: string[] = [];

      // Sort by size (smallest first to maximize coverage)
      const files = await Promise.all(
        filePaths.map(async (path) => ({
          path,
          content: await Deno.readTextFile(path),
          size: (await Deno.stat(path)).size,
        })),
      );

      files.sort((a, b) => a.size - b.size);

      for (const file of files) {
        const tokens = this.tokenCounter(file.content);

        if (tokens > limit) {
          if (config.truncationStrategy === "truncate-each") {
            const allowedTokens = Math.max(limit - totalTokens, 0);
            const allowedChars = allowedTokens * 4;
            const truncated = file.content.slice(0, allowedChars);
            chunks.push(`\n## Context: ${file.path} (truncated)\n\n${truncated}\n`);
            warnings.push(`Truncated ${file.path} to ${allowedTokens} tokens`);
            totalTokens = limit;
            break;
          }
          warnings.push(
            `Skipped ${file.path} (${tokens} tokens, no strategy could include it)`,
          );
          continue;
        }

        if (totalTokens + tokens <= limit) {
          chunks.push(`\n## Context: ${file.path}\n\n${file.content}\n`);
          totalTokens += tokens;
        } else {
          warnings.push(
            `Skipped ${file.path} (${tokens} tokens, would exceed limit)`,
          );
        }
      }

      // Inject warnings into system prompt if any
      if (warnings.length > 0) {
        const warningBlock = `\n[System Warning: Context truncated. Budget=${limit} tokens]\n${warnings.join("\n")}\n`;
        chunks.unshift(warningBlock);
      }

      return {
        content: chunks.join("\n"),
        warnings,
      };
    }
  }
  ```

### Step 3.4: The Plan Writer (Drafting)

- **Action:** Wire output to write proposals to `/Inbox/Plans`.
- **Requirement:** Plan must include "Reasoning" section referencing used Context files.
- **Success Criteria:**
  - Dropping `request.md` results in `request_plan.md`.
  - Plan text links back to Obsidian notes: "Based on [[Architecture_Docs]]..."

---

## Phase 4: The Hands (Tools & Git)

**Goal:** Agents execute actions securely and robustly.

### Step 4.1: The Tool Registry

- **Action:** Map LLM tool calls (JSON) to Deno functions (`read_file`, `run_command`).
- **Justification:** Turns text into action.
- **Success Criteria:**
  - LLM outputting `{"tool": "read_file", ...}` triggers actual file read.

### Step 4.2: Git Integration (Identity Aware)

- **Action:** Implement `GitService` class with complete error handling.
- **Features:**
  - Auto-init repo if not exists
  - Auto-configure identity if missing
  - Handle branch name conflicts (append timestamp)
  - Validate changes exist before commit
  - Wrap all git operations in try/catch
- **Success Criteria:**
  - Run test in non-git directory → auto-initializes
  - Run test with no git config → auto-configures
  - Create branch twice → second gets unique name
  - Attempt commit with no changes → throws clear error
- **Partial implementation**

```typescript
// src/services/git.ts

class GitService {
  constructor(private workingDir: string) {}

  private async exec(args: string[]): Promise<string> {
    const command = new Deno.Command("git", {
      args,
      cwd: this.workingDir,
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await command.output();

    if (code !== 0) {
      const error = new TextDecoder().decode(stderr);
      throw new Error(`Git command failed: git ${args.join(" ")}\n${error}`);
    }

    return new TextDecoder().decode(stdout).trim();
  }

  async isRepo(): Promise<boolean> {
    try {
      await this.exec(["rev-parse", "--git-dir"]);
      return true;
    } catch {
      return false;
    }
  }

  async initIfNeeded(): Promise<void> {
    if (!(await this.isRepo())) {
      await this.exec(["init"]);
      await this.exec(["commit", "--allow-empty", "-m", "Initial commit"]);
    }
  }

  async ensureIdentity(): Promise<void> {
    try {
      await this.exec(["config", "user.email"]);
    } catch {
      // Email not configured, set default
      await this.exec(["config", "user.email", "bot@exoframe.local"]);
      await this.exec(["config", "user.name", "ExoFrame Agent"]);
    }
  }

  async createBranch(baseName: string, traceId: string): Promise<string> {
    await this.ensureIdentity();

    const branchName = `feat/${baseName}-${traceId.slice(0, 8)}`;

    try {
      await this.exec(["checkout", "-b", branchName]);
      return branchName;
    } catch (error) {
      // Branch might already exist, try with suffix
      const uniqueName = `${branchName}-${Date.now()}`;
      await this.exec(["checkout", "-b", uniqueName]);
      return uniqueName;
    }
  }

  async commit(message: string, traceId: string): Promise<void> {
    await this.ensureIdentity();

    // Check if there are changes to commit
    const status = await this.exec(["status", "--porcelain"]);
    if (status.trim().length === 0) {
      throw new Error("No changes to commit");
    }

    // Stage all changes
    await this.exec(["add", "-A"]);

    // Commit with trace ID footer
    const fullMessage = `${message}\n\n[ExoTrace: ${traceId}]`;
    await this.exec(["commit", "-m", fullMessage]);
  }

  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.exec(["status", "--porcelain"]);
    return status.trim().length > 0;
  }
}
```

### Step 4.3: The Execution Loop (Resilient)

- **Dependencies:** Steps 4.1–4.2 — **Rollback:** pause queue processing through config and replay from last clean
  snapshot.
- **Action:** Implement logic for `/System/Active`.
- **Logic:** Wrap execution in `try/catch`.
  - _Success:_ Call Mission Reporter, move Request to `/Inbox/Archive`.
  - _Failure:_ Write **Failure Report** (with error trace) to `/Knowledge/Reports`, move Request back to
    `/Inbox/Requests` (status: `error`).
- **Justification:** Ensures user knows _why_ an agent failed instead of infinite hanging.
- **Success Criteria:**
  - Force a tool failure. Verify "Failure Report" appears in Obsidian.

### Step 4.4: The Mission Reporter (Episodic Memory)

- **Dependencies:** Step 4.3 — **Rollback:** rerun reporter for trace or regenerate from Activity Journal.
- **Action:** On active task completion, write `YYYY-MM-DD_TraceID.md` to `/Knowledge/Reports`.
- **Content:** Summary of changes, files modified, self-reflection on errors.
- **Success Criteria:**
  - After active task, new Markdown file appears in Obsidian.
  - File contains valid link to Portal card.

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
