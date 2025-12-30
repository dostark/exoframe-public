---
agent: copilot
scope: dev
title: ExoFrame quick reference for Copilot
short_summary: "Short summary: ExoFrame is a Deno + TypeScript project that provides Flow-driven AI automation. Key dirs: src/, tests/, Blueprints/, docs/, agents/. Use Copilot to suggest edits and tests but consult `agents/manifest.json` first."
version: "0.1"
topics: ["repo-overview","testing","flows","obsidian"]
---

# ExoFrame — Copilot quick reference

Purpose
- Provide concise, high-value context for Copilot or Copilot Labs when working on development tasks.

Quick notes
- Runtime: Deno, TypeScript
- Key code paths: `src/ai/`, `src/services/`, `Flows/`, `Blueprints/Agents/`
- Tests: `tests/` (use `initTestDbService()` and `createCliTestContext()` helpers)

Canonical prompt (short):
"You are a repository-aware coding assistant for ExoFrame. Read the `agents/manifest.json` and include any `short_summary` matches before replying. When proposing code, prefer existing helpers and tests, and add unit tests for behavior changes."

Examples
- "Add a test that verifies PlanWriter handles empty JSON files"
- "Migrate test X to use initTestDbService()"

Do / Don't
- ✅ Do consult `agents/manifest.json` and `agents/copilot/exoframe.md` before applying repo-specific assumptions.
- ❌ Don't assume production agent blueprint semantics when modifying these docs — runtime agents live in `Blueprints/Agents/`.

Quick verification
- Provide a 1–2 line `short_summary` to insert into small prompts.
