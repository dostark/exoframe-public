---
agent: claude
scope: dev
title: "Detailed Commit Message Prompt"
short_summary: "Example prompt for creating structured, informative commit messages."
version: "0.1"
topics: ["git", "commit", "documentation", "best-practices"]
---

# Detailed Commit Message Prompt

## Prompt Template

```
I've completed work on [feature/fix]. Create a detailed commit message following ExoFrame conventions.

Before creating the commit:
1. Review what files changed: git status
2. Review the actual changes: git diff
3. Check Implementation Plan step if applicable

Then create a commit message with:

FORMAT:
<type>(<scope>): <short summary>

<detailed body explaining WHAT and WHY>

<footer with references>

TYPES: feat, fix, refactor, test, docs, chore, perf
SCOPE: component name (agents, flows, portal, mcp, cli, etc.)

GUIDELINES:
- Summary: ≤72 chars, imperative mood ("add" not "added")
- Body: Wrap at 72 chars, explain context and rationale
- Reference Implementation Plan steps: "Implements Step X.Y"
- Reference issues if applicable: "Fixes #123"
- List breaking changes if any: "BREAKING CHANGE: ..."

Component: [agents / flows / portal / mcp / cli / etc.]
Type: [feat / fix / refactor / test / docs / chore]
```

## Example Usage (Feature Addition)

**User:**
```
I've completed work on Step 10.5 - Claude agent interaction enhancements. Create a detailed commit message.

Before creating the commit:
1. git status shows: agents/providers/claude.md, agents/providers/claude-rag.md, agents/cross-reference.md, agents/prompts/, tests/agents/claude_enhancements_test.ts
2. git diff shows ~800 lines added across agent docs
3. Implementation Plan Step 10.5 has 10/10 success criteria met

Create commit message:

Component: agents
Type: feat
```

**Expected Response:**

```bash
git add agents/ tests/agents/claude_enhancements_test.ts docs/ExoFrame_Implementation_Plan.md

git commit -m "feat(agents): enhance Claude interaction with prompts, RAG, and examples

Implements Step 10.5 - Claude Agent Interaction Enhancements

Added comprehensive guidance for using Claude agents effectively:

HIGH Priority:
- Enhanced claude.md with 4 task-type system prompts (TDD, Refactoring,
  Debugging, Documentation) including thinking protocol and token budget
  strategies
- Created claude-rag.md with complete RAG workflow, tools usage
  (inspect_embeddings.ts, inject_agent_context.ts), and semantic search
  quality guidance

MEDIUM Priority:
- Added Quick Start Guide to README.md with 7-step workflow for creating
  new agent docs
- Documented tool-use best practices (parallel reads, incremental updates)

LOW Priority:
- Created cross-reference.md mapping 12 task types to primary/secondary docs
- Added 8 ExoFrame-specific common pitfalls with code examples
- Optimized all short summaries to ≤200 chars (copilot/exoframe.md: 229→131)
- Created agents/prompts/ with 7 ready-to-use prompt templates

Testing:
- Added tests/agents/claude_enhancements_test.ts (12 tests, all passing)
- All docs pass validate_agents_docs.ts
- Manifest updated with 18 total docs (7 new)
- Embeddings regenerated (64-dim mock vectors)

Files changed:
- agents/providers/claude.md (v0.1→v0.2, 16→330+ lines)
- agents/providers/claude-rag.md (NEW, 360+ lines)
- agents/cross-reference.md (NEW, 180+ lines)
- agents/prompts/*.md (NEW, 7 prompt templates)
- agents/README.md (79→267+ lines)
- agents/copilot/summary.md (added frontmatter)
- agents/copilot/exoframe.md (optimized summary)
- tests/agents/claude_enhancements_test.ts (NEW, 12 tests)
- docs/ExoFrame_Implementation_Plan.md (added Step 10.5)

Implements Step 10.5 (10/10 success criteria met)"
```

## Example Usage (Bug Fix)

**User:**
```
I fixed the database cleanup issue in config_test.ts. Create a detailed commit message.

Before creating the commit:
1. git status shows: tests/config_test.ts, tests/helpers/db.ts
2. git diff shows cleanup() now in try/finally block
3. Implementation Plan Step 4.3 (Config Loading) was affected

Create commit message:

Component: tests
Type: fix
```

**Expected Response:**

```bash
git add tests/config_test.ts tests/helpers/db.ts

git commit -m "fix(tests): ensure database cleanup in config tests

Fixes resource leak in config_test.ts where database connections
were not properly cleaned up when tests failed.

Problem:
- cleanup() was called conditionally after test assertions
- If assertion failed, cleanup() was never reached
- Database connections leaked, causing subsequent test failures

Solution:
- Wrapped all test bodies in try/finally blocks
- Moved cleanup() calls to finally blocks
- Added helper assertWithCleanup() to tests/helpers/db.ts for reuse

Testing:
- All tests in tests/config_test.ts now pass
- No resource leak warnings
- Coverage maintained at 85%

Related to Step 4.3 - Config Loading Tests"
```

## Example Usage (Refactoring)

**User:**
```
I extracted database initialization into a reusable helper. Create a detailed commit message.

Before creating the commit:
1. git status shows: tests/helpers/db.ts, 12 test files updated
2. git diff shows new initTestDb() helper, import changes
3. No Implementation Plan step - this is technical debt reduction

Create commit message:

Component: tests
Type: refactor
```

**Expected Response:**

```bash
git add tests/helpers/db.ts tests/*_test.ts

git commit -m "refactor(tests): extract database initialization to shared helper

Extracted common database setup pattern into tests/helpers/db.ts
to reduce duplication across 12 test files.

Before:
- Each test file had its own initTestDbService() setup
- 40+ lines of duplicated initialization code
- Inconsistent cleanup patterns

After:
- Single initTestDb() helper in tests/helpers/db.ts
- Returns { db, tempDir, cleanup } interface
- Consistent cleanup with try/finally pattern
- 15-line setup reduced to single import + call

Benefits:
- Easier to maintain (one place to update db setup)
- Consistent error handling across all tests
- Reduced test file sizes by ~20%
- No behavior changes - purely structural improvement

Files updated (12):
- tests/helpers/db.ts (NEW helper)
- tests/config_test.ts
- tests/db_test.ts
- tests/event_logger_test.ts
- tests/migration_test.ts
- tests/plan_executor_test.ts
- tests/portal_permissions_test.ts
- tests/request_processor_test.ts
- tests/scaffold_test.ts
- tests/setup_db_test.ts
- tests/watcher_test.ts
- tests/flows/feature_development_test.ts

Testing:
- All affected tests still pass (94/94)
- Coverage unchanged at 85%
- No functional changes"
```

## Example Usage (Documentation)

**User:**
```
I updated the Implementation Plan with Step 10.5 completion. Create a detailed commit message.

Before creating the commit:
1. git status shows: docs/ExoFrame_Implementation_Plan.md
2. git diff shows Step 10.5 with 10/10 criteria marked [x]
3. This documents completed work from previous commits

Create commit message:

Component: docs
Type: docs
```

**Expected Response:**

```bash
git add docs/ExoFrame_Implementation_Plan.md

git commit -m "docs(plan): mark Step 10.5 complete (Claude enhancements)

Updated Implementation Plan to reflect completion of Step 10.5
(Claude Agent Interaction Enhancements).

Changes:
- All 10 success criteria marked [x] complete
- Added notes about deliverables (7 files created, 4 enhanced)
- Documented test results (12/12 passing)
- Noted infrastructure updates (manifest, chunks, embeddings)

Step 10.5 Summary:
- HIGH: Claude prompt templates + RAG usage guide
- MEDIUM: Quick start guide, thinking protocol, tool-use patterns
- LOW: Cross-reference map, common pitfalls, prompt examples

All enhancements validated and tested. Phase 10 polishing work
continues with remaining steps.

No code changes - documentation only."
```

## Example Usage (Multiple Components)

**User:**
```
I added Flow parameter validation with schema, tests, and docs. Create a detailed commit message.

Before creating the commit:
1. git status shows: src/schemas/flow.ts, src/flows/plan_executor.ts, tests/flows/validation_test.ts, docs/ExoFrame_Implementation_Plan.md
2. git diff shows new Zod schema, validation logic, 8 new tests
3. Implementation Plan Step 8.3 - Flow Parameter Validation

Create commit message:

Component: flows (primary), schemas, tests, docs
Type: feat
```

**Expected Response:**

```bash
git add src/schemas/flow.ts src/flows/plan_executor.ts tests/flows/validation_test.ts docs/ExoFrame_Implementation_Plan.md

git commit -m "feat(flows): add parameter validation with Zod schema

Implements Step 8.3 - Flow Parameter Validation

Added comprehensive parameter validation for Flow execution to ensure
type safety and provide user-friendly error messages.

Schema (src/schemas/flow.ts):
- FlowParameterSchema validates required/optional params
- Supports string, number, boolean, array, object types
- Validates enum constraints for restricted values
- Validates min/max for numeric parameters

Validation (src/flows/plan_executor.ts):
- Validate parameters before Flow execution
- Throw ValidationError with clear messages
- Include parameter name, expected type, received value in errors

Testing (tests/flows/validation_test.ts):
- 8 new tests covering validation scenarios:
  - Missing required parameters → error
  - Wrong parameter types → error with type info
  - Invalid enum values → error with allowed values
  - Out of range numbers → error with min/max
  - Valid parameters → passes validation
  - Optional parameters → allows undefined
  - Array type validation
  - Nested object validation

Error Messages:
Before: \"Flow execution failed\"
After: \"Parameter 'maxTokens' must be a number, received string\"

Documentation:
- Updated Step 8.3 success criteria (4/4 complete)
- Added validation examples to Flow documentation

Breaking Changes: None (new feature, backward compatible)

Implements Step 8.3 (4/4 success criteria met)"
```

## Best Practices

### Commit Message Structure

**Good commit summary:**
```
feat(agents): add RAG usage guide with embedding examples
```

**Bad commit summary:**
```
updated files
added some stuff to agents folder
WIP
```

### Detailed Body Guidelines

**✅ Good - explains WHY and provides context:**
```
Added RAG workflow documentation to help developers use semantic
search effectively.

Problem: Developers weren't aware of inject_agent_context.ts tool
or didn't know optimal chunk limits for different task types.

Solution: Created comprehensive guide covering:
- 4-step RAG workflow
- Token budget strategies by task complexity
- Tool usage with CLI examples
- Troubleshooting common issues

This enables more effective context injection, reducing hallucinations
and improving response quality for complex queries.
```

**❌ Bad - just describes WHAT (already visible in diff):**
```
Added new file claude-rag.md with content about RAG.
Updated manifest.json.
```

### Scope Selection

- **agents** — Agent documentation system
- **flows** — Flow orchestration, plan execution
- **portal** — Portal permissions, PathResolver
- **mcp** — Model Context Protocol integration
- **cli** — Command-line interface
- **ai** — LLM providers, model adapters
- **db** — Database, migrations
- **config** — Configuration loading
- **tests** — Test infrastructure (not individual test files)
- **docs** — Documentation updates
- **chore** — Build, dependencies, tooling

### Footer References

Always include:
- Implementation Plan steps: `Implements Step X.Y`
- Issue numbers: `Fixes #123` or `Closes #456`
- Breaking changes: `BREAKING CHANGE: <description>`
- Related work: `Related to Step X.Y`

## Expected Response Pattern

Claude should:
1. Run `git status` to see changed files
2. Run `git diff --stat` to see scope of changes
3. Identify the component and type
4. Check Implementation Plan if applicable
5. Generate structured commit message with:
   - Concise summary (≤72 chars)
   - Detailed body explaining WHY and context
   - List of specific changes
   - Testing verification
   - Implementation Plan reference
6. Show the complete `git commit` command ready to execute
