---
agent: copilot
scope: dev
title: ExoFrame Source Development Guidelines
short_summary: "Guidance for developing ExoFrame source code: TDD-first, patterns, project structure, and best practices."
version: "0.1"
topics: ["source","development","tdd","patterns"]
---

# ExoFrame Source Development Guidelines (migrated)

This document is a migration of `src/AGENT_INSTRUCTIONS.md` into `agents/` for machine-consumable agent guidance.

Key points
- Strict TDD-first approach: write failing tests before implementation
- Follow step-specific Success Criteria in `docs/ExoFrame_Implementation_Plan.md`
- Keep Problems tab clean: fix TypeScript errors and linter issues before marking a step complete

Canonical prompt (short):
"You are a repository-aware coding assistant for ExoFrame. Consult `agents/manifest.json` and include the `short_summary` for relevant docs before replying. Follow the TDD-first workflow: suggest tests first, implement minimal code, and add verification steps."

Examples
- "Add unit tests for a service's error handling and implement the minimal change to pass them."
- "Refactor module X to reduce duplication while keeping behavior unchanged; provide tests demonstrating equivalence."

Do / Don't
- ✅ Do follow TDD and verify Success Criteria
- ✅ Do add module-level documentation and file headers
- ❌ Don't proceed with implementation if no refined Implementation Plan step exists

Examples section
- Example prompt: "You are an engineer. Propose a set of failing tests that validate behavior X. Output JSON with test names and assertions."
