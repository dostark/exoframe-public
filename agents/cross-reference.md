---
agent: general
scope: dev
title: Agent Documentation Cross-Reference Map
short_summary: "Quick reference mapping task types to relevant agent documentation files."
version: "0.1"
topics: ["navigation", "quick-reference", "task-mapping"]
---

# Agent Documentation Cross-Reference Map

## Task → Agent Doc Quick Reference

| Task Type | Primary Doc | Secondary Docs |
|-----------|-------------|----------------|
| Write unit tests | [tests/testing.md](tests/testing.md) | [source/exoframe.md](source/exoframe.md) |
| Refactor code | [source/exoframe.md](source/exoframe.md) | [tests/testing.md](tests/testing.md) |
| Update documentation | [docs/documentation.md](docs/documentation.md) | - |
| Fix TypeScript errors | [source/exoframe.md](source/exoframe.md) | [copilot/exoframe.md](copilot/exoframe.md) |
| Add new feature | [source/exoframe.md](source/exoframe.md) + [tests/testing.md](tests/testing.md) | [docs/documentation.md](docs/documentation.md) |
| Debug test failures | [tests/testing.md](tests/testing.md) | [source/exoframe.md](source/exoframe.md) |
| Security audit | [tests/testing.md](tests/testing.md) (#Security Tests) | [source/exoframe.md](source/exoframe.md) (#System Constraints) |
| Claude-specific guidance | [providers/claude.md](providers/claude.md) | [README.md](README.md) |
| RAG/embeddings usage | [providers/claude-rag.md](providers/claude-rag.md) | [README.md](README.md) (#Building embeddings) |
| VS Code Copilot setup | [copilot/exoframe.md](copilot/exoframe.md) | [README.md](README.md) |
| OpenAI integration | [providers/openai.md](providers/openai.md) | [README.md](README.md) |
| OpenAI RAG/embeddings usage | [providers/openai-rag.md](providers/openai-rag.md) | [providers/openai.md](providers/openai.md) |
| Google integration | [providers/google.md](providers/google.md) | [README.md](README.md) |
| Gemini Long-Context | [providers/google-long-context.md](providers/google-long-context.md) | [providers/google.md](providers/google.md) |

## Search by Topic

- **`tdd`** → [source/exoframe.md](source/exoframe.md), [tests/testing.md](tests/testing.md)
- **`security`** → [tests/testing.md](tests/testing.md) (Security Tests as First-Class Citizens)
- **`database`** → [tests/testing.md](tests/testing.md) (Database Initialization, initTestDbService)
- **`docs`** → [docs/documentation.md](docs/documentation.md)
- **`patterns`** → [source/exoframe.md](source/exoframe.md) (Service Pattern, Module Documentation)
- **`helpers`** → [tests/testing.md](tests/testing.md) (Test Organization, Helpers)
- **`embeddings`** → [providers/claude-rag.md](providers/claude-rag.md), [README.md](README.md)
- **`rag`** → [providers/claude-rag.md](providers/claude-rag.md)
- **`openai`** → [providers/openai.md](providers/openai.md), [providers/openai-rag.md](providers/openai-rag.md)
- **`prompts`** → [providers/claude.md](providers/claude.md), [providers/openai.md](providers/openai.md)
- **`refactoring`** → [source/exoframe.md](source/exoframe.md), [providers/claude.md](providers/claude.md)
- **`debugging`** → [providers/claude.md](providers/claude.md)
- **`coverage`** → [tests/testing.md](tests/testing.md)
- **`gemini`** → [providers/google.md](providers/google.md), [providers/google-long-context.md](providers/google-long-context.md)
- **`long-context`** → [providers/google-long-context.md](providers/google-long-context.md)

## Workflow Examples

### "I want to add a new feature"

1. Read [docs/ExoFrame_Implementation_Plan.md](../docs/ExoFrame_Implementation_Plan.md) to find or create Implementation Plan step
2. Follow TDD guidance from [source/exoframe.md](source/exoframe.md)
3. Use test helpers from [tests/testing.md](tests/testing.md)
4. Update docs per [docs/documentation.md](docs/documentation.md)

### "I want to fix a bug"

1. Check Implementation Plan for related step
2. Write failing test per [tests/testing.md](tests/testing.md)
3. Fix code following [source/exoframe.md](source/exoframe.md) patterns
4. Verify coverage maintained with `deno test --coverage`

### "I want to use Claude effectively"

1. Read [providers/claude.md](providers/claude.md) for prompt templates
2. Use [providers/claude-rag.md](providers/claude-rag.md) for context injection
3. Follow tool-use patterns (parallel reads, thinking protocol)
4. Reference task-specific system prompts for TDD/refactoring/debugging

### "I want to use Gemini effectively"

1. Read [providers/google.md](providers/google.md) for optimized prompts
2. Use [providers/google-long-context.md](providers/google-long-context.md) to decide when to use RAG vs full context
3. Follow thinking protocol (Saturate → Analyze → Plan)

### "I want to add security tests"

1. Review [tests/testing.md](tests/testing.md) security section
2. Label tests with `[security]` tag
3. Test path traversal, injection, leakage
4. Use PathResolver for all path validation

### "I want to set up RAG for semantic search"

1. Read [providers/claude-rag.md](providers/claude-rag.md) for workflow
2. Build embeddings: `deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock`
3. Test retrieval: `deno run --allow-read scripts/inject_agent_context.ts --query "your query" --agent claude`
4. Inspect similarity: `deno run --allow-read scripts/inspect_embeddings.ts --query "your query" --top 5`

## Provider-Specific Quick Links

### Claude
- **Main guide**: [providers/claude.md](providers/claude.md)
- **RAG setup**: [providers/claude-rag.md](providers/claude-rag.md)
- **System prompts**: TDD, Refactoring, Debugging, Documentation (in claude.md)
- **Context window**: 200k tokens (4-6 chunks recommended)

### VS Code Copilot
- **Main guide**: [copilot/exoframe.md](copilot/exoframe.md)
- **Quick summary**: [copilot/summary.md](copilot/summary.md)
- **Pattern**: Consult `agents/manifest.json` first

### OpenAI
- **Main guide**: [providers/openai.md](providers/openai.md)
- **RAG guide**: [providers/openai-rag.md](providers/openai-rag.md)
- **Prompt templates**: See `agents/prompts/openai-*.md`
- **Budgets**: Uses simple/standard/complex output budgets (see openai.md)

### Google
- **Main guide**: [providers/google.md](providers/google.md)
- **Long-context**: [providers/google-long-context.md](providers/google-long-context.md)
- **Context window**: 1M-2M tokens (use "Saturation" pattern)

## Common Task Patterns

### Test-Driven Development (TDD)
1. **Docs**: [source/exoframe.md](source/exoframe.md), [tests/testing.md](tests/testing.md)
2. **Pattern**: Write failing tests → Implement minimal code → Verify passing → Refactor
3. **Helpers**: `initTestDbService()`, `createCliTestContext()`, `withEnv()`

### Code Refactoring
1. **Docs**: [source/exoframe.md](source/exoframe.md), [providers/claude.md](providers/claude.md)
2. **Pattern**: Read existing code + tests → Propose changes → Verify tests still pass → Check coverage
3. **Tools**: `deno test --coverage`, grep for usage patterns

### Documentation Updates
1. **Docs**: [docs/documentation.md](docs/documentation.md)
2. **Pattern**: Check Implementation Plan → Update docs → Sync versions → Cross-reference
3. **Rules**: Keep synchronized with Plan, maintain terminology consistency

### Debugging
1. **Docs**: [providers/claude.md](providers/claude.md) (Debugging section)
2. **Pattern**: Read error/stack trace → Check Plan step → Write reproducing test → Fix → Verify
3. **Tools**: Add regression test for bug

## Canonical Prompt (Short)

"You are a developer working on ExoFrame. Before starting work, consult this cross-reference map to find the most relevant agent documentation. Use the task-to-doc mapping table to quickly locate guidance for your specific task type."

## Examples

- Example prompt: "I need to add a security feature. Which docs should I read?" → Answer: Start with [tests/testing.md](tests/testing.md) security section and [source/exoframe.md](source/exoframe.md) system constraints.
- Example prompt: "How do I set up Claude with RAG?" → Answer: Read [providers/claude-rag.md](providers/claude-rag.md) for the complete workflow.
- Example prompt: "What's the TDD workflow?" → Answer: See [source/exoframe.md](source/exoframe.md) and [tests/testing.md](tests/testing.md) for patterns and helpers.
