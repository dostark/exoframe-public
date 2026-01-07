
## Phase 2: The Nervous System (Events & State) ✅ COMPLETED

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

