---
agent: claude
scope: dev
title: Claude RAG (Retrieval-Augmented Generation) Usage Guide
short_summary: "How to use embeddings infrastructure for semantic search and context injection with Claude."
version: "0.1"
topics: ["rag", "embeddings", "context-injection", "semantic-search"]
---

# Claude RAG Usage Guide

## Overview

ExoFrame pre-computes embeddings for all agent documentation, enabling rag embeddings semantic search and automatic context injection for Claude-powered workflows. This guide shows how to leverage the embeddings infrastructure to provide Claude with the most relevant context for any task.

## RAG Workflow

1. **Generate query embedding** for user's task (or use mock vector based on query text)
2. **Rank chunks** by cosine similarity against pre-computed embeddings
3. **Inject top 4-6 chunks** into Claude system prompt (within 200k token budget)
4. **Execute task** with enriched context

## Tools

### Inspect Embeddings

Find best matching chunks for a query using cosine similarity:

```bash
# Find top 5 most relevant chunks for a query
deno run --allow-read scripts/inspect_embeddings.ts --query "test database setup" --top 5
```

**Output:** Ranked list of `agents/chunks/*.txt` files with cosine similarity scores.

**Example output:**
```
Top 5 matches for "test database setup":
1. agents/chunks/testing.md.chunk1.txt (similarity: 0.92)
2. agents/chunks/testing.md.chunk2.txt (similarity: 0.87)
3. agents/chunks/exoframe.md.chunk3.txt (similarity: 0.76)
4. agents/chunks/README.md.chunk0.txt (similarity: 0.65)
5. agents/chunks/testing.md.chunk0.txt (similarity: 0.62)
```

### Automatic Context Injection

Use the `inject_agent_context.ts` script to retrieve relevant context:

```typescript
import { inject } from "./scripts/inject_agent_context.ts";

// Retrieve best matching doc + snippet for a query
const context = await inject("claude", "fix async test flake", 4);

if (context.found) {
  const systemPrompt = `${context.short_summary}\n\nRelevant docs:\n${context.snippet}`;

  // Pass systemPrompt to Claude API
  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }]
  });
}
```

**CLI usage:**
```bash
# Get context for a specific query
deno run --allow-read scripts/inject_agent_context.ts --query "write security tests" --agent claude

# Output: JSON with path, title, short_summary, and snippet
{
  "found": true,
  "path": "agents/tests/testing.md",
  "title": "ExoFrame Test Development Guidelines",
  "short_summary": "Testing patterns and unified test context...",
  "snippet": "# ExoFrame Test Development Guidelines\n\nKey points\n- Use `initTestDbService()`..."
}
```

## Token Budget Strategies

### Context Window

- **Claude 3.5 Sonnet**: 200k tokens (~600k characters)
- **Claude 3 Opus**: 200k tokens
- **Claude 3 Haiku**: 200k tokens

### Recommended Chunk Allocation

| Task Complexity | Chunks | Estimated Tokens | Use Case |
|----------------|--------|------------------|----------|
| Simple (single file edit) | 2-3 | 1-1.5k | Quick fixes, single function implementation |
| Medium (multi-file feature) | 4-6 | 2-3k | Feature implementation, refactoring |
| Complex (architecture change) | 8-10 | 4-5k | Multi-service refactoring, debugging |
| Maximum | 10-12 | 5-6k | Cross-cutting concerns, security audit |

**Best practice:** Start with 4-6 chunks, add more only if Claude requests additional context.

### Token-Efficient Prompting

✅ **Good:** Include chunk summaries in system prompt, full chunks in user message
```
System: You are working on ExoFrame. Relevant docs: [testing.md: TDD patterns, exoframe.md: service patterns]
User: [Full chunk text]\n\nTask: Implement ConfigLoader error handling
```

❌ **Avoid:** Repeating full chunks in both system and user prompts

## Semantic Search Quality

### Mock Embeddings (Default)

The default embeddings use **SHA-256-based deterministic vectors** (64-dimensional):
- **Pros**: No API calls, reproducible, fast generation
- **Cons**: Lower semantic accuracy than learned embeddings
- **Quality**: Good for keyword matching, moderate for semantic similarity

### OpenAI Embeddings (Production)

For higher quality semantic search:

```bash
# Generate OpenAI embeddings (requires API key in environment)
deno run --allow-read --allow-write --allow-net --allow-env \
  scripts/build_agents_embeddings.ts --mode openai
```

**Configuration:**
- Model: `text-embedding-3-small` (1536 dimensions, reduced to 64 via PCA)
- Cost: ~$0.002 per agent doc (one-time)
- Quality: High semantic accuracy

### Precomputed Embeddings

Use pre-generated embeddings from external sources:

1. **Prepare embedding files** following the template:
```json
{
  "path": "agents/tests/testing.md",
  "title": "ExoFrame Test Development Guidelines",
  "vecs": [
    {
      "text": "# ExoFrame Test Development Guidelines\n\nKey points...",
      "vector": [0.123, -0.456, 0.789, ...]
    }
  ]
}
```

2. **Place files** in `agents/embeddings/` (format: `<doc-name>.json`)

3. **Validate and import**:
```bash
deno run --allow-read --allow-write scripts/build_agents_embeddings.ts \
  --mode precomputed --dir agents/embeddings
```

**Template:** See `agents/embeddings/example_precomputed_template.json`

## Example: Multi-Step Task with RAG

### Scenario: Add Security Tests for PathResolver

**Step 1: Retrieve relevant context**
```typescript
const query = "security tests PathResolver path traversal";
const context = await inject("claude", query, 6);
```

**Step 2: Build enriched system prompt**
```typescript
const systemPrompt = `
You are a security-focused test developer for ExoFrame.

Relevant context from documentation:
${context.short_summary}

Key patterns:
${context.snippet}

Task: Propose 3 security tests for PathResolver that check:
- Path traversal attacks (../ sequences)
- Symlink escape attempts
- Absolute path handling outside Portal boundaries

Follow TDD workflow: write failing tests first, then implement fixes.
`;
```

**Step 3: Call Claude API**
```typescript
const response = await anthropic.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 8192,
  system: systemPrompt,
  messages: [{
    role: "user",
    content: "Write comprehensive security tests for PathResolver"
  }]
});
```

**Step 4: Validate response includes**
- `initTestDbService()` or `createCliTestContext()` usage
- Explicit assertions for attack vectors
- Try/finally cleanup blocks
- References to ExoFrame security patterns (Portal permissions, PathResolver validation)

## Best Practices

### Pre-filter by Agent and Scope

When retrieving chunks, filter by relevant metadata:

```typescript
// Filter for Claude + dev scope
const manifest = JSON.parse(await Deno.readTextFile("agents/manifest.json"));
const relevantDocs = manifest.docs.filter(doc =>
  doc.agent === "claude" && doc.scope === "dev"
);
```

### Combine Chunks Intelligently

Group related chunks together:

```typescript
// Good: All testing.md chunks together
const testingChunks = [
  "agents/chunks/testing.md.chunk0.txt",
  "agents/chunks/testing.md.chunk1.txt",
  "agents/chunks/testing.md.chunk2.txt"
];

// Better: Mix relevant chunks from different docs
const mixedChunks = [
  "agents/chunks/testing.md.chunk1.txt",  // initTestDbService pattern
  "agents/chunks/exoframe.md.chunk2.txt", // Service patterns
  "agents/chunks/testing.md.chunk3.txt"   // Security tests
];
```

### Validate Freshness

Ensure embeddings match current documentation:

```bash
# Verify manifest is up-to-date
deno run --allow-read scripts/verify_manifest_fresh.ts

# Regenerate if stale
deno run --allow-read --allow-write scripts/build_agents_index.ts
deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock
```

### Measure Retrieval Quality

Track which chunks are most useful:

```typescript
// Log chunk usage for monitoring
const logChunkUsage = (chunkPath: string, taskType: string, wasHelpful: boolean) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    chunk: chunkPath,
    taskType,
    helpful: wasHelpful
  }));
};

// After task completion
logChunkUsage("agents/chunks/testing.md.chunk1.txt", "tdd", true);
```

## Workflow Integration

### VS Code Integration

Add a task to `.vscode/tasks.json`:

```json
{
  "label": "Get Agent Context",
  "type": "shell",
  "command": "deno run --allow-read scripts/inject_agent_context.ts --query '${input:query}' --agent claude",
  "presentation": {
    "reveal": "always",
    "panel": "new"
  }
}
```

### CLI Helper

Create `bin/agent-context` wrapper (already exists):

```bash
#!/usr/bin/env -S deno run --allow-read --allow-run
import { inject } from "../scripts/inject_agent_context.ts";

const query = Deno.args[0] || "";
const agent = Deno.args[1] || "claude";

const result = await inject(agent, query, 6);
console.log(JSON.stringify(result, null, 2));
```

Usage:
```bash
bin/agent-context "write security tests"
```

## Troubleshooting

### No Results Found

**Problem:** `inject_agent_context.ts` returns `{ found: false }`

**Solutions:**
1. Check query matches document topics: `agents/manifest.json`
2. Verify agent type exists: `"claude"`, `"copilot"`, `"openai"`, `"google"`
3. Rebuild embeddings: `deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock`

### Low Similarity Scores

**Problem:** Top chunks have cosine similarity < 0.5

**Solutions:**
1. Use more specific queries with domain keywords
2. Switch from mock to OpenAI embeddings for better semantic matching
3. Add more relevant topics to document frontmatter
4. Expand query with synonyms: "test" → "test unit integration"

### High Token Usage

**Problem:** Context injection uses >10k tokens

**Solutions:**
1. Reduce chunk count (4-6 is recommended)
2. Use `short_summary` only for simple tasks
3. Filter chunks by relevance threshold (cosine similarity > 0.6)
4. Summarize chunks before injection (trade quality for tokens)

## Canonical Prompt (Short)

"You are a Claude-based assistant working on ExoFrame with RAG-enhanced context. Before responding, semantic search will inject the 4-6 most relevant documentation chunks. Use this context to provide accurate, project-specific guidance following ExoFrame patterns."

## Examples

- Example prompt: "Use RAG to find test patterns, then suggest TDD tests for ConfigLoader using `initTestDbService()`"
- Example prompt: "Retrieve security testing docs and propose PathResolver vulnerability tests"
- Example prompt: "Find refactoring patterns and extract database initialization into a shared helper"

## See Also

- [claude.md](claude.md) — Task-specific prompts and thinking protocols
- [../README.md](../README.md) — Agents directory overview
- `scripts/inspect_embeddings.ts` — Embedding inspection tool
- `scripts/inject_agent_context.ts` — Context injection script
- `scripts/build_agents_embeddings.ts` — Embedding generation
