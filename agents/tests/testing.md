---
agent: copilot
scope: dev
title: ExoFrame Test Development Guidelines
short_summary: "Testing patterns and unified test context for ExoFrame (initTestDbService, createCliTestContext, withEnv, etc.)."
version: "0.1"
topics: ["tests","tdd","helpers"]
---

# ExoFrame Test Development Guidelines (migrated)

This document is a migration of `tests/AGENT_INSTRUCTIONS.md` into `agents/` to provide focused guidance for dev-time agents and tooling.

Key points
- Use `initTestDbService()` and `createCliTestContext()` to centralize db+tempdir setup
- Use `withEnv()` for temporary env var changes in tests
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

---

*The above content is migrated from `tests/AGENT_INSTRUCTIONS.md` to ensure the `agents/tests/testing.md` document contains the full guidance used by test-focused agents.*
