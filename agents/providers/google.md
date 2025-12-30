---
agent: google
scope: dev
title: Google provider adaptation notes
short_summary: "Provider-specific tips for Google PaLM/Vertex AI usage."
version: "0.1"
topics: ["provider-adaptations","prompts"]
---

# Google provider adaptation notes

- Respect token limits; use `inject_agent_context.ts` to include only short_summary + 1–2 chunks.
- Token guidance: Gemini 1.5 Pro (2M context); text-embedding-004 (768 dims).
- For vector retrieval, follow the build/embeddings guidance in `scripts/build_agents_embeddings.ts` (optional).

Canonical prompt (short):
"You are a Google PaLM/Vertex AI assistant for ExoFrame; consult `agents/manifest.json` and include `short_summary` + best chunks before answering."

Examples
- Example prompt: "Summarize the Testing Strategy and propose a small change that adds a 'validate-agent-docs' CI check."
