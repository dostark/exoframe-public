---
agent: openai
scope: dev
title: "OpenAI Debugging: Reproduce → Diagnose → Fix → Verify"
short_summary: "Prompt template for systematic debugging with context injection, minimal diffs, and explicit verification steps."
version: "0.1"
topics: ["openai", "debugging", "prompts", "diff-first"]
---

# OpenAI Debugging: Reproduce → Diagnose → Fix → Verify

Key points
- Reproduce first (tests or exact commands).
- Diagnose with evidence (stack trace, failing assertions, logs).
- Fix minimally, then verify and add regression coverage.

Canonical prompt (short)

"You are debugging ExoFrame. First, retrieve agents/ context relevant to the failing area. Then: (1) reproduce, (2) diagnose root cause, (3) propose minimal diffs, (4) verify with commands. Output format: Files → Plan → Diffs → Verification. Cite agent doc paths used. Ask clarifying questions if the repro steps are incomplete."

Examples

- Example prompt:
  "Failure: tests/execution_loop_test.ts is flaky. Inject agents/ context for 'execution loop tests flake'. Provide a repro strategy, likely root causes, and a minimal diff to stabilize. End with verification commands."

- Example prompt:
  "Runtime error: daemon hangs on --version. Inject agents/ context for 'cli version flag'. Provide diagnosis and minimal fix + regression test."

Do / Don't
- ✅ Do add a regression test when possible.
- ✅ Do keep diffs minimal and file-scoped.
- ❌ Don’t guess without reproducing.
