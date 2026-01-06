---
agent: claude
scope: dev
title: Claude provider adaptation notes
short_summary: "Comprehensive Claude usage guide with task-specific prompts, thinking protocols, and tool-use patterns."
version: "0.2"
topics: ["provider-adaptations","prompts","tdd","refactoring","debugging","tool-use"]
---

# Claude Provider Adaptation Guide

## Overview

Claude 3.5 Sonnet provides a 200k context window and excellent reasoning capabilities. This guide provides task-specific prompt templates (including TDD test patterns), thinking protocols, and tool-use patterns optimized for ExoFrame development.

## Self-improvement loop

When Claude lacks enough ExoFrame-specific guidance to proceed safely, patch `.copilot/` during the task (minimal + test-backed), then continue.

- Process: `.copilot/process/self-improvement.md`
- Copy/paste template: `.copilot/prompts/self-improvement-loop.md`
- Claude-specific tip: use the thinking protocol to (1) list concrete instruction gaps, (2) propose the smallest doc patch, (3) rebuild/validate `.copilot/` artifacts, then (4) resume the primary task.

## Task-Specific System Prompts

### TDD Workflow

**System prompt:**
```
You are a test-driven development assistant for ExoFrame. Before implementing any feature, propose 2-3 failing unit tests with explicit assertions. Use `initTestDbService()` or `createCliTestContext()` for test setup. After tests are written and failing, implement the minimal code to pass them.

Key patterns:
- Read Implementation Plan step first
- Write failing tests with clear assertions
- Implement minimal code to pass
- Verify coverage with `deno test --coverage`
- Clean up test resources in finally blocks
```

**Example interaction:**

User: "Add error handling for missing config files in ConfigLoader"

Claude response:
```
<thinking>
The ConfigLoader needs to handle missing files gracefully. I'll propose tests first, then implement.

Tests needed:
1. Missing file returns default config
2. Invalid TOML format throws clear error
3. Partial config merges with defaults
</thinking>

Here are 3 failing tests:

```typescript
import { assertEquals, assertRejects } from "https://deno.land/std@0.203.0/assert/mod.ts";
import { ConfigLoader } from "../src/config/loader.ts";
import { createCliTestContext } from "./helpers/test_context.ts";
import { join } from "https://deno.land/std@0.203.0/path/mod.ts";

Deno.test("ConfigLoader: missing file returns default config", async () => {
  const { tempDir, cleanup } = await createCliTestContext();
  try {
    const loader = new ConfigLoader(join(tempDir, "nonexistent.toml"));
    const cfg = await loader.load();
    assertEquals(cfg.mode, "sandboxed"); // default mode
  } finally {
    await cleanup();
  }
});

Deno.test("ConfigLoader: invalid TOML throws clear error", async () => {
  const { tempDir, cleanup } = await createCliTestContext();
  try {
    await Deno.writeTextFile(join(tempDir, "bad.toml"), "mode = [[[invalid");
    const loader = new ConfigLoader(join(tempDir, "bad.toml"));
    await assertRejects(
      () => loader.load(),
      Error,
      "Invalid TOML syntax"
    );
  } finally {
    await cleanup();
  }
});

Deno.test("ConfigLoader: partial config merges with defaults", async () => {
  const { tempDir, cleanup } = await createCliTestContext();
  try {
    await Deno.writeTextFile(join(tempDir, "partial.toml"), 'mode = "hybrid"');
    const loader = new ConfigLoader(join(tempDir, "partial.toml"));
    const cfg = await loader.load();
    assertEquals(cfg.mode, "hybrid");
    assertEquals(cfg.portals, []); // default value
  } finally {
    await cleanup();
  }
});
```

Now run these tests (they should fail), then I'll implement the error handling.
```

### Refactoring

**System prompt:**
```
You are a refactoring assistant for ExoFrame. Before changing code:
1. Read the existing implementation and all related tests
2. Propose refactoring steps that preserve behavior (proven by unchanged test results)
3. Use `deno test --coverage` to verify coverage is maintained or improved
4. Follow ExoFrame patterns: constructor DI, PathResolver for paths, EventLogger for side effects

Never refactor without tests proving equivalence.
```

**Example interaction:**

User: "Extract database initialization logic into a shared helper"

Claude response:
```
<thinking>
Need to identify all places using database initialization, create a shared helper, and migrate incrementally.

Steps:
1. Search for database initialization patterns
2. Read existing test helpers
3. Propose new helper location
4. Show migration for representative files
5. Verify tests still pass
</thinking>

I'll search for existing patterns first, then propose a consolidated helper.
```

### Debugging

**System prompt:**
```
You are a debugging assistant for ExoFrame. Process:
1. Read error messages, stack traces, and the Implementation Plan step
2. Identify root cause before proposing fixes
3. Suggest a test that reproduces the bug
4. Implement the fix
5. Verify the test passes and no regressions occur

Always add a regression test for bugs.
```

### Documentation

**System prompt:**
```
You are a documentation assistant for ExoFrame. Workflow:
1. Check the Implementation Plan for the related step
2. Maintain version synchronization across related docs
3. Update cross-references when file paths change
4. Include a short summary of changes with required tests
5. Follow the Refinement Loop pattern (request → refine → implement → document)

Keep docs concise and synchronized with Implementation Plan.
```

## Thinking Protocol for Complex Tasks

Claude excels when given space to plan before acting. For multi-step work:

1. **Analyze** dependencies and risks in `<thinking>` tags
2. **Plan** tool calls (read files, search patterns, check tests)
3. **Execute** tool calls in parallel where possible
4. **Synthesize** results and propose next steps
5. **Verify** against Implementation Plan success criteria

**Example: Multi-file refactoring**

```
<thinking>
User wants to extract database initialization logic into a shared helper.

Dependencies:
- All files that call initTestDbService()
- Check if a shared helper already exists
- Verify test coverage won't drop

Risks:
- Breaking existing tests if import paths change
- Circular dependencies if helper is in wrong location

Plan:
1. Parallel reads: grep for "initTestDbService", read test helpers
2. Propose new helper location (tests/helpers/db.ts)
3. Show migration for 2-3 representative files
4. Verify tests still pass
</thinking>

[Execute tool calls for reading files, then provide implementation]
```

## Tool-Use Patterns for Claude

### Parallel Reads (Context Gathering)

✅ **Good: Read multiple files in parallel**
```xml
<antml_function_calls>
<antml_invoke name="read_file">
<antml_parameter name="filePath">src/services/plan_writer.ts</antml_parameter>
<antml_parameter name="startLine">1</antml_parameter>
<antml_parameter name="endLine">100</antml_parameter>
</antml_invoke>
<antml_invoke name="read_file">
<antml_parameter name="filePath">tests/plan_writer_test.ts</antml_parameter>
<antml_parameter name="startLine">1</antml_parameter>
<antml_parameter name="endLine">100</antml_parameter>
</antml_invoke>
<antml_invoke name="grep_search">
<antml_parameter name="query">PlanWriter</antml_parameter>
<antml_parameter name="isRegexp">false</antml_parameter>
</antml_invoke>
</antml_function_calls>
```

❌ **Avoid: Sequential reads**
```
Read file 1 → wait for result → read file 2 → wait for result → read file 3
```

### Incremental Updates for Multi-Step Tasks

Use `manage_todo_list` to track progress:
- Mark tasks `in-progress` before starting
- Mark `completed` immediately after finishing each step
- Provide status updates between major operations

### Efficient Context Gathering

1. **Parallelize** independent searches (grep_search + file_search + semantic_search)
2. **Read results**, deduplicate file paths
3. **Batch read** unique files in one parallel call
4. **Synthesize** and proceed with implementation

## Token Budget Strategies

- **Claude 3.5 Sonnet**: 200k context window
- **Recommended**: Include `short_summary` + 4-6 chunks (~2-3k tokens) for high-confidence tasks
- **Maximum**: 10-12 chunks (~5-6k tokens) for complex multi-file refactoring
- **Prefer explicit instruction**: "Consult `.copilot/manifest.json` and include `short_summary` and up to 4 chunks relevant to the task"

## Common Pitfalls with ExoFrame

### 1. Forgetting cleanup in tests
❌ **Bad:**
```typescript
const { db, tempDir, cleanup } = await initTestDbService();
// test code without cleanup
```

✅ **Good:**
```typescript
const { db, tempDir, cleanup } = await initTestDbService();
try {
  // test code
} finally {
  await cleanup();
}
```

### 2. Not checking Implementation Plan
❌ **Bad:** Implement features without corresponding Plan step

✅ **Good:** Read Plan first, create step if missing, then implement

### 3. Skipping TDD workflow
❌ **Bad:** Write implementation first, add tests later (or never)

✅ **Good:** Write failing tests FIRST, then implement minimal code to pass

### 4. Ignoring security patterns
❌ **Bad:**
```typescript
const filePath = userInput;
await Deno.readTextFile(filePath);
```

✅ **Good:**
```typescript
const filePath = pathResolver.resolve(userInput); // validates against Portal permissions
await Deno.readTextFile(filePath);
```

### 5. Hardcoding paths
❌ **Bad:**
```typescript
"/home/user/ExoFrame/Workspace/Active"
```

✅ **Good:**
```typescript
join(workspaceRoot, "Workspace", "Active") // use PathResolver
```

### 6. Missing activity logging
❌ **Bad:** Side effects (file writes, executions) without EventLogger calls

✅ **Good:**
```typescript
await eventLogger.log({ type: "file_write", path, result: "success" });
```

### 7. Using deprecated Deno APIs
❌ **Bad:**
```typescript
Deno.run({ cmd: ["deno", "test"] })
```

✅ **Good:**
```typescript
new Deno.Command("deno", { args: ["test"] }).output()
```

### 8. Not validating frontmatter
❌ **Bad:** Manually parse YAML without schema validation

✅ **Good:** Use Zod schemas from `src/schemas/` for all YAML frontmatter

## Canonical Prompt (Short)

"You are a Claude-based assistant working on ExoFrame. Check `.copilot/manifest.json` and include `short_summary` and up to 4 chunks relevant to the task before responding. Follow TDD workflow: propose failing tests first, then implement minimal code to pass them."

## Examples

- Example prompt: "Inspect test patterns and suggest TDD tests for module X using `initTestDbService()` and provide failing assertions."
- Example prompt: "Refactor PlanWriter to extract validation logic. Show tests proving behavior is unchanged."
- Example prompt: "Debug why async test is flaking. Propose a test that reproduces the race condition."
