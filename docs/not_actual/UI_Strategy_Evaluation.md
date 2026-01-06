# UI Strategy Evaluation: ExoFrame MVP

## 1. Problem Statement

The current ExoFrame workflow relies on manual file manipulation in the `Workspace/Requests` directory or CLI commands. While functional, it lacks a cohesive "cockpit" for monitoring agent activity, reviewing plans, and managing portals.

## 2. Evaluation Matrix

| Option                                | Pros                                                                                | Cons                                                                                 | Effort |
| :------------------------------------ | :---------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- | :----- |
| **A. Obsidian + Dataview (Optional)** | Already integrated (optional), no new dependencies, fits "Files-as-API" philosophy. | Static (requires refresh), no interactivity (buttons), requires Obsidian (optional). | Low    |
| **B. Obsidian Plugin**                | Native integration, familiar UI, can add custom buttons/ribbons.                    | Requires Obsidian, plugin maintenance, TypeScript/React overhead.                    | Medium |
| **C. Web Dashboard (Deno/Fresh)**     | Full interactivity, real-time updates, browser-accessible.                          | New dependency, deployment complexity, security overhead.                            | High   |
| **D. TUI (Terminal UI)**              | No browser needed, fits developer workflow, fast.                                   | Limited visualization (diffs), learning curve for TUI libraries.                     | Medium |
| **E. VS Code Extension**              | Integrated with dev workflow, high visibility.                                      | VS Code only, extension maintenance, complex API.                                    | Medium |

## 3. Decision: Option D (TUI - Terminal User Interface)

### Rationale:

1. **Developer Workflow**: Developers spend most of their time in the terminal. A TUI provides a "cockpit" that feels native to the existing `exoctl` workflow.
2. **Interactivity**: Unlike Obsidian/Dataview (which is read-only and optional), a TUI can provide interactive plan approval, log streaming, and portal management without leaving the shell.
3. **No External Dependencies**: Does not require users to install or configure Obsidian to get a high-level view of the system.
4. **Performance**: TUIs are extremely fast and lightweight, fitting the "Iron Skeleton" philosophy of ExoFrame.

### Future Path:

- **Option A (Obsidian, Optional)** will remain an add-on for **Knowledge Management** and long-term auditability (viewing historical plans and activity logs for users who enable it).
- **Option C (Web Dashboard)** will be considered for v2.0 if multi-user or remote monitoring becomes a requirement.

## 4. Implementation Plan (Phase 9 & 10)

### Step 9.5: TUI Cockpit Foundation

1. **Library Selection**: Use a lightweight TUI library (e.g., `cliffy` or `deno-tui`) to build the dashboard.
2. **Dashboard Views**:
   - **Monitor**: Real-time log streaming from the Activity Journal.
   - **Plan Reviewer**: Interactive diff viewer for pending plans with Approve/Reject buttons.
   - **Portal Manager**: List and status of active portals.
   - **Daemon Control**: Start/Stop/Restart the daemon from within the TUI.

### Step 9.6: Integration with exoctl

1. Implement `exoctl dashboard` (or `exoctl cockpit`) to launch the TUI.
2. Ensure the TUI can run in parallel with the daemon.
