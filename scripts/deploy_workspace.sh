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
  mkdir -p "$DEST/.exo" "$DEST/Memory/Projects" "$DEST/Memory/Execution" "$DEST/Workspace/Requests" "$DEST/Workspace/Plans" "$DEST/Portals"
fi

# Copy runtime artifacts needed for an installed workspace (configs, tasks)
rsync -a --exclude='node_modules' --exclude='.git' --exclude='*.log' \
  "$REPO_ROOT/deno.json" "$REPO_ROOT/import_map.json" "$REPO_ROOT/exo.config.sample.toml" "$DEST/" || true

# Copy entire Memory/ folder (preserve subfolders and files)
if [ -d "$REPO_ROOT/Memory" ]; then
  echo "Copying Memory/ (all content) to deployed workspace..."
  mkdir -p "$DEST/Memory"
  rsync -a --delete --exclude='.git' "$REPO_ROOT/Memory/" "$DEST/Memory/" || true
fi

# Copy all Blueprints/ content (including subfolders), but do not copy templates/ from repo root
if [ -d "$REPO_ROOT/Blueprints" ]; then
  echo "Copying Blueprints/ to deployed workspace..."
  mkdir -p "$DEST/Blueprints"
  rsync -a --delete --exclude='.git' "$REPO_ROOT/Blueprints/" "$DEST/Blueprints/" || true
fi

# Copy top-level files from docs/ (only files directly under docs/, do not copy subfolders)
if [ -d "$REPO_ROOT/docs" ]; then
  echo "Copying top-level docs/ files to deployed workspace (excluding subfolders)..."
  mkdir -p "$DEST/docs"
  find "$REPO_ROOT/docs" -maxdepth 1 -type f -exec cp -p {} "$DEST/docs/" \; || true
fi

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
