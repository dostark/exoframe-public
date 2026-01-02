---
agent: claude
scope: dev
title: "Systematic Debugging Prompt"
short_summary: "Example prompt for systematic debugging using agents/ guidance."
version: "0.1"
topics: ["debugging", "troubleshooting", "prompts", "examples"]
---

# Systematic Debugging Prompt

## Prompt Template

```
I have a bug: [description of issue]

Use systematic debugging approach:

1. CONTEXT INJECTION:
   deno run --allow-read scripts/inject_agent_context.ts claude "debugging [component] [error-type]" 6

2. REPRODUCE:
   - Write failing test that reproduces the bug
   - Run test to confirm failure
   - Show exact error message

3. DIAGNOSE:
   <thinking>
   - What's the expected behavior?
   - What's the actual behavior?
   - Where's the gap?
   - What files are involved?
   </thinking>

4. FIX:
   - Implement minimal fix
   - Verify test passes
   - Check no regressions

5. DOCUMENT:
   - Add regression test
   - Update Implementation Plan if needed
   - Note in CHANGELOG if significant

Error type: [TypeScript error / runtime error / test failure / logic bug]
Component: [specific file or module]
```

## Example Usage (Test Failure)

**User:**
```
I have a bug: tests/config_test.ts is failing with "Database connection not cleaned up"

Use systematic debugging approach:

1. CONTEXT INJECTION:
   deno run --allow-read scripts/inject_agent_context.ts claude "debugging database cleanup testing" 6

2. REPRODUCE:
   Run: deno test --allow-read --allow-write tests/config_test.ts
   Show the exact error message and stack trace

3. DIAGNOSE:
   <thinking>
   - Expected: cleanup() called in finally block
   - Actual: cleanup() might be missing or called conditionally
   - Gap: Test setup doesn't guarantee cleanup
   - Files: tests/config_test.ts, possibly tests/helpers/db.ts
   </thinking>

4. FIX:
   - Check if cleanup is in try/finally
   - Verify all code paths call cleanup
   - Update test to use proper pattern from agents/tests/testing.md

5. DOCUMENT:
   - Add comment explaining cleanup requirement
   - Update Implementation Plan step if this was part of config work

Error type: Test failure (resource leak)
Component: tests/config_test.ts
```

## Example Usage (Runtime Error)

**User:**
```
I have a bug: PathResolver crashes with "Permission denied" for valid Portal paths

Use systematic debugging approach:

1. CONTEXT INJECTION:
   deno run --allow-read scripts/inject_agent_context.ts claude "debugging PathResolver Portal permissions" 8

2. REPRODUCE:
   - Write test: new PathResolver(portalId).resolve("valid/path")
   - Run test to confirm "Permission denied" error
   - Show exact error message and path that fails

3. DIAGNOSE:
   <thinking>
   - Expected: Valid paths within Portal should resolve
   - Actual: Permission denied even for valid paths
   - Gap: Permission check logic might be too restrictive
   - Files: src/services/PathResolver.ts, Portal config validation
   </thinking>

4. FIX:
   - Read PathResolver permission logic
   - Check Portal config parsing
   - Fix validation to allow valid paths
   - Verify test passes

5. DOCUMENT:
   - Add regression test for this case
   - Update security test suite if needed

Error type: Runtime error (permission validation)
Component: src/services/PathResolver.ts
```

## Example Usage (TypeScript Error)

**User:**
```
I have a bug: TypeScript error in src/ai/model_adapter.ts - "Property 'temperature' does not exist"

Use systematic debugging approach:

1. CONTEXT INJECTION:
   deno run --allow-read scripts/inject_agent_context.ts claude "TypeScript types model adapter LLM" 4

2. REPRODUCE:
   - Show the exact TypeScript error
   - Show the line causing the issue
   - Show the type definition

3. DIAGNOSE:
   <thinking>
   - Expected: temperature property should exist on config type
   - Actual: Type definition doesn't include temperature
   - Gap: Schema mismatch or wrong type imported
   - Files: src/ai/model_adapter.ts, src/schemas/
   </thinking>

4. FIX:
   - Check Zod schema definition for model config
   - Add temperature to schema if missing
   - Or fix import if using wrong type
   - Verify TypeScript errors clear

5. DOCUMENT:
   - Update schema version if changed
   - Note in Implementation Plan if significant

Error type: TypeScript type error
Component: src/ai/model_adapter.ts
```

## Expected Response Pattern

Claude should:
1. Inject context about the error domain
2. Create/run reproducing test
3. Show explicit thinking about root cause
4. Implement targeted fix
5. Verify fix with tests
6. Add regression test
7. Document if needed
