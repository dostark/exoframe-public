# ExoFrame Test Development Guidelines

This document contains instructions for AI coding agents when creating or refactoring tests in the ExoFrame project.

## Core Testing Patterns

### Pattern 12: Coverage-Driven TDD

**Target**: Minimum 70% branch coverage on new features.

**Process**:

1. Request implementation with coverage target
2. Implement and run coverage report (`deno test --coverage`)
3. Identify uncovered branches
4. Add specific tests for those branches

**Why**: Branch coverage catches conditional logic gaps that line coverage misses.

### Pattern 13: Test Organization and Deduplication

**Structure**:

- `tests/cli/` - CLI command tests
- `tests/services/` - Service unit tests
- `tests/integration/` - End-to-end workflows
- `tests/helpers/` - Shared test utilities

**Deduplication Checklist**:

1. Search for similar test file names
2. Compare test case names for duplicates
3. Merge unique cases into canonical location
4. Delete duplicate files

### Pattern 22: Security Tests as First-Class Citizens

**Requirement**: Every security boundary needs explicit tests.

**Practice**: Label security tests explicitly with `[security]`.

**Coverage**:

- Path traversal (e.g., `../../etc/passwd`)
- Shell injection (e.g., `; rm -rf /`)
- Network exfiltration
- Env variable leakage

**Example**:

```typescript
Deno.test({
  name: "[security] path traversal attack should be blocked",
  fn: async () => { ... }
});
```

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

### Agent Blueprints: Use YAML frontmatter (`---`)

```markdown
---
name: "code-reviewer"
model: "anthropic:claude-3-5-sonnet-20241022"
capabilities: ["read_file", "write_file", "list_directory"]
---

# Code Reviewer Agent

System prompt and description here...
```

## Agent Blueprint Testing

### Test Agent Loading and Validation

```typescript
import { BlueprintService } from "../../src/services/blueprint_service.ts";
import { createMockConfig } from "./helpers/config.ts";

Deno.test("BlueprintService: loads example agents from Step 6.10", async () => {
  const config = createMockConfig(tempDir);
  const blueprintService = new BlueprintService({ config });

  // Test loading code-reviewer agent
  const codeReviewer = await blueprintService.loadBlueprint("code-reviewer");
  assertExists(codeReviewer);
  assertEquals(codeReviewer.name, "code-reviewer");
  assertEquals(codeReviewer.model, "anthropic:claude-3-5-sonnet-20241022");
  assert(codeReviewer.capabilities.includes("read_file"));
});

Deno.test("BlueprintService: validates agent capabilities", async () => {
  const config = createMockConfig(tempDir);
  const blueprintService = new BlueprintService({ config });

  // Test invalid capability
  await assertRejects(
    async () => await blueprintService.loadBlueprint("invalid-agent"),
    Error,
    "Blueprint not found",
  );
});
```

### Test MCP Tool Interactions

```typescript
import { MCPToolRegistry } from "../../src/mcp/tools.ts";
import { createPortalConfigTestContext } from "./helpers/portal_test_helper.ts";

Deno.test("MCP Tools: agent can read files with proper permissions", async () => {
  const { helper, cleanup } = await createPortalConfigTestContext("mcp-test");

  try {
    const registry = new MCPToolRegistry(helper.config);

    // Test read_file tool with code-reviewer agent
    const result = await registry.invokeTool("read_file", {
      portal: "TestPortal",
      path: "src/main.ts",
    }, "code-reviewer");

    assertExists(result);
    assertEquals(result.success, true);
  } finally {
    await cleanup();
  }
});

Deno.test("MCP Tools: blocks unauthorized portal access", async () => {
  const { helper, cleanup } = await createPortalConfigTestContext("mcp-test");

  try {
    const registry = new MCPToolRegistry(helper.config);

    // Test unauthorized agent
    await assertRejects(
      async () =>
        await registry.invokeTool("write_file", {
          portal: "RestrictedPortal",
          path: "secret.txt",
          content: "secret data",
        }, "unauthorized-agent"),
      Error,
      "permission denied",
    );
  } finally {
    await cleanup();
  }
});
```

### Test Agent Execution in Flows

```typescript
import { FlowRunner } from "../../src/services/flow_runner.ts";
import { defineFlow } from "../../src/flows/define_flow.ts";

Deno.test("FlowRunner: executes agent from Step 6.10 examples", async () => {
  const { helper, cleanup } = await createPortalConfigTestContext("flow-test");

  try {
    const flow = defineFlow({
      id: "test-flow",
      name: "Test Flow",
      description: "Test agent execution",
      version: "1.0.0",
      steps: [{
        id: "review",
        name: "Code Review",
        agent: "code-reviewer", // From Step 6.10 examples
        dependsOn: [],
        input: { source: "request", transform: "passthrough" },
        retry: { maxAttempts: 1, backoffMs: 1000 },
      }],
    });

    const runner = new FlowRunner({ config: helper.config });
    const result = await runner.executeFlow(flow, "test-request-id");

    assertExists(result);
    assertEquals(result.success, true);
  } finally {
    await cleanup();
  }
});
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

## Test Code Deduplication

### ⚠️ CRITICAL: Avoid Duplicated Test Setup/Teardown

**Target**: Keep overall duplication below **3%**.

### Use Existing Test Helpers

**Before adding new tests**, check if a helper exists:

1. **`tests/helpers/db.ts`** - Database initialization
   - `initTestDbService()` - Full db setup with cleanup
   - `initActivityTableSchema()` - Schema-only for reconnection tests

2. **`tests/helpers/config.ts`** - Configuration
   - `createMockConfig()` - Generate test configs
   - `createTestConfigService()` - ConfigService instances

3. **`tests/helpers/git_test_helper.ts`** - Git operations
   - `GitTestHelper` class with repo setup, commit, branch operations
   - `createGitTestContext()` factory function

4. **`tests/helpers/watcher_test_helper.ts`** - FileWatcher tests
   - `WatcherTestHelper` class for file watching scenarios
   - `createWatcherTestContext()` factory function

5. **`tests/helpers/tool_registry_test_helper.ts`** - ToolRegistry tests
   - `ToolRegistryTestHelper` class for tool execution tests
   - `createToolRegistryTestContext()` factory function

6. **`tests/helpers/portal_test_helper.ts`** - Portal configuration tests
   - `PortalConfigTestHelper` class for portal operations
   - `createPortalConfigTestContext()` factory function

### Create New Helpers When Needed

**If you find yourself writing the same setup code 3+ times**, create a helper:

```typescript
// tests/helpers/my_feature_test_helper.ts
export class MyFeatureTestHelper {
  constructor(
    public readonly tempDir: string,
    public readonly service: MyService,
    private readonly cleanup: () => Promise<void>,
  ) {}

  static async create(prefix: string): Promise<MyFeatureTestHelper> {
    const tempDir = await Deno.makeTempDir({ prefix: `my-feature-${prefix}-` });
    const { db, cleanup: dbCleanup } = await initTestDbService();
    const config = createMockConfig(tempDir);
    const service = new MyService({ config, db });

    return new MyFeatureTestHelper(
      tempDir,
      service,
      async () => {
        await dbCleanup();
        await Deno.remove(tempDir, { recursive: true }).catch(() => {});
      },
    );
  }

  async doCommonSetup(): Promise<void> {
    // Common setup operations
  }

  async cleanup(): Promise<void> {
    await this.cleanup();
  }
}

export async function createMyFeatureTestContext(
  prefix: string,
): Promise<{ helper: MyFeatureTestHelper; cleanup: () => Promise<void> }> {
  const helper = await MyFeatureTestHelper.create(prefix);
  return {
    helper,
    cleanup: () => helper.cleanup(),
  };
}
```

### Measure Test Duplication

After adding/modifying tests:

```bash
# Check overall duplication
npx jscpd src tests --reporters json --output ./report

# Identify test files with most duplication
python3 -c "import json; data=json.load(open('report/jscpd-report.json')); \
  files={}; \
  for d in data['duplicates']: \
    for f in d['fragment']: \
      if 'tests/' in f['loc']: \
        files[f['loc']] = files.get(f['loc'], 0) + 1; \
  sorted_files = sorted(files.items(), key=lambda x: x[1], reverse=True); \
  [print(f'{count} clones: {file}') for file, count in sorted_files[:10]]"
```

### Refactoring Test Code

**When duplication is detected**:

1. **Identify the pattern** - What's being repeated?
2. **Check existing helpers** - Can you extend an existing helper?
3. **Create or extend helper** - Extract to `tests/helpers/`
4. **Refactor tests incrementally** - One test at a time
5. **Verify all tests pass** - Run test suite after each change
6. **Measure improvement** - Confirm duplication decreased

**Example - Before (repeated in 5 tests)**:

```typescript
const tempDir = await Deno.makeTempDir({ prefix: "feature-test-" });
const { db, cleanup: dbCleanup } = await initTestDbService();
const config = createMockConfig(tempDir);
const service = new MyService({ config, db });
try {
  // ... test logic ...
} finally {
  await dbCleanup();
  await Deno.remove(tempDir, { recursive: true });
}
```

**Example - After (using helper)**:

```typescript
const { helper, cleanup } = await createMyFeatureTestContext("test-name");
try {
  await helper.doCommonSetup();
  // ... test logic ...
} finally {
  await cleanup();
}
```

**Documentation**: Refer to project documentation for refactoring patterns and helper examples.

## Success Criteria

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

## Flow Testing Guidelines

### Test Flow Definition and Validation

```typescript
import { defineFlow } from "../../src/flows/define_flow.ts";
import { FlowSchema } from "../../src/schemas/flow.ts";

Deno.test("Flow Definition: validates Step 7.9 example flows", async () => {
  // Test pipeline flow from examples
  const pipelineFlow = defineFlow({
    id: "code-review-pipeline",
    name: "Code Review Pipeline",
    description: "Multi-stage code review from Step 7.9",
    version: "1.0.0",
    steps: [
      {
        id: "lint",
        name: "Code Linting",
        agent: "code-quality-agent",
        dependsOn: [],
        input: { source: "request", transform: "extract_code" },
        retry: { maxAttempts: 1, backoffMs: 1000 },
      },
      {
        id: "security",
        name: "Security Analysis",
        agent: "security-agent",
        dependsOn: ["lint"],
        input: { source: "step", stepId: "lint", transform: "passthrough" },
        retry: { maxAttempts: 2, backoffMs: 2000 },
      },
    ],
  });

  // Validate against schema
  const validation = FlowSchema.safeParse(pipelineFlow);
  assert(validation.success, `Flow validation failed: ${validation.error}`);
});
```

### Test Flow Execution with Mock Agents

```typescript
import { FlowRunner } from "../../src/services/flow_runner.ts";

Deno.test("FlowRunner: executes fan-out-fan-in pattern from Step 7.9", async () => {
  const { helper, cleanup } = await createPortalConfigTestContext("flow-test");

  try {
    const fanOutFlow = defineFlow({
      id: "research-synthesis",
      name: "Research Synthesis",
      description: "Fan-out-fan-in pattern from Step 7.9",
      version: "1.0.0",
      steps: [
        {
          id: "researcher1",
          name: "Researcher 1",
          agent: "research-synthesizer",
          dependsOn: [],
          input: { source: "request", transform: "extract_topic" },
          retry: { maxAttempts: 1, backoffMs: 1000 },
        },
        {
          id: "synthesizer",
          name: "Synthesizer",
          agent: "research-synthesizer",
          dependsOn: ["researcher1", "researcher2"],
          input: { source: "step", stepId: "researcher1", transform: "mergeAsContext" },
          retry: { maxAttempts: 1, backoffMs: 1000 },
        },
      ],
    });

    const runner = new FlowRunner({ config: helper.config });
    const result = await runner.executeFlow(fanOutFlow, "test-request-id");

    assertExists(result);
    assertEquals(result.steps.length, 3);
  } finally {
    await cleanup();
  }
});
```
