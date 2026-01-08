# ExoFrame - Deployed Workspace

This directory is a runtime workspace created from the ExoFrame repository.

## Quick Start

1. **Configure ExoFrame:**
   ```bash
   cp exo.config.sample.toml exo.config.toml
   # Edit exo.config.toml to customize paths and settings
   ```

````markdown
# ExoFrame — Deployed Workspace

This directory represents a deployed runtime workspace created from the ExoFrame repository. It contains the runtime layout that agents operate against.

## Quick Start

1. Copy the sample config and edit as needed:
```bash
cp exo.config.sample.toml exo.config.toml
# edit exo.config.toml to customize paths and settings
```

2. Start the daemon
```bash
exoctl daemon start
```

3. Verify status
```bash
exoctl daemon status
```

4. Create your first request
```bash
exoctl request "Add a hello world function"
```

## Daemon Management

```bash
exoctl daemon start    # Start in background
exoctl daemon stop     # Stop gracefully
exoctl daemon status   # Check if running
exoctl daemon restart  # Restart daemon
```

## Directory Structure

- `Blueprints/` — Agent definitions and templates
- `Workspace/` — Requests, Plans, and Changesets
- `Memory/` — Persistent memory banks (copied during deploy)
- `.exo/` — Runtime state: DB, logs, active tasks (replaces former `System/`)
- `Portals/` — Symlinks to external project repositories

## Getting Help

```bash
exoctl --help
exoctl request --help
exoctl plan --help
exoctl blueprint --help
exoctl portal --help
```
````
