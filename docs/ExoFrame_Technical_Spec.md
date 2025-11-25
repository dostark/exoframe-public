# Project ExoFrame: Technical Specification & Architecture

- **Version:** 1.5.0
- **Release Date:** 2025-11-23
- **Status:** Engineering Specification
- **Reference:** [ExoFrame White Paper](./ExoFrame_White_Paper.md)
- **Philosophy:** Local-First, Type-Safe, Secure-by-Design

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

ExoFrame is a secure, daemon-based orchestration platform. It operates on the **"Files as API"** principle, utilizing a
watched folder structure to trigger typed workflows.

ExoFrame deliberately supports **three agent execution modes**:

1. **Local/Sovereign Agents** — run entirely on the user’s hardware (e.g., Ollama, deterministic scripts). They have
   unrestricted access to on-disk context within the allowed portals and do not require token-budget enforcement.
2. **Federated / Third-Party Agents** — call out to remote APIs (e.g., Claude, GPT). They inherit provider-specific
   token ceilings, rate limits, and privacy constraints that the engine enforces via the Context Loader and Capability
   pipeline.
3. **Hybrid Agents** — orchestrations that mix local + federated sub-agents inside a single trace. Hybrid mode must log
   every cross-boundary handoff and only share context slices that the blueprint explicitly authorizes.

**Security Upgrade:** Migrated from Bun/Node to **Deno**, leveraging its capability-based security model and codifying
permission governance across CLI, daemon, and agents.

---

## 2. Core Technical Stack

| Component        | Technology          | Justification                                                     |
| :--------------- | :------------------ | :---------------------------------------------------------------- |
| **Runtime**      | **Deno** (v2.0+)    | Native TypeScript, Web Standards, and **Permission System**.      |
| **Language**     | **TypeScript**      | No transpilation needed. Strict typing via Zod.                   |
| **Config**       | **TOML** & **YAML** | TOML for System Config; YAML for Blueprints.                      |
| **Journal**      | **SQLite**          | Accessible via `jsr:@db/sqlite` (WASM) or FFI for performance.    |
| **Dependencies** | **ES Modules**      | No `node_modules`. Dependencies cached globally or in vendor dir. |
| **Interface**    | **Obsidian**        | Viewer for Markdown files and Dashboard.                          |

---

## 3. Directory Structure

The File System is the Single Source of Truth. Every path shown above is provisioned by `scripts/scaffold.ts`; missing
folders are treated as fatal errors during daemon startup so that watchers do not run in partially-initialized states.

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
Note: the tree above describes the *deployed workspace* layout used at runtime. The *development repository* (the Git checkout developers work in) contains the same folders plus development-only artifacts such as `tests/`, `.github/`, `docs/`, and the full `src/` codebase. Do not treat your deployed workspace as a development checkout — deploy workspaces are intended for runtime and user data (Knowledge, System/journal.db) and are created from the development repo via the provided deploy script.
```

---

## 4. The Engine (Deno Orchestrator)

The Engine is a state machine running as a background daemon.

### 4.1. Security Primitives (The Deno Advantage)

Instead of building custom path validation logic (which is error-prone), we use Deno's startup flags to enforce
boundaries at the OS process level.

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

**Impact:** If a rogue agent tries to `fetch('evil.com')` or `Deno.readTextFile('/etc/passwd')`, the Deno runtime throws
a `PermissionDenied` error immediately. The agent code _cannot_ bypass this.

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

- **Implementation:** Uses `jsr:@db/sqlite`.
- **Concurrency:** Uses WAL mode to handle concurrent writes from the Daemon and Agents.

### Tier 2: The Content Store

- **Format:** Markdown.
- **Watcher:** `Deno.watchFs()` is used instead of `chokidar` (reducing dependencies).
  - _Debounce Strategy:_ The engine implements a 200ms debounce buffer to handle OS-level rapid-fire events.

---

## 6. Feature: The Portal System & Safety

### 6.1. Mechanism

1. **Mounting:** User runs `deno task mount <target> <alias>`.
2. **Linking:** Deno creates the symlink using `Deno.symlink`.
3. **Permissioning:** _Crucial Step_ — `exoctl portal add` patches `exo.config.toml`, regenerates `deno.json` permission
   lists, and runs `deno task config validate`. Only if validation succeeds do we restart the daemon (or hot-reload
   permissions on supported OSes). If any sub-step fails, the symlink is deleted and configuration rollback is performed
   automatically.
4. **Verification:** After restart, `exoctl portal list --json` is executed and compared with the expected allow-list;
   mismatches block agent access and surface an actionable error.

```bash
# exoctl portal add ~/Dev/MyProject MyProject
# 1. Creates symlink
# 2. Updates exo.config.toml to add path
# 3. Regenerates deno.json with new permissions
# 4. Restarts daemon automatically
```

### 6.2. Path Safety

- **Engine Level:** Deno prevents access outside the allowed list.
- **Logic Level:** Engine still checks `if (path.startsWith(portalRoot))` to prevent logical confusion between portals.

### 6.3. OS-Specific Notes

- **Windows:** Symlink creation requires Developer Mode or elevated PowerShell. When unavailable, `exoctl` falls back to
  NTFS junctions and records the deviation in Activity Journal.
- **macOS:** First-time portal creation triggers System Settings > Privacy prompt; instructions are logged to
  `/Knowledge/README.md`.
- **Linux:** Ensure `inotify` watch limits (`fs.inotify.max_user_watches`) include portal paths; setup script adjusts
  when possible.

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
2. **Permission Compilation:** At agent launch, requested capabilities are intersected with daemon-wide policy,
   producing concrete Deno flags (`--allow-read`, `--allow-run`, `--allow-net`) plus internal guards (tool registry
   filters, command allowlist).
3. **Runtime Guardrails:** Even when Deno permits an API, the Tool Registry double-checks that the caller’s capability
   bit is set before dispatching commands.
4. **Audit:** Granted permissions are recorded in the Activity Journal’s payload, and `exoctl log query --trace` shows
   what the agent actually received.
5. **Violation Handling:** Attempts to exceed declared capabilities raise a `CapabilityViolationError`, halt the agent,
   and trigger Mission Reporter warnings.

### 7.2 Local vs Federated vs Hybrid Agents

| Attribute           | Local/Sovereign                         | Third-Party / Federated                  | Hybrid                                      |
| ------------------- | --------------------------------------- | ---------------------------------------- | ------------------------------------------- |
| Execution           | Runs on user hardware (Ollama, scripts) | Calls remote API (Claude, GPT)           | Mixed chain of local + remote sub-agents    |
| Context Limits      | Unlimited (bounded by disk)             | Enforced via Context Loader token budget | Local hops unrestricted; remote hops capped |
| Network Permissions | Typically none                          | Requires explicit `--allow-net`          | Only remote segments get net perms; logged  |
| Privacy Guarantees  | Data never leaves machine               | Subject to provider ToS                  | Per-hop consent + redaction lists required  |
| Blueprint Hint      | `runtime_mode: local`                   | `runtime_mode: remote`                   | `runtime_mode: hybrid` + `handoff_policy`   |

When `runtime_mode` is `local`, the Context Loader bypasses token truncation and streams all resolved files (subject to
optional soft caps). When `runtime_mode` is `remote`, the loader enforces the model’s context window and emits
`[System Warning]` entries if truncation occurs. For `runtime_mode: hybrid`, the loader splits context into local vs
exportable segments based on `handoff_policy`, and every remote hop logs the exact files shared.

---

## 8. Security & Trust

### 8.1. Threat Model (v1.2 - Hardened)

- **Scope:** Personal Productivity.
- **Mitigation:**
  - **Runtime Sandbox:** Deno enforces file/net/env boundaries.
  - **Supply Chain:** No `node_modules`. Dependencies are imported via HTTPS URLs with integrity hashes (`lock.json`).
  - **Path Traversal:** Deno throws `PermissionDenied` if code attempts to read `../outside`.

### 8.2. Secret Management

- **Storage:** Secrets stored in OS Keyring (Keychain/DPAPI).
- **Access:** Deno accesses keyring via FFI plugin (e.g., `deno_keyring`) only when needed. Secrets are never printed to
  stdout/logs.
- **Verification:** Each threat in Section 8 maps to a regression test listed in the Implementation Plan’s Phase 7 risk
  matrix; CI fails if any mitigation test regresses.

---

## 9. Concurrency & Locking

### 9.1. The Lease Protocol

- **Heartbeat:** Agents run a `setInterval` loop updating the SQLite `leases` table every 30s.
- **Failure:** If the Deno process crashes, the lease expires in 60s.

### 9.2. Conflict Resolution

- **Git:** Agents utilize Feature Branches.
- **User:** User merges branches manually via Git CLI or VS Code.

---

## 10. Performance KPIs

Targets based on Reference Hardware (**Mac Mini M4 / Linux x64**). Benchmarks are planned but not yet published.

| Metric                   | Target       | Notes                                                            |
| ------------------------ | ------------ | ---------------------------------------------------------------- |
| **Cold Start**           | < 80 ms      | Measured via `deno bench cold_start_bench.ts` once harness lands |
| **Watcher Latency**      | < 100 ms     | Slow-write scenario to be profiled in CI                         |
| **Memory Footprint**     | < 150 MB     | Idle daemon including Activity Journal cache                     |
| **Plan Loop Throughput** | ≥ 10 req/min | Scenario A dry run with mock provider                            |


---

## 11. Future: External Agent Interoperability

### 11.1. Agent2Agent (A2A) Protocol

**What is Agent2Agent?**
Google's Agent2Agent (A2A) is an open standard protocol (now under Linux Foundation) for inter-agent communication. It enables agents from different vendors and frameworks to discover, communicate, and coordinate tasks using JSON-RPC 2.0 over HTTP(S).

**Key Features:**
- **Agent Discovery**: Standardized Agent Cards at `/.well-known/agent.json`
- **Task Lifecycle**: Structured task states (submitted, working, completed)
- **Communication**: JSON-RPC 2.0 over HTTP(S) with Server-Sent Events (SSE) for streaming
- **Platform-Agnostic**: Works across frameworks and vendors
- **Complementary to MCP**: While MCP handles tool/context sharing, A2A handles agent-to-agent coordination

### 11.2. Why ExoFrame Doesn't Use A2A Currently

**Design Philosophy Mismatch:**

ExoFrame's core architecture is **file-based and local-first**:
- Agents communicate via markdown files in watched directories
- No network infrastructure required for local agents
- Security through Deno's capability system and filesystem boundaries
- All coordination happens via file movements

A2A is **network-based and distributed**:
- Requires HTTP servers and exposed endpoints
- Necessitates network permissions and authentication
- Designed for cross-platform, cross-network agent meshes

**Current Coverage:**

ExoFrame already supports multi-agent scenarios through its file-based protocol:
- **Local Agents**: Coordinate via shared filesystem (no network)
- **Federated Agents**: Call out to third-party APIs when needed
- **Hybrid Agents**: Mix local and remote execution with logged handoffs

### 11.3. Future Bridge Architecture (If Needed)

If ExoFrame needs to interoperate with external agent systems, we can implement an **A2A Adapter Layer** without changing the core architecture:

```typescript
// src/adapters/a2a_adapter.ts

/**
 * Bridges ExoFrame's file-based protocol to Agent2Agent HTTP protocol
 * Enables external agents to invoke ExoFrame agents via A2A
 */
class A2AAdapter {
  constructor(
    private exoRoot: string,
    private port: number = 8080
  ) {}

  /**
   * Start HTTP server exposing A2A endpoints
   * Permissions: Requires --allow-net=0.0.0.0:8080
   */
  async start(): Promise<void> {
    // Serve Agent Card at /.well-known/agent.json
    // Handle POST /tasks for task submission
    // Poll /Inbox/Plans for responses
  }

  /**
   * Translate A2A task to ExoFrame request file
   */
  private async ingestA2ATask(task: A2ATask): Promise<string> {
    const requestPath = `${this.exoRoot}/Inbox/Requests/${task.id}.md`;
    const markdown = this.toExoFrameMarkdown(task);
    await Deno.writeTextFile(requestPath, markdown);
    return task.id;
  }

  /**
   * Monitor for plan file and translate back to A2A response
   */
  private async pollForPlan(taskId: string): Promise<A2AResponse> {
    const planPath = `${this.exoRoot}/Inbox/Plans/${taskId}_plan.md`;
    const watcher = Deno.watchFs(planPath);
    // Wait for file creation, parse, return A2A response
  }
}
```

**Integration Points:**

1. **Inbound (External → ExoFrame)**:
   - External agent calls A2A endpoint
   - Adapter creates request file in `/Inbox/Requests`
   - ExoFrame agent processes normally
   - Adapter watches `/Inbox/Plans`, translates to A2A response

2. **Outbound (ExoFrame → External)**:
   - ExoFrame agent specifies A2A-compatible remote in blueprint
   - Adapter translates request file to A2A task
   - Posts to external agent's A2A endpoint
   - Receives response, creates plan file

**Security Considerations:**

- A2A adapter runs as **separate Deno process** with `--allow-net` permission
- Core ExoFrame daemon remains network-isolated for local agents
- Adapter uses Unix socket or named pipe to communicate with main daemon
- All A2A traffic logged to Activity Journal with external agent metadata

**Deployment Model:**

```bash
# Core daemon (no network)
deno run --allow-read=./ExoFrame --allow-write=./ExoFrame src/main.ts

# Optional A2A adapter (when external integration needed)
deno run --allow-read=./ExoFrame --allow-write=./ExoFrame \
  --allow-net=0.0.0.0:8080 src/adapters/a2a_adapter.ts
```

### 11.4. Decision Criteria for A2A Integration

Implement A2A bridge only if one or more of these requirements emerge:

1. **External System Integration**: Need to invoke agents in other frameworks (LangChain, AutoGen, etc.)
2. **Multi-Instance Coordination**: Multiple ExoFrame deployments need to collaborate across machines
3. **Agent Marketplace**: ExoFrame agents need to be discoverable/invokable by third-party systems
4. **Enterprise Requirements**: Organization requires standardized agent protocols

**Current Recommendation**: Defer A2A implementation. File-based protocol is simpler, more secure, and sufficient for current use cases.

---

_End of Technical Specification_

