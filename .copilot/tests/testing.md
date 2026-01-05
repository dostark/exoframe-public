---
agent: copilot
scope: dev
title: ExoFrame Test Development Guidelines
short_summary: "Testing patterns and unified test context for ExoFrame (initTestDbService, createCliTestContext, withEnv, etc.)."
version: "0.1"
topics: ["tests", "tdd", "helpers"]
---

# ExoFrame Test Development Guidelines

Key points

- Use `initTestDbService()` and `createCliTestContext()` to centralize db+tempdir setup
- Use `withEnv()` for temporary env var changes in tests
- **Mocking**: Use `MockLLMProvider` for deterministic agent testing (avoid real API calls).
- **Integration**: Use `TestEnvironment.create()` to scaffold full workspace/DB structures.
- **Leases**: File locking integration tests live in `tests/execution_loop_test.ts`.

- Prefer `createCliTestContext()` for CLI tests and call returned `cleanup()` in `afterEach`

Canonical prompt (short):
"You are a test-writing assistant for ExoFrame. List failing test names and assertions first, using `initTestDbService()` or `createCliTestContext()` where appropriate."

Examples

- Example prompt: "Write tests that verify PlanWriter handles missing files and empty JSON. Use `initTestDbService()` and ensure cleanup is called."

Example snippet

```typescript
const { db, tempDir, cleanup } = await initTestDbService();
try {
  // test actions
} finally {
  await cleanup();
}
```

Examples section

- Example prompt: "Provide 3 failing unit tests showing how PlanWriter handles malformed plan.json and missing permissions."

## Full migration: Test guidelines (extended)

### Coverage-Driven TDD

Target: Minimum 70% branch coverage on new features. Request an implementation with a coverage target and add tests to cover uncovered branches using `deno test --coverage`.

### Advanced Testing Patterns

- **Refactoring & Duplication**: Use `npx jscpd src tests` to find duplicated test setup code. Extract helpers (e.g., `GitTestHelper`, `ToolRegistryTestHelper`) to keep tests DRY.
- **Paranoid Security Testing**: Ask agents to write "paranoid" tests: path traversal, command injection, symlink escapes. Whitelists beat blacklists.
- **Performance Testing**: Don't guess—measure. Ask agents to write benchmarks or load tests to verify async behavior (e.g., batched logging).

### Test Organization and Deduplication

- `tests/cli/` - CLI command tests
- `tests/services/` - Service unit tests
- `tests/integration/` - End-to-end workflows
- `tests/helpers/` - Shared test utilities

Deduplication checklist:

1. Search for similar test file names
2. Compare test case names for duplicates
3. Merge unique cases into canonical location
4. Delete duplicate files

### Security Tests as First-Class Citizens

Every security boundary needs explicit tests. Label security tests with `[security]` and include tests for path traversal, shell injection, network exfiltration, and env leakage.

### Database Initialization

✅ DO: Use `initTestDbService()` for DatabaseService tests. Prefer `initActivityTableSchema()` for reconnection tests and avoid raw SQL table creation in test files.

### CLI Test Context — Recommended Pattern

Use `createCliTestContext()` to centralize DB + tempdir setup for CLI tests. Always call returned `cleanup()` in `afterEach` to avoid leaking resources.

### Integration TestEnvironment — Recommended Pattern

Use `TestEnvironment.create()` for full integration tests that require workspace layout, DB, and optional git initialization. Prefer small, focused integration tests that exercise end-to-end behavior with deterministic teardown.

### CI (GitHub Actions) — Common Pitfalls

- Treat `CI` as a truthy flag (`CI=true` on GitHub Actions), not strictly `"1"`.
  - Prefer the shared helpers in `tests/helpers/env.ts` (`isCi()`, `isTruthyEnv()`).
- When CI guard is active, paid LLM providers are intentionally disabled unless explicitly opted in.
  - Expect mock behavior unless `EXO_ENABLE_PAID_LLM=1` is set.
  - Tests that assert provider selection should include a CI-guard branch (e.g., accept `mock-provider` or `CI-protected ...`).
- Avoid requiring compiled binaries in tests.
  - If you need to run the CLI from a temp workspace, prefer:
    - `new Deno.Command(Deno.execPath(), { args: ["run", "--allow-all", "--config", <repo>/deno.json, <repo>/src/cli/exoctl.ts, ...] })`
  - This keeps behavior consistent between local runs and CI without extra build steps.

---
