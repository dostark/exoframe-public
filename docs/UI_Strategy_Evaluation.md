# UI Strategy Evaluation: ExoFrame MVP

## 1. Problem Statement
The current ExoFrame workflow relies on manual file manipulation in the `Inbox/Requests` directory or CLI commands. While functional, it lacks a cohesive "cockpit" for monitoring agent activity, reviewing plans, and managing portals.

## 2. Evaluation Matrix

| Option | Pros | Cons | Effort |
| :--- | :--- | :--- | :--- |
| **A. Obsidian + Dataview** | Already integrated, no new dependencies, fits "Files-as-API" philosophy. | Static (requires refresh), no interactivity (buttons), requires Obsidian. | Low |
| **B. Obsidian Plugin** | Native integration, familiar UI, can add custom buttons/ribbons. | Requires Obsidian, plugin maintenance, TypeScript/React overhead. | Medium |
| **C. Web Dashboard (Deno/Fresh)** | Full interactivity, real-time updates, browser-accessible. | New dependency, deployment complexity, security overhead. | High |
| **D. TUI (Terminal UI)** | No browser needed, fits developer workflow, fast. | Limited visualization (diffs), learning curve for TUI libraries. | Medium |
| **E. VS Code Extension** | Integrated with dev workflow, high visibility. | VS Code only, extension maintenance, complex API. | Medium |

## 3. Decision: Option A (Obsidian + Dataview) for MVP

### Rationale:
1. **Zero Deployment Overhead**: Users already have Obsidian if they are following the recommended setup.
2. **Architecture Alignment**: Fits the "Files-as-API" and "Auditability" goals. Every dashboard view is just a query over the existing filesystem.
3. **Speed to Market**: Can be implemented in hours rather than weeks.

### Future Path:
- **Option C (Web Dashboard)** will be evaluated for v2.0 if users require remote access or real-time log streaming.
- **Option E (VS Code Extension)** will be considered if the community shows strong preference for IDE integration over Obsidian.

## 4. MVP Implementation Plan (Phase 9)
1. **Dashboard Template**: Create `Knowledge/Dashboard.md` with Dataview queries for:
    - Daemon Status (via `daemon.pid`)
    - Pending Plans (via `Inbox/Plans`)
    - Recent Activity (via `System/activity_export.md`)
    - Active Portals (via `Knowledge/Portals`)
2. **Activity Export Service**: Implement a background task or script to export the SQLite activity log to a Markdown file for Dataview consumption.
