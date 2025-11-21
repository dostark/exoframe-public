
# ExoFrame Repository Build v1.4

**Version:** 1.4.0  
**Release Date:** 2025-11-21  

### Create repository from scratch (no GitHub repo yet)
If you (the project creator) are starting ExoFrame development from scratch and there is no repository yet, follow these optional bootstrap steps to create a local repository and publish it to GitHub. The commands below use the GitHub CLI (`gh`) where possible for automation; you can also create the repository via the GitHub web UI.

#### A. Prepare local project (common)
1. Create project folder and basic files

```bash
# Create project folder
mkdir -p ~/ExoFrame && cd ~/ExoFrame

# Create initial files
cat > README.md <<'EOF'
# ExoFrame

ExoFrame - local-first agent orchestration (Implementation Plan v1.4)
EOF

cat > .gitignore <<'EOF'
/.cache
/node_modules
/dist
*.log
*.db
EOF

# Optionally add license
cat > LICENSE <<'EOF'
MIT License
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

#### B. Create required Deno config files and folder tree (must-do for Deno)

Before running any `deno task` commands, you must have a `deno.json` (or `deno.jsonc`) file in your project root. You should also create a minimal `exo.config.toml` and the required folder structure. See the Implementation Plan for full details, but the following is the minimal working set:

1. Create `deno.json` (minimal example):
```bash
cat > deno.json <<'EOF'
{
	"tasks": {
		"cache": "deno cache src/main.ts"
	},
	"importMap": "import_map.json"
}
EOF
```

2. Create `import_map.json` (optional, but referenced above):
```bash
cat > import_map.json <<'EOF'
{
	"imports": {}
}
EOF
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
mkdir -p src scripts System Blueprints/Agents Blueprints/Flows Inbox/Requests Inbox/Plans Knowledge/Context Knowledge/Reports Knowledge/Portals Portals
```

5. (Optional) Add a minimal `src/main.ts` to allow `deno task cache` to succeed:
```bash
mkdir -p src
cat > src/main.ts <<'EOF'
console.log("ExoFrame Daemon Active");
EOF
```

You can now safely run:
```bash
deno task cache
```

For full configuration, see:
- Implementation Plan: `ExoFrame_Implementation_Plan_v1.4.md` — section **Bootstrap: Developer Workspace Setup**
- Technical Spec: `ExoFrame_Technical_Spec_v1.4.md` — section **3. Directory Structure**

#### C. Recommended repository settings (first-run)
- Enable branch protection for `main` (require PR reviews, require status checks). You can configure this in the GitHub UI under Settings → Branches, or via `gh api` calls.
- Add a basic `CODEOWNERS` for review ownership (optional).
- Add a GitHub Actions workflow that runs `deno test` on PRs (see `.github/workflows/test.yml` already present in the repo). Ensure the workflow is enabled.

Example: enable a minimal branch protection rule via `gh` (requires repo admin privileges):

```bash
gh api --method POST /repos/<org>/exoframe/branches/main/protection -f required_status_checks='{"strict":true,"contexts":[]}' -f enforce_admins=true -f required_pull_request_reviews='{"required_approving_review_count":1}'
```

#### D. First PR & branch strategy
- Push feature branches for work: `git checkout -b feat/setup-workspace` → commit → `git push -u origin feat/setup-workspace` → open a PR and request review.
- Protect `main` from direct pushes; require CI to pass before merging.

#### E. If you don't have a GitHub account or prefer an alternative
- Use a self-hosted Git server or GitLab; the local steps are identical. Replace `gh` commands with your Git host's API or UI steps.

**Notes:**
- Do not commit secrets (API keys) to the repository. Use `exoctl secret set` and exclude key files via `.gitignore`.
- If you want automated repo creation as part of `scripts/bootstrap`, add an interactive flag so creators can choose web UI or `gh` automation.

---

## References & minimal next steps

This document covers *only* the minimal actions required to create the repository and push it to a remote. For full developer workspace bootstrap (installing Deno, initializing the Activity Journal, scaffolding the Knowledge vault, running tests, and starting the daemon), see the Implementation Plan and Technical Specification:

- Implementation Plan: `ExoFrame_Implementation_Plan_v1.4.md` — see section **Bootstrap: Developer Workspace Setup**
- Technical Spec: `ExoFrame_Technical_Spec_v1.4.md` — see section **11.4 Bootstrap (Reference Implementation)**

Minimal next steps after repository creation (creator-only, do these once):

1. Copy the system sample config into the repo (if present) and set basic values:

```bash
cp exo.config.sample.toml exo.config.toml 2>/dev/null || true
```

2. (Optional) Push an initial protected branch policy and enable CI (see Implementation Plan for details). Example quick commands:

```bash
# Push initial branch
git push -u origin main

# If using GitHub and gh is installed, enable a simple branch protection rule (requires admin):
gh api --method POST /repos/<org>/exoframe/branches/main/protection -f required_status_checks='{"strict":true,"contexts":[]}' -f enforce_admins=true -f required_pull_request_reviews='{"required_approving_review_count":1}' || true
```

3. Do not add secrets to the repository. Store API keys using the OS keyring and the engine CLI (`exoctl secret set`). See the Implementation Plan for secure developer guidance.

If you want, add a reference to this repository-build doc in the repo root (e.g., `REPOSITORY_BUILD.md`) and link it from `README.md` so new contributors follow the canonical onboarding flow.

---

*End of Repository Build v1.4*