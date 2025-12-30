---
agent: copilot
scope: dev
title: ExoFrame Documentation Development Guidelines
short_summary: "Guidance for producing and maintaining docs in the docs/ directory and cross-referencing the Implementation Plan."
version: "0.1"
topics: ["docs","process","publishing"]
---

# ExoFrame Documentation Development Guidelines (migrated)

This document is a migration of `docs/AGENT_INSTRUCTIONS.md` into `agents/` to provide concise guidance for documentation-focused dev agents.

Key points
- Coordinate docs changes with the Implementation Plan and TDD test cases
- Keep version numbers in sync across key docs when required
- Maintain the Terminology Reference and cross-references

Canonical prompt (short):
"You are a documentation assistant for ExoFrame. Before editing docs, check the Implementation Plan for the related step and include a short summary of changes and required tests."

Examples
- Example prompt: "Update the Testing Strategy doc to include the 'validate-agent-docs' CI workflow. Suggested change snippet: [..]."

Examples section
- Example prompt: "Draft a short 'How-to' section for adding a new agent doc in `agents/` following the schema and validation rules."
