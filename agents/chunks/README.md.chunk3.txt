See `agents/embeddings/example_precomputed_template.json` for a minimal, valid template to create precomputed embedding files.

Canonical prompt (short):
"You are a dev-time agent. Before performing repository-specific changes, consult `agents/manifest.json` and include matching `short_summary` items for relevant docs in `agents/`."

Examples
- Example prompt: "Suggest 3 unit test cases for PlanWriter that use `initTestDbService()` and include expected assertions."

Notes
-----
These files are **not** runtime Blueprints/agents (see `Blueprints/Agents/`). They are development-focused guidance to be used by IDE agents and automation helpers.