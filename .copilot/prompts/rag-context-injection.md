---
agent: claude
scope: dev
title: "RAG Context Injection Prompt"
short_summary: "Example prompt showing how to use semantic search for context injection."
version: "0.1"
topics: ["rag", "embeddings", "context-injection", "prompts"]
---

# RAG Context Injection Prompt

## Prompt Template

```
Before answering my question, inject relevant context from agents/:

Step 1: Inspect available embeddings
deno run --allow-read scripts/inspect_embeddings.ts --query "[your query]" --top 10

Step 2: Inject context (adjust --limit based on complexity)
deno run --allow-read scripts/inject_agent_context.ts claude "[your query]" [2-10]

Then use the injected context to guide your response.

My question: [actual question]

Token budget: [simple: 2-3 chunks | medium: 4-6 chunks | complex: 8-10 chunks]
```

## Example Usage (Simple Task)

**User:**
```
Before answering my question, inject relevant context from agents/:

Step 1: Inspect available embeddings
deno run --allow-read scripts/inspect_embeddings.ts --query "database cleanup patterns" --top 10

Step 2: Inject context (2-3 chunks for simple task)
deno run --allow-read scripts/inject_agent_context.ts claude "database cleanup patterns testing" 3

Then use the injected context to guide your response.

My question: How do I properly clean up database connections in tests?

Token budget: simple task, 2-3 chunks sufficient
```

## Example Usage (Complex Task)

**User:**
```
Before answering my question, inject relevant context from agents/:

Step 1: Inspect available embeddings
deno run --allow-read scripts/inspect_embeddings.ts --query "security testing Portal permissions PathResolver" --top 10

Step 2: Inject context (8-10 chunks for complex task)
deno run --allow-read scripts/inject_agent_context.ts claude "security testing Portal permissions path validation" 10

Then use the injected context to guide your response.

My question: Design comprehensive security tests for Portal permission boundaries and PathResolver validation.

Token budget: complex task requiring security patterns + testing patterns + Portal docs = 8-10 chunks
```

## Example Usage (Multi-Step Workflow)

**User:**
```
I'm working on a multi-step task. Before each step, inject fresh context:

STEP 1: Design (inject context about architecture patterns)
deno run --allow-read scripts/inject_agent_context.ts claude "service pattern module design" 4

STEP 2: Write tests (inject context about TDD patterns)
deno run --allow-read scripts/inject_agent_context.ts claude "TDD testing patterns helpers" 4

STEP 3: Implement (inject context about implementation patterns)
deno run --allow-read scripts/inject_agent_context.ts claude "implementation patterns error handling" 4

STEP 4: Document (inject context about documentation)
deno run --allow-read scripts/inject_agent_context.ts claude "documentation updates Implementation Plan" 3

Task: Add new LLM provider with comprehensive tests and docs.
```

## Expected Response Pattern

Claude should:
1. Run inspect_embeddings.ts to see available docs
2. Run inject_agent_context.ts with appropriate limit
3. Reference specific sections from injected docs in response
4. Follow patterns from retrieved context
5. Cite which agent docs were used (e.g., "Per agents/tests/testing.md...")
