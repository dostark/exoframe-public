# Bootstrap: Developer Workspace Setup

Provide step-by-step instructions to bootstrap a local development workspace for ExoFrame. Two platforms are supported
in this plan: **Ubuntu (pure)** and **Windows with WSL2**. The goal is a reproducible, minimal environment that allows
contributors to run the daemon, tests and benchmarks locally.

### Goals

- Install required tools (Git, Deno, SQLite; VS Code is optional)
- Create a local repository and initial configuration
- Initialize the Activity Journal and Memory Banks
- Run the daemon in development mode and execute the test suite

### 0. Preflight (common)

- Ensure you have at least 8GB RAM and 20GB free disk space.
- Create a user account for development with normal privileges.
- Recommended editor: VS Code (recommended).

### 1. Ubuntu (tested baseline)

1. Update packages and install dependencies

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget build-essential libsecret-1-dev sqlite3
```

2. Install Deno (recommended installer)

```bash
curl -fsSL https://deno.land/install.sh | sh
export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"
deno --version
```

3. Install Ollama (for local LLM inference)

Ollama enables 100% local AI inference without cloud API dependencies. Install using the official installer:

```bash
curl -fsSL https://ollama.com/install.sh | sh

# Verify installation
ollama --version

# Start the Ollama service (if not auto-started)
ollama serve &
```

**Choosing the Right Model (Hardware Guidelines):**

| System Resources                | Recommended Model                        | Command                     | Notes                                      |
| ------------------------------- | ---------------------------------------- | --------------------------- | ------------------------------------------ |
| **16GB+ RAM, GPU (8GB+ VRAM)**  | `codellama:13b`                          | `ollama pull codellama:13b` | Best code quality, requires good GPU       |
| **16GB RAM, CPU-only**          | `llama3.2:3b` or `codellama:7b-instruct` | `ollama pull llama3.2:3b`   | Good balance of speed and quality          |
| **8GB RAM, CPU-only**           | `llama3.2:1b` or `tinyllama`             | `ollama pull llama3.2:1b`   | Fast but limited reasoning                 |
| **32GB+ RAM, GPU (16GB+ VRAM)** | `codellama:34b`                          | `ollama pull codellama:34b` | Premium quality, slow without high-end GPU |

**Quick Start (recommended for most developers):**

```bash
# Pull the default model (llama3.2 - good for most systems)
ollama pull llama3.2

# For code-focused tasks, also pull codellama
ollama pull codellama:7b-instruct

# Test the model works
ollama run llama3.2 "Hello, world!"
```

**WSL2-Specific Notes:**

- GPU passthrough requires WSL2 with CUDA support (NVIDIA drivers on Windows host)
- Without GPU, stick to smaller models (3b or 7b parameter variants)
- Ollama uses ~2-4GB base memory plus model size

4. Install VS Code (optional)

```bash
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.gpg
sudo install -o root -g root -m 644 microsoft.gpg /etc/apt/trusted.gpg.d/
sudo sh -c 'echo "deb [arch=amd64] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list'
sudo apt update
sudo apt install -y code
rm microsoft.gpg
```

5. Clone repo and bootstrap

```bash
# Clone into ~/ExoFrame (recommended)
git clone https://github.com/<org>/<repo>.git ~/ExoFrame
cd ~/ExoFrame

# Install dependencies (Deno caches on first run)
deno task cache

# Scaffold runtime directories and configuration
# This creates Workspace, Memory, .exo, Portals and copies exo.config.toml
./scripts/scaffold.sh .

# Initialize the database
deno task setup

# Edit configuration if needed
nano exo.config.toml

# Initialize git branch for work
git checkout -b feat/setup-workspace

# Run tests (use allow flags appropriate for tests)
deno test --allow-read --allow-write --allow-run

# Start daemon in dev mode
deno run --watch --allow-read --allow-write --allow-run src/main.ts
```

```bash
# Verify the Activity Journal (SQLite) was initialized correctly
deno test --allow-read --allow-write --allow-run tests/setup_db_test.ts
```

7. Test the Memory Banks system

```bash
# Test Memory Banks services
deno test --allow-all tests/services/memory_bank_test.ts

# Test the complete system end-to-end
deno test --allow-all tests/
```

8. Development workflow verification

**Test complete system:**

```bash
# Run all tests
deno test --allow-all

# Start the daemon
deno task start

# In another terminal, test CLI
exoctl daemon status
exoctl memory projects
```

- ☑ Auto pair markdown syntax

**Platform-Specific Notes:**

| Platform        | Configuration                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Linux**       | Increase inotify watchers for large projects: `echo fs.inotify.max_user_watches=524288 \| sudo tee -a /etc/sysctl.conf && sudo sysctl -p` |
| **macOS**       | FSEvents works well, no special configuration needed                                                                                      |
| **Windows/WSL** | WSL filesystem watching works out of the box                                                                                              |

### 2. Windows + WSL2 (Ubuntu inside WSL)

Prerequisite on Windows host:

- Enable WSL2 and install a Linux distro (Ubuntu) from Microsoft Store. See Microsoft docs if WSL not enabled.
- Optional: Install Windows Terminal for a better shell experience.

1. Open WSL2 shell (Ubuntu) and follow the same Ubuntu steps above.

Notes specific to WSL2:

- Ensure Git on Windows and Git inside WSL are consistent. Use the WSL-side git for repository work inside `~/ExoFrame`.

2. Symlink behavior

- WSL supports Unix symlinks inside the distro. When creating Portals that point to Windows paths, prefer using
  WSL-mounted paths or ensure permissions allow access.

3. Windows-side utilities (optional convenience)

- If you expect to run UI workflows from Windows, install the Windows Git client and ensure `core.autocrlf` matches your
  team policy.

### 3. Post-bootstrap checks (both platforms)

- Verify Deno version: `deno --version` (should match project `deno.json` expectations)
- Verify git config: `git config --list` (ensure `user.name` and `user.email` set)
- Verify DB exists: `ls -la .exo/*.db` or run `sqlite3 .exo/exo.db 'SELECT count(*) FROM activity;'`
- Run smoke test: `deno test --allow-read --allow-write` and confirm core tests pass.
- Create a test portal and verify watcher triggers:

```bash
exoctl portal add ~/Dev/MyProject MyProject
echo "# Test Request" > ~/ExoFrame/Workspace/Requests/test.md

# Observe daemon logs in real time
exoctl daemon logs --follow
```

### 4. File Format Standards (Developer Reference)

ExoFrame uses a **hybrid format strategy**:

| File Type                | Format   | Reason                                             |
| ------------------------ | -------- | -------------------------------------------------- |
| System config            | TOML     | Token-efficient for LLM context                    |
| Agent blueprints         | TOML     | Complex nested structures                          |
| **Markdown frontmatter** | **YAML** | **Memory Banks compatibility and search indexing** |
| Deno config              | JSON     | Runtime requirement                                |

#### YAML Frontmatter (Requests, Plans, Reports)

All markdown files with metadata use **YAML frontmatter** (`---` delimiters):

```markdown
---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
created: 2025-11-28T10:30:00.000Z
status: pending
priority: normal
agent: default
source: cli
created_by: user@example.com
---

# Request Body
```

**Why YAML for frontmatter?**

- **Memory Banks indexing** parses YAML frontmatter for structured search
- **Standard CLI tools** can extract metadata from YAML frontmatter efficiently
- **Industry standard** for markdown frontmatter across many tools and platforms

#### Test Fixture Format

When writing tests, use YAML frontmatter in test fixtures:

```typescript
// tests/cli/request_commands_test.ts

// ✅ CORRECT - YAML frontmatter
const testContent = `---
trace_id: "test-uuid-1234"
status: pending
priority: normal
agent: default
---

# Test Request`;

// ❌ WRONG - TOML frontmatter
const badContent = `+++
trace_id = "test-uuid-1234"
status = "pending"
+++`;
```

#### Parser Methods

The `BaseCommand` class provides frontmatter utilities:

```typescript
// src/cli/base.ts

// Extract YAML frontmatter from markdown
protected extractFrontmatter(content: string): Record<string, string>

// Serialize object to YAML frontmatter
protected serializeFrontmatter(frontmatter: Record<string, string>): string

// Update frontmatter while preserving body
protected updateFrontmatter(content: string, updates: Record<string, string>): string
```

**Frontmatter Regex Pattern:**

```typescript
// Match YAML frontmatter (--- delimiters)
const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);

// NOT TOML (+++ delimiters) - deprecated
// const tomlMatch = content.match(/^\+\+\+\n([\s\S]*?)\n\+\+\+/);
```

### 5. Automation & recommended improvements

- Provide automated installer scripts for each platform: `scripts/bootstrap_ubuntu.sh` and `scripts/bootstrap_wsl.sh` to
  replicate these steps.
- Consider a declarative setup using Ansible (Ubuntu) and Winget/PowerShell (Windows) for reproducible developer
  environments.

#### Embeddings build & tests 🔧

We provide scripts and tests to build optional precomputed embeddings used for retrieval-augmented generation (RAG):

- Script: `scripts/build_agents_embeddings.ts` supports three modes:
  - `--mode mock` (default): deterministic mock embeddings (SHA-256 derived) — no external API or cost
  - `--mode openai`: use OpenAI Embeddings API (requires `OPENAI_API_KEY`)
  - `--mode precomputed --dir <path>`: copy validated precomputed embedding files from `<path>` into `.copilot/embeddings/`

Each embedding file should be JSON with the minimal schema:

```json
{ "path": ".copilot/docs/documentation.md", "title": "Documentation quickstart", "vecs": [{ "text": "chunk text...", "vector": [0.1, 0.2, ...] } ] }
```

Run the embedding build script (mock):

```bash
# Mock mode (fast, free)
den o run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock
```

Run the precomputed copy mode:

```bash
deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode precomputed --dir /path/to/precomputed
# or set env var:
PRECOMPUTED_EMB_DIR=/path/to/precomputed deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode precomputed
```

Tests for the embedding builder live under `scripts/` and can be run directly with Deno:

```bash
deno test --allow-read --allow-write --allow-run scripts/build_agents_embeddings_test.ts scripts/build_agents_embeddings_precomputed_test.ts
```

The tests validate manifest generation, file copying, and basic shape of the embedding files.

### 5. Agent Context & Documentation

ExoFrame includes a dedicated `.copilot/` directory containing machine-friendly documentation, provider adaptation notes (OpenAI, Claude, Google), and canonical prompt templates. This directory is designed to be consumed by both VS Code Copilot (dev-time) and the ExoFrame runtime system.

**Usage with VS Code / Copilot:**
When asking Copilot to perform repository tasks, it is highly recommended to instruct it to consult `.copilot/manifest.json`. The recommended canonical prompt is:

> "You are a dev-time agent. Before performing repository-specific changes, consult `.copilot/manifest.json` and include matching `short_summary` items for relevant docs in `.copilot/`."

**Key components:**

- `.copilot/manifest.json`: An index of all available agent docs, topics, and chunk references.
- `.copilot/providers/`: Specific guidance for different LLM providers (token limits, prompt structures).
- `.copilot/`: Quick-start context for IDE agents.

**Maintenance:**
If you add or update documentation in `.copilot/`, you must regenerate the manifest and chunks to keep the index fresh:

```bash
# Regenerate manifest and chunks
deno run --allow-read --allow-write scripts/build_agents_index.ts
```

This ensures downstream tools and agents always have access to the latest documentation.

### 6. Security & permission notes

- On Ubuntu, ensure `libsecret` is installed for keyring support: `sudo apt install -y libsecret-1-0 libsecret-1-dev`.
- On WSL, GUI keyrings are not available by default; prefer environment-based secrets or Windows credential manager with
  secure bridging.
- Keep API keys out of the repository; use `exoctl secret set <name>` to store them in the OS keyring.

### 6. Next steps (automation)

- Create `scripts/bootstrap_ubuntu.sh` and `scripts/bootstrap_wsl.sh` in repo and add basic CI verification that the
  scripts run in a clean container.

**Clarification — Development repo vs Deployed workspace**

This Implementation Plan documents work for the _ExoFrame development repository_ — the source repository containing
`src/`, tests, CI, and developer tooling. The _deployed workspace_ (where end-users run the ExoFrame daemon and keep
their Memory scaffold) is a distinct runtime instance that can be created from the development repository.

Recommended workflow:

- Developers edit code and push to the development repo (`/path/to/exoframe-repo`).
- From the development repo you produce a _deployed workspace_ using `./scripts/deploy_workspace.sh /target/path` (see
  `docs/ExoFrame_Repository_Build.md` for details).
- The deployed workspace is intended for running the daemon, storing `.exo/journal.db`, and housing user content
  (`Memory`). It should not be used as a primary development checkout (no tests, no CI config required there).

Planned automation (Phase 1 deliverable):

- Add `scripts/deploy_workspace.sh` (lightweight) to create a runtime workspace from the repo and run `deno task setup`.
- Document the difference clearly in this Implementation Plan and Repository-Build doc so contributors and users follow
  the proper paths.
- Provide `scripts/scaffold.sh` to idempotently create runtime folder layout and copy templates.

Produce a deployed workspace for an end-user (runtime)

```bash
# Option A: full deploy (runs deno tasks automatically)
./scripts/deploy_workspace.sh /home/alice/ExoFrame

# Option B: deploy but skip running deno tasks (safe for CI/offline)
./scripts/deploy_workspace.sh --no-run /home/alice/ExoFrame

# Option C: only scaffold the target layout and copy templates
./scripts/scaffold.sh /home/alice/ExoFrame

# After scaffold (manual initialization)
cd /home/alice/ExoFrame
deno task cache
deno task setup
deno task start
```

Notes:

- The deployed workspace is a runtime instance and should not be treated as a development checkout. It contains only
  runtime artifacts (configs, minimal src, scripts) and user data (Memory, .exo/journal.db).
- Keep migration SQL and schema under `migrations/` or `sql/` in the development repo rather than committing `.db`
  files.
