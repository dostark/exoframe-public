---
agent: claude
scope: dev
title: Claude provider adaptation notes
short_summary: "Provider-specific tips for Claude usage (chunking and context inclusion)."
version: "0.1"
topics: ["provider-adaptations","prompts"]
---

# Claude provider adaptation notes

- Claude handles longer contexts; include `short_summary` plus up to 4 chunks for high-confidence guidance.
- Token guidance: Claude 3.5 Sonnet (200k context).
- Prefer explicit instruction to "consult manifest.json and short_summary first" in your prompt.
- Example template provided in the OpenAI doc applies with increased chunk allowance.

Canonical prompt (short):
"You are a Claude-based assistant working on ExoFrame. Check `agents/manifest.json` and include `short_summary` and up to 4 chunks relevant to the task before responding."

Examples
- Example prompt: "Inspect test patterns and suggest TDD tests for module X using `initTestDbService()` and provide failing assertions."
