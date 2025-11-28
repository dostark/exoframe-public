#!/usr/bin/env bash
# scripts/scaffold.sh
# Create runtime workspace folders and copy template files into place.
# Usage: ./scripts/scaffold.sh [TARGET_DIR]

set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET=${1:-$PWD}

echo "Scaffolding runtime workspace at: $TARGET"

# Ensure base folders
mkdir -p "$TARGET/System" \
  "$TARGET/Blueprints/Agents" \
  "$TARGET/Blueprints/Flows" \
  "$TARGET/Inbox/Requests" \
  "$TARGET/Inbox/Plans" \
  "$TARGET/Knowledge/Context" \
  "$TARGET/Knowledge/Reports" \
  "$TARGET/Knowledge/Portals" \
  "$TARGET/Portals" \
  "$TARGET/scripts" \
  "$TARGET/src"

# Place .gitkeep placeholders to keep empty dirs visible in repos if desired
touch "$TARGET/System/.gitkeep" || true
touch "$TARGET/Blueprints/Agents/.gitkeep" || true
touch "$TARGET/Blueprints/Flows/.gitkeep" || true
touch "$TARGET/Inbox/Requests/.gitkeep" || true
touch "$TARGET/Inbox/Plans/.gitkeep" || true
touch "$TARGET/Knowledge/.gitkeep" || true
touch "$TARGET/Portals/.gitkeep" || true

# Copy templates into target if they don't already exist
if [ -f "$ROOT_DIR/templates/exo.config.sample.toml" ] && [ ! -f "$TARGET/exo.config.sample.toml" ]; then
  cp "$ROOT_DIR/templates/exo.config.sample.toml" "$TARGET/exo.config.sample.toml"
  echo "Copied exo.config.sample.toml"
fi

if [ -f "$ROOT_DIR/templates/src_main.ts" ] && [ ! -f "$TARGET/src/main.ts" ]; then
  mkdir -p "$TARGET/src"
  cp "$ROOT_DIR/templates/src_main.ts" "$TARGET/src/main.ts"
  echo "Copied src/main.ts template"
fi

if [ -f "$ROOT_DIR/templates/README.template.md" ] && [ ! -f "$TARGET/README.md" ]; then
  cp "$ROOT_DIR/templates/README.template.md" "$TARGET/README.md"
  echo "Copied README template"
fi

if [ -f "$ROOT_DIR/templates/Knowledge_README.md" ] && [ ! -f "$TARGET/Knowledge/README.md" ]; then
  cp "$ROOT_DIR/templates/Knowledge_README.md" "$TARGET/Knowledge/README.md"
  echo "Copied Knowledge/README.md"
fi

if [ -f "$ROOT_DIR/templates/Knowledge_Dashboard.md" ] && [ ! -f "$TARGET/Knowledge/Dashboard.md" ]; then
  cp "$ROOT_DIR/templates/Knowledge_Dashboard.md" "$TARGET/Knowledge/Dashboard.md"
  echo "Copied Knowledge/Dashboard.md"
fi

echo "Scaffold complete. You can now run in the target workspace:"
echo "  deno task cache"
echo "  deno task setup"

exit 0
