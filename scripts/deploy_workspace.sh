#!/usr/bin/env bash
# scripts/deploy_workspace.sh
# Create a deployable ExoFrame workspace from the repo for users (not devs).
# Usage: ./scripts/deploy_workspace.sh [DEST_PATH]

# Refactored deploy script: reuse scaffold.sh and add --no-run flag
set -euo pipefail
NORUN=0
DEST=""
REPO_ROOT=$(dirname "$0")/..

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

# Delegate actual folder scaffolding and template copy to scaffold.sh
if [ -x "$REPO_ROOT/scripts/scaffold.sh" ]; then
  echo "Running scaffold to prepare runtime folders and templates..."
  "$REPO_ROOT/scripts/scaffold.sh" "$DEST"
else
  echo "Warning: scaffold script not found or not executable; falling back to minimal layout"
  mkdir -p "$DEST/System" "$DEST/Knowledge" "$DEST/Inbox/Requests" "$DEST/Inbox/Plans" "$DEST/Knowledge/Context" "$DEST/Knowledge/Reports" "$DEST/Portals"
fi

# Copy runtime artifacts needed for an installed workspace (configs, tasks)
rsync -a --exclude='node_modules' --exclude='.git' --exclude='*.log' \
  "$REPO_ROOT/deno.json" "$REPO_ROOT/import_map.json" "$REPO_ROOT/templates/exo.config.sample.toml" "$DEST/" || true

# Copy runtime scripts (setup + deploy + scaffold)
mkdir -p "$DEST/scripts"
cp -f "$REPO_ROOT/scripts/setup_db.ts" "$DEST/scripts/" 2>/dev/null || true
cp -f "$REPO_ROOT/scripts/deploy_workspace.sh" "$DEST/scripts/" 2>/dev/null || true
cp -f "$REPO_ROOT/scripts/scaffold.sh" "$DEST/scripts/" 2>/dev/null || true

# Copy minimal src if present
if [ -d "$REPO_ROOT/src" ]; then
  mkdir -p "$DEST/src"
  cp -r "$REPO_ROOT/src/"* "$DEST/src/" 2>/dev/null || true
fi

# Create a small README for deployed workspace (users)
cat > "$DEST/README.md" <<'EOF'
ExoFrame - Deployed Workspace

This directory is a runtime workspace created from the ExoFrame repository.
Run the following to initialize the database and prepare the workspace:

  cd /path/to/your/workspace
  deno task cache
  deno task setup

After that, start the daemon as documented in the Technical Spec.
EOF

# Run cache+setup in the deployed workspace (best-effort) unless --no-run
if [ "$NORUN" -eq 0 ]; then
  echo "Running deno task cache and setup in $DEST (requires deno in PATH)"
  ( cd "$DEST" && deno task cache || true )
  ( cd "$DEST" && deno task setup || true )
else
  echo "--no-run specified: skipping deno cache/setup in deployed workspace"
fi

echo "Deployment complete. User workspace at: $DEST"

echo
echo "Next steps for users:"
echo "  - Inspect $DEST/exo.config.sample.toml and copy to exo.config.toml"
echo "  - Run: deno task cache && deno task setup (if not run automatically)"
echo "  - Start daemon: deno task start"

exit 0
