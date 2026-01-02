---
agent: claude
scope: dev
title: "TDD Workflow Prompt Example"
short_summary: "Example prompt for test-driven development following ExoFrame patterns."
version: "0.1"
topics: ["tdd", "testing", "prompts", "examples"]
---

# TDD Workflow Prompt Example

## Prompt Template

```
I need to [add feature / fix bug / refactor code] for [component name].

Before you start:
1. Search agents/ for relevant patterns: "TDD testing [component area]"
2. Read the Implementation Plan to find/create the step
3. Review existing tests in tests/ to understand patterns

Then follow TDD workflow:
1. Write failing test first (use initTestDbService() if needed)
2. Implement minimal code to pass
3. Refactor and verify coverage maintained
4. Update Implementation Plan step as [x] completed

Context injection command:
deno run --allow-read scripts/inject_agent_context.ts claude "TDD testing [component]" 6

Requirements:
- Follow patterns from agents/tests/testing.md
- Use test helpers from tests/helpers/
- Include cleanup in try/finally blocks
- Verify no coverage drop
```

## Example Usage

**User:**
```
I need to add input validation for Portal configuration files.

Before you start:
1. Search agents/ for relevant patterns: "TDD testing validation Portal"
2. Read the Implementation Plan step for Portal validation
3. Review existing tests in tests/portal_permissions_test.ts

Then follow TDD workflow:
1. Write failing test first (test malformed YAML, missing required fields)
2. Implement minimal code to pass (validation schema)
3. Refactor and verify coverage maintained
4. Update Implementation Plan step as [x] completed

Context injection command:
deno run --allow-read scripts/inject_agent_context.ts claude "TDD testing Portal validation" 6

Requirements:
- Follow patterns from agents/tests/testing.md
- Use Zod schemas from src/schemas/
- Include cleanup in try/finally blocks
- Test both valid and invalid cases
```

## Expected Response Pattern

Claude should:
1. Inject context from agents/ using the provided query
2. Read Implementation Plan to find relevant step
3. Review existing tests for patterns
4. Write complete failing test with assertions
5. Implement minimal passing code
6. Show coverage verification
7. Mark Implementation Plan step complete
