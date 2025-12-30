# ExoFrame Repository Build

- **Version:** 1.7.0
- **Release Date:** 2025-12-02

### Create repository from scratch (no GitHub repo yet)

If you (the project creator) are starting ExoFrame development from scratch and there is no repository yet, follow these
optional bootstrap steps to create a local repository and publish it to GitHub. The commands below use the GitHub CLI
(`gh`) where possible for automation; you can also create the repository via the GitHub web UI.

#### A. Prepare local project (common)

# Create project folder and basic files

> [!NOTE]
> **VS Code Users:** You must install the
> [Deno extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno) (ID:
> `denoland.vscode-deno`) and enable it in the workspace (`"deno.enable": true`) to avoid linting errors like "Cannot
> find name 'Deno'".

```bash
# Create project folder
mkdir -p ~/ExoFrame && cd ~/ExoFrame

# Create initial files (scaffold only — database and runtime setup handled by tasks below)
cat > .gitignore <<'EOF'
/cache
/node_modules
/dist
/.vscode
# runtime/user data
/System/*.db
/System/*.sqlite
/Knowledge/
/Inbox/
/Portals/
*.log
deno.lock
EOF

# Optionally add license
cat > LICENSE <<'EOF'
MIT License
EOF

# Create minimal Deno config and import map so tasks run predictably
cat > deno.json <<'EOF'
{
	"imports": {
		"sqlite/": "https://deno.land/x/sqlite@v3.6.0/",
		"std/": "https://deno.land/std@0.201.0/"
	},
	"tasks": {
		"cache": "deno cache scripts/setup_db.ts",
		"setup": "deno run --allow-read --allow-write --allow-run scripts/setup_db.ts"
	}
}
EOF
```

2. Initialize git and make initial commit

```bash
git init -b main
git add -A
git commit -m "chore: initial project scaffold"
```

#### B. Create GitHub repository (recommended: `gh` CLI)

Install `gh` (GitHub CLI) if not present. On Ubuntu:

```bash
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo apt update
sudo apt install gh -y
```

Authenticate and create repo:

```bash
# Authenticate (interactive)
gh auth login

# Create a new repo under your user or org (replace <org> or use --public/--private flags)
gh repo create <org>/exoframe --public --source=. --remote=origin --push
```

If you prefer the web UI, create a new repository at https://github.com/new, then add the remote and push:

```bash
git remote add origin git@github.com:<org>/exoframe.git
git push -u origin main
```

**Note:** The above steps create the _development repository_ for ExoFrame (the source code, tests, and developer
tooling). A deployed _user workspace_ is a separate directory where end-users run the daemon and store their Knowledge
vault. See the "Deploying a user workspace" section below for how to bootstrap a runtime workspace from this repository.

#### B. Create required Deno config files and folder tree (must-do for Deno)

Before running any `deno task` commands, you must have a `deno.json` (or `deno.jsonc`) file in your project root. You
should also create a minimal `exo.config.toml` and the required folder structure. See the Implementation Plan for full
details, but the following is the minimal working set:

1. Create `deno.json` (minimal example):

```bash
cat > deno.json <<'EOF'
{
  "name": "@dostark/exoframe",
  "version": "0.1.0",
  "lock": true,
  "exports": "./src/main.ts",
  "tasks": {
    "start": "deno run --allow-read=. --allow-write=. --allow-net=api.anthropic.com,api.openai.com,localhost:11434 --allow-env=EXO_,HOME,USER --allow-run=git src/main.ts",
    "dev": "deno run --watch --allow-all src/main.ts",
    "stop": "deno run --allow-run=pkill scripts/stop.ts",
    "status": "deno run --allow-run=ps scripts/status.ts",
    "setup": "deno run --allow-all scripts/setup.ts",
    "cli": "deno run --allow-all src/cli.ts",
    "test": "deno test --allow-all tests/",
    "test:watch": "deno test --watch --allow-all tests/",
    "bench": "deno bench --allow-all tests/benchmarks/",
    "coverage": "deno test --coverage=cov_profile && deno coverage cov_profile",
    "lint": "deno lint src/ tests/",
    "fmt": "deno fmt src/ tests/",
    "fmt:check": "deno fmt --check src/ tests/",
    "cache": "deno cache src/main.ts",
    "compile": "deno compile --allow-all --output exoframe src/main.ts"
  },
  "imports": {
    "@std/fs": "jsr:@std/fs@^0.221.0",
    "@std/path": "jsr:@std/path@^0.221.0",
    "@std/toml": "jsr:@std/toml@^0.221.0",
    "@db/sqlite": "jsr:@db/sqlite@^0.11.0",
    "zod": "https://deno.land/x/zod@v3.22.4/mod.ts"
  },
  "exclude": ["cov_profile", "exoframe", "dist"],
  "lint": {
    "rules": {
      "tags": ["recommended"],
      "exclude": ["no-explicit-any"]
    }
  },
  "fmt": {
    "useTabs": false,
    "lineWidth": 100,
    "indentWidth": 2,
    "semiColons": true,
    "singleQuote": false
  },
  "compilerOptions": {
    "strict": true,
    "allowJs": false,
    "checkJs": false
  }
}
EOF
```

2. Create `import_map.json` (optional, but referenced above):

```bash
```

3. Create a minimal `exo.config.toml` (edit as needed):

```bash
cat > exo.config.toml <<'EOF'
[system]
version = "1.0.0"
log_level = "info"

[paths]
knowledge = "./Knowledge"
blueprints = "./Blueprints"
system = "./System"
EOF
```

4. Create the required folder tree:

```bash
mkdir -p src scripts templates tests migrations System Blueprints/Agents Blueprints/Flows
touch tests/.gitkeep migrations/.gitkeep Blueprints/Agents/.gitkeep Blueprints/Flows/.gitkeep
```

5. Add a minimal `src/main.ts` to allow `deno task cache` to succeed and provide a simple daemon entrypoint:

```bash
mkdir -p src
cat > src/main.ts <<'EOF'
console.log("ExoFrame Daemon Active");
EOF
```

You can now safely run the setup task which will cache remote modules and initialize the Activity Journal (database):

```bash
deno task cache
deno task setup
```

Verify the created database and schema (requires `sqlite3` CLI):

```bash
# List tables
sqlite3 System/journal.db ".tables"

# Show full schema
sqlite3 System/journal.db ".schema"

# Count activity rows
sqlite3 System/journal.db "SELECT COUNT(*) FROM activity;"
```

For full configuration, see:

- Implementation Plan: `ExoFrame_Implementation_Plan.md` — section **Bootstrap: Developer Workspace Setup**
- Technical Spec: `ExoFrame_Technical_Spec.md` — section **3. Directory Structure**

---

## Deploying a user workspace

See [ExoFrame User Guide](./ExoFrame_User_Guide.md) for instructions on how to deploy and manage a user workspace.

#### C. Recommended repository settings (first-run)

- Enable branch protection for `main` (require PR reviews, require status checks). You can configure this in the GitHub
  UI under Settings → Branches, or via `gh api` calls.
- Add a basic `CODEOWNERS` for review ownership (optional).
- Add a GitHub Actions workflow that runs `deno test` on PRs (see `.github/workflows/test.yml` already present in the
  repo). Ensure the workflow is enabled.

Example: enable a minimal branch protection rule via `gh` (requires repo admin privileges):

```bash
gh api --method POST /repos/<org>/exoframe/branches/main/protection -f required_status_checks='{"strict":true,"contexts":[]}' -f enforce_admins=true -f required_pull_request_reviews='{"required_approving_review_count":1}'
```

#### D. First PR & branch strategy

- Push feature branches for work: `git checkout -b feat/setup-workspace` → commit →
  `git push -u origin feat/setup-workspace` → open a PR and request review.
- Protect `main` from direct pushes; require CI to pass before merging.

#### E. If you don't have a GitHub account or prefer an alternative

- Use a self-hosted Git server or GitLab; the local steps are identical. Replace `gh` commands with your Git host's API
  or UI steps.

**Notes:**

- Do not commit secrets (API keys) to the repository. Use `exoctl secret set` and exclude key files via `.gitignore`.
- If you want automated repo creation as part of `scripts/bootstrap`, add an interactive flag so creators can choose web
  UI or `gh` automation.

---

## References & minimal next steps

This document covers _only_ the minimal actions required to create the repository and push it to a remote. For full
developer workspace bootstrap (installing Deno, initializing the Activity Journal, scaffolding the Knowledge vault,
running tests, and starting the daemon), see the Implementation Plan and Technical Specification:

- Implementation Plan: `ExoFrame_Implementation_Plan.md` — see section **Bootstrap: Developer Workspace Setup**
- Technical Spec: `ExoFrame_Technical_Spec.md` — see section **11.4 Bootstrap (Reference Implementation)**

Minimal next steps after repository creation (creator-only, do these once):

1. Copy the system sample config into the repo (if present) and set basic values:

```bash
cp exo.config.sample.toml exo.config.toml 2>/dev/null || true
```

2. (Optional) Push an initial protected branch policy and enable CI (see Implementation Plan for details). Example quick
   commands:

```bash
# Push initial branch
git push -u origin main

# If using GitHub and gh is installed, enable a simple branch protection rule (requires admin):
gh api --method POST /repos/<org>/exoframe/branches/main/protection -f required_status_checks='{"strict":true,"contexts":[]}' -f enforce_admins=true -f required_pull_request_reviews='{"required_approving_review_count":1}' || true
```

3. Do not add secrets to the repository. Store API keys using the OS keyring and the engine CLI (`exoctl secret set`).
   See the Implementation Plan for secure developer guidance.

If you want, add a reference to this repository-build doc in the repo root (e.g., `REPOSITORY_BUILD.md`) and link it
from `README.md` so new contributors follow the canonical onboarding flow.

---

_End of Repository Build_
