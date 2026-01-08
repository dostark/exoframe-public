## Phase 10: Polishing

> **Status:** 🔲 PLANNED\
> **Prerequisites:** Phases 1–9 (All core features implemented)\
> **Goal:** Finalize user-facing polish and low-effort quality improvements before wide release.

### Overview

Phase 10 collects finishing touches that improve user experience, reduce operational costs, and broaden accessibility. Activities in this phase are low-risk, high-impact improvements that make ExoFrame feel production-ready without changing core architecture.

### Step 10.1: Add cost-free LLM providers ✅ COMPLETED

**Location:** `src/ai/providers.ts` (ModelFactory), `src/ai/providers/openai_provider.ts`, `tests/ai/`, `docs/CostFree_LLMs.md`

**Goal:** Integrate and document support for cost-free and low-cost LLMs (e.g., GPT-4.1, GPT-4o, GPT-5mini), enabling local and CI-friendly testing with minimal API costs.

**Success Criteria:**

1. [x] Provider adapters supported via `ModelFactory` for `gpt-4.1`, `gpt-4o`, and `gpt-5-mini` (shims returning OpenAI-compatible clients).
2. [x] Default test configurations use `mock` provider to avoid billing during CI.
3. [x] Documentation updated with setup instructions and sample configs. (See `docs/CostFree_LLMs.md`)
4. [x] Backward compatibility maintained with existing LLM provider interfaces.

**Test Definitions:**

- Unit tests: Adapter interface conformance tests for each provider (`tests/ai/free_providers_test.ts`). ✅ (added)
- Integration tests: Flow runs using cost-free providers in a sandbox environment (tests/integration/llm_free_provider_test.ts) — **manual and opt-in**; runs only when `EXO_ENABLE_PAID_LLM=1` and appropriate API keys are set.
- CI behavior: Default CI uses `mock` provider and will not call paid endpoints unless explicitly opted-in via `EXO_ENABLE_PAID_LLM=1`. ✅ (config defaults to `mock`)

**Notes:**

- Implemented a minimal `OpenAIShim` in `src/ai/providers.ts` to provide quick, low-coupling adapters for model-specific usage and to avoid circular imports with the full `OpenAIProvider` implementation.
- Added documentation at `docs/CostFree_LLMs.md` with setup instructions, a sample `exo.config` snippet, environment variables, and instructions for running the manual integration test.
- The manual integration test is intentionally **ignored by default** and also guards on `EXO_ENABLE_PAID_LLM=1` and the appropriate API key to prevent accidental paid calls in CI or local runs.

### Step 10.2: Modernize IDE/Agent instruction files for VS Code (Copilot) & multi-provider agents ✅ COMPLETED

**Location:** `agents/` (new top-level directory), plus references in `agents/src/`, `agents/tests/`, and `agents/docs/` (these may be renamed to `agents/*.md` or preserved as small redirects).

**Goal:** Establish a clear, provider-agnostic, and machine-friendly set of agent instruction files that are optimized for consumption by VS Code Copilot (dev-time agents) and easily adaptable for OpenAI, Claude, and Google agent integrations. These files will provide concise repository context, canonical prompts, safe/unsafe patterns, and quick-start examples that agents can use to build task-specific context for development work.

**Success Criteria:**

1. [x] Create `agents/` directory with a standardized layout and a top-level `agents/README.md` describing intent and maintenance policy.
2. [x] Add a Copilot-focused doc (e.g., `agents/copilot/exoframe.md`) containing: short repo summary, critical conventions (file locations, important modules), canonical prompts, example workflows, and "Do / Don't" guidance for automation tasks.
3. [x] Add provider-specific adaptation docs under `agents/providers/` (OpenAI, Claude, Google) that explain model-specific considerations (token limits, tooling, prompt templates) and include provider-tailored example prompts.
4. [x] Define a small YAML frontmatter schema for agent docs (required fields: `agent`, `scope`, `title`, `summary`, `version`) so the docs are machine-discoverable and validate with a lightweight `scripts/validate_agents_docs.ts` script.
5. [x] Migrate existing `src/AGENT_INSTRUCTIONS.md`, `tests/AGENT_INSTRUCTIONS.md`, and `docs/AGENT_INSTRUCTIONS.md` into `agents/` and consolidate enhanced guidance; legacy files removed.
6. [x] Add CI validation (linting job) that runs the validation script on PRs and ensures each agent doc contains required metadata and at least one canonical example prompt.
7. [x] Add a short quickstart in `agents/docs/documentation.md` that explains how to use the `agents/` content with VS Code Copilot / Copilot Labs and other agent interfaces.

**Test Definitions:**

- Unit tests: `tests/agents_docs_test.ts` to validate YAML schema and presence of required sections and examples. ✅
- Integration (manual): A documented manual test that illustrates loading `agents/copilot/exoframe.md` content into VS Code Copilot (via Copilot Labs or local Copilot preview) and verifies suggested code or prose references repository-specific guidance.
- CI checks: `validate-agent-docs` workflow step that fails PRs missing required metadata or example prompts.

**Notes:**

- Use YAML frontmatter to provide metadata helpful for automated indexing and filtering (e.g., `agent`, `scope`, `tags`, `short_summary`, `version`). Keep frontmatter minimal and stable.
- Provide a small `agents/manifest.json` (or `manifest.yaml`) that lists available agent docs, version, and per-doc `short_summary` and `topics` so automated tools can discover content without scanning the whole tree.
- Add a per‑doc `short_summary` and a `summary.md` (one paragraph) to ensure quick ingestion by agents with limited token budgets.
- Distinguish clearly between "Dev/IDE agent instructions" and runtime agents defined in `Blueprints/Agents/` in the header of each agent doc so they are not confused. ✅
- Keep provider-specific docs limited to adaptation guidance (token constraints, tool integration notes, prompt templates) so the same core content can be reused across providers.
- Add a `scripts/build_agents_index.ts` that produces both a human-friendly `agents/manifest.json` and a pre-chunked artifacts folder `agents/chunks/` for quick retrieval.
- Provide an optional `agents/embeddings/` index (vector store or serialized JSON) and a `scripts/build_agents_embeddings.ts` to support retrieval-augmented generation (RAG) for providers that support embeddings (OpenAI, Claude, Google). This is optional but dramatically increases the probability that external agents will find and use relevant passages.
- Add a `scripts/inject_agent_context.ts` utility which, given a target `agent` and a short query, returns the most relevant `short_summary` + `chunks` (or the full doc when small) to be appended to prompts. This makes it straightforward for CI scripts or local agent wrappers to include `agents/` content deterministically.
- Provide a VS Code snippet/task and a short Copilot Labs prompt template that instructs Copilot to "consult the `agents/manifest.json` and include any matching `short_summary` or `chunks` before answering or editing files" — this reduces ambiguity for dev-time agents.
- Include a lightweight content-safety check in `scripts/validate_agents_docs.ts` that flags secrets, plaintext tokens, or sensitive paths; CI should fail if secrets are found in agent docs.
- Legacy `AGENT_INSTRUCTIONS.md` files have been consolidated into `agents/` and removed; references and Implementation Plan updated to point to `agents/` equivalents.

**Enhancements to maximize agent adoption (multi-provider):**

1. Manifest & short summaries — agents often prefer small, structured entry points. `agents/manifest.json` + `short_summary` fields make it trivial for any agent to discover and ingest the most relevant content.
2. Chunking & embeddings — split long docs into small chunks and optionally precompute embeddings to enable fast semantic retrieval with RAG. Embed building should be provider-agnostic and reversible.
3. Prompt injection helpers — `scripts/inject_agent_context.ts` and a simple CLI (`bin/agent-context`) allow any automation pipeline to deterministically insert curated context into prompts.
4. Provider adapters — document explicit prompt templates for OpenAI/Claude/Google that include how to handle token limits and instruct the agent to reference `manifest.json` first.
5. VS Code integration — provide a snippet and Copilot Labs prompt that standardizes how devs include `agents/` content in copilot requests; include a small VS Code task to run `bin/agent-context` and copy the returned context into the clipboard for manual use.
6. CI & tests — build a `validate-agent-docs` workflow that runs schema checks, safety checks, and a retrieval smoke test that verifies `inject_agent_context` returns content for a small list of canonical queries.
7. Monitoring & metrics — optionally add a manual logging step in developer agent wrappers to count usage (how often a doc was injected) so teams can monitor whether docs are actually being used and which docs are most useful.

**Implementation Plan (step-by-step, extended):**

1. Create `agents/README.md` with purpose, schema reference, and maintenance guidelines.
2. Add `agents/copilot/exoframe.md` (concise repo summary, key files, canonical prompts, example dev tasks, "Do/Don't" guidance) and a `summary.md` per doc for quick ingestion.
3. Add `agents/providers/{openai,claude,google}.md` with adaptation notes and sample prompt templates (include `token_limit_hints` and examples of `inject_agent_context` usage).
4. Implement `scripts/validate_agents_docs.ts` and `tests/agents_docs_test.ts` to check schema, required fields, safety rules, and presence of canonical prompts.
5. Implement `scripts/build_agents_index.ts` (creates `manifest.json` and `chunks/`) and `scripts/build_agents_embeddings.ts` optionally to produce `agents/embeddings/*`.
6. Add `scripts/inject_agent_context.ts` and a thin CLI wrapper `bin/agent-context` that returns the best matching short_summary and chunk set for a query and agent type.
7. Add CI workflow step `validate-agent-docs` that runs validation + retrieval smoke test + optional embedding build check.
8. Add VS Code snippet and a short `agents/docs/documentation.md` quickstart with Copilot Labs instructions and an example using `bin/agent-context`.
9. Migrate or add references from the existing `AGENT_INSTRUCTIONS.md` files to the new `agents/` structure; add small redirect/wrapper files in the original locations for 3 months before deprecation.
10. Add an integration (manual) test and a small automated smoke test that runs `bin/agent-context` for canonical queries and asserts it returns expected short_summary strings and at least one chunk.

**Additional Exit Criteria:**

- [ ] `agents/manifest.json` is present and lists all agent docs with `short_summary` and `topics`.
- [ ] `scripts/inject_agent_context.ts` returns relevant context for canonical queries in CI smoke tests.
- [ ] Validation script and tests added and green in CI (schema, safety rules, retrieval smoke test).
- [ ] VS Code quickstart doc added; at least one developer has verified the Copilot flow (manual verification step).

**Estimated Effort & Risks (updated):**

- Effort: 2–3 days for initial scaffold, validation scripts, and CI integration; another 1–2 days for embedding index and optional RAG flow. Adding CI retrieval smoke tests and provider-specific prompts increases testing overhead but improves reliability.
- Risks: Embeddings and RAG introduce maintenance and cost considerations. If using external embeddings, make the embedding build optional and gated behind CI flags (e.g., `EXO_BUILD_EMBEDDINGS=1`) to prevent accidental costs.

**Final Note:**

The combination of a manifest, short summaries, chunking, optional embeddings, and deterministic prompt-injection helpers greatly increases the chance that Copilot, OpenAI, Claude, or Google agents will find and consult the authoritative `agents/` docs when performing repo-specific development tasks. This approach emphasizes deterministic, auditable pipelines over hoping an agent "guesses" to look in a particular file.

### Step 10.3: Comprehensive CI Infrastructure

**Goal**: Unify local and remote CI/CD pipelines to ensure identical validation standards across environments.

#### 10.3.1. Unified CI Pipeline Script (`scripts/ci.ts`)

- **Action**: Create a `scripts/ci.ts` CLI tool using `cliffy` that orchestrates the entire build/validation lifecycle.
- **Commands**:
  - `deno run scripts/ci.ts check` (Lint + Type Check)
  - `deno run scripts/ci.ts test` (Unit + Security Tests)
  - `deno run scripts/ci.ts build` (Compile Binaries)
  - `deno run scripts/ci.ts all` (Full Pipeline)
- **Technical Requirements**:
  - **Parallel Execution**: Run unrelated tasks (e.g., linting vs testing) concurrently using `Promise.all` + `Deno.Command`.
  - **Step Isolation**: Each step must be idempotent and isolated (no shared mutable state).
  - **Reporter**: Output a structured summary (Markdown/Console) of pass/fail status per step.
  - **Cross-Platform**: Ensure paths and commands work on Linux, macOS, and Windows.
- **Success Criteria:**
  - [x] `deno run scripts/ci.ts all` completes successfully on local machine
  - [x] Script cleanly handles failure in one parallel step without hanging
  - [x] Output includes timing for each step
- **Plan Tests:**
  - [x] `deno test tests/ci/script_test.ts` (Mocked extensive pipeline run)

#### 10.3.2. GitHub Actions Optimization (`.github/workflows/`)

- **Action**: Deconstruct existing workflows and rebuild them to call `scripts/ci.ts`.
- **Workflow Architecture**:
  - **`pr-validation.yml`**:
    - Triggers: `pull_request` (branches: main, develop)
    - Strategy: Matrix build (Linux, macOS, Windows) to catch platform-specific bugs.
    - Steps:
      1. Checkout
      2. Install Deno (uses `denoland/setup-deno`)
      3. Run `deno run scripts/ci.ts check` (Fast feedback)
      4. Run `deno run scripts/ci.ts test --quick` (Skip integration tests)
  - **`merge-validation.yml`**:
    - Triggers: `push` (branches: main)
    - Steps: Full pipeline (`ci.ts all`) + Coverage uploading to Codecov.
  - **`release-pipeline.yml`**:
    - Triggers: `release` (created)
    - Steps: Build binaries -> Sign (if applicable) -> Upload Release Assets.
- **Success Criteria:**
  - [x] PR validation runs in < 5 minutes
  - [x] Windows matrix job fails if a path is posix-only
  - [x] Release workflow publishes artifacts attached to GH Release
- **Plan Tests:**
  - [x] Manual run of workflows on a test branch

#### 10.3.3. Advanced Quality Gates & Policy Enforcement

- **Action**: Implement strict gates that fail the build if specific criteria aren't met.
- **Gates**:
  - **Security Regression**: `deno task test:security` must pass 100%. Blocks PRs with security vulnerabilities.
  - **Documentation Drift**: `verify_manifest_fresh.ts` must pass. Ensures `agents/manifest.json` matches the Markdown files.
  - **Type Safety**: `deno check` must return zero errors. We do not allow `// @ts-ignore` without accompanying tracking issue reference.
  - **Coverage Limits**: Fail if `branch` coverage drops below 80% or `function` coverage drops below 90%.
- **Success Criteria:**
  - [x] Build fails if `verify_manifest_fresh.ts` detects changes
  - [x] Build fails if coverage report shows below thresholds (60% Line/50% Func)
- **Plan Tests:**
  - `tests/ci/gates_test.ts` (Verify gate logic with mocked inputs)

#### 10.3.4. Local Git Hooks (`scripts/setup_hooks.ts`)

- **Action**: Automate the installation of git hooks to shift-left validation.
- **Hooks**:
  - **`pre-commit`**:
    - `deno task lint` (Format + Lint)
    - `deno task check:docs` (Fast drift check)
    - Rejects commit if files are messy.
  - **`pre-push`**:
    - `deno task test:security` (Prevent pushing vulnerable code)
    - `deno task check` (Type check)
- **Developer UX**:
  - `deno task hooks:install` copies hooks to `.git/hooks/`.
  - `deno task hooks:uninstall` removes them.
- **Success Criteria:**
  - [x] Use `scripts/setup_hooks.ts` to install hooks without error
  - [x] `git commit` fails if formatting is incorrect
  - [x] `git push` fails if security tests fail
- **Plan Tests:**
  - Manual verification in a temporary git repo

#### 10.3.5. Artifact Management and Publishing

- **Action**: Standardize the output of the build process. Compilation is optional and triggered via `--compile`.
- **Artifact Layout**:
  ```text
  dist/bin/
  ├── exoframe-x86_64-unknown-linux-gnu
  ├── exoframe-x86_64-apple-darwin
  ├── exoframe-aarch64-apple-darwin
  └── exoframe-x86_64-pc-windows-msvc.exe
  ```
- **Validation**:
  - Verify binary size is within limits (e.g. < 100MB).
  - Run `dist/bin/exoframe-<target> --version` to verify successful compilation.
- **Success Criteria:**
  - [x] `scripts/ci.ts build --compile` produces all 4 targets
  - [x] Binaries are executable on host system
- **Plan Tests:**
  - `tests_infra/build_test.ts` (Verify specific binary outputs exist)

#### 10.4. GitHub Actions CI Enablement Guide

- **Action**: Document the setup process for enabling and maintaining the ExoFrame CI pipeline on GitHub.
- **Guideline**:
  1. **Permissions**: Go to Repo Settings -> Actions -> General. Ensure "Allow all actions and reusable workflows" is selected. Set "Workflow permissions" to "Read and write permissions" (required for the Release Pipeline to upload assets).
  2. **Branch Protection**: Go to Repo Settings -> Branches -> Add rule for `main`.
     - Enable "Require a pull request before merging".
     - Enable "Require status checks to pass before merging".
     - Search and add `PR Validation (ubuntu-latest)`, `PR Validation (macos-latest)`, `PR Validation (windows-latest)` as required checks.
  3. **Release configuration**: To trigger automated binary builds, create a new Release in GitHub and tag it. The `release-pipeline.yml` will automatically build and attach all 4 target binaries to the release.
  4. **Local setup**: Run `deno task hooks:install` to sync your local environment with the CI gates.
- **Success Criteria**:
  - [x] Guide is integrated into the Implementation Plan
  - [x] All 3 workflows are correctly triggered by their respective events
- **Plan Tests**:
  - [x] Manual verification of workflow triggers on repo configuration

### Step 10.5: Enhance `agents/` for Claude Agent Interaction ✅ COMPLETED

**Location:** `agents/providers/claude.md`, `agents/providers/claude-rag.md`, `agents/README.md`, `agents/cross-reference.md`

**Goal:** Improve the `agents/` folder structure and content to maximize interaction quality with Claude agents by providing explicit prompt templates, RAG usage guides, thinking protocols, and task-specific guidance that leverages Claude's 200k context window and tool-use capabilities.

**Success Criteria:**

1. [x] `agents/providers/claude.md` expanded with concrete, actionable prompt templates for different task types (TDD, refactoring, debugging, documentation)
2. [x] `agents/providers/claude-rag.md` created with retrieval-augmented generation (RAG) workflow documentation
3. [x] "Thinking Protocol" section added to guide Claude through complex multi-step tasks
4. [x] "Quick Start Guide for New Agent Docs" added to `agents/README.md` with step-by-step instructions and frontmatter template
5. [x] Tool-use best practices section added showing parallel reads, incremental updates, and efficient context gathering patterns
6. [x] Cross-reference map created (`agents/cross-reference.md`) mapping task types to primary/secondary agent docs
7. [x] "Common Pitfalls" section added with ExoFrame-specific anti-patterns and best practices
8. [x] Short summaries reviewed and optimized for conciseness (1-3 sentences max)

**Test Definitions:**

- Validation tests: `tests/agents/claude_enhancements_test.ts` to verify all new sections exist and contain required elements (canonical prompts, examples, code snippets)
- Integration tests (manual): Load enhanced Claude docs into Claude API and verify responses reference ExoFrame-specific patterns (e.g., `initTestDbService()`, TDD workflow, PathResolver usage)
- CI checks: Extend `validate-agent-docs` workflow to check for minimum section requirements in provider-specific docs

**Enhancement Details:**

#### 1. Enhanced Claude-Specific Prompt Templates (HIGH PRIORITY)

**File:** `agents/providers/claude.md`

**Action:** Expand from minimal (16 lines) to comprehensive prompt templates:

- **System prompts** for different task types:
  - **TDD workflow**: "You are a test-driven development assistant for ExoFrame. Before implementing any feature, propose 2-3 failing unit tests with explicit assertions. Use `initTestDbService()` or `createCliTestContext()` for test setup. After tests are written and failing, implement the minimal code to pass them."
  - **Refactoring**: "You are a refactoring assistant. Before changing code, read the existing implementation and all related tests. Propose refactoring steps that preserve behavior (proven by unchanged test results). Use `deno test --coverage` to verify coverage is maintained."
  - **Debugging**: "You are a debugging assistant. Start by reading error messages, stack traces, and the Implementation Plan step. Identify the root cause before proposing fixes. Suggest a test that reproduces the bug, then fix it."
  - **Documentation**: "You are a documentation assistant. Check the Implementation Plan for the related step. Maintain version sync, update cross-references, and include a short summary of changes with required tests."

- **Few-shot examples** showing ideal responses:
  ````markdown
  **Example: TDD Test Proposal**

  User: "Add error handling for missing config files in ConfigLoader"

  Claude response:
  <thinking>
  The ConfigLoader needs to handle missing files gracefully. I'll propose tests first, then implement.

  Tests needed:

  1. Missing file returns default config
  2. Invalid TOML format throws clear error
  3. Partial config merges with defaults
     </thinking>

  Here are 3 failing tests:

  ```typescript
  import { assertEquals, assertRejects } from "https://deno.land/std@0.203.0/assert/mod.ts";
  import { ConfigLoader } from "../src/config/loader.ts";
  import { createCliTestContext } from "./helpers/test_context.ts";

  Deno.test("ConfigLoader: missing file returns default config", async () => {
    const { tempDir, cleanup } = await createCliTestContext();
    try {
      const loader = new ConfigLoader(join(tempDir, "nonexistent.toml"));
      const cfg = await loader.load();
      assertEquals(cfg.mode, "sandboxed"); // default mode
    } finally {
      await cleanup();
    }
  });

  Deno.test("ConfigLoader: invalid TOML throws clear error", async () => {
    const { tempDir, cleanup } = await createCliTestContext();
    try {
      await Deno.writeTextFile(join(tempDir, "bad.toml"), "mode = [[[invalid");
      const loader = new ConfigLoader(join(tempDir, "bad.toml"));
      await assertRejects(
        () => loader.load(),
        Error,
        "Invalid TOML syntax",
      );
    } finally {
      await cleanup();
    }
  });
  ```
  ````

  Now run these tests (they should fail), then I'll implement the error handling.
  ```
  ```

- **Thinking budget hints**: Guide Claude to use `<thinking>` tags for complex planning before tool invocations
- **Token budget strategies**: "With 200k context, include up to 4-6 relevant chunk files from `agents/chunks/` for high-confidence guidance"

**Success Criteria:**

- [x] At least 4 task-type system prompts added
- [x] At least 2 few-shot examples included
- [x] Thinking protocol guidance added
- [x] Token budget strategies documented

#### 2. RAG Usage Guide (HIGH PRIORITY)

**File:** `agents/providers/claude-rag.md` (new)

**Action:** Create comprehensive retrieval-augmented generation guide:

````markdown
---
agent: claude
scope: dev
title: Claude RAG (Retrieval-Augmented Generation) Usage Guide
short_summary: "How to use embeddings infrastructure for semantic search and context injection with Claude."
version: "0.1"
topics: ["rag", "embeddings", "context-injection", "semantic-search"]
---

# Claude RAG Usage Guide

## Overview

ExoFrame pre-computes embeddings for all agent documentation, enabling semantic search and automatic context injection for Claude-powered workflows.

## Workflow

1. **Generate query embedding** for user's task (or use mock vector)
2. **Rank chunks** by cosine similarity
3. **Inject top 4-6 chunks** into Claude system prompt (within 200k token budget)

## Tools

### Inspect Embeddings

Find best matching chunks for a query:

```bash
deno run --allow-read scripts/inspect_embeddings.ts --query "test database setup" --top 5
```
````

Output: ranked list of `agents/chunks/*.txt` files with cosine similarity scores.

### Automatic Context Injection

```typescript
import { inject } from "./scripts/inject_agent_context.ts";

const context = await inject("claude", "fix async test flake", 4);
if (context.found) {
  const systemPrompt = `${context.short_summary}\n\nRelevant docs:\n${context.snippet}`;
  // Pass systemPrompt to Claude API
}
```

## Token Budget Strategies

- **Claude 3.5 Sonnet**: 200k context window
- **Recommended**: 4-6 chunks (~2-3k tokens) for high-confidence tasks
- **Maximum**: 10-12 chunks (~5-6k tokens) for complex multi-file refactoring

## Semantic Search Quality

The mock embeddings use SHA-256-based deterministic vectors (64-dim). For production:

1. Generate OpenAI embeddings: `deno run --allow-read --allow-write --allow-net --allow-env scripts/build_agents_embeddings.ts --mode openai`
2. Or use precomputed embeddings: Place JSON files in `agents/embeddings/` following `precomputed_template.json` format

## Example: Multi-Step Task with RAG

```typescript
// 1. User query: "Add security tests for PathResolver"
const query = "security tests PathResolver";

// 2. Retrieve relevant chunks
const context = await inject("claude", query, 6);

// 3. Build system prompt
const systemPrompt = `
You are a security-focused test developer for ExoFrame.

Relevant context:
${context.short_summary}

Key patterns from docs:
${context.snippet}

Task: Propose 3 security tests for PathResolver that check:
- Path traversal attacks (../)
- Symlink escape attempts
- Absolute path handling
`;

// 4. Call Claude API with context
const response = await claude.complete(systemPrompt, userMessage);
```

## Best Practices

- **Pre-filter by agent/scope**: Search only `agent: claude` and `scope: dev` docs for dev tasks
- **Combine chunks intelligently**: Group related chunks (e.g., all testing.md chunks together)
- **Validate freshness**: Run `scripts/verify_manifest_fresh.ts` before retrieval to ensure embeddings match current docs

````
**Success Criteria:**
- [x] RAG workflow documented with code examples
- [x] Token budget strategies explained
- [x] Semantic search quality guidance added
- [x] Multi-step example included

#### 3. Thinking Protocol for Complex Tasks (MEDIUM PRIORITY)

**File:** `agents/providers/claude.md` (append section)

**Action:** Add explicit thinking protocol:

```markdown
### Thinking Protocol for Complex Tasks

Claude excels when given space to plan before acting. For multi-step work:

1. **Analyze** dependencies and risks in `<thinking>` tags
2. **Plan** tool calls (read files, search patterns, check tests)
3. **Execute** tool calls in parallel where possible
4. **Synthesize** results and propose next steps
5. **Verify** against Implementation Plan success criteria

**Example: Multi-file refactoring**

<thinking>
User wants to extract database initialization logic into a shared helper.

Dependencies:
- Read all files that call initTestDbService()
- Check if a shared helper already exists
- Verify test coverage won't drop

Risks:
- Breaking existing tests if import paths change
- Circular dependencies if helper is in wrong location

Plan:
1. Parallel reads: grep for "initTestDbService", read test helpers
2. Propose new helper location (tests/helpers/db.ts)
3. Show migration for 2-3 representative files
4. Verify tests still pass
</thinking>

[tool calls for reading files, then implementation]
````

**Success Criteria:**

- [x] Thinking protocol with 5-step framework added
- [x] Multi-file refactoring example included

#### 4. Quick Start Guide for New Agent Docs (MEDIUM PRIORITY)

**File:** `agents/README.md` (append section)

**Action:** Add step-by-step guide:

````markdown
## How to Add a New Agent Doc

1. **Create file** in appropriate subfolder:
   - `source/` — source code development guidance
   - `tests/` — testing patterns and helpers
   - `docs/` — documentation maintenance
   - `providers/` — provider-specific adaptations

2. **Add frontmatter** with required fields:
   ```yaml
   ---
   agent: claude  # or copilot, openai, google, general
   scope: dev     # or ci, docs, test
   title: "Your Title Here"
   short_summary: "One-liner description (1-3 sentences max, <200 chars)"
   version: "0.1"
   topics: ["keyword1", "keyword2", "keyword3"]
   ---
   ```
````

3. **Include required sections**:
   - **Key points** — bullet list of 3-5 critical takeaways
   - **Canonical prompt (short)** — example system prompt showing ideal usage
   - **Examples** — 2-3 example prompts with expected responses
   - **Do / Don't** — guidance on safe/unsafe patterns

4. **Regenerate manifest**:
   ```bash
   deno run --allow-read --allow-write scripts/build_agents_index.ts
   ```

5. **Build embeddings** (optional but recommended):
   ```bash
   # Mock embeddings (deterministic, no API calls)
   deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock

   # Or OpenAI embeddings (requires API key)
   deno run --allow-read --allow-write --allow-net --allow-env scripts/build_agents_embeddings.ts --mode openai
   ```

6. **Validate**:
   ```bash
   deno run --allow-read scripts/validate_agents_docs.ts
   ```

7. **Test retrieval**:
   ```bash
   deno run --allow-read scripts/inject_agent_context.ts --query "your test query" --agent claude
   ```

**Template file**: Copy `agents/providers/claude.md` as starting point.

**Common mistakes**:

- Missing `short_summary` or making it too long (>200 chars)
- Forgetting to add topics array
- Not including canonical prompt example
- Skipping manifest regeneration (doc won't be discoverable)

````
**Success Criteria:**
- [x] 7-step guide added to README.md
- [x] Frontmatter template included
- [x] Common mistakes section added

#### 5. Tool-Use Best Practices (MEDIUM PRIORITY)

**File:** `agents/providers/claude.md` (append section)

**Action:** Add efficient tool-use patterns:

```markdown
### Tool-Use Patterns for Claude

**Parallel reads** when gathering context:

✅ **Good: Read multiple files in parallel**
```xml
<antml_function_calls>
<antml_invoke name="read_file">
<antml_parameter name="filePath">src/services/plan_writer.ts</antml_parameter>
<antml_parameter name="startLine">1</antml_parameter>
<antml_parameter name="endLine">100</antml_parameter>
</antml_invoke>
<antml_invoke name="read_file">
<antml_parameter name="filePath">tests/plan_writer_test.ts</antml_parameter>
<antml_parameter name="startLine">1</antml_parameter>
<antml_parameter name="endLine">100</antml_parameter>
</antml_invoke>
<antml_invoke name="grep_search">
<antml_parameter name="query">PlanWriter</antml_parameter>
<antml_parameter name="isRegexp">false</antml_parameter>
</antml_invoke>
</antml_function_calls>
````

❌ **Avoid: Sequential reads** (read file 1, wait for result, then read file 2)

**Incremental updates** for multi-step tasks:

```markdown
Use `manage_todo_list` to track progress:

- Mark tasks in-progress before starting
- Complete immediately after finishing each step
- Provide status updates between major operations
```

**Efficient context gathering**:

```markdown
1. Parallelize independent searches (grep + file_search + semantic_search)
2. Read results, deduplicate file paths
3. Batch read unique files in one parallel call
4. Synthesize and proceed with implementation
```

**Success Criteria:**

- [x] Parallel read pattern documented with code example
- [x] Sequential anti-pattern shown
- [x] Incremental update guidance added
- [x] Efficient context gathering workflow included

#### 6. Cross-Reference Map (LOW PRIORITY)

**File:** `agents/cross-reference.md` (new)

**Action:** Create task-to-doc mapping:

```markdown
---
agent: general
scope: dev
title: Agent Documentation Cross-Reference Map
short_summary: "Quick reference mapping task types to relevant agent documentation files."
version: "0.1"
topics: ["navigation", "quick-reference", "task-mapping"]
---

# Agent Documentation Cross-Reference Map

## Task → Agent Doc Quick Reference

| Task Type                | Primary Doc                                                                     | Secondary Docs                                                 |
| ------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Write unit tests         | [tests/testing.md](tests/testing.md)                                            | [source/exoframe.md](source/exoframe.md)                       |
| Refactor code            | [source/exoframe.md](source/exoframe.md)                                        | [tests/testing.md](tests/testing.md)                           |
| Update documentation     | [docs/documentation.md](docs/documentation.md)                                  | -                                                              |
| Fix TypeScript errors    | [source/exoframe.md](source/exoframe.md)                                        | [copilot/exoframe.md](copilot/exoframe.md)                     |
| Add new feature          | [source/exoframe.md](source/exoframe.md) + [tests/testing.md](tests/testing.md) | [docs/documentation.md](docs/documentation.md)                 |
| Debug test failures      | [tests/testing.md](tests/testing.md)                                            | [source/exoframe.md](source/exoframe.md)                       |
| Security audit           | [tests/testing.md](tests/testing.md) (#Security Tests)                          | [source/exoframe.md](source/exoframe.md) (#System Constraints) |
| Claude-specific guidance | [providers/claude.md](providers/claude.md)                                      | [README.md](README.md)                                         |
| RAG/embeddings usage     | [providers/claude-rag.md](providers/claude-rag.md)                              | [README.md](README.md) (#Building embeddings)                  |

## Search by Topic

- **`tdd`** → [source/exoframe.md](source/exoframe.md), [tests/testing.md](tests/testing.md)
- **`security`** → [tests/testing.md](tests/testing.md) (Security Tests as First-Class Citizens)
- **`database`** → [tests/testing.md](tests/testing.md) (Database Initialization, initTestDbService)
- **`docs`** → [docs/documentation.md](docs/documentation.md)
- **`patterns`** → [source/exoframe.md](source/exoframe.md) (Service Pattern, Module Documentation)
- **`helpers`** → [tests/testing.md](tests/testing.md) (Test Organization, Helpers)
- **`embeddings`** → [providers/claude-rag.md](providers/claude-rag.md), [README.md](README.md)

## Workflow Examples

**"I want to add a new feature"**

1. Read [docs/ExoFrame_Implementation_Plan.md](../docs/ExoFrame_Implementation_Plan.md) to find or create Implementation Plan step
2. Follow TDD guidance from [source/exoframe.md](source/exoframe.md)
3. Use test helpers from [tests/testing.md](tests/testing.md)
4. Update docs per [docs/documentation.md](docs/documentation.md)

**"I want to fix a bug"**

1. Check Implementation Plan for related step
2. Write failing test per [tests/testing.md](tests/testing.md)
3. Fix code following [source/exoframe.md](source/exoframe.md) patterns
4. Verify coverage maintained

**"I want to use Claude effectively"**

1. Read [providers/claude.md](providers/claude.md) for prompt templates
2. Use [providers/claude-rag.md](providers/claude-rag.md) for context injection
3. Follow tool-use patterns (parallel reads, thinking protocol)
```

**Success Criteria:**

- [ ] Cross-reference table created with 8+ task types
- [ ] Topic search section added
- [ ] Workflow examples included

#### 7. Common Pitfalls Section (LOW PRIORITY)

**File:** `agents/providers/claude.md` (append section)

**Action:** Add ExoFrame-specific anti-patterns:

```markdown
### Common Pitfalls with ExoFrame

1. **Forgetting cleanup in tests**
   - ❌ Bad: `const { db, tempDir, cleanup } = await initTestDbService(); // no cleanup`
   - ✅ Good: Use `try/finally` or `afterEach` to always call `cleanup()`

2. **Not checking Implementation Plan**
   - ❌ Bad: Implement features without corresponding Plan step
   - ✅ Good: Read Plan first, create step if missing, then implement

3. **Skipping TDD workflow**
   - ❌ Bad: Write implementation first, add tests later (or never)
   - ✅ Good: Write failing tests FIRST, then implement minimal code to pass

4. **Ignoring security patterns**
   - ❌ Bad: `const filePath = userInput; await Deno.readTextFile(filePath);`
   - ✅ Good: `const filePath = pathResolver.resolve(userInput); // validates against Portal permissions`

5. **Hardcoding paths**
  - ❌ Bad: `"/home/user/ExoFrame/.exo/Active"`
  - ✅ Good: `join(workspaceRoot, ".exo", "Active")` (use PathResolver)

6. **Missing activity logging**
   - ❌ Bad: Side effects (file writes, executions) without EventLogger calls
   - ✅ Good: `await eventLogger.log({ type: "file_write", path, ... })`

7. **Using deprecated Deno APIs**
   - ❌ Bad: `Deno.run({ cmd: ["deno", "test"] })`
   - ✅ Good: `new Deno.Command("deno", { args: ["test"] }).output()`

8. **Not validating frontmatter**
   - ❌ Bad: Manually parse YAML without schema validation
   - ✅ Good: Use Zod schemas from `src/schemas/` for all YAML frontmatter
```

**Success Criteria:**

- [x] At least 8 common pitfalls documented
- [x] Each pitfall includes ❌ Bad and ✅ Good examples
- [x] Code snippets are ExoFrame-specific (not generic advice)

#### 8. Short Summary Optimization (LOW PRIORITY)

**Action:** Review and shorten verbose `short_summary` fields:

**Before:**

```yaml
short_summary: "Guidance for producing and maintaining docs in the docs/ directory and cross-referencing the Implementation Plan."
```

**After:**

```yaml
short_summary: "How to maintain docs/ and sync with Implementation Plan. Includes Refinement Loop, version control, terminology."
```

**Files to review:**

- `agents/docs/documentation.md`
- `agents/source/exoframe.md`
- `agents/tests/testing.md`
- `agents/README.md`

**Success Criteria:**

- [ ] All `short_summary` fields are ≤200 characters
- [ ] Summaries are concise (1-3 sentences) but informative
- [ ] Key topics mentioned explicitly

**Plan Tests:**

- Unit tests: `tests/agents/claude_enhancements_test.ts`
  ```typescript
  Deno.test("Claude enhancements: verify all sections exist", async () => {
    const claudeMd = await Deno.readTextFile("agents/providers/claude.md");
    assert(claudeMd.includes("### Tool-Use Patterns for Claude"));
    assert(claudeMd.includes("### Thinking Protocol for Complex Tasks"));
    assert(claudeMd.includes("### Common Pitfalls with ExoFrame"));

    const ragMd = await Deno.readTextFile("agents/providers/claude-rag.md");
    assert(ragMd.includes("## Workflow"));
    assert(ragMd.includes("## Token Budget Strategies"));

    const readmeMd = await Deno.readTextFile("agents/README.md");
    assert(readmeMd.includes("## How to Add a New Agent Doc"));

    const crossRefMd = await Deno.readTextFile("agents/cross-reference.md");
    assert(crossRefMd.includes("## Task → Agent Doc Quick Reference"));
  });

  Deno.test("Claude enhancements: verify frontmatter schema", async () => {
    const ragMd = await Deno.readTextFile("agents/providers/claude-rag.md");
    const fmMatch = ragMd.match(/^---\n([\s\S]*?)\n---/);
    assertExists(fmMatch);

    const fm = parse(fmMatch[1]) as Record<string, unknown>;
    assertEquals(fm.agent, "claude");
    assertEquals(fm.scope, "dev");
    assert(fm.short_summary);
    assert((fm.short_summary as string).length <= 200);
  });
  ```

- Integration tests (manual):
  1. Load `agents/providers/claude.md` content into Claude API
  2. Ask: "Write tests for ConfigLoader error handling"
  3. Verify response includes `initTestDbService()`, TDD workflow, and follows few-shot example pattern
  4. Ask: "How do I use embeddings for context injection?"
  5. Verify response references `claude-rag.md` and includes `inspect_embeddings.ts` usage

- CI checks: Extend `.github/workflows/validate-agent-docs.yml`
  ```yaml
  - name: Validate Claude enhancements
    run: |
      deno test --allow-read tests/agents/claude_enhancements_test.ts
      deno run --allow-read scripts/validate_agents_docs.ts
  ```

**Success Criteria:**

1. [x] `agents/providers/claude.md` expanded with 4+ task-type prompts, 2+ few-shot examples, thinking protocol, token strategies
2. [x] `agents/providers/claude-rag.md` created with RAG workflow, tools usage, token budget strategies, multi-step example
3. [x] "Thinking Protocol" section added to `claude.md` with 5-step framework and refactoring example
4. [x] "Quick Start Guide" added to `agents/README.md` with 7-step process and frontmatter template
5. [x] Tool-use best practices added to `claude.md` (parallel reads, incremental updates, context gathering)
6. [x] `agents/cross-reference.md` created with task mapping table, topic search, workflow examples
7. [x] "Common Pitfalls" section added to `claude.md` with 8+ ExoFrame-specific anti-patterns
8. [x] All `short_summary` fields optimized to ≤200 chars
9. [x] Unit tests pass (`tests/agents/claude_enhancements_test.ts`) - 12/12 tests passing
10. [x] CI validation includes Claude enhancement checks (validate_agents_docs.ts passes)

**Notes:**

- This step enhances developer experience with Claude agents by providing explicit, actionable guidance
- RAG infrastructure enables semantic search and automatic context injection (leverages existing embeddings system)
- Thinking protocol guides Claude through complex multi-step refactoring/debugging tasks
- Cross-reference map reduces discovery friction for new contributors
- All enhancements follow existing `agents/` frontmatter schema and validation rules

### Step 10.6: Enhance `agents/` for OpenAI Agent Interaction ✅ COMPLETED

**Location:** `agents/providers/openai.md`, `agents/providers/openai-rag.md` (new), `agents/prompts/openai-*.md` (new), `agents/cross-reference.md`, `tests/agents/openai_enhancements_test.ts` (new)

**Goal:** Improve the `agents/` folder to maximize _regular usage_ and _effectiveness_ for OpenAI agents (junior → senior) by making “use agents/ first” the default path, with copy/paste prompt templates, predictable RAG workflows, and tool-use guardrails tuned to the gpt-4o family.

**Design Constraints (from `agents/README.md`):**

- All new/updated agent docs MUST have valid YAML frontmatter and required sections.
- Required sections: **Key points**, **Canonical prompt (short)**, **Examples**. Recommended: **Do / Don't**.
- After edits under `agents/`: rebuild manifest/chunks, rebuild embeddings (mock or openai), then validate.

**Success Criteria:**

1. [x] `agents/providers/openai.md` expanded to include **Key points**, **Canonical prompt**, **Examples**, and **Do / Don't** in addition to OpenAI-specific guidance
2. [x] OpenAI doc includes 4 task-type prompt patterns (TDD, refactoring, debugging, documentation) mirroring Step 10.5’s “task-type system prompts” approach
3. [x] Clear “pit of success” RAG workflow documented for OpenAI: retrieve → plan → patch → verify, with chunk count guidance (2–3 simple, 4–6 standard, 8–10 complex)
4. [x] New `agents/providers/openai-rag.md` created with tool-centric recipes (`inject_agent_context.ts`, `inspect_embeddings.ts`, embeddings modes)
5. [x] New OpenAI prompt templates added under `agents/prompts/` (at least 4):
   - openai-quickstart.md (diff-first + budgets)
   - openai-rag-context-injection.md (inspect → inject)
   - openai-tdd-workflow.md (tests-first + assertions)
   - openai-debugging-systematic.md (repro → isolate → fix → test)
6. [x] `agents/prompts/README.md` updated to include the new OpenAI templates and when to use them
7. [x] `agents/cross-reference.md` updated so OpenAI users can find the “right doc first” (task → doc mapping + topic search entries)
8. [x] All OpenAI-related `short_summary` fields are ≤200 chars and topics are populated (improves retrieval quality)
9. [x] Unit tests added (`tests/agents/openai_enhancements_test.ts`) to enforce required sections, frontmatter compliance, and summary limits
10. [x] CI validation includes OpenAI enhancements via `deno task test` (runs the new OpenAI enhancement tests) plus `check:docs` (manifest freshness) and `validate_agents_docs.ts`

**Test Definitions:**

- Validation: `deno run --allow-read scripts/validate_agents_docs.ts`
- Manifest/chunks: `deno run --allow-read --allow-write scripts/build_agents_index.ts`
- Embeddings (mock baseline): `deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock`
- Unit tests: `deno test --allow-read tests/agents/openai_enhancements_test.ts`
- Retrieval sanity (manual): `deno run --allow-read scripts/inject_agent_context.ts openai "openai rag context injection" 6` returns OpenAI docs and templates

**Enhancement Details:**

#### 1. OpenAI Provider Guide: Copy/Paste First (HIGH PRIORITY)

- Expand `agents/providers/openai.md` so the first screen is actionable:
  - A canonical system prompt that _requires_ retrieval from `agents/` and requires citing doc paths used
  - Explicit budgets (simple/standard/complex) and an instruction to trim output if over budget
  - A “stop and ask” rule when context is missing or ambiguous requirements exist

#### 2. OpenAI RAG Usage Guide (HIGH PRIORITY)

- Create `agents/providers/openai-rag.md` with:
  - Inspect-first workflow (`inspect_embeddings.ts`) then inject (`inject_agent_context.ts`)
  - Chunk-count guidance by task complexity
  - Freshness contract: if docs changed, rebuild manifest/chunks/embeddings then retry
  - Guidance for `--mode mock` vs `--mode openai` embeddings

#### 3. Multi-Level Prompts (MEDIUM PRIORITY)

- Add examples for junior/mid/senior prompts, each with:
  - An explicit budget
  - Required output format (diff-first, apply_patch-ready)
  - Required citations (which agent docs were used)

#### 4. Tool-Use Guardrails (MEDIUM PRIORITY)

- Document OpenAI-specific guardrails (in `openai.md` + templates):
  - Prefer minimal diffs; separate multi-file changes
  - Ask 1–3 clarifying questions if requirements are ambiguous
  - Always end with verification steps (tests/lint) and residual risks

#### 5. Discovery: Cross-Reference + Prompts Library (LOW PRIORITY)

- Update `agents/cross-reference.md` with OpenAI mapping rows and topics
- Add OpenAI templates to `agents/prompts/` to make the “right way” the fastest way

#### 6. Enforcement: Tests + CI (LOW PRIORITY)

- Add `tests/agents/openai_enhancements_test.ts` matching the style of the Claude enhancement tests
- Update CI so drift and section regression fails fast

### Step 10.7: Enhance `agents/` for Google (Gemini) Agent Interaction ✅ COMPLETED

**Location:** `agents/providers/google.md`, `agents/providers/google-long-context.md` (new), `agents/prompts/google-*.md` (new), `agents/cross-reference.md`, `tests/agents/google_enhancements_test.ts` (new)

**Goal:** Improve the `agents/` folder to maximize interaction quality with Google (Gemini) agents by leveraging Gemini's massive (1M-2M) context window, providing long-context reasoning protocols, and establishing "whole-module" injection patterns that complement the existing RAG-based retrieval.

**Success Criteria:**

1. [x] `agents/providers/google.md` expanded with Gemini-optimized system prompts, parallel function calling patterns, and multimodal guidance
2. [x] New `agents/providers/google-long-context.md` created, documenting the "Full-Context Injection" strategy (injecting entire documentation sets for complex reasoning)
3. [x] Gemini-specific thinking protocol added, focusing on long-context synthesis and cross-file reasoning
4. [x] Google-specific prompt templates added under `agents/prompts/` (at least 3):
   - `google-quickstart.md` (Native long-context + broad reasoning)
   - `google-tdd-workflow.md` (Exhaustive test coverage + multi-file impact analysis)
5. [x] `agents/cross-reference.md` updated with Google/Gemini mapping, highlighting long-context advantages
6. [x] "Common Pitfalls" section updated with Gemini-specific considerations (e.g., "lost in the middle" mitigation, instruction following for specific output formats)
7. [x] Unit tests added (`tests/agents/google_enhancements_test.ts`) to ensure frontmatter compliance, required section presence, and summary length
8. [x] CI validation includes Google enhancements via `deno task test` and `validate_agents_docs.ts`

**Test Definitions:**

- **Validation Tests**: `tests/agents/google_enhancements_test.ts` will verify:
  - All Google-specific files have valid YAML frontmatter.
  - Required sections (Key points, Canonical prompt, Examples) are present in the provider docs.
  - Short summaries in Google docs are ≤ 200 characters.
  - Prompt templates are correctly associated with the `google` agent.
- **Structural Tests**: `scripts/validate_agents_docs.ts` must pass for all new files.
- **Retrieval Sanity**: Verify that `inject_agent_context.ts google "long context"` retrieves the `google-long-context.md` file and relevant guidance.

**Enhancement Details:**

#### 1. Gemini Provider Guide: Leveraging Scale (HIGH PRIORITY)

- **Native Long-Context**: Unlike RAG-constrained providers, Gemini can ingest the entire `agents/` directory if needed.
- **System instructions**: Optimization for "Long-Chain Reasoning" where the agent analyzes the broad architecture before proposing local changes.
- **Parallel Function Calling**: Documenting how to structure multiple tool calls in a single turn for faster execution.

#### 2. Long-Context Thinking Protocol (HIGH PRIORITY)

- **Saturate**: Instructions to load ALL relevant primary and secondary docs for the task.
- **Synthesize**: Analysis of how the change affects the entire system, not just the local file.
- **Exhaustive Planning**: Leveraging the large window to brainstorm 5+ alternatives before picking the optimal path.

#### 3. Task-Specific Gemini Prompts (MEDIUM PRIORITY)

- **TDD (Broad View)**: "Analyze all existing test helpers and documentation before proposing tests. Ensure the new tests match the repository's physical laws."
- **Refactoring (Global Impact)**: "Identify all occurrences of [pattern] across the provided context. Propose a plan that updates all callsites consistently."

#### 4. Retrieval Strategy for Gemini (MEDIUM PRIORITY)

- **RAG-as-a-Filter**: Use semantic search to identify _which_ modules to load in full, rather than just loading chunks.
- **Chunk Density**: Guidance on using 20+ chunks (or full docs) to provide maximum detail for reasoning.

### Step 10.8: Add Self-Improvement Loop for `agents/` Instructions (Claude + OpenAI + Google) ✅ COMPLETED

**Location:** `agents/process/self-improvement.md` (new, common), `agents/providers/{claude,openai,google}.md`, `agents/cross-reference.md`, `agents/prompts/self-improvement-loop.md` (new, common), `tests/agents/self_improvement_process_test.ts` (new)

**Goal:** Establish a repeatable “instruction adequacy check” that runs during real chat/task execution: the active agent must (1) confirm the current `agents/` instructions are sufficient to complete the user request safely and correctly, and (2) if not sufficient, plan + apply a minimal update to `agents/` that eliminates the missing guidance _as part of the same work_ (then rebuild/validate artifacts), without derailing the primary task.

**Design Constraints (from `agents/README.md`):**

- All new/updated agent docs MUST have valid YAML frontmatter and required sections.
- Required sections: **Key points**, **Canonical prompt (short)**, **Examples**. Recommended: **Do / Don't**.
- After edits under `agents/`: rebuild manifest/chunks, rebuild embeddings (mock or openai), then validate.

**Success Criteria:**

1. [x] A provider-agnostic process doc exists: `agents/process/self-improvement.md` defining the self-improvement loop, when to trigger it, and how to keep doc updates minimal and grounded.
2. [x] A common prompt template exists: `agents/prompts/self-improvement-loop.md` that forces (a) adequacy check, (b) explicit gaps list, (c) doc patch plan, (d) execution plan, (e) verification.
3. [x] Provider docs (`claude.md`, `openai.md`, `google.md`) each include a short “Self-improvement loop” section that:
   - references the common process doc,
   - clarifies provider-specific implementation details (e.g., Claude thinking protocol, OpenAI diff-first output contract, Gemini long-context saturation).
4. [x] Discovery surfaces include the process:
   - `agents/cross-reference.md` includes a row/topic mapping for “instruction gaps / self-improvement loop”.
   - `agents/prompts/README.md` lists the new template and when to use it.
5. [x] Enforcement tests exist and pass: `tests/agents/self_improvement_process_test.ts` ensures the process doc/template exist, have required sections/frontmatter, and that each provider doc references the process.

**Process Definition (to be captured in the common doc):**

- **Trigger:** Before any non-trivial change (multi-file code edits, new feature, refactor, debugging session, doc updates) the agent performs an **Instruction Adequacy Check**:
  1. Identify the task type (TDD/refactor/debug/docs/CI/etc).
  2. Retrieve relevant agent docs (cross-reference + provider guide + any domain docs).
  3. Answer: “Do the current docs contain enough concrete, ExoFrame-specific guidance to execute safely and verify?”

- **If adequate:** Proceed with the task using the existing provider workflow (retrieve → plan → diff/patch → verify).

- **If not adequate:** Execute a **Doc Patch Loop** (minimal, targeted):
  1. List missing guidance as actionable gaps (e.g., missing test helper, missing CLI command pattern, missing schema expectation).
  2. Propose the smallest doc update(s) that close the gap (new section, new example, new prompt template, or cross-reference row).
  3. Apply the doc patch during the task (only changes directly relevant to the current request).
  4. Rebuild `agents/manifest.json` + `agents/chunks/` and (mock) embeddings; run `validate_agents_docs.ts`.
  5. Add/update a regression test that prevents the same gap from reappearing.
  6. Continue the primary task with the improved instructions.

- **Guardrails:**
  - Keep doc updates **minimal and task-scoped**; avoid speculative “nice-to-have” content.
  - If requirements are ambiguous, ask 1–3 clarifying questions before making doc changes.
  - Prefer adding examples/checklists over long prose; optimize for retrieval.

**Test Definitions:**

- Validation: `deno run --allow-read scripts/validate_agents_docs.ts`
- Manifest/chunks: `deno run --allow-read --allow-write scripts/build_agents_index.ts` + `deno run --allow-read scripts/verify_manifest_fresh.ts`
- Embeddings (mock baseline): `deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock`
- Unit tests: `deno test --allow-read tests/agents/self_improvement_process_test.ts`

**Enhancement Details:**

#### 1. Common Self-Improvement Process Doc (HIGH PRIORITY)

- Create `agents/process/self-improvement.md` (agent: `general`) with:
  - A concrete checklist for adequacy assessment
  - A “gap taxonomy” (missing examples, missing commands, missing invariants, missing tests, missing safety constraints)
  - A minimal template for doc patches (what to add, where, and how to validate)

#### 2. Common Prompt Template (HIGH PRIORITY)

- Create `agents/prompts/self-improvement-loop.md` that enforces output structure:
  - Used docs (paths)
  - Instruction adequacy verdict
  - Gaps list
  - Doc patch plan (files to edit)
  - Primary task plan
  - Verification steps

#### 3. Provider Integration (MEDIUM PRIORITY)

- Update:
  - `agents/providers/claude.md` to integrate with Claude thinking protocol + parallel reads.
  - `agents/providers/openai.md` to integrate with OpenAI diff-first contract + ask-when-ambiguous rule.
  - `agents/providers/google.md` to integrate with Gemini long-context saturation + parallel tool calls.

#### 4. Discovery + Enforcement (LOW PRIORITY)

- Add a cross-reference row/topic for “self-improvement loop”.
- Add a prompts README entry for the new template.
- Add `tests/agents/self_improvement_process_test.ts` mirroring the Claude/OpenAI/Google enhancement test style.
