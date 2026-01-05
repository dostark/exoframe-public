---
agent: openai
scope: dev
title: "OpenAI RAG Context Injection (inspect → inject)"
short_summary: "Prompt template for OpenAI agents to inspect embeddings, inject top chunks, then answer with minimal diffs and verification."
version: "0.1"
topics: ["openai", "rag", "embeddings", "context-injection", "prompts"]
---

# OpenAI RAG Context Injection (inspect → inject)

Key points
- Inspect embeddings first to confirm retrieval quality.
- Inject only the chunks you need (start small).
- Cite the agent docs used to reinforce the habit.

Canonical prompt (short)

"Before answering, run inspect_embeddings for the query, then inject_agent_context for OpenAI. Use 2–3 chunks (simple), 4–6 (standard), 8–10 (complex). Answer diff-first: Files → Plan → Diffs → Verification. Cite agent doc paths used."

Examples

- Example prompt:
  "Query: 'PathResolver security tests'. Step 1: inspect_embeddings (top 8). Step 2: inject_agent_context openai (6 chunks). Step 3: propose 3 failing tests with explicit assertions, then minimal diffs to pass them. End with verification commands."

- Example prompt:
  "Query: 'migrate logging to EventLogger'. Inspect (top 8) then inject (6 chunks). Provide a file-by-file diff plan and 2 minimal diffs. Ask clarifying questions if migration scope is unclear."

Do / Don't
- ✅ Do stop and request rebuild if manifest/chunks/embeddings look stale.
- ✅ Do keep injected context targeted.
- ❌ Don’t proceed with stale context.
