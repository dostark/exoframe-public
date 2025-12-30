# ExoFrame: Auditable Agent Orchestration Platform

[![Deno](https://img.shields.io/badge/runtime-Deno-green.svg)](https://deno.land/)
[![SQLite](https://img.shields.io/badge/storage-SQLite-blue.svg)](https://www.sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**ExoFrame** is a secure, auditable agent orchestration platform designed for developers who need more than just real-time coding assistance. It operates as a background daemon, managing complex, multi-project workflows with explicit human approval gates and a permanent audit trail.

---

## �️ Core Strengths for AI Agent Orchestration

ExoFrame is built from the ground up to be the "Mission Control" for AI agents, focusing on reliability, security, and transparency.

- **Permanent Audit Trail (Activity Journal)**: Every agent thought, tool call, and file modification is logged to a persistent SQLite database. Trace IDs link requests → plans → code changes → commits, providing a complete "black box" recorder for your AI workflows.
- **Security-First Sandboxing**: Leverages Deno's granular permission system to sandbox agent operations. Agents are restricted at the OS level from unauthorized network or filesystem access—security that prompt-engineering alone cannot provide.
- **Human-in-the-Loop Governance**: Agents generate structured **Plans** that must be reviewed and approved by a human before execution. No "oops" moments; you are always the final authority.
- **Multi-Project Context (Portals)**: Securely link multiple external repositories into a single agent context. Agents can reason across your entire stack (e.g., API, Frontend, and Docs) simultaneously.
- **Data Sovereignty & Local-First**: 100% local-first option with Ollama. Your code never leaves your machine unless you explicitly configure cloud APIs. Ideal for air-gapped or high-security environments.
- **Files-as-API Interoperability**: Interact with the system via CLI or by dropping Markdown files into folders. This "invisible" interface makes ExoFrame easy to integrate into any existing developer toolchain.

---

## When to Use ExoFrame

While IDE-integrated agents (Cursor, Copilot, Windsurf) excel at real-time pair programming, ExoFrame is an **auditable agent orchestration platform** for asynchronous, high-trust, and multi-project workflows.

| Scenario | Tool |
| :--- | :--- |
| Quick code fix while coding | Use IDE agent (Copilot/Cursor) |
| Interactive feature development | Use IDE agent |
| **Overnight batch processing** | **ExoFrame** |
| **Audit/compliance requirements** | **ExoFrame** |
| **Multi-project refactoring** | **ExoFrame** |
| **Air-gapped environments** | **ExoFrame** |

ExoFrame is not competing with IDE agents for real-time assistance. It provides a robust, sandboxed environment for agents to work autonomously on complex tasks while you maintain full control through explicit approval gates.

---

## ✨ Key Features

- **Activity Journal**: A permanent SQLite-backed audit trail of every thought, tool call, and file modification.
- **Human-in-the-Loop**: Agents generate **Plans** that you review and approve before a single line of code is changed.
- **Portals**: Securely link multiple external repositories into a single agent context.
- **Deno-Powered Security**: Leverages Deno's granular permission system to sandbox agent operations (no unauthorized network or filesystem access).
- **Files-as-API**: Interact with the system by dropping Markdown files into folders or using the `exoctl` CLI.
- **Obsidian Integration (Optional)**: The `Knowledge/` directory can be used as an Obsidian vault with live dashboards for users who want knowledge management and historical auditability. Obsidian is not required for ExoFrame operation; the TUI dashboard and CLI are the primary interfaces.

---

## 🛠️ Quick Start

### 1. Installation

ExoFrame requires [Deno](https://deno.land/). Once installed, deploy a workspace:

```bash
# Clone the repository
git clone https://github.com/dostark/exoframe.git
cd exoframe

# Deploy a workspace to your home directory
./scripts/deploy_workspace.sh ~/ExoFrame
```

### 2. Start the Daemon

```bash
cd ~/ExoFrame
deno task start
```

### 3. Submit a Request

Use the CLI to tell ExoFrame what to do:

```bash
exoctl request "Implement a new user authentication module in the MyProject portal" --priority high
```

### 4. Review and Approve

1. **Review the Plan**: `exoctl plan show <plan-id>`
2. **Approve**: `exoctl plan approve <plan-id>`
3. **Review Changes**: Once the agent finishes, review the diff with `exoctl changeset show <request-id>`
4. **Merge**: `exoctl changeset approve <request-id>`

---

## 🏗️ Architecture

ExoFrame is built on a "Files-as-API" philosophy:

- **`Inbox/`**: Where new **Requests** and AI-generated **Plans** live.
- **`Portals/`**: Symlinks to your actual project repositories.
- **`Knowledge/`**: A directory containing project context, agent reports, and the **Activity Journal** dashboard. It is compatible with Obsidian for users who want an optional knowledge management UI, but Obsidian is not required.
- **`System/`**: Internal state, SQLite database, and active task tracking.

---

## 🔒 Security

ExoFrame takes security seriously. Unlike other agent frameworks that run with full user privileges, ExoFrame:
- Uses **Deno's sandbox** to restrict agents to specific directories and domains.
- Requires **explicit approval** for all code changes.
- Maintains a **tamper-evident log** in the Activity Journal.

---

## 📖 Documentation

- [White Paper](./docs/ExoFrame_White_Paper.md) - Vision and Strategy
- [Technical Spec](./docs/ExoFrame_Technical_Spec.md) - Architecture and Schemas
- [User Guide](./docs/ExoFrame_User_Guide.md) - Detailed Usage and Setup
- [Building with AI Agents](./docs/Building_with_AI_Agents.md) - Our TDD-first development philosophy

---

## Contributing & Testing ✅

Please follow our test patterns when contributing tests or refactoring existing ones:

- Use the centralized DB helper `initTestDbService()` (in `tests/helpers/db.ts`) to create an in-memory SQLite DB, initialize required tables, and obtain a `cleanup()` helper for deterministic teardown.
- For CLI tests, prefer `createCliTestContext()` (in `tests/cli/helpers/test_setup.ts`) which wraps `initTestDbService()` and optionally pre-creates common directories (e.g., `Inbox/Requests`, `System/Active`). This reduces boilerplate and avoids leaking temp directories.

Quick example (recommended):

```typescript
import { createCliTestContext } from "tests/cli/helpers/test_setup.ts";
let db, tempDir, config, cleanup;
beforeEach(async () => ({ db, tempDir, config, cleanup } = await createCliTestContext({ createDirs: ["Inbox/Requests"] }));
afterEach(async () => await cleanup());
```

For more details and examples, see `agents/tests/testing.md` under **CLI Test Context — Recommended Pattern**.

---

## 📄 License

MIT © [dostark](https://github.com/dostark)
