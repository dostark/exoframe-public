# agents/ — IDE & Dev Agent Instructions

Purpose
-------
This directory contains short, machine-discoverable instruction documents intended to be consumed by development-time agents (e.g., VS Code Copilot, Copilot Labs) and provider integrations (OpenAI, Claude, Google). The content is curated to be concise, provider-agnostic where possible, and easy to inject into prompts using tooling in `scripts/`.

Layout
------
- `agents/manifest.json` — auto-generated manifest listing available agent docs (`scripts/build_agents_index.ts`)
- `agents/copilot/` — Copilot-focused docs and short summaries
- `agents/providers/` — provider-specific adaptation notes and prompt templates
- `agents/chunks/` — (auto-generated) pre-chunked text files for quick retrieval

Schema
------
Each `.md` file should include YAML frontmatter with at least the following keys:
- `agent` (string) — e.g., `copilot`, `openai`
- `scope` (string) — e.g., `dev`, `ci`, `docs`
- `title` (string)
- `short_summary` (string) — one paragraph, 1–3 lines — used for quick ingestion
- `version` (string)
- `topics` (array of strings) — optional tags

Maintenance
-----------
- Use `scripts/validate_agents_docs.ts` to validate frontmatter and safety rules.
- Update the manifest with `scripts/build_agents_index.ts` if new docs are added.

Notes
-----
These files are **not** runtime Blueprints/agents (see `Blueprints/Agents/`). They are development-focused guidance to be used by IDE agents and automation helpers.
