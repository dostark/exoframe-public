# .copilot/ — IDE & Dev Agent Instructions

Purpose
-------
This directory contains short, machine-discoverable instruction documents intended to be consumed by development-time agents (e.g., VS Code Copilot, Copilot Labs) and provider integrations (OpenAI, Claude, Google). The content is curated to be concise, provider-agnostic where possible, and easy to inject into prompts using tooling in `scripts/`.

Layout
------
- `.copilot/manifest.json` — auto-generated manifest listing available agent docs (`scripts/build_agents_index.ts`)
- `.copilot/copilot/` — Copilot-focused docs and short summaries
- `.copilot/providers/` — provider-specific adaptation notes and prompt templates
- `.copilot/chunks/` — (auto-generated) pre-chunked text files for quick retrieval