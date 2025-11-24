# Bootstrap: Developer Workspace Setup

Provide step-by-step instructions to bootstrap a local development workspace for ExoFrame. Two platforms are supported
in this plan: **Ubuntu (pure)** and **Windows with WSL2**. The goal is a reproducible, minimal environment that allows
contributors to run the daemon, tests and benchmarks locally.

### Goals

- Install required tools (Git, Deno, SQLite, Obsidian, optional: VS Code)
- Create a local repository and initial configuration
- Initialize the Activity Journal and Knowledge vault
- Run the daemon in development mode and execute the test suite

### 0. Preflight (common)

- Ensure you have at least 8GB RAM and 20GB free disk space.
- Create a user account for development with normal privileges.
- Recommended editor: VS Code or Obsidian for the Knowledge vault.

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

3. Install Obsidian (optional GUI)

Download from Obsidian site or install via Snap:

```bash
sudo snap install obsidian --classic
```

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
# This creates Inbox, Knowledge, System, Portals and copies exo.config.toml
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

6. Initialize Obsidian vault

```bash
# Point Obsidian to the Knowledge folder
# In Obsidian: "Open folder as vault" -> ~/ExoFrame/Knowledge

# Verify the Activity Journal (SQLite) was initialized correctly
deno test --allow-read --allow-write --allow-run tests/setup_db_test.ts
```

### 2. Windows + WSL2 (Ubuntu inside WSL)

Prerequisite on Windows host:

- Enable WSL2 and install a Linux distro (Ubuntu) from Microsoft Store. See Microsoft docs if WSL not enabled.
- Optional: Install Windows Terminal for a better shell experience.

1. Open WSL2 shell (Ubuntu) and follow the same Ubuntu steps above.

Notes specific to WSL2:

- Ensure Git on Windows and Git inside WSL are consistent. Use the WSL-side git for repository work inside `~/ExoFrame`.
- For Obsidian UI on Windows: point Obsidian to the WSL mount (e.g.,
  `\\wsl$\\Ubuntu-22.04\\home\\<user>\\ExoFrame\\Knowledge`) or use the Windows-side Obsidian and open vault via the WSL
  path.

2. Symlink behavior

- WSL supports Unix symlinks inside the distro. When creating Portals that point to Windows paths, prefer using
  WSL-mounted paths or ensure permissions allow access.

3. Windows-side utilities (optional convenience)

- Install Obsidian on Windows and open the WSL vault via `\\wsl$` share.
- If you expect to run UI workflows from Windows, install the Windows Git client and ensure `core.autocrlf` matches your
  team policy.

### 3. Post-bootstrap checks (both platforms)

- Verify Deno version: `deno --version` (should match project `deno.json` expectations)
- Verify git config: `git config --list` (ensure `user.name` and `user.email` set)
- Verify DB exists: `ls -la System/*.db` or run `sqlite3 System/activity.db 'SELECT count(*) FROM activity;'`
- Run smoke test: `deno test --allow-read --allow-write` and confirm core tests pass.
- Create a test portal and verify watcher triggers:

```bash
exoctl portal add ~/Dev/MyProject MyProject
echo "# Test Request" > ~/ExoFrame/Inbox/Requests/test.md
# Observe daemon logs / Obsidian Dashboard
```

### 4. Automation & recommended improvements

- Provide automated installer scripts for each platform: `scripts/bootstrap_ubuntu.sh` and `scripts/bootstrap_wsl.sh` to
  replicate these steps.
- Consider a declarative setup using Ansible (Ubuntu) and Winget/PowerShell (Windows) for reproducible developer
  environments.

### 5. Security & permission notes

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
their Knowledge vault) is a distinct runtime instance that can be created from the development repository.

Recommended workflow:

- Developers edit code and push to the development repo (`/path/to/exoframe-repo`).
- From the development repo you produce a _deployed workspace_ using `./scripts/deploy_workspace.sh /target/path` (see
  `docs/ExoFrame_Repository_Build.md` for details).
- The deployed workspace is intended for running the daemon, storing `System/journal.db`, and housing user content
  (`/Knowledge`). It should not be used as a primary development checkout (no tests, no CI config required there).

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
  runtime artifacts (configs, minimal src, scripts) and user data (Knowledge, System/journal.db).
- Keep migration SQL and schema under `migrations/` or `sql/` in the development repo rather than committing `.db`
  files.
