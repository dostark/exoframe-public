---
agent: openai
scope: dev
title: OpenAI adaptation notes
short_summary: "Provider-specific tips for OpenAI usage (token hints and example prompt template)."
version: "0.1"
topics: ["provider-adaptations","prompts"]
---

# OpenAI provider adaptation notes

- Token hints: Keep `short_summary` under ~800 tokens for reliable inclusion in prompts.
- Use `inject_agent_context.ts` to include `short_summary` + at most two chunks for larger docs.
- Example prompt template:
```
System: You help modify ExoFrame repository files. Consult the following context (manifest summary + chunks) before responding.
User: [task details]
```
