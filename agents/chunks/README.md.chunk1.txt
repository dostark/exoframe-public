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

Canonical prompt (short):
"You are a dev-time agent. Before performing repository-specific changes, consult `agents/manifest.json` and include matching `short_summary` items for relevant docs in `agents/`."