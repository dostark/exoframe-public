# CLAUDE.md — ExoFrame AI Assistant Guidelines

> **Purpose:** Provide AI assistants with immediate context about ExoFrame's structure, conventions, and where to find detailed guidance.

## Quick Reference

| Need | Location |
|------|----------|
| Task → Doc mapping | [.copilot/cross-reference.md](.copilot/cross-reference.md) |
| Source patterns | [.copilot/source/exoframe.md](.copilot/source/exoframe.md) |
| Testing patterns | [.copilot/tests/testing.md](.copilot/tests/testing.md) |
| Documentation guide | [.copilot/docs/documentation.md](.copilot/docs/documentation.md) |
| Planning documents | [.copilot/planning/](.copilot/planning/) |
| All agent docs index | [.copilot/manifest.json](.copilot/manifest.json) |

## Project Overview

**ExoFrame** is an AI agent orchestration framework built with **Deno** and **TypeScript**.

### Runtime & Tooling
- **Runtime:** Deno (strict TypeScript)
- **Config:** `deno.json` (tasks, imports)
- **Pre-commit:** Auto-runs `fmt:check`, `lint`, `check:docs`

### Key Commands
```bash
deno task test              # Run all tests
deno task test:cov          # Run with coverage
deno task fmt               # Format code
deno task lint              # Lint code
deno task check:docs        # Verify .copilot/manifest.json is fresh
```

## Development Workflow

### TDD-First (MANDATORY)
1. Write failing tests first
2. Implement minimal code to pass
3. Refactor with tests green
4. Verify coverage maintained

### Before Committing
- Run `deno task test` — all tests must pass
- Run `deno task fmt` — code must be formatted
- Pre-commit hooks enforce: `fmt:check`, `lint`, `check:docs`

## Project Structure

```
src/
├── ai/          # LLM provider implementations
├── cli/         # CLI commands (exoctl)
├── config/      # Configuration schemas
├── parsers/     # File parsers (frontmatter)
├── schemas/     # Zod validation schemas
├── services/    # Core business logic
├── tui/         # Terminal UI components
└── main.ts      # Entry point

tests/           # Mirror of src/ structure
.copilot/          # AI assistant guidance (see below)
docs/            # User & architecture documentation
```

## .copilot/ Directory — Your Knowledge Base

The `.copilot/` folder contains **machine-readable guidance** for AI assistants:

### Structure
```
.copilot/
├── manifest.json       # Index of all agent docs (auto-generated)
├── cross-reference.md  # Task → Document quick reference
├── source/             # Source code development patterns
├── tests/              # Testing patterns and helpers
├── docs/               # Documentation maintenance
├── process/            # Development processes
├── prompts/            # Example prompts for various tasks
├── providers/          # Provider-specific guidance (Claude, OpenAI, etc.)
├── planning/           # Phase planning documents
└── chunks/             # Pre-chunked docs for RAG (auto-generated)
```

### When to Consult .copilot/

| Task | Consult |
|------|---------|
| Writing tests | `.copilot/tests/testing.md` |
| Adding features | `.copilot/source/exoframe.md` + `.copilot/tests/testing.md` |
| Refactoring | `.copilot/source/exoframe.md` |
| Documentation | `.copilot/docs/documentation.md` |
| Planning/roadmap | `.copilot/planning/*.md` |
| Finding the right doc | `.copilot/cross-reference.md` |

## Key Patterns & Constraints

### Service Pattern
- Constructor-based DI: pass `config`, `db`, `provider`
- Keep side effects out of constructors

### File System as Database
- `Workspace/Active`, `Workspace/Requests`, `Workspace/Plans` are the "database"
- Use atomic file operations (write + rename)
- All side-effects MUST log to Activity Journal via `EventLogger`

### Security Modes
- **Sandboxed:** No network, no file access (default)
- **Hybrid:** Read-only access to Portal paths
- Always use `PathResolver` to validate paths

### TUI Tests (Important)
- Use `sanitizeOps: false, sanitizeResources: false` for timer-based tests
- Skip `setTimeout` in test mode to avoid timer leaks
- Pattern: `if (Deno.env.get("DENO_TEST") !== "1") setTimeout(...)`

## Test Helpers

```typescript
// Database + tempdir setup
const { db, tempDir, cleanup } = await initTestDbService();

// CLI test context
const ctx = await createCliTestContext();

// Full integration environment
const env = await TestEnvironment.create();

// Temporary env vars
await withEnv({ MY_VAR: "value" }, async () => { ... });
```

## Current Project Status

### Completed Phases
- **Phase 12:** Obsidian Retirement, Memory Banks v2
- **Phase 13:** TUI Enhancement & Unification (656 tests)
  - All 7 TUI views enhanced with consistent patterns
  - Split view system with layout presets
  - Comprehensive keyboard shortcuts

### Planning Documents
Check `.copilot/planning/` for:
- `phase-12-obsidian-retirement.md`
- `phase-12.5-memory-bank-enhanced.md`
- `phase-13-tui-enhancement.md` ✅ COMPLETED

## Common Workflows

### "Add a new feature"
1. Check `.copilot/planning/` for relevant phase
2. Follow TDD from `.copilot/source/exoframe.md`
3. Use test helpers from `.copilot/tests/testing.md`
4. Update docs per `.copilot/docs/documentation.md`

### "Fix a bug"
1. Write failing test first
2. Fix code following patterns in `.copilot/source/exoframe.md`
3. Verify all tests pass

### "Update agent docs"
After adding/changing files in `.copilot/`:
```bash
deno run --allow-read --allow-write scripts/build_agents_index.ts
```

## Do's and Don'ts

### ✅ Do
- Follow TDD (tests first, always)
- Consult `.copilot/cross-reference.md` to find relevant docs
- Use established test helpers (`initTestDbService`, etc.)
- Keep Problems tab clean (fix TS errors before completing)
- Run `deno task test` before committing

### ❌ Don't
- Skip writing tests
- Proceed without checking relevant agent docs
- Use raw SQL table creation in tests (use helpers)
- Ignore pre-commit hook failures
- Guess at patterns — check `.copilot/` docs first
