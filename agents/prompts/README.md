---
agent: claude
scope: dev
title: "Prompt Examples README"
short_summary: "Guide to using example prompts for maximum agent effectiveness."
version: "0.1"
topics: ["prompts", "examples", "guide", "best-practices"]
---

# Agent Prompt Examples

This folder contains example prompts demonstrating how to effectively utilize the `agents/` documentation system with Claude.

## Available Prompt Templates

### Development Workflows

1. **[tdd-workflow.md](tdd-workflow.md)** — Test-driven development following ExoFrame patterns
   - When to use: Adding features, fixing bugs with tests
   - Key pattern: Write failing test → implement → refactor
   - Context injection: TDD patterns, testing helpers

2. **[refactoring-with-thinking.md](refactoring-with-thinking.md)** — Complex refactoring with thinking protocol
   - When to use: Multi-file changes, extracting patterns, restructuring
   - Key pattern: Analyze → Plan → Execute → Synthesize → Verify
   - Context injection: Refactoring patterns, service patterns

3. **[debugging-systematic.md](debugging-systematic.md)** — Systematic bug diagnosis and fixing
   - When to use: Test failures, runtime errors, TypeScript issues
   - Key pattern: Reproduce → Diagnose → Fix → Document
   - Context injection: Component-specific debugging patterns

4. **[implementation-plan-driven.md](implementation-plan-driven.md)** — Working from Implementation Plan steps
   - When to use: Every significant feature or change
   - Key pattern: Read Plan → Understand → Implement → Verify → Mark Complete
   - Context injection: Step-specific requirements

5. **[commit-message.md](commit-message.md)** — Creating detailed, structured commit messages
   - When to use: After completing any work (features, fixes, refactoring)
   - Key pattern: Review changes → Identify type/scope → Write structured message
   - Context injection: Commit conventions, Implementation Plan references

### Documentation

6. **[update-building-with-ai-agents.md](update-building-with-ai-agents.md)** — Updating Building with AI Agents field guide
   - When to use: After major features, pattern discoveries, or implementation phases
   - Key pattern: Review commits → Extract patterns → Write entertaining narrative
   - Context injection: Commit history, chat history, implementation details

### Discovery & Navigation

7. **[cross-reference-navigation.md](cross-reference-navigation.md)** — Using cross-reference map for task discovery
   - When to use: Finding the right docs for your task
   - Key pattern: Find task type → Read primary docs → Follow workflow
   - Context injection: Task-specific documentation

8. **[rag-context-injection.md](rag-context-injection.md)** — Semantic search and context injection
   - When to use: Complex questions, unfamiliar areas, multi-step tasks
   - Key pattern: Inspect → Inject → Execute with context
   - Context injection: Dynamic based on query

## How to Use These Prompts

### 1. Choose the Right Template

Match your task to the appropriate prompt template:

| Your Task | Use This Template |
|-----------|------------------|
| Add a new feature with tests | [tdd-workflow.md](tdd-workflow.md) |
| Extract common code to helper | [refactoring-with-thinking.md](refactoring-with-thinking.md) |
| Fix a failing test | [debugging-systematic.md](debugging-systematic.md) |
| Work on Implementation Plan step | [implementation-plan-driven.md](implementation-plan-driven.md) |
| Create a commit message | [commit-message.md](commit-message.md) |
| Update Building with AI Agents doc | [update-building-with-ai-agents.md](update-building-with-ai-agents.md) |
| Don't know where to start | [cross-reference-navigation.md](cross-reference-navigation.md) |
| Need docs for unfamiliar area | [rag-context-injection.md](rag-context-injection.md) |

### 2. Customize the Template

Replace placeholders with your specific details:
- `[component name]` → actual component (e.g., "PathResolver", "EventLogger")
- `[description]` → your specific issue or feature
- `[query]` → search terms relevant to your task
- `[2-10]` → chunk limit based on complexity (simple: 2-3, medium: 4-6, complex: 8-10)

### 3. Copy-Paste and Send

Each template has an "Example Usage" section showing complete, ready-to-use prompts. You can:
1. Copy the example prompt
2. Modify placeholders for your specific case
3. Paste into your conversation with Claude
4. Claude will follow the structured workflow

### 4. Iterate as Needed

For multi-step tasks:
- Use one prompt per major step
- Re-inject context between steps if the focus changes
- Reference the Implementation Plan to track progress

## Token Budget Guidelines

**How many chunks to inject:**

| Task Complexity | Chunks | Example |
|----------------|--------|---------|
| Simple lookup | 2-3 | "How do I clean up database connections?" |
| Standard feature | 4-6 | "Add input validation for Portal config" |
| Complex feature | 8-10 | "Design security test suite for Portal boundaries" |
| Multi-step workflow | 3-5 per step | "Step 1: Design → Step 2: Test → Step 3: Implement" |

**Note:** Claude has 200k context window, but targeted context is more effective than dumping all docs.

## Best Practices

### ✅ Do

- **Start with cross-reference** if you're unsure which docs apply
- **Inject fresh context** for each major step in multi-step tasks
- **Use thinking protocol** for complex changes requiring planning
- **Reference Implementation Plan** for all significant work
- **Follow TDD** for code changes (test first, then implement)
- **Verify success criteria** before marking steps complete

### ❌ Don't

- Don't skip context injection for complex tasks
- Don't inject 10+ chunks for simple questions (wastes tokens)
- Don't proceed without reading Implementation Plan first
- Don't forget to rebuild chunks/embeddings after doc changes:
  ```bash
  deno run --allow-read --allow-write scripts/build_agents_index.ts
  deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock
  ```
- Don't implement features without corresponding Plan step

## Combining Prompts

For comprehensive workflows, combine multiple templates:

```
PHASE 1: Discovery
Use: cross-reference-navigation.md to find relevant docs

PHASE 2: Planning
Use: implementation-plan-driven.md to read/create Plan step

PHASE 3: Context Injection
Use: rag-context-injection.md to gather relevant patterns

PHASE 4: Implementation
Use: tdd-workflow.md to implement with tests

PHASE 5: Verification
Use: implementation-plan-driven.md to verify and mark complete
```

## Examples by Use Case

### "I want to add a completely new feature"

1. **Start:** [implementation-plan-driven.md](implementation-plan-driven.md) — Find or create Plan step
2. **Design:** [rag-context-injection.md](rag-context-injection.md) — Inject architecture patterns
3. **Implement:** [tdd-workflow.md](tdd-workflow.md) — TDD implementation
4. **Complete:** [implementation-plan-driven.md](implementation-plan-driven.md) — Mark step done

### "I have a bug I can't figure out"

1. **Start:** [debugging-systematic.md](debugging-systematic.md) — Systematic diagnosis
2. **Context:** [rag-context-injection.md](rag-context-injection.md) — Inject component-specific patterns
3. **Fix:** [tdd-workflow.md](tdd-workflow.md) — Write regression test, fix, verify

### "I need to refactor a complex pattern across multiple files"

1. **Start:** [cross-reference-navigation.md](cross-reference-navigation.md) — Find refactoring docs
2. **Plan:** [refactoring-with-thinking.md](refactoring-with-thinking.md) — Use thinking protocol
3. **Execute:** Multi-step with context injection per step
4. **Verify:** [tdd-workflow.md](tdd-workflow.md) — Ensure tests pass, coverage maintained

## Updating These Prompts

When you discover better patterns:

1. Create new prompt file or update existing one
2. Follow frontmatter schema (see any example)
3. Include "Example Usage" section
4. Rebuild agents/ infrastructure:
   ```bash
   deno run --allow-read --allow-write scripts/build_agents_index.ts
   deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock
   deno run --allow-read scripts/validate_agents_docs.ts
   ```

## Meta Note

These prompts ARE the agents/ documentation system in action. They demonstrate:
- How to query the system (RAG)
- How to structure requests (thinking protocol)
- How to follow workflows (cross-reference)
- How to maintain consistency (Implementation Plan)

The prompts themselves follow the patterns they teach. Use them as templates, adapt them to your needs, and contribute improvements back to this folder.
