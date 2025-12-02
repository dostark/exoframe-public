# ExoFrame Test Development Guidelines

This document contains instructions for AI coding agents when creating or refactoring tests in the ExoFrame project.

## Database Initialization

### ✅ DO: Use `initTestDbService()` for DatabaseService tests

```typescript
import { initTestDbService } from "./helpers/db.ts";

const { db, tempDir, config, cleanup } = await initTestDbService();
// ... run tests ...
await cleanup();
```

### ✅ DO: Use `initActivityTableSchema()` for reconnection tests

When testing data persistence across database connections:

```typescript
import { initActivityTableSchema, initTestDbService } from "./helpers/db.ts";
import { createMockConfig } from "./helpers/config.ts";

const { db: db1, tempDir, cleanup: _cleanup } = await initTestDbService();
// Write data with db1, then close it
db1.close();

// Create second connection
const config2 = createMockConfig(tempDir);
const db2 = new DatabaseService(config2);
initActivityTableSchema(db2);
// Read data with db2
```

### ❌ DON'T: Create activity table with raw SQL

Never use raw `CREATE TABLE` statements in test files:

```typescript
// ❌ WRONG
db.instance.exec(`
  CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY,
    ...
  );
`);

// ✅ CORRECT
import { initTestDbService } from "./helpers/db.ts";
const { db, cleanup } = await initTestDbService();
```

## Frontmatter Formats

### Request Files: Use YAML frontmatter (`---`)

```markdown
---
trace_id: "abc-123-def"
agent: "senior-coder"
status: "pending"
priority: "normal"
---

# Request description here
```

### Plan Files: Use YAML frontmatter (`---`)

```markdown
---
trace_id: "abc-123-def"
request_id: "request-abc123"
agent_id: "senior-coder"
status: "review"
created_at: "2025-01-01T00:00:00Z"
---

# Proposed Plan
```

## MockLLMProvider Usage

### Scripted Responses

```typescript
import { MockLLMProvider } from "../src/ai/providers/mock_llm_provider.ts";

const mockProvider = new MockLLMProvider("scripted", {
  responses: [
    "First response",
    "Second response",
  ],
});
```

### Tool Calls in Responses

```typescript
const mockProvider = new MockLLMProvider("scripted", {
  responses: [
    JSON.stringify({
      tool_calls: [{
        id: "call_1",
        type: "function",
        function: {
          name: "write_file",
          arguments: JSON.stringify({ path: "test.ts", content: "..." }),
        },
      }],
    }),
  ],
});
```

## Config Creation

### Use `createMockConfig()` for test configurations

```typescript
import { createMockConfig } from "./helpers/config.ts";

const config = createMockConfig(tempDir, {
  watcher: { debounce_ms: 50, stability_check: false },
  database: { batch_flush_ms: 50, batch_max_size: 10 },
});
```

### Config Structure Requirements

The config object must include all required nested objects:

```typescript
{
  root: tempDir,
  database: { batch_flush_ms: 100, batch_max_size: 100 },
  watcher: { debounce_ms: 100, stability_check: true },
  blueprints: { agents_dir: "Blueprints/Agents", flows_dir: "Blueprints/Flows" },
  inbox: { requests_dir: "Inbox/Requests", plans_dir: "Inbox/Plans" },
  // ... other required fields
}
```

## Activity Logging in Tests

### Always wait for flush before querying

```typescript
db.logActivity("human", "action.type", "target", { payload: "data" }, traceId);

// ✅ REQUIRED: Wait for batched write to complete
await db.waitForFlush();

// Now safe to query
const activities = db.getActivitiesByTrace(traceId);
```

## Test File Structure

### Use BDD-style describe/it blocks

```typescript
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@^1.0.0/bdd";
import { assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";

describe("FeatureName", () => {
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const result = await initTestDbService();
    cleanup = result.cleanup;
    // ... setup
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("methodName", () => {
    it("should do something specific", async () => {
      // ... test
    });
  });
});
```

### Or use Deno.test for simple tests

```typescript
Deno.test("FeatureName: does something", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    // ... test
  } finally {
    await cleanup();
  }
});
```

## Cleanup Patterns

### With try/finally for cleanup

```typescript
const { db, cleanup } = await initTestDbService();
try {
  // ... test code
} finally {
  await cleanup();
}
```

### With afterEach hook

```typescript
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const result = await initTestDbService();
  cleanup = result.cleanup;
});

afterEach(async () => {
  await cleanup();
});
```

### Mark unused variables with underscore prefix

```typescript
// When cleanup is handled manually (e.g., reconnection tests)
const { db, tempDir, cleanup: _cleanup } = await initTestDbService();
```

## Git Operations in Tests

### Initialize git repository for changeset tests

```typescript
async function runGitCommand(cwd: string, args: string[]): Promise<string> {
  const cmd = new Deno.Command("git", {
    args: ["-C", cwd, ...args],
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout, success } = await cmd.output();
  if (!success) throw new Error(`Git command failed: ${args.join(" ")}`);
  return new TextDecoder().decode(stdout).trim();
}

// In beforeEach:
await runGitCommand(tempDir, ["init", "-b", "main"]);
await runGitCommand(tempDir, ["config", "user.email", "test@example.com"]);
await runGitCommand(tempDir, ["config", "user.name", "Test User"]);
```

## Integration Test Environment

### Use TestEnvironment helper

```typescript
import { TestEnvironment } from "./helpers/test_environment.ts";

const env = await TestEnvironment.create({
  initGit: true,
  configOverrides: { watcher: { debounce_ms: 50 } },
});

try {
  await env.createRequest("Description", { priority: 5 });
  // ... test
} finally {
  await env.cleanup();
}
```

## Common Assertions

```typescript
import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert@^1.0.0";

// Check value exists
assertExists(result.trace_id);

// Check exact equality
assertEquals(result.status, "pending");

// Check string contains
assertStringIncludes(content, "expected text");

// Check async throws
await assertRejects(
  async () => await someAsyncFunction(),
  Error,
  "expected error message",
);
```

## File Paths

### Always use absolute paths with join()

```typescript
import { join } from "@std/path";

const filePath = join(tempDir, "Inbox", "Requests", "request.md");
```

### Use ensureDir for directory creation

```typescript
import { ensureDir } from "@std/fs";

await ensureDir(join(tempDir, "Inbox", "Requests"));
```

## Test Documentation

### Add success criteria comments

```typescript
/**
 * Tests for FeatureName
 *
 * Success Criteria:
 * - Test 1: Does X when Y
 * - Test 2: Handles error case Z
 * - Test 3: Validates input correctly
 */
```

## CLI Command Testing

### ⚠️ CRITICAL: Add Integration Tests for New CLI Commands

**When implementing new CLI commands, you MUST add corresponding integration tests in `tests/integration/`.**

Each new CLI command requires:

1. **Unit tests** in `tests/cli/<command>_commands_test.ts` - Test command logic in isolation
2. **Integration tests** in `tests/integration/` - Test command in realistic scenarios with:
   - Full workspace setup (database, file watchers, etc.)
   - Interaction with other system components
   - End-to-end workflows (e.g., create request → generate plan → approve → execute)
   - Error handling and edge cases in production-like environment

### Integration Test Naming Convention

Use sequential numbering for integration tests:

```
tests/integration/
├── 01_happy_path_test.ts          # Basic success flow
├── 02_plan_rejection_test.ts      # Alternative flow
├── 03_plan_revision_test.ts       # Iterative flow
├── 04_execution_failure_test.ts   # Error handling
├── 05_concurrent_requests_test.ts # Concurrency
├── ...
├── 11_new_feature_test.ts         # Your new integration test
```

### Integration Test Structure

```typescript
import { TestEnvironment } from "./helpers/test_environment.ts";
import { assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";

Deno.test("Integration: New CLI Feature - success flow", async () => {
  const env = await TestEnvironment.create({
    initGit: true,
    configOverrides: { watcher: { debounce_ms: 50 } },
  });

  try {
    // Step 1: Setup preconditions
    await env.createRequest("Test request");

    // Step 2: Execute CLI command
    const result = await env.runCliCommand("new-command", ["arg1", "arg2"]);

    // Step 3: Verify state changes
    assertExists(result);
    assertEquals(result.status, "success");

    // Step 4: Verify side effects (files created, DB updated, etc.)
    const activities = env.db.getActivitiesByTrace(result.trace_id);
    assertEquals(activities.length, 1);
  } finally {
    await env.cleanup();
  }
});
```

### When to Add Integration Tests

Add integration tests when:

- Adding new CLI commands (`exoctl <new-command>`)
- Modifying workflows that span multiple components
- Implementing features that interact with external systems (git, file system, etc.)
- Adding error handling for complex failure scenarios

Integration tests complement unit tests by validating the system works correctly as a whole, not just in isolation.

## Running Tests

```bash
# Run all tests
deno test --allow-all

# Run specific test file
deno test tests/feature_test.ts --allow-all

# Run with filter
deno test --allow-all --filter "FeatureName"

# Run only integration tests
deno test tests/integration/ --allow-all
```

## Final Step: Format Code

**ALWAYS run `deno fmt` as the final step after major code changes.**

```bash
# Format all files
deno fmt

# Check formatting without modifying
deno fmt --check
```

This ensures consistent code style across the codebase and prevents formatting-related lint errors.
