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
- For vector retrieval, follow the build/embeddings guidance in `scripts/build_agents_embeddings.ts` (optional).
