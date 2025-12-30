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

## Quickstart — Using `agents/` with VS Code & Copilot ✅

1. Install Copilot (or open Copilot Labs) in your VS Code.
2. Run the helper to get the most relevant agent context for your task:

```bash
# returns JSON with short_summary and snippet for the best doc matching the query
deno run --allow-read scripts/inject_agent_context.ts --query "fix tests" --agent copilot
```

3. Copy the `short_summary` and paste into your Copilot prompt (or use the VS Code snippet below to automate insertion).

### Copilot Labs / Prompt Template (short)

System: You are a repository-aware coding assistant for ExoFrame. Before answering, consult the `agents/manifest.json` by using the `agents/` short_summary and include the matching `short_summary` items. Try to prefer tests-first (TDD) patterns. When suggesting code, add tests.

User: [task details]

### VS Code snippet (Installed in `.vscode/snippets/agent-context.code-snippets`)

- Trigger: "agent-context"
- Inserts a short template reminding Copilot to consult `agents/manifest.json` and include short_summary.

## Examples

- "Add unit tests for a service's error handling and implement the minimal change to pass them."
- "Draft a short docs section for adding a new agent doc in `agents/` and include sample frontmatter."

## Verification

- Manual: Use `deno run --allow-read scripts/inject_agent_context.ts --query "write tests" --agent copilot` and verify the returned `short_summary` is relevant.
- CI: The `validate-agent-docs` workflow checks doc schema. The `bin/agent-context` / `scripts/inject_agent_context.ts` smoke tests will verify retrieval.

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
