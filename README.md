*** Begin ExoFrame overview ***

# ExoFrame — Auditable Agent Orchestration Platform

[![Deno](https://img.shields.io/badge/runtime-Deno-green.svg)](https://deno.land/) [![SQLite](https://img.shields.io/badge/storage-SQLite-blue.svg)](https://www.sqlite.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

ExoFrame is a secure, auditable platform for running autonomous agent workflows with human supervision. It focuses on reproducibility, security, and a permanent audit trail so teams can run complex, long-running agent tasks with confidence.

Core ideas
- Activity Journal: every plan, tool call, and file modification is recorded to a persistent SQLite-backed journal for full traceability.
- Human-in-the-loop: agents propose structured Plans which must be reviewed and approved before changes are applied.
- Files-as-API: workspaces are represented on disk (Requests, Plans, Changesets) so standard tools and CI can interact with agent outputs.

Where to find more detail
- User Guide: [./docs/ExoFrame_User_Guide.md](./docs/ExoFrame_User_Guide.md)
- Technical Spec: [./docs/dev/ExoFrame_Technical_Spec.md](./docs/dev/ExoFrame_Technical_Spec.md)
- White Paper: [./docs/dev/ExoFrame_White_Paper.md](./docs/dev/ExoFrame_White_Paper.md)
- Development & TDD: [./docs/dev/Building_with_AI_Agents.md](./docs/dev/Building_with_AI_Agents.md)

Quick start
```bash
# Clone
git clone https://github.com/dostark/exoframe.git
cd exoframe

# Deploy a runtime workspace (copies Memory/, Blueprints/, top-level docs; does not copy templates/)
./scripts/deploy_workspace.sh ~/MyExoWorkspace

# Start the daemon inside the deployed workspace
cd ~/MyExoWorkspace
deno task start
```

Core components & runtime layout
- `Workspace/` — Requests, Plans, and Changesets (primary user-facing area).
- `Portals/` — Symlinks to project repositories (multi-repo context).
- `Memory/` — Persistent memory banks (copied to deployed workspaces; used for search and recall).
- `Blueprints/` — Agent blueprints and templates (copied on deploy).
- `.exo/` — Runtime state (database, logs, pid files). This replaces the legacy `System/` folder.

Operator features
- TUI Dashboard (`exoctl dashboard`) — review Plans, monitor agents, and approve changes.
- Least-privilege execution — Deno's permission model reduces blast radius for agent actions.
- Local-first operation — optional integrations to cloud LLMs, but data remains local by default.

Testing & contributing
- Follow test helpers in `tests/` (use `createCliTestContext()` and `initTestDbService()` for deterministic tests).
- Run local CI: `deno run -A scripts/ci.ts all` (fmt, lint, tests, coverage, build).

License
- MIT © dostark

*** End ExoFrame overview ***
