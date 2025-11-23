# ExoFrame User Guide

**Version:** 1.5.0
**Date:** 2025-11-23

## 1. Introduction
This guide explains how to deploy and use an ExoFrame workspace. Unlike the development repository (where the code lives), a **User Workspace** is where your actual agents, knowledge, and portals reside.

## 2. Installation & Deployment

### 2.1 Standard Deployment
From the repository root run the included script to create a user workspace (default: `~/ExoFrame`):

```bash
# From repo root
./scripts/deploy_workspace.sh /path/to/target-workspace

# Example (create a workspace in your home dir)
./scripts/deploy_workspace.sh ~/ExoFrame
```

**What the deploy script does:**
- Creates the standard runtime folders (`System`, `Knowledge`, `Inbox`, `Portals`).
- Copies runtime artifacts (`deno.json`, `import_map.json`, `scripts/setup_db.ts`, minimal `src/`) into the target workspace.
- Runs `deno task cache` and attempts `deno task setup` in the target workspace.

### 2.2 Post-Deployment Setup
After deploy, you should inspect the copied `exo.config.sample.toml`, copy it to `exo.config.toml` and adjust paths as needed, then run:

```bash
cd /path/to/target-workspace
deno task cache
deno task setup
deno task start
```

### 2.3 Advanced Deployment Options

```bash
# fast deploy (runs deno tasks automatically)
./scripts/deploy_workspace.sh /home/alice/ExoFrame

# deploy but skip automatic execution of deno tasks (safer in constrained envs)
./scripts/deploy_workspace.sh --no-run /home/alice/ExoFrame

# alternative: only scaffold the target layout and copy templates
./scripts/scaffold.sh /home/alice/ExoFrame

# once scaffolded, initialize runtime manually
cd /home/alice/ExoFrame
deno task cache
deno task setup
deno task start
```

## 3. Workspace Overview

### 3.1 Directory Structure
- **Inbox/**: Drop requests here.
- **Knowledge/**: Your Obsidian vault.
- **System/**: Database and logs (do not touch manually).
- **Portals/**: Symlinks to your projects.

## 4. CLI Reference

### 4.1 Installation

CLI is automatically available via deno tasks:
```bash
# Use via task runner
deno task cli <command>

# Or install globally
deno install --allow-all -n exoctl src/cli.ts

# Then use directly
exoctl <command>
```

### 4.2 Commands

**Daemon Management**
```bash
deno task start              # Start daemon (detached)
deno task stop               # Stop gracefully (sends SIGTERM)
deno task restart            # Stop + Start
deno task status             # Check if running, show uptime and stats
```

**Portal Management**
```bash
deno task cli portal add <path> <alias>
  # Creates symlink, generates context card
  # Example: deno task cli portal add ~/Dev/MyApp MyApp

deno task cli portal list
  # Shows all portals with paths and sizes
  # Output:
  # MyApp     -> /home/user/Dev/MyApp (324 MB, 1,234 files)
  # LegacyApp -> /home/user/Work/Old   (1.2 GB, 8,901 files)

deno task cli portal remove <alias>
  # Removes symlink (does not delete actual project)

deno task cli portal refresh <alias>
  # Regenerates context card (rescans project)
```

**Activity Log**
```bash
deno task cli log tail
  # Live stream (like tail -f)
  # Press Ctrl+C to stop

deno task cli log query --trace <trace-id>
  # Show all events for specific trace

deno task cli log query --actor "Senior Coder"
  # Show all events from specific agent

deno task cli log query --since "1 hour ago"
  # Time-based filter (also: "30m", "2 days", "2024-11-20")

deno task cli log export --format json > logs.json
  # Export entire activity log
```

**Lease Management**
```bash
deno task cli lease list
  # Show active file leases
  # Output:
  # /ExoFrame/System/Active/task-42.md
  #   Agent: Senior Coder
  #   Acquired: 2024-11-20 14:32:15
  #   Expires: 2024-11-20 14:33:15 (in 45 seconds)

deno task cli lease release <file-path>
  # Force release lease (use if agent crashed)

deno task cli lease clean
  # Remove all expired leases (automatic cleanup)
```

**Diagnostics**
```bash
deno task cli doctor
  # System health check (see section 12.6)

deno task cli config validate
  # Parse and validate exo.config.toml
  # Shows errors with line numbers

deno task cli version
  # Show ExoFrame version and Deno version
```

### 4.3 Output Formatting

All CLI commands output human-readable text by default.
Add `--json` flag for machine-readable output:
```bash
deno task cli portal list --json
# {"portals": [{"alias": "MyApp", "path": "/home/user/Dev/MyApp", ...}]}

deno task cli log query --trace abc123 --json
# {"events": [{...}]}
```

### 4.4 Bootstrap (Reference Implementation)

```bash
# 1. Clone Core
git clone https://github.com/your-repo/exoframe-core.git ~/ExoFrame

# 2. Cache Dependencies (No npm install!)
cd ~/ExoFrame
deno cache src/main.ts

# 3. Setup (Generates Keys, DB)
deno task setup

# 4. Mount Project
deno task mount ~/Dev/MyProject "MyProject"

# 5. Launch Daemon
# (See deno.json for the full command with permission flags)
deno task start
```

## 5. Operational Procedures

### 5.1 Backup

**Before Backup:**
```bash
# Stop daemon to ensure database consistency
deno task stop
```

**Backup Command:**
```bash
# Backup ExoFrame directory
tar -czf exoframe-backup-$(date +%Y%m%d).tar.gz \
  --exclude='*.log' \
  --exclude='deno-dir' \
  ~/ExoFrame

# Verify backup
tar -tzf exoframe-backup-*.tar.gz | head
```

**What to backup separately:**
- Portals are symlinks, not actual code
- Actual project code lives in `~/Dev/*` (backup separately)
- OS keyring secrets (handled by OS backup tools)

### 5.2 Restore
```bash
# Extract backup
tar -xzf exoframe-backup-20251120.tar.gz -C ~/

# Verify portal symlinks still work
cd ~/ExoFrame/Portals
ls -la

# Recreate broken symlinks if projects moved
deno task mount ~/Dev/MyProject MyProject

# Restart daemon
deno task start
```

### 5.3 Upgrade ExoFrame
```bash
# 1. Stop daemon
deno task stop

# 2. Backup current version (see 12.1)
tar -czf exoframe-pre-upgrade.tar.gz ~/ExoFrame

# 3. Pull latest code
cd ~/ExoFrame
git pull origin main

# 4. Check for breaking changes
cat CHANGELOG.md

# 5. Run migrations if needed
deno task migrate

# 6. Clear Deno cache (forces re-compilation)
deno cache --reload src/main.ts

# 7. Restart daemon
deno task start

# 8. Verify
deno task status
```

### 5.4 Troubleshooting

**Agent Stuck / Unresponsive:**
```bash
# Check active leases
deno task cli lease list

# View agent's recent activity
deno task cli log query --actor "Senior Coder" --since "10m"

# Force release lease
deno task cli lease release "/ExoFrame/System/Active/task-123.md"

# If daemon is completely frozen
pkill -f "deno.*exoframe"
deno task start
```

**Database Corruption:**
```bash
# Check integrity
sqlite3 ~/ExoFrame/System/journal.db "PRAGMA integrity_check;"

# If corrupted, restore from backup
cp ~/backups/journal.db ~/ExoFrame/System/journal.db

# If no backup, rebuild empty database
rm ~/ExoFrame/System/journal.db
deno task setup --db-only
```

**Permission Errors:**
```bash
# Check current Deno permissions
cat deno.json

# Verify portal paths are in allow lists
deno task cli portal list

# Add missing portal root to exo.config.toml
nano ~/ExoFrame/exo.config.toml
# Then restart daemon
```

### 5.5 Uninstall
```bash
# 1. Stop daemon
deno task stop

# 2. Remove ExoFrame directory
rm -rf ~/ExoFrame

# 3. Remove CLI tool from PATH
rm ~/.deno/bin/exoctl

# 4. Clean secrets from OS keyring (manual)
# macOS: Open Keychain Access → Search "exoframe" → Delete
# Linux: seahorse → Search "exoframe" → Delete
# Windows: Credential Manager → Generic Credentials → Delete exoframe entries

# 5. Portals are just symlinks - actual projects untouched
# Nothing to clean unless you want to remove project directories
```

### 5.6 Health Check
```bash
# Run built-in diagnostics
deno task cli doctor

# Output:
# ✓ Deno runtime: v2.0.4
# ✓ Database: Accessible, 1,234 events
# ✓ Configuration: Valid
# ✓ Portals: 3 mounted, all accessible
# ✓ Leases: 0 active, 2 expired (cleaned)
# ⚠ Disk space: 85% used (consider cleanup)
# ✓ Permissions: Correctly configured
```

---
*End of User Guide*
