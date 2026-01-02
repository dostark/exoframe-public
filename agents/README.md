---
agent: general
scope: dev
title: Agents directory README
short_summary: "Overview of the agents/ directory, schema, and maintenance guidelines."
version: "0.1"
---

# agents/ — IDE & Dev Agent Instructions

Purpose
-------
This directory contains short, machine-discoverable instruction documents intended to be consumed by development-time agents (e.g., VS Code Copilot, Copilot Labs) and provider integrations (OpenAI, Claude, Google). The content is curated to be concise, provider-agnostic where possible, and easy to inject into prompts using tooling in `scripts/`.

Layout
------
- `agents/manifest.json` — auto-generated manifest listing available agent docs (`scripts/build_agents_index.ts`)
- `agents/copilot/` — Copilot-focused docs and short summaries
- `agents/providers/` — provider-specific adaptation notes and prompt templates
- `agents/chunks/` — (auto-generated) pre-chunked text files for quick retrieval

Schema
------
Each `.md` file should include YAML frontmatter with at least the following keys:
- `agent` (string) — e.g., `copilot`, `openai`
- `scope` (string) — e.g., `dev`, `ci`, `docs`
- `title` (string)
- `short_summary` (string) — one paragraph, 1–3 lines — used for quick ingestion
- `version` (string)
- `topics` (array of strings) — optional tags

Maintenance
-----------
- Use `scripts/validate_agents_docs.ts` to validate frontmatter and safety rules.
- Update the manifest with `scripts/build_agents_index.ts` if new docs are added.

Regenerating manifest & chunks
------------------------------
If you add or update files under `agents/`, regenerate the manifest and pre-chunk artifacts with:

```bash
# Rebuild manifest.json and chunks/
deno run --allow-read --allow-write scripts/build_agents_index.ts
```

To verify the manifest is fresh (useful for CI):

```bash
# Verifies the generated manifest is consistent with current agent docs
deno run --allow-read scripts/verify_manifest_fresh.ts
```

Building embeddings
-------------------
Precompute and import embeddings with `scripts/build_agents_embeddings.ts`. For precomputed embeddings, drop JSON files that follow the example template into `agents/embeddings/` and then run:

```bash
# Build embeddings from a directory of precomputed JSON files
deno run --allow-read --allow-write --unstable scripts/build_agents_embeddings.ts --mode precomputed --dir agents/embeddings
```

See `agents/embeddings/example_precomputed_template.json` for a minimal, valid template to create precomputed embedding files.

How to Add a New Agent Doc
---------------------------

Follow this workflow to create a new agent documentation file:

### 1. Create File in Appropriate Subfolder

Choose the right location based on content:
- **`source/`** — Source code development guidance (patterns, architecture, conventions)
- **`tests/`** — Testing patterns and helpers (TDD, test utilities, security tests)
- **`docs/`** — Documentation maintenance (Implementation Plan, versioning, cross-references)
- **`providers/`** — Provider-specific adaptations (Claude, OpenAI, Google, Copilot)
- **`copilot/`** — Copilot-specific quick references

### 2. Add YAML Frontmatter with Required Fields

Every agent doc MUST start with YAML frontmatter:

```yaml
---
agent: claude  # or: copilot, openai, google, general
scope: dev     # or: ci, docs, test
title: "Your Title Here"
short_summary: "One-liner description (1-3 sentences max, <200 chars)"
version: "0.1"
topics: ["keyword1", "keyword2", "keyword3"]
---
```

**Field descriptions:**
- **`agent`**: Target agent type (`claude`, `copilot`, `openai`, `google`, `general`)
- **`scope`**: Context scope (`dev`, `ci`, `docs`, `test`)
- **`title`**: Human-readable title
- **`short_summary`**: Concise summary for quick injection (≤200 characters recommended)
- **`version`**: Semantic version (start with `"0.1"`)
- **`topics`**: Array of searchable keywords (helps with semantic retrieval)

### 3. Include Required Sections

Structure your document with these sections:

#### Key Points (Required)
Bullet list of 3-5 critical takeaways:
```markdown
Key points
- Use `initTestDbService()` for database tests
- Follow TDD workflow: tests first, implementation second
- Clean up resources in finally blocks
```

#### Canonical Prompt (Required)
Example system prompt showing ideal usage:
```markdown
Canonical prompt (short):
"You are a test-writing assistant for ExoFrame. List failing test names and assertions first, using `initTestDbService()` or `createCliTestContext()` where appropriate."
```

#### Examples (Required)
2-3 example prompts with expected responses:
```markdown
Examples
- Example prompt: "Write tests that verify PlanWriter handles missing files and empty JSON. Use `initTestDbService()` and ensure cleanup is called."
- Example prompt: "Propose 3 failing unit tests showing how ConfigLoader handles malformed TOML."
```

#### Do / Don't (Recommended)
Guidance on safe/unsafe patterns:
```markdown
Do / Don't
- ✅ Do follow TDD and verify Success Criteria
- ✅ Do add module-level documentation
- ❌ Don't proceed without Implementation Plan step
```

### 4. Regenerate Manifest

After creating or updating a doc:

```bash
deno run --allow-read --allow-write scripts/build_agents_index.ts
```

This updates `agents/manifest.json` and regenerates `agents/chunks/*.txt` files.

### 5. Build Embeddings (Optional but Recommended)

Generate embeddings for semantic search:

```bash
# Mock embeddings (deterministic, no API calls, fast)
deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock

# Or OpenAI embeddings (requires authentication, higher quality)
deno run --allow-read --allow-write --allow-net --allow-env scripts/build_agents_embeddings.ts --mode openai
```

**Mock mode** is recommended for most cases (deterministic, fast, no API costs).

### 6. Validate

Run validation to check schema compliance and safety:

```bash
deno run --allow-read scripts/validate_agents_docs.ts
```

This checks for:
- Required frontmatter fields
- Canonical prompt section
- Examples section
- Sensitive data patterns (fails if detected)
- YAML syntax

### 7. Test Retrieval

Verify your doc is discoverable:

```bash
# Test context injection with a relevant query
deno run --allow-read scripts/inject_agent_context.ts --query "your test query" --agent claude

# Should return JSON with your doc if query matches
```

### Template File

Copy an existing doc as a starting point:
- For provider-specific: `agents/providers/claude.md`
- For testing guidance: `agents/tests/testing.md`
- For source patterns: `agents/source/exoframe.md`

### Common Mistakes to Avoid

❌ **Missing `short_summary`** or making it too long (>200 chars)
- Keep it concise: 1-3 sentences maximum

❌ **Forgetting to add topics array**
- Topics improve semantic search quality

❌ **Not including canonical prompt example**
- Required by validation

❌ **Skipping manifest regeneration**
- Your doc won't be discoverable without this step

❌ **Hardcoding sensitive data (credentials, auth tokens, etc.)**
- Validation will fail if detected

❌ **Using inconsistent agent/scope values**
- Stick to standard values: `claude`, `copilot`, `openai`, `google`, `general` for agent
- And: `dev`, `ci`, `docs`, `test` for scope

### Example: Creating a New Security Testing Guide

```bash
# 1. Create file
cat > agents/tests/security-patterns.md << 'EOF'
---
agent: claude
scope: test
title: Security Testing Patterns
short_summary: "Common security testing patterns for ExoFrame: path traversal, injection, leakage."
version: "0.1"
topics: ["security", "testing", "paranoid-tests", "path-traversal"]
---

# Security Testing Patterns

Key points
- Label security tests with `[security]` in test names
- Test path traversal with `../` sequences
- Use PathResolver for all path validation
- Verify Portal permissions are enforced

Canonical prompt (short):
"You are a security testing assistant. Propose paranoid tests for attack vectors: path traversal, command injection, symlink escapes."

Examples
- Example prompt: "Write security tests for PathResolver that check ../ handling and symlink resolution."
EOF

# 2. Regenerate manifest and chunks
deno run --allow-read --allow-write scripts/build_agents_index.ts

# 3. Build embeddings
deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock

# 4. Validate
deno run --allow-read scripts/validate_agents_docs.ts

# 5. Test retrieval
deno run --allow-read scripts/inject_agent_context.ts --query "security path traversal" --agent claude
```

Canonical prompt (short):
"You are a dev-time agent. Before performing repository-specific changes, consult `agents/manifest.json` and include matching `short_summary` items for relevant docs in `agents/`."

Examples
- Example prompt: "Suggest 3 unit test cases for PlanWriter that use `initTestDbService()` and include expected assertions."

Notes
-----
These files are **not** runtime Blueprints/agents (see `Blueprints/Agents/`). They are development-focused guidance to be used by IDE agents and automation helpers.
