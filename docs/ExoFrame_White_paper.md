# ExoFrame: Auditable Agent Orchestration Platform

### White Paper - Developer Tool Edition

- **Date:** November 27, 2025
- **Version:** 1.6.0
- **Status:** Development Specification
- **Target Audience:** Solo Developers, Technical Power Users, System Architects

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

## 1. Executive Summary

Modern AI-enabled IDEs (Cursor, Copilot, Windsurf) excel at **interactive, real-time coding assistance**. ExoFrame does not compete with them for that use case.

**ExoFrame is an Auditable Agent Orchestration Platform** — designed for scenarios where you need:

1. **Audit Trail & Traceability:** Every agent action is logged with trace IDs linking requests → plans → code changes → commits. Essential for compliance, team accountability, and understanding "why did this change happen?"

2. **Asynchronous Workflows:** Drop a request, go to lunch, come back to a reviewed plan. Unlike chat-based agents that require constant supervision, ExoFrame operates as a background daemon.

3. **Explicit Human Approval Gates:** Plans must be approved before execution. Code changes must be approved before merging. No "oops, the agent deleted my files" moments.

4. **Multi-Project Context:** Portals link multiple codebases simultaneously. Agents can reference your API server while modifying your frontend — something single-workspace IDEs struggle with.

5. **Data Sovereignty:** 100% local-first option with Ollama. Your code never leaves your machine unless you explicitly configure cloud APIs.

**When to Use ExoFrame vs IDE Agents:**

| Scenario                        | Recommendation |
| ------------------------------- | -------------- |
| Quick code fix while coding     | Use IDE agent  |
| Interactive feature development | Use IDE agent  |
| Overnight batch processing      | **ExoFrame**   |
| Compliance/audit requirements   | **ExoFrame**   |
| Multi-project refactoring       | **ExoFrame**   |
| Air-gapped environments         | **ExoFrame**   |

**The Core Architecture:**

- **Daemon-based:** Watches `/Inbox/Requests` for new tasks
- **File-driven:** "Files as API" — drop markdown, get results
- **Secure:** Deno's permission system sandboxes all agent operations
- **Traceable:** SQLite Activity Journal records everything

---

## 2. Market Position & Differentiation

### What ExoFrame Is NOT

ExoFrame is **not** a replacement for IDE-integrated AI assistants. Tools like GitHub Copilot, Cursor, and Windsurf provide excellent real-time, interactive coding assistance. If you need help writing code _right now_, use those tools.

### What ExoFrame IS

ExoFrame is an **agent orchestration layer** that provides:

| Capability                  | IDE Agents            | ExoFrame                 |
| --------------------------- | --------------------- | ------------------------ |
| Real-time code completion   | ✅ Excellent          | ❌ Not a focus           |
| Interactive chat            | ✅ Native             | ❌ File-based            |
| Audit trail                 | ❌ None               | ✅ Full trace_id linking |
| Async background processing | ❌ Requires attention | ✅ Daemon-based          |
| Multi-project context       | ⚠️ Single workspace   | ✅ Portal system         |
| Human approval gates        | ⚠️ Implicit           | ✅ Explicit workflow     |
| Local-only operation        | ⚠️ Cloud default      | ✅ Ollama support        |
| Compliance/audit ready      | ❌ No logging         | ✅ Activity Journal      |

### The "Background Agent" Workflow

```
Morning: Drop request → "Implement user authentication for the API"
         ↓
Daemon:  Generates plan, waits for approval
         ↓
Review:  exoctl plan show auth-impl → looks good
         ↓
Approve: exoctl plan approve auth-impl
         ↓
Execute: Agent creates branch, writes code, commits with trace_id
         ↓
Evening: exoctl changeset show auth-impl → review diff
         ↓
Merge:   exoctl changeset approve auth-impl → done
```

This workflow is **impossible** with current IDE agents, which require continuous human attention.

---

## 3. Architectural Philosophy & Decisions

Our technical choices are driven by three non-negotiable principles: **Security, Simplicity, and Portability.**

### 3.1. Runtime: Deno (The Secure Foundation)

- **Choice:** **Deno**.
- **Justification:**
  - **Secure by Default:** Unlike Node.js or Bun, Deno requires explicit permissions (`--allow-read`, `--allow-net`) to
    access the system.
  - **Zero Configuration:** TypeScript is supported natively. No build steps, no `package.json` configuration hell.
  - **Clean Filesystem:** Deno caches dependencies globally, eliminating the massive `node_modules` folder that clutters
    file-based workflows.

### 3.2. Storage: Tiered & Separated

We reject the monolithic database approach in favor of a separation of concerns:

1. **Activity Journal:** **SQLite (WAL Mode)**.
   - _Purpose:_ A persistent log of all agent thoughts, actions, and outcomes.
   - _Scaling:_ Default retention of 90 days (hot).
2. **User Content:** **The File System**.
   - _Usage:_ Notes, Source Code.
   - _Integrity:_ The file system is the source of truth. "Files as API" relies on strict YAML Frontmatter
     (Zod-validated).

### 3.3. Configuration: "Everything-as-Code" (EaC)

- **The Standard:** Agents and workflows are defined in **YAML** blueprints.
- **Validation:** Blueprints support a "Dry Run" mode where agent logic is simulated deterministically.

### 3.4. Triple Agent Modes (Local, Federated, Hybrid)

ExoFrame treats agent runtimes as first-class configuration:

1. **Local/Sovereign Agents** — execute entirely on your workstation (Ollama, scripted coders). They consume context
   directly from disk, so no artificial token ceiling is applied.
2. **Third-Party/Federated Agents** — delegate to remote APIs (Claude, GPT). These inherit provider-specific token and
   privacy limits; the Context Loader enforces truncation budgets and injects warnings when context must be reduced.
3. **Hybrid Agents** — orchestrations where a local agent handles sensitive work and selectively calls a federated
   helper. Each handoff declares what context may leave the machine, and the Activity Journal records the transfer for
   audit.

Blueprint authors declare the mode via `runtime_mode` (`local`, `remote`, `hybrid`) plus optional `handoff_policy`,
letting the engine automatically decide when to enforce token budgets versus streaming full context.

---

## 4. Technical Architecture Overview

The system operates as a secure daemon on the host machine.

### Layer 1: The "Portal" File System

ExoFrame "mounts", i.e. creates portals to existing folders (Git repos) via **Symbolic Links**.

- **Security:** Deno's permission system is configured to _only_ allow read/write access to the `/ExoFrame` directory
  and specific created Portals. Even if an agent is hijacked, the runtime prevents it from accessing your personal
  documents or system keys.
- **OS Notes:** Windows users must enable Developer Mode or run elevated to create symlinks; otherwise ExoFrame
  automatically creates NTFS junctions and logs the deviation. macOS prompts for Full Disk Access on first run;
  instructions are embedded in `/Knowledge/README.md`.

### Layer 2: The Engine (The Orchestrator)

A state machine that watches input channels and dispatches tasks.

- **Input Channel:** The `/Inbox` folder serves as the event bus.
- **Runtime Adapter:** Abstracts OS operations to ensure compatibility across Linux, Mac, and Windows.

### Layer 3: The "Flight Recorder" (Activity Journal)

- **Event Stream:** Every thought, tool call, and file write is serialized.
- **Traceability:** Commits made by Agents include a `Trace-ID` footer (`Exo-Trace: <uuid>`) linking code changes to the
  structured log.

---

## 5. Security & Threat Model

### 5.1 What Deno Provides

Deno's permission system enforces **boundaries at the OS level:**

```bash
deno run \
  --allow-read="/ExoFrame,/home/user/Dev" \
  --allow-write="/ExoFrame,/home/user/Dev" \
  --allow-net="api.anthropic.com" \
  src/main.ts
```

**If agent code attempts:**

- `Deno.readFile("/etc/passwd")` → PermissionDenied
- `fetch("https://evil.com")` → PermissionDenied
- `Deno.readFile("../../.ssh/id_rsa")` → PermissionDenied (path canonicalization)

This **reduces attack surface** significantly vs Node.js/Bun where any dependency can access anything.

### 5.2 What Deno Does NOT Provide

**Deno cannot prevent:**

1. **Logic Bugs:** Agent with `--allow-write=/Dev/MyApp` can delete your entire app
2. **Bad Decisions:** Agent might refactor working code into broken code
3. **Resource Abuse:** Agent can consume 100% CPU in infinite loop
4. **Social Engineering:** Malicious blueprint could trick you into approving destructive plans

**Bottom Line:** Deno reduces **accidental** and **dependency-driven** attacks. It does not replace:

- Human review of plans before approval
- Git-based rollback mechanisms
- Regular backups
- Trust in blueprint authors

### 5.3 Threat Model

| Threat                    | Likelihood | Deno Mitigation                      | Operational Control                                         | Linked Test                                     |
| ------------------------- | ---------- | ------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------- |
| **Buggy Agent**           | High       | None                                 | Git feature branches + Mission Reporter (Tech Spec §9)      | `tests/integration/happy_path_test.ts`          |
| **Malicious Dependency**  | Medium     | ✅ Permission system                 | Supply-chain review checklist (Implementation Plan Phase 7) | `tests/security/permission_test.ts`             |
| **Hijacked API Keys**     | Low        | ✅ OS-level network restrictions     | Keyring storage + `exoctl doctor` credential audit          | `tests/security/secret_scope_test.ts`           |
| **Path Traversal Attack** | Low        | ✅ Path canonicalization             | Portal allow-lists + Config validation (Tech Spec §6)       | `tests/security_test.ts`                        |
| **Malicious Blueprint**   | Low        | ⚠️ Partial (can't escape filesystem) | Capability enforcement pipeline (Tech Spec §7.1)            | `tests/blueprints/capability_violation_test.ts` |
| **Root-Level Attacker**   | Very Low   | ❌ None                              | User must maintain OS patching/EDR                          | n/a                                             |

### 5.4 Best Practices

1. **Review blueprints before first use** (they're just YAML - easy to audit)
2. **Keep portals scoped** (don't mount `/` or `~`)
3. **Use API key restrictions** (OpenAI: limit scope, rate limits)
4. **Regular backups** (stop daemon, tar ExoFrame directory)
5. **Monitor activity journal** (`deno task cli log tail`)
6. **Use read-only portals** for sensitive code (future feature)
7. **Trust but verify:** For every threat listed in §5.3, the Implementation Plan Phase 7 defines an automated
   regression test; CI must stay green before shipping.

---

## 6. Concurrency & Conflict Resolution

### 6.1. Lease Protocol (Optimistic Locking)

- **Intent:** Before writing, an Agent registers a **Lease** (Target File + TTL) in the DB.
- **Heartbeat:** Agents must renew leases every 30 seconds during long operations.

### 6.2. Git Atomicity

- **Code:** Resolved via **Git Branches**. Agents work on feature branches; conflicts are resolved via standard Merge
  Request flows.

---

## 7. Target Platforms & Performance

ExoFrame is optimized for modern developer workstations (**~€1000** budget).

### 7.1 Platform Support Priorities

1. **x64 Linux Workstation** (Ubuntu/Debian) - **Primary Target**.
   - _Config:_ Deno runs natively. Best performance for filesystem events.
2. **Mac System** (Apple Silicon) - **Secondary Target**.
   - _Config:_ Deno optimizes for ARM64.
3. **x64 Windows with WSL2** - **Tertiary Target**.

### 7.2 Performance Goals

Targets are defined for the reference hardware (**Mac Mini M4, 24 GB RAM**) and mirrored Linux workstation. Benchmark
automation is in progress; results will be published once the CI harness lands.

| Metric               | Goal         | Measurement Plan                                 |
| -------------------- | ------------ | ------------------------------------------------ |
| **Cold Start**       | < 80 ms      | `deno bench cold_start_bench.ts`                 |
| **Watcher Latency**  | < 100 ms     | `deno bench watcher_bench.ts` (10 MB slow write) |
| **Memory Footprint** | < 150 MB     | Idle daemon telemetry                            |
| **Plan Throughput**  | ≥ 10 req/min | Scenario A dry run with Mock LLM                 |

---

## 8. Conclusion

ExoFrame rejects the compromise between automation and sovereignty.

By anchoring intelligence in the **Local File System**, utilizing **Transparent Code Blueprints**, and enforcing
**Runtime Security**, ExoFrame offers a third path:

1. **Sovereignty** over data and models.
2. **Interoperability** with existing tools.
3. **Security** via engine-level sandboxing.

It transforms the computer from a passive storage device into an active, cognitive partner. **ExoFrame is the
infrastructure for the next decade of sovereign intellectual work.**

---

## Appendix A: Benchmarks

**Purpose:** To ensure claims of "Speed" are reproducible.

- **Methodology:**
  - **Cold Start:** `deno bench cold_start_bench.ts`
  - **Watcher Latency:** `deno bench watcher_bench.ts` with 10 MB incremental writes
  - **Plan Throughput:** Scenario A dry run with Mock LLM
  - **CI:** GitHub Actions pipeline runs these on every commit; results exported to `Knowledge/Reports/benchmarks.md`.

**Planned Reporting:** Once automation is live, benchmark summaries will be exported to
`Knowledge/Reports/benchmarks.md` with per-commit trends.

---

_End of White Paper_
