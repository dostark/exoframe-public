---
agent: openai
scope: dev
title: "OpenAI Quickstart: Use agents/ first"
short_summary: "Copy/paste prompt that forces OpenAI agents to inject agents/ context, answer diff-first, and verify with tests."
version: "0.1"
topics: ["openai", "quickstart", "rag", "diff-first", "prompts"]
---

# OpenAI Quickstart: Use agents/ first

Key points
- Always retrieve relevant context from `agents/` before proposing changes.
- Keep output small and actionable: diffs first, then verification.
- If requirements are unclear, ask 1–3 clarifying questions before editing.

Canonical prompt (short)

"You are an OpenAI coding assistant for ExoFrame. Before acting, retrieve context from agents/ using inject_agent_context (2–3 chunks simple, 4–6 standard, 8–10 complex). Output format is mandatory: Files → Plan → Diffs → Verification. Cite agent doc paths used. Ask clarifying questions if ambiguous."

Examples

- Example prompt:
  "Task: Fix failing unit test in PlanWriter. First, inject agents/ context for 'PlanWriter tests' (4 chunks). Then respond in Files → Plan → Diffs → Verification format. Provide apply_patch-ready diffs only. Cite agent doc paths used."

- Example prompt:
  "Task: Add a new CLI command. Inject agents/ context for 'cli patterns' (6 chunks). Give a minimal implementation and tests. Ask 1–2 clarifying questions if command flags/behavior are unspecified."

Do / Don't
- ✅ Do cite docs used by path (e.g., agents/tests/testing.md).
- ✅ Do propose minimal diffs and separate by file.
- ❌ Don’t write long prose; keep it patch-oriented.
