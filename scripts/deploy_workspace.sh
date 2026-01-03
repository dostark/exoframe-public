#!/usr/bin/env bash
# scripts/deploy_workspace.sh
# Create a deployable ExoFrame workspace from the repo for users (not devs).
# Usage: ./scripts/deploy_workspace.sh [DEST_PATH]

# Refactored deploy script: reuse scaffold.sh and add --no-run flag
set -euo pipefail
NORUN=0
DEST=""
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Simple flag parsing: --no-run optionally skips running deno tasks
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-run)
      NORUN=1
      shift
      ;;
    *)
      DEST=$1
      shift
      ;;
  esac
done

DEST=${DEST:-$HOME/ExoFrame}

echo "Deploying ExoFrame workspace to: $DEST"

# Ensure target exists
mkdir -p "$DEST"

# Delegate actual folder scaffolding and template copy to scaffold.sh (run with bash so exec bit is not required)
if [ -f "$REPO_ROOT/scripts/scaffold.sh" ]; then
  echo "Running scaffold to prepare runtime folders and templates..."
  bash "$REPO_ROOT/scripts/scaffold.sh" "$DEST"
else
  echo "Warning: scaffold script not found; falling back to minimal layout"
  mkdir -p "$DEST/System" "$DEST/Memory/Projects" "$DEST/Memory/Execution" "$DEST/Inbox/Requests" "$DEST/Inbox/Plans" "$DEST/Portals"
fi

# Copy runtime artifacts needed for an installed workspace (configs, tasks)
rsync -a --exclude='node_modules' --exclude='.git' --exclude='*.log' \
  "$REPO_ROOT/deno.json" "$REPO_ROOT/import_map.json" "$REPO_ROOT/templates/exo.config.sample.toml" "$DEST/" || true

# Copy runtime scripts (setup + deploy + scaffold + migrate)
mkdir -p "$DEST/scripts"
cp -f "$REPO_ROOT/scripts/setup_db.ts" "$DEST/scripts/" 2>/dev/null || true
cp -f "$REPO_ROOT/scripts/migrate_db.ts" "$DEST/scripts/" 2>/dev/null || true
cp -f "$REPO_ROOT/scripts/deploy_workspace.sh" "$DEST/scripts/" 2>/dev/null || true
cp -f "$REPO_ROOT/scripts/scaffold.sh" "$DEST/scripts/" 2>/dev/null || true

# Copy migrations folder (required for database setup)
if [ -d "$REPO_ROOT/migrations" ]; then
  mkdir -p "$DEST/migrations"
  cp -r "$REPO_ROOT/migrations/"* "$DEST/migrations/" 2>/dev/null || true
fi

# Copy minimal src if present
if [ -d "$REPO_ROOT/src" ]; then
  mkdir -p "$DEST/src"
  cp -r "$REPO_ROOT/src/"* "$DEST/src/" 2>/dev/null || true
fi

# Create a small README for deployed workspace (users)
cat > "$DEST/README.md" <<'EOF'
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
- `Inbox/` - Request and plan queue
- `Memory/` - Memory Banks for execution history and project context
- `System/` - Database and active tasks
- `Portals/` - Symlinks to external projects

## Getting Help

```bash
exoctl --help              # General help
exoctl request --help      # Request commands
exoctl plan --help         # Plan commands
exoctl blueprint --help    # Blueprint commands
exoctl portal --help       # Portal commands
```
EOF

# Run cache+setup in the deployed workspace (best-effort) unless --no-run
if [ "$NORUN" -eq 0 ]; then
  echo "Running deno task cache and setup in $DEST (requires deno in PATH)"
  ( cd "$DEST" && deno task cache || true )
  ( cd "$DEST" && deno task setup || true )

  # Install exoctl CLI globally (include config for import map resolution)
  echo "Installing exoctl CLI..."
  ( cd "$DEST" && deno install --global --allow-all --force --config deno.json -n exoctl src/cli/exoctl.ts 2>/dev/null || true )

  # Check if ~/.deno/bin is in PATH
  if [[ ":$PATH:" != *":$HOME/.deno/bin:"* ]]; then
    echo ""
    echo "⚠️  Add ~/.deno/bin to your PATH to use exoctl:"
    echo "   echo 'export PATH=\"\$HOME/.deno/bin:\$PATH\"' >> ~/.bashrc"
    echo "   source ~/.bashrc"
  fi
else
  echo "--no-run specified: skipping deno cache/setup in deployed workspace"
fi

echo "Deployment complete. User workspace at: $DEST"

echo
echo "Next steps:"
echo "  1. Navigate to workspace:"
echo "     cd $DEST"
echo ""
echo "  2. Configure ExoFrame:"
echo "     cp exo.config.sample.toml exo.config.toml"
echo "     # Edit exo.config.toml to customize settings"
echo ""
echo "  3. Verify installation:"
echo "     exoctl --version"
echo ""
echo "  4. Start the daemon:"
echo "     exoctl daemon start"
echo ""
echo "  5. Check status:"
echo "     exoctl daemon status"
echo ""
echo "For more information, see: $DEST/README.md"

exit 0
