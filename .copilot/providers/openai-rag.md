---
agent: openai
scope: dev
title: OpenAI RAG (Retrieval-Augmented Generation) Usage Guide
short_summary: "How to retrieve and inject .copilot/ context for OpenAI models using ExoFrame embeddings and chunk tooling."
version: "0.1"
topics: ["rag", "embeddings", "context-injection", "semantic-search", "provider-adaptations"]
---

# OpenAI RAG Usage Guide

Key points
- Use RAG by default: retrieve .copilot/ context before proposing code changes.
- Prefer inspect → inject: preview matches, then inject the top chunks.
- Start small: 2–3 chunks for simple tasks, 4–6 for standard, 8–10 only for complex work.
- If docs changed, rebuild manifest/chunks and embeddings before trusting retrieval results.

## Overview

ExoFrame precomputes embeddings for all documentation in `.copilot/` and splits docs into `.copilot/chunks/*.txt` for retrieval. This guide shows a predictable, tool-centric workflow to provide OpenAI models (gpt-4o family) the most relevant ExoFrame context with minimal prompt bloat.

## RAG Workflow (pit of success)

1. **Inspect**: preview top-matching chunks for the task query.
2. **Inject**: inject top chunks into the prompt as a context block.
3. **Act**: propose a minimal diff (apply_patch-ready) that follows the retrieved instructions.
4. **Verify**: state which tests/linters to run.

## Tools

### Inspect embeddings

```bash
# Preview what retrieval will pick up
deno run --allow-read scripts/inspect_embeddings.ts --query "write tests for ConfigLoader" --top 8
```

Use this to confirm you’re pulling the right areas (tests helpers, service patterns, provider notes) before you inject anything.

### Inject .copilot context

```bash
# Inject the top 4 chunks for a query into a JSON payload
deno run --allow-read scripts/inject_agent_context.ts openai "write tests for ConfigLoader" 4
```

Recommended chunk counts:
- Simple (single-file edit): 2–3 chunks
- Standard (multi-file feature/refactor): 4–6 chunks
- Complex (architecture or cross-cutting): 8–10 chunks

## Canonical prompt (short)

"Before answering, retrieve .copilot/ context using inject_agent_context. Use 2–3 chunks for simple tasks, 4–6 for standard, 8–10 for complex. Cite the docs used by path. Provide diffs first, then verification steps."

## Examples

- Example prompt: "Use inspect_embeddings then inject_agent_context for query: 'refactor plan executor parsing'. Keep response under 900 tokens. Output: file-by-file diff plan + test list. Cite agent doc paths used."
- Example prompt: "Inject context for 'add unit tests for PathResolver'. Propose 3 failing tests with explicit assertions and helper usage. Then provide minimal code diff to pass them."
- Example prompt: "Context seems stale: instruct me to rebuild manifest/chunks and embeddings, then re-run injection and continue."

Examples (by level)

- Junior (simple, 2–3 chunks):
	"Inspect embeddings for 'write a unit test'. Inject 3 chunks. Then answer in the format Files → Plan → Diffs → Verification. Keep it short and cite the doc paths used."

- Mid-level (standard, 4–6 chunks):
	"Inspect and inject 6 chunks for 'refactor service to reduce duplication'. Provide two file-scoped diffs and a short test list. Ask clarifying questions if the scope is ambiguous."

- Senior (complex, 8–10 chunks):
	"Inject 10 chunks for 'cross-cutting change across CLI + services'. Produce minimal diffs per file and a verification checklist. If you suspect stale embeddings, stop and request a rebuild before continuing."

## Embeddings modes

- Mock embeddings (default for local/dev): deterministic and fast, good enough for keyword-y matching.
- OpenAI embeddings: higher quality semantic matching (requires network + environment access).
- Precomputed embeddings: import JSON vectors under `.copilot/embeddings/` then rebuild.

## Freshness contract (don’t skip)

If you add or update anything under `.copilot/`, do this before trusting RAG output:

```bash
deno run --allow-read --allow-write scripts/build_agents_index.ts
deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock
deno run --allow-read scripts/validate_agents_docs.ts
```

## Do / Don't

- ✅ Do inspect before injection when the task is ambiguous.
- ✅ Do cite the agent docs you used (paths) to reinforce the habit.
- ✅ Do keep injected context small and relevant.
- ❌ Don’t proceed if the manifest/chunks look stale; rebuild first.
