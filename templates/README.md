# ExoFrame - Deployed Workspace

This directory is a runtime workspace created from the ExoFrame repository.

## Quick Start

1. **Configure ExoFrame:**
   ```bash
   cp exo.config.sample.toml exo.config.toml
   # Edit exo.config.toml to customize paths and settings
   ```

2. **Start the daemon:**
   ```bash
   exoctl daemon start
   ```

3. **Verify it's running:**
   ```bash
   exoctl daemon status
   ```

4. **Create your first request:**
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

## Documentation

- Technical Specification: See project repository
- User Guide: See project repository
- Manual Test Scenarios: See project repository

## Directory Structure

- `Blueprints/` - Agent definitions
- `Workspace/` - Request and plan queue
- `Memory/` - Memory Banks for execution history and project context
- `.exo/` - Database and active tasks
- `Portals/` - Symlinks to external projects

## Getting Help

```bash
exoctl --help              # General help
exoctl request --help      # Request commands
exoctl plan --help         # Plan commands
exoctl blueprint --help    # Blueprint commands
exoctl portal --help       # Portal commands
