---
agent: claude
scope: dev
title: "Cross-Reference Navigation Prompt"
short_summary: "Example prompt using cross-reference map for task navigation."
version: "0.1"
topics: ["cross-reference", "navigation", "prompts", "workflow"]
---

# Cross-Reference Navigation Prompt

## Prompt Template

```
I want to [task type].

First, consult agents/cross-reference.md for the workflow:
1. Find my task type in "Task → Agent Doc Quick Reference"
2. Read the Primary Doc listed
3. Check Secondary Docs if needed
4. Follow the workflow example if available

Task type: [write tests / refactor / update docs / fix errors / add feature / debug / security audit / etc.]

Then proceed with the work following guidance from those docs.
```

## Example Usage (Add New Feature)

**User:**
```
I want to add a new feature: Flow parameter validation.

First, consult agents/cross-reference.md for the workflow:
1. Task type: "Add new feature"
2. Primary Docs: agents/source/exoframe.md + agents/tests/testing.md
3. Secondary Docs: agents/docs/documentation.md
4. Workflow example: "I want to add a new feature"

Then proceed with:
1. Read Implementation Plan to find/create step
2. Follow TDD from source/exoframe.md
3. Use test helpers from tests/testing.md
4. Update docs per documentation.md
```

## Example Usage (Security Audit)

**User:**
```
I want to perform a security audit on Portal permission boundaries.

First, consult agents/cross-reference.md for the workflow:
1. Task type: "Security audit"
2. Primary Docs: agents/tests/testing.md (#Security Tests)
3. Secondary Docs: agents/source/exoframe.md (#System Constraints)
4. Topics to search: "security", "Portal"

Then design security tests covering:
- Path traversal attempts (../)
- Symlink escape detection
- Absolute path restrictions
- Cross-portal access attempts
```

## Example Usage (Fix TypeScript Errors)

**User:**
```
I have TypeScript errors in src/flows/plan_executor.ts

First, consult agents/cross-reference.md for the workflow:
1. Task type: "Fix TypeScript errors"
2. Primary Docs: agents/source/exoframe.md
3. Secondary Docs: agents/copilot/exoframe.md

Read the errors, understand the patterns from source/exoframe.md, then fix following:
- Service Pattern if it's a service
- Proper error handling
- Type safety throughout
```

## Example Usage (Topic Search)

**User:**
```
I need help with embeddings and RAG.

Use agents/cross-reference.md topic search:
- Topic: "embeddings" → agents/providers/claude-rag.md, agents/README.md
- Topic: "rag" → agents/providers/claude-rag.md

Read claude-rag.md sections:
- RAG Workflow (4 steps)
- Tools usage (inspect_embeddings.ts, inject_agent_context.ts)
- Token budget strategies

Then answer my questions about using embeddings.
```

## Expected Response Pattern

Claude should:
1. Open and read [agents/cross-reference.md](../cross-reference.md)
2. Find the relevant task type or topic
3. Navigate to Primary Doc(s) listed
4. Read relevant sections from those docs
5. Follow the workflow pattern if provided
6. Execute the task using guidance from retrieved docs
7. Reference which sections were consulted (e.g., "Following the workflow from cross-reference.md...")
