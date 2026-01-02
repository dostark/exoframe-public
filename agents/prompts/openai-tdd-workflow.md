---
agent: openai
scope: dev
title: "OpenAI TDD Workflow (tests first)"
short_summary: "Prompt template that forces tests-first with explicit assertions, then minimal diffs and verification."
version: "0.1"
topics: ["openai", "tdd", "testing", "prompts", "diff-first"]
---

# OpenAI TDD Workflow (tests first)

Key points
- Start by proposing failing tests with explicit assertions.
- Use existing ExoFrame test helpers (retrieve guidance from agents/ first).
- Only then implement the minimal change to make tests pass.

Canonical prompt (short)

"You are implementing a change in ExoFrame using TDD. First, inject agents/ context for testing patterns. Then propose 2–4 failing tests with explicit assertions. After that, provide minimal file-scoped diffs to make them pass. End with verification commands. Cite agent doc paths used."

Examples

- Example prompt:
  "Feature: ConfigLoader should surface malformed TOML errors clearly. Inject agents/ context for 'testing helpers ConfigLoader'. Propose 3 failing tests with explicit assertions, then minimal diffs to pass them."

- Example prompt:
  "Bug: a CLI subcommand returns exit code 0 on failure. Inject agents/ context for 'cli error handling tests'. Propose 2 failing tests, then implement minimal fix."

Do / Don't
- ✅ Do keep diffs minimal and separated by file.
- ✅ Do include cleanup/teardown patterns from retrieved docs.
- ❌ Don’t implement before tests.
