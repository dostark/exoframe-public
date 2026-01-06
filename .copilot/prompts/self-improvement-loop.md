---
agent: general
scope: dev
title: Self-improvement loop prompt template
short_summary: "Copy/paste prompt to detect instruction gaps and patch agents/ docs during execution (then rebuild/validate) before continuing."
version: "0.1"
topics: ["self-improvement", "prompt-template", "instruction-adequacy", "maintenance"]
---

# Self-improvement loop (prompt template)

Key points
- Use this when you suspect the current `agents/` instructions are insufficient for the active task.
- It forces: adequacy verdict → gaps list → minimal doc patch → rebuild/validate → resume.
- Keep the doc patch tightly scoped to the user’s request.

Canonical prompt (short)
"Run an Instruction Adequacy Check against agents/ for this task. If guidance is missing, propose and apply the smallest update to agents/ docs/templates/cross-reference to close the gap, then rebuild manifest/chunks/embeddings and validate agent docs before continuing the primary task."

## Template

You are working on ExoFrame.

1) Instruction Adequacy Check
- Task type: (TDD/refactor/debug/docs/etc)
- Active provider: (Claude/OpenAI/Google)
- Docs consulted (paths):
- Verdict: Adequate / Inadequate
- If inadequate: list 1–5 concrete gaps.

2) Doc Patch Loop (only if inadequate)
- Files to update under `agents/`:
- Minimal changes to make (bullets):
- Regeneration + validation commands to run:
  - `deno run --allow-read --allow-write scripts/build_agents_index.ts`
  - `deno run --allow-read scripts/verify_manifest_fresh.ts`
  - `deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock`
  - `deno run --allow-read scripts/validate_agents_docs.ts`
- Enforcement test to add/update (if applicable):

3) Primary task execution
- Files to touch:
- Plan (3–6 bullets):
- Diffs (minimal, file-scoped):
- Verification:

Do / Don’t
- ✅ Do ask 1–3 clarifying questions if requirements are ambiguous.
- ✅ Do keep doc changes minimal and directly tied to the current request.
- ✅ Do cite which `agents/` docs informed decisions.
- ❌ Don’t broaden scope into unrelated doc refactors.

Examples

- Example usage
  - “Use this template. My task is: add a new CLI command that writes to Workspace/Active. I’m using OpenAI. Ensure agents/ has sufficient guidance; if not, patch it (minimal) and rebuild/validate before coding.”
