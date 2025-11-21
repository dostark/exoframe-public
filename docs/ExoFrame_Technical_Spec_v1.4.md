# Project ExoFrame: Technical Specification & Architecture

**Version:** 1.4.0
**Status:** Engineering Specification
**Reference:** [ExoFrame White Paper v1.4](./ExoFrame_White_Paper_v1.4.md)
**Philosophy:** Local-First, Type-Safe, Secure-by-Design


---

## Terminology Reference

- **Activity Journal:** The SQLite database logging all events
- **Portal:** A symlinked directory providing agent access to external projects
- **Request:** A markdown file in `/Inbox/Requests` containing user intent
- **Plan:** An agent-generated proposal in `/Inbox/Plans`
- **Active Task:** An approved request in `/System/Active` being executed
- **Report:** An agent-generated summary in `/Knowledge/Reports` after completion
- **Trace ID:** UUID linking request → plan → execution → report
- **Lease:** Exclusive lock on a file (stored in `leases` table)
- **Actor:** Entity performing action (agent name, "system", or "user")
- **Blueprint:** YAML definition of an agent (model, capabilities, prompt)

---

## 1. System Overview

ExoFrame is a secure, daemon-based orchestration platform. It operates on the **"Files as API"** principle, utilizing a watched folder structure to trigger typed workflows.

ExoFrame deliberately supports **three agent execution modes**:
1. **Local/Sovereign Agents** — run entirely on the user’s hardware (e.g., Ollama, deterministic scripts). They have unrestricted access to on-disk context within the allowed portals and do not require token-budget enforcement.
2. **Federated / Third-Party Agents** — call out to remote APIs (e.g., Claude, GPT). They inherit provider-specific token ceilings, rate limits, and privacy constraints that the engine enforces via the Context Loader and Capability pipeline.
3. **Hybrid Agents** — orchestrations that mix local + federated sub-agents inside a single trace. Hybrid mode must log every cross-boundary handoff and only share context slices that the blueprint explicitly authorizes.

**Security Upgrade:** v1.4 completes the migration from Bun/Node to **Deno**, leveraging its capability-based security model and codifying permission governance across CLI, daemon, and agents.

---

## 2. Core Technical Stack

| Component | Technology | Justification |
| :--- | :--- | :--- |
| **Runtime** | **Deno** (v2.0+) | Native TypeScript, Web Standards, and **Permission System**. |
| **Language** | **TypeScript** | No transpilation needed. Strict typing via Zod. |
| **Config** | **TOML** & **YAML** | TOML for System Config; YAML for Blueprints. |
| **Journal** | **SQLite** | Accessible via `jsr:@db/sqlite` (WASM) or FFI for performance. |
| **Dependencies** | **ES Modules** | No `node_modules`. Dependencies cached globally or in vendor dir. |
| **Interface** | **Obsidian** | Viewer for Markdown files and Dashboard. |

---

## 3. Directory Structure

The File System is the Single Source of Truth. Every path shown above is provisioned by `scripts/scaffold.ts`; missing folders are treated as fatal errors during daemon startup so that watchers do not run in partially-initialized states.

```text
/ExoFrame
├── deno.json                   <-- Project Config (Import Maps, Tasks)
├── lock.json                   <-- Dependency Integrity Hash
├── exo.config.toml             <-- System Physics (Paths, Models)
├── /System
│   ├── journal.db              <-- SQLite: Activity Log & Locks
│   ├── /Active                 <-- Runtime State
│   └── /Archive                <-- Completed task artifacts
├── /Blueprints                 <-- "Source Code" of the Swarm
│   ├── /Agents                 <-- YAML definitions
│   └── /Flows                  <-- TS logic
├── /Inbox                      <-- The Input Layer
│   ├── /Requests               <-- User drops ideas here
│   ├── /Plans                  <-- Agents submit proposals
│   └── /Archive                <-- Processed requests/plans
├── /Knowledge                  <-- User Content (Obsidian Vault)
│   ├── /Context                <-- Curated reference docs
│   ├── /Reports                <-- Agent-authored reports
│   └── /Portals                <-- Auto-generated context cards
├── /Knowledge/README.md        <-- Obsidian usage guide
├── /Portals                    <-- VIRTUAL OVERLAY (Symlinks)
│   └── <Alias> -> /home/user/Dev/Project_X
```

---

## 4. The Engine (Deno Orchestrator)

The Engine is a state machine running as a background daemon.

### 4.1. Security Primitives (The Deno Advantage)
Instead of building custom path validation logic (which is error-prone), we use Deno's startup flags to enforce boundaries at the OS process level.

**Startup Command:**
```bash
deno run \
  --allow-read="./ExoFrame" \
  --allow-write="./ExoFrame" \
  --allow-net="api.anthropic.com,api.openai.com,localhost:11434" \
  --allow-env="EXO_*" \
  --allow-run="git" \
  src/main.ts
```

**Impact:** If a rogue agent tries to `fetch('evil.com')` or `Deno.readTextFile('/etc/passwd')`, the Deno runtime throws a `PermissionDenied` error immediately. The agent code *cannot* bypass this.

### 4.2. Runtime Interface (`IExoRuntime`)
Even though we use Deno, we abstract operations to allow for mocking in tests.

```typescript
interface IExoRuntime {
  // Filesystem (Uses Deno.readTextFile)
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  
  // Security (Uses Deno.realPath to resolve symlinks)
  resolvePath(path: string): Promise<string>;
  
  // Processes (Uses Deno.Command)
  spawn(cmd: string, args: string[]): Promise<Result>;
}
```

---

## 5. Storage Architecture

### Tier 1: The Activity Journal (SQLite)
*   **Implementation:** Uses `jsr:@db/sqlite`.
*   **Concurrency:** Uses WAL mode to handle concurrent writes from the Daemon and Agents.

### Tier 2: The Content Store
*   **Format:** Markdown.
*   **Watcher:** `Deno.watchFs()` is used instead of `chokidar` (reducing dependencies).
    *   *Debounce Strategy:* The engine implements a 200ms debounce buffer to handle OS-level rapid-fire events.

---

## 6. Feature: The Portal System & Safety

### 6.1. Mechanism
1.  **Mounting:** User runs `deno task mount <target> <alias>`.
2.  **Linking:** Deno creates the symlink using `Deno.symlink`.
3.  **Permissioning:** *Crucial Step* — `exoctl portal add` patches `exo.config.toml`, regenerates `deno.json` permission lists, and runs `deno task config validate`. Only if validation succeeds do we restart the daemon (or hot-reload permissions on supported OSes). If any sub-step fails, the symlink is deleted and configuration rollback is performed automatically.
4.  **Verification:** After restart, `exoctl portal list --json` is executed and compared with the expected allow-list; mismatches block agent access and surface an actionable error.

```bash
# exoctl portal add ~/Dev/MyProject MyProject
# 1. Creates symlink
# 2. Updates exo.config.toml to add path
# 3. Regenerates deno.json with new permissions
# 4. Restarts daemon automatically
```

### 6.2. Path Safety
*   **Engine Level:** Deno prevents access outside the allowed list.
*   **Logic Level:** Engine still checks `if (path.startsWith(portalRoot))` to prevent logical confusion between portals.

### 6.3. OS-Specific Notes
*   **Windows:** Symlink creation requires Developer Mode or elevated PowerShell. When unavailable, `exoctl` falls back to NTFS junctions and records the deviation in Activity Journal.
*   **macOS:** First-time portal creation triggers System Settings > Privacy prompt; instructions are logged to `/Knowledge/README.md`.
*   **Linux:** Ensure `inotify` watch limits (`fs.inotify.max_user_watches`) include portal paths; setup script adjusts when possible.

---

## 7. Agentic Architecture

**Example Blueprint:** `/Blueprints/Agents/senior_coder.yaml`

```yaml
name: "Senior Coder"
runtime: "deno" # Explicitly marks runtime requirement
model: "claude-3-5-sonnet"

# PERMISSIONS
# Deno allows us to be very granular via sub-process flags
capabilities:
  filesystem:
    allow_write: ["portal:*"] 
  shell:
    allow: ["git", "npm"] # Mapped to --allow-run
```

### 7.1 Capability Enforcement Pipeline
1. **Blueprint Parsing:** `BlueprintService` validates YAML against Zod schema and resolves macros (e.g., `portal:*`).
2. **Permission Compilation:** At agent launch, requested capabilities are intersected with daemon-wide policy, producing concrete Deno flags (`--allow-read`, `--allow-run`, `--allow-net`) plus internal guards (tool registry filters, command allowlist).
3. **Runtime Guardrails:** Even when Deno permits an API, the Tool Registry double-checks that the caller’s capability bit is set before dispatching commands.
4. **Audit:** Granted permissions are recorded in the Activity Journal’s payload, and `exoctl log query --trace` shows what the agent actually received.
5. **Violation Handling:** Attempts to exceed declared capabilities raise a `CapabilityViolationError`, halt the agent, and trigger Mission Reporter warnings.

### 7.2 Local vs Federated vs Hybrid Agents
| Attribute | Local/Sovereign | Third-Party / Federated | Hybrid |
| --- | --- | --- | --- |
| Execution | Runs on user hardware (Ollama, scripts) | Calls remote API (Claude, GPT) | Mixed chain of local + remote sub-agents |
| Context Limits | Unlimited (bounded by disk) | Enforced via Context Loader token budget | Local hops unrestricted; remote hops capped |
| Network Permissions | Typically none | Requires explicit `--allow-net` | Only remote segments get net perms; logged |
| Privacy Guarantees | Data never leaves machine | Subject to provider ToS | Per-hop consent + redaction lists required |
| Blueprint Hint | `runtime_mode: local` | `runtime_mode: remote` | `runtime_mode: hybrid` + `handoff_policy` |

When `runtime_mode` is `local`, the Context Loader bypasses token truncation and streams all resolved files (subject to optional soft caps). When `runtime_mode` is `remote`, the loader enforces the model’s context window and emits `[System Warning]` entries if truncation occurs. For `runtime_mode: hybrid`, the loader splits context into local vs exportable segments based on `handoff_policy`, and every remote hop logs the exact files shared.

---

## 8. Security & Trust

### 8.1. Threat Model (v1.2 - Hardened)
*   **Scope:** Personal Productivity.
*   **Mitigation:**
    *   **Runtime Sandbox:** Deno enforces file/net/env boundaries.
    *   **Supply Chain:** No `node_modules`. Dependencies are imported via HTTPS URLs with integrity hashes (`lock.json`).
    *   **Path Traversal:** Deno throws `PermissionDenied` if code attempts to read `../outside`.

### 8.2. Secret Management
*   **Storage:** Secrets stored in OS Keyring (Keychain/DPAPI).
*   **Access:** Deno accesses keyring via FFI plugin (e.g., `deno_keyring`) only when needed. Secrets are never printed to stdout/logs.
*   **Verification:** Each threat in Section 8 maps to a regression test listed in the Implementation Plan’s Phase 7 risk matrix; CI fails if any mitigation test regresses.

---

## 9. Concurrency & Locking

### 9.1. The Lease Protocol
*   **Heartbeat:** Agents run a `setInterval` loop updating the SQLite `leases` table every 30s.
*   **Failure:** If the Deno process crashes, the lease expires in 60s.

### 9.2. Conflict Resolution
*   **Git:** Agents utilize Feature Branches.
*   **User:** User merges branches manually via Git CLI or VS Code.

---

## 10. Performance KPIs

Targets based on Reference Hardware (**Mac Mini M4 / Linux x64**). Benchmarks are planned but not yet published.

| Metric | Target | Notes |
|---|---|---|
| **Cold Start** | < 80 ms | Measured via `deno bench cold_start_bench.ts` once harness lands |
| **Watcher Latency** | < 100 ms | Slow-write scenario to be profiled in CI |
| **Memory Footprint** | < 150 MB | Idle daemon including Activity Journal cache |
| **Plan Loop Throughput** | ≥ 10 req/min | Scenario A dry run with mock provider |

---

## 11. CLI Reference

### 11.1 Installation

CLI is automatically available via deno tasks:
```bash
# Use via task runner
deno task cli <command>

# Or install globally
deno install --allow-all -n exoctl src/cli.ts

# Then use directly
exoctl <command>
```

### 11.2 Commands

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

### 11.3 Output Formatting

All CLI commands output human-readable text by default.
Add `--json` flag for machine-readable output:
```bash
deno task cli portal list --json
# {"portals": [{"alias": "MyApp", "path": "/home/user/Dev/MyApp", ...}]}

deno task cli log query --trace abc123 --json
# {"events": [{...}]}
```

### 11.4 Bootstrap (Reference Implementation)

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

## 12. Operational Procedures

### 12.1 Backup

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

### 12.2 Restore
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

### 12.3 Upgrade ExoFrame
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

### 12.4 Troubleshooting

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

### 12.5 Uninstall
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

### 12.6 Health Check
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
*End of Technical Specification v1.4*

