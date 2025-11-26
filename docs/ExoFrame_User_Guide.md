# ExoFrame User Guide

- **Version:** 1.5.0
- **Date:** 2025-11-23

## 1. Introduction

This guide explains how to deploy and use an ExoFrame workspace. Unlike the development repository (where the code
lives), a **User Workspace** is where your actual agents, knowledge, and portals reside.

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
- Copies runtime artifacts (`deno.json`, `import_map.json`, `scripts/setup_db.ts`, minimal `src/`) into the target
  workspace.
- Runs `deno task cache` and attempts `deno task setup` in the target workspace.

### 2.2 Post-Deployment Setup

After deploy, you should inspect the copied `exo.config.sample.toml`, copy it to `exo.config.toml` and adjust paths as
needed, then run:

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

The ExoFrame CLI (`exoctl`) provides a comprehensive interface for managing plans, changesets, git operations, and the daemon.

```bash
# Use via task runner (recommended for development)
deno task cli <command>

# Or install globally for system-wide access
deno install --allow-all -n exoctl src/cli/exoctl.ts

# Then use directly
exoctl <command>
```

### 4.2 Command Groups

ExoFrame CLI is organized into four main command groups:

#### **Plan Commands** - Review AI-generated plans

Review and approve plans before agents execute them:

```bash
# List all plans awaiting review
exoctl plan list
exoctl plan list --status review          # Filter by status

# Show plan details
exoctl plan show <plan-id>

# Approve a plan (moves to /System/Active for execution)
exoctl plan approve <plan-id>

# Reject a plan with reason
exoctl plan reject <plan-id> --reason "Approach too risky"

# Request revisions with comments
exoctl plan revise <plan-id> \
  --comment "Add error handling" \
  --comment "Include unit tests"
```

**Example workflow:**
```bash
# 1. Check what's pending
$ exoctl plan list
📋 Plans (2):

🔍 implement-auth
   Status: review
   Trace: 550e8400...

⚠️ refactor-db
   Status: needs_revision
   Trace: 7a3c9b12...

# 2. Review a plan
$ exoctl plan show implement-auth

# 3. Approve or request changes
$ exoctl plan approve implement-auth
✓ Plan 'implement-auth' approved
  Moved to: /System/Active/implement-auth.md
  Next: ExecutionLoop will process this plan automatically
```

#### **Changeset Commands** - Review agent-generated code

After agents execute plans and create git branches, review their code changes:

```bash
# List all pending changesets (agent-created branches)
exoctl changeset list
exoctl changeset list --status pending

# Show changeset details with diff
exoctl changeset show <request-id>
exoctl changeset show feat/implement-auth-550e8400

# Approve changeset (merges branch to main)
exoctl changeset approve <request-id>

# Reject changeset (deletes branch without merging)
exoctl changeset reject <request-id> --reason "Failed code review"
```

**Example workflow:**
```bash
# 1. See what code changes are ready
$ exoctl changeset list
🔀 Changesets (1):

📌 implement-auth (feat/implement-auth-550e8400)
   Files: 12
   Created: 2025-11-25 14:30:22
   Trace: 550e8400...

# 2. Review the changes
$ exoctl changeset show implement-auth
🔀 Changeset: implement-auth

Branch: feat/implement-auth-550e8400
Files changed: 12
Commits: 3

Commits:
  a3f21b89 - Add JWT authentication
  c4d8e123 - Add login endpoint
  f9a23c45 - Add auth middleware

Diff:
[full diff output...]

# 3. Approve or reject
$ exoctl changeset approve implement-auth
✓ Changeset approved
  Branch: feat/implement-auth-550e8400
  Merged to main: 3b5f7a21
  Files changed: 12
```

#### **Git Commands** - Repository operations with trace_id

Query git history and track changes by trace_id:

```bash
# List all branches with trace metadata
exoctl git branches
exoctl git branches --pattern "feat/*"     # Filter pattern

# Show repository status
exoctl git status

# Search commits by trace_id
exoctl git log --trace <trace-id>
```

**Example workflow:**
```bash
# Find all branches created by agents
$ exoctl git branches --pattern "feat/*"
🌳 Branches (3):

  feat/implement-auth-550e8400
   Last commit: a3f21b89 (11/25/2025)
   Trace: 550e8400...

  feat/add-tests-7a3c9b12
   Last commit: b2c31a45 (11/24/2025)
   Trace: 7a3c9b12...

# Check workspace status
$ exoctl git status
📊 Repository Status

Branch: main

Modified (2):
  M src/auth/handler.ts
  M src/config/schema.ts

# Find all commits for a specific request
$ exoctl git log --trace 550e8400-e29b-41d4-a716-446655440000
📜 Commits for trace 550e8400...

a3f21b89 - Add JWT authentication
  Author: exoframe-agent
  Date: 11/25/2025, 2:30:45 PM
```

#### **Portal Commands** - Manage external project access

Portals are symlinked directories that give agents controlled access to external projects:

```bash
# Add a new portal
exoctl portal add <target-path> <alias>
exoctl portal add ~/Dev/MyWebsite MyWebsite

# List all configured portals
exoctl portal list

# Portal listing output:
# 🔗 Configured Portals (2):
# 
# MyWebsite
#   Status: Active ✓
#   Target: /home/user/Dev/MyWebsite
#   Symlink: ~/ExoFrame/Portals/MyWebsite
#   Context: ~/ExoFrame/Knowledge/Portals/MyWebsite.md
#
# MyAPI
#   Status: Broken ⚠
#   Target: /home/user/Dev/MyAPI (not found)
#   Symlink: ~/ExoFrame/Portals/MyAPI

# Show detailed information about a portal
exoctl portal show <alias>
exoctl portal show MyWebsite

# Remove a portal (deletes symlink, archives context card)
exoctl portal remove <alias>
exoctl portal remove MyWebsite
exoctl portal remove MyWebsite --keep-card  # Keep context card

# Verify portal integrity
exoctl portal verify                        # Check all portals
exoctl portal verify MyWebsite              # Check specific portal

# Refresh context card (re-scan project)
exoctl portal refresh <alias>
exoctl portal refresh MyWebsite
```

**What happens when adding a portal:**

1. Creates symlink: `~/ExoFrame/Portals/<alias>` → `<target-path>`
2. Generates context card: `~/ExoFrame/Knowledge/Portals/<alias>.md`
3. Updates `exo.config.toml` with portal configuration
4. Validates Deno permissions for new path
5. Restarts daemon if running (or prompts for manual restart)
6. Logs action to Activity Journal

**Portal verification checks:**

- Symlink exists and is valid
- Target directory exists and is readable
- Target path matches config
- Deno has necessary permissions
- Context card exists

**Safety features:**

- Portal removal moves context cards to `_archived/` instead of deleting
- Broken portals are detected and flagged (target moved/deleted)
- OS-specific handling:
  - **Windows:** Creates junction points if symlinks unavailable
  - **macOS:** Prompts for Full Disk Access on first portal
  - **Linux:** Checks inotify limits for filesystem watching

**Example workflows:**

```bash
# 1. Add a new portal
$ exoctl portal add ~/Dev/MyWebsite MyWebsite
✓ Validated target: /home/user/Dev/MyWebsite
✓ Created symlink: ~/ExoFrame/Portals/MyWebsite
✓ Generated context card: ~/ExoFrame/Knowledge/Portals/MyWebsite.md
✓ Updated configuration: exo.config.toml
✓ Validated permissions
✓ Logged to Activity Journal
⚠️  Daemon restart required: exoctl daemon restart

# 2. List all portals and check status
$ exoctl portal list
🔗 Configured Portals (3):

MyWebsite
  Status: Active ✓
  Target: /home/user/Dev/MyWebsite
  Symlink: ~/ExoFrame/Portals/MyWebsite
  Context: ~/ExoFrame/Knowledge/Portals/MyWebsite.md

MyAPI
  Status: Active ✓
  Target: /home/user/Dev/MyAPI
  Symlink: ~/ExoFrame/Portals/MyAPI
  Context: ~/ExoFrame/Knowledge/Portals/MyAPI.md

OldProject
  Status: Broken ⚠
  Target: /home/user/Dev/OldProject (not found)
  Symlink: ~/ExoFrame/Portals/OldProject

# 3. View detailed portal information
$ exoctl portal show MyWebsite
📁 Portal: MyWebsite

Target Path:    /home/user/Dev/MyWebsite
Symlink:        ~/ExoFrame/Portals/MyWebsite
Status:         Active ✓
Context Card:   ~/ExoFrame/Knowledge/Portals/MyWebsite.md
Permissions:    Read/Write ✓
Created:        2025-11-26 10:30:15
Last Verified:  2025-11-26 14:22:33

# 4. Verify portal integrity
$ exoctl portal verify
🔍 Verifying Portals...

MyWebsite: OK ✓
  ✓ Target accessible
  ✓ Symlink valid
  ✓ Permissions correct
  ✓ Context card exists

MyAPI: OK ✓
  ✓ Target accessible
  ✓ Symlink valid
  ✓ Permissions correct
  ✓ Context card exists

OldProject: FAILED ✗
  ✗ Target not found: /home/user/Dev/OldProject
  ✓ Symlink exists
  ✓ Context card exists
  ⚠️  Portal is broken - target directory missing

Summary: 1 broken, 2 healthy

# 5. Refresh context card after project changes
$ exoctl portal refresh MyWebsite
🔄 Refreshing context card for 'MyWebsite'...
✓ Scanned target directory
✓ Detected changes: 3 new files
✓ Updated context card
✓ Preserved user notes
✓ Logged to Activity Journal

# 6. Remove a portal safely
$ exoctl portal remove OldProject
⚠️  Remove portal 'OldProject'?
This will:
  - Delete symlink: ~/ExoFrame/Portals/OldProject
  - Archive context card: ~/ExoFrame/Knowledge/Portals/_archived/OldProject_20251126.md
  - Update configuration
Continue? (y/N): y

✓ Removed symlink
✓ Archived context card
✓ Updated configuration
✓ Logged to Activity Journal
⚠️  Daemon restart recommended: exoctl daemon restart
```

**Common errors and solutions:**

```bash
# Error: Target path does not exist
$ exoctl portal add /nonexistent/path BadPortal
✗ Error: Target path does not exist: /nonexistent/path
✗ Portal creation failed - no changes made

Solution: Verify the path exists and is accessible

# Error: Alias already exists
$ exoctl portal add ~/Dev/Another MyWebsite
✗ Error: Portal 'MyWebsite' already exists

Solution: Use a different alias or remove the existing portal first

# Error: Invalid alias characters
$ exoctl portal add ~/Dev/Project "My Project!"
✗ Error: Alias contains invalid characters. Use alphanumeric, dash, underscore only.

Solution: Use only letters, numbers, dashes, and underscores

# Error: Permission denied (macOS)
$ exoctl portal add ~/Desktop/MyApp MyApp
✗ Error: Permission denied - Full Disk Access required

Solution: System Settings → Privacy & Security → Full Disk Access → Enable for Terminal

# Warning: inotify limit (Linux)
⚠️  Warning: File watch limit may be insufficient for large portals
Current limit: 8192 watches

Solution: Increase limit with: echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p
```

**Alias validation rules:**

- Must contain only alphanumeric characters, dashes, and underscores
- Cannot start with a number
- Cannot be empty
- Cannot use reserved names: `System`, `Inbox`, `Knowledge`, `Blueprints`, `Active`, `Archive`
- Maximum length: 50 characters

#### **Daemon Commands** - Control the ExoFrame daemon

Manage the background daemon process:

```bash
# Start the daemon
exoctl daemon start

# Stop the daemon gracefully
exoctl daemon stop

# Restart the daemon
exoctl daemon restart

# Check daemon status
exoctl daemon status

# View daemon logs
exoctl daemon logs
exoctl daemon logs --lines 100           # Show last 100 lines
exoctl daemon logs --follow              # Stream logs (like tail -f)
```

**Example workflow:**
```bash
# Check if daemon is running
$ exoctl daemon status
🔧 Daemon Status

Version: 1.0.0
Status: Running ✓
PID: 12345
Uptime: 2:15:30

# View recent logs
$ exoctl daemon logs --lines 20

# Follow logs in real-time
$ exoctl daemon logs --follow
[2025-11-25 14:30:15] INFO: Daemon started
[2025-11-25 14:30:16] INFO: Watching /Inbox/Requests
[2025-11-25 14:32:45] INFO: New request detected: implement-auth
...
```

### 4.3 Quick Reference

**Most Common Operations:**

```bash
# Human review workflow
exoctl plan list                           # See pending plans
exoctl plan show <id>                      # Review plan details
exoctl plan approve <id>                   # Approve for execution
exoctl plan reject <id> --reason "..."     # Reject with feedback

# Code review workflow  
exoctl changeset list                      # See agent-created branches
exoctl changeset show <id>                 # Review code changes
exoctl changeset approve <id>              # Merge to main
exoctl changeset reject <id> --reason "..."# Delete branch

# Portal management
exoctl portal add ~/Dev/MyProject MyProject  # Mount external project
exoctl portal list                           # Show all portals
exoctl portal show MyProject                 # Portal details
exoctl portal remove MyProject               # Unmount portal
exoctl portal verify                         # Check portal integrity
exoctl portal refresh MyProject              # Update context card

# Daemon management
exoctl daemon start                        # Start background process
exoctl daemon stop                         # Stop gracefully
exoctl daemon status                       # Check health
exoctl daemon logs --follow                # Watch logs

# Git operations
exoctl git branches                        # List all branches
exoctl git status                          # Working tree status
exoctl git log --trace <id>                # Find commits by trace
```

### 4.4 Activity Logging

All human actions via CLI are automatically logged to the Activity Journal:

- Plan approvals/rejections → `plan.approved`, `plan.rejected`
- Changeset approvals/rejections → `changeset.approved`, `changeset.rejected`
- All actions tagged with `actor='human'`, `via='cli'`
- User identity captured from git config or OS username

Query activity history:
```bash
# View activity database directly
sqlite3 ~/ExoFrame/System/journal.db \
  "SELECT * FROM activity WHERE actor='human' ORDER BY timestamp DESC LIMIT 10;"
```

### 4.5 Output Formatting

All CLI commands output human-readable text by default. Future versions will support JSON output:

```bash
# Human-readable (default)
exoctl plan list

# Machine-readable (planned)
exoctl plan list --json
```

### 4.6 Bootstrap (Reference Implementation)

```bash
# 1. Clone or deploy workspace
./scripts/deploy_workspace.sh ~/ExoFrame

# 2. Navigate to workspace
cd ~/ExoFrame

# 3. Cache dependencies
deno task cache

# 4. Initialize database and system
deno task setup

# 5. Start daemon
exoctl daemon start
# or: deno task start

# 6. Verify daemon is running
exoctl daemon status
```

**Complete workflow example:**
```bash
# 1. Drop a request in Inbox
echo "Implement user authentication" > ~/ExoFrame/Inbox/Requests/auth.md

# 2. Agent will generate a plan automatically
# Wait a moment...

# 3. Review the plan
exoctl plan list
exoctl plan show implement-auth

# 4. Approve the plan
exoctl plan approve implement-auth

# 5. Agent executes and creates a branch
# Wait for execution...

# 6. Review the code changes
exoctl changeset list
exoctl changeset show implement-auth

# 7. Approve the changeset to merge
exoctl changeset approve implement-auth

# Done! Changes are now in main branch
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
# Check daemon status
exoctl daemon status

# View recent daemon logs
exoctl daemon logs --lines 50

# Check active git branches
exoctl git branches --pattern "feat/*"

# View agent activity
exoctl changeset list

# Restart daemon if needed
exoctl daemon restart
```

**Plan Not Processing:**

```bash
# List pending plans
exoctl plan list

# Check if plan is approved
exoctl plan show <id>

# Approve if status is 'review'
exoctl plan approve <id>

# Check daemon logs for errors
exoctl daemon logs --follow
```

**Code Changes Not Visible:**

```bash
# List all changesets
exoctl changeset list

# Show specific changeset details
exoctl changeset show <id>

# Check git status
exoctl git status

# View branches
exoctl git branches
```

**Database Corruption:**

```bash
# Stop daemon first
exoctl daemon stop

# Check integrity
sqlite3 ~/ExoFrame/System/journal.db "PRAGMA integrity_check;"

# If corrupted, restore from backup
cp ~/backups/journal.db ~/ExoFrame/System/journal.db

# If no backup, rebuild empty database
rm ~/ExoFrame/System/journal.db
deno task setup --db-only

# Restart daemon
exoctl daemon start
```

**Permission Errors:**

```bash
# Check current Deno permissions
cat deno.json

# View daemon status for errors
exoctl daemon status
exoctl daemon logs

# Verify workspace paths are accessible
ls -la ~/ExoFrame/Inbox
ls -la ~/ExoFrame/System

# Restart with correct permissions
exoctl daemon restart
```

### 5.5 Uninstall

```bash
# 1. Stop daemon
exoctl daemon stop

# 2. Remove ExoFrame directory
rm -rf ~/ExoFrame

# 3. Remove CLI tool from PATH (if installed globally)
rm ~/.deno/bin/exoctl

# 4. Portals are just symlinks - actual projects untouched
# Nothing to clean unless you want to remove project directories
```

### 5.6 Health Check

```bash
# Check daemon status
exoctl daemon status

# Output:
# 🔧 Daemon Status
# Version: 1.0.0
# Status: Running ✓
# PID: 12345
# Uptime: 2:15:30

# View recent activity
exoctl daemon logs --lines 20

# Check git repository status
exoctl git status

# List pending work
exoctl plan list
exoctl changeset list

# View all branches
exoctl git branches
```

### 5.7 Common Workflows

**Daily Operations:**

```bash
# Morning: Check what's pending
exoctl plan list
exoctl changeset list

# Review and approve plans
exoctl plan show <id>
exoctl plan approve <id>

# Review and merge code
exoctl changeset show <id>
exoctl changeset approve <id>

# End of day: Check daemon health
exoctl daemon status
```

**Weekly Maintenance:**

```bash
# Stop daemon for backup
exoctl daemon stop

# Backup workspace (see section 5.1)
tar -czf exoframe-backup-$(date +%Y%m%d).tar.gz ~/ExoFrame

# Clean up old branches
exoctl git branches | grep -v main | xargs git branch -d

# Restart daemon
exoctl daemon start
```

---

_End of User Guide_
