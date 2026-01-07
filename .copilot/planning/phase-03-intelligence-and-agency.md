## Phase 3: The Brain (Intelligence & Agency) ✅ COMPLETED

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

```bash
# 1. Create request and approve
$ exoctl request "Implement user registration" --portal=MyProject
$ exoctl plan approve <plan-id>

# 2. Wait for execution
$ sleep 10

# 3. Verify report created
$ ls -la Knowledge/Reports/
# Expected: 2025-01-26_550e8400_implement-user-registration.md

# 4. Verify report structure
$ cat Knowledge/Reports/2025-01-26_550e8400_implement-user-registration.md
# Expected: Valid TOML frontmatter, Summary, Changes Made, Git Summary, Context Used, Reasoning sections

# 5. Check Activity Journal
$ exoctl journal --filter trace_id=<trace_id>
plan.detected
plan.parsed
plan.executing
agent.tool.invoked (read_file)
agent.git.branch_created
agent.tool.invoked (write_file)
agent.git.commit
changeset.created
plan.executed
```

---
