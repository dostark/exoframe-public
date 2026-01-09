---
agent: copilot
scope: dev
title: ExoFrame Source Development Guidelines
short_summary: "Guidance for developing ExoFrame source code: TDD-first, patterns, project structure, and best practices."
version: "0.1"
topics: ["source","development","tdd","patterns"]
---

# ExoFrame Source Development Guidelines

Key points
- Strict TDD-first approach: write failing tests before implementation
- Follow step-specific Success Criteria in `docs/ExoFrame_Implementation_Plan.md`
- Keep Problems tab clean: fix TypeScript errors and linter issues before marking a step complete

Canonical prompt (short):
"You are a repository-aware coding assistant for ExoFrame. Consult `.copilot/manifest.json` and include the `short_summary` for relevant docs before replying. Follow the TDD-first workflow: suggest tests first, implement minimal code, and add verification steps."

Examples
- "Add unit tests for a service's error handling and implement the minimal change to pass them."
- "Refactor module X to reduce duplication while keeping behavior unchanged; provide tests demonstrating equivalence."

Do / Don't
- ✅ Do follow TDD and verify Success Criteria
- ✅ Do add module-level documentation and file headers
- ❌ Don't proceed with implementation if no refined Implementation Plan step exists

Examples section
- Example prompt: "You are an engineer. Propose a set of failing tests that validate behavior X. Output JSON with test names and assertions."

## Full migration: Source guidelines (extended)

### Project Structure

- `src/ai/` — AI/LLM provider implementations
- `src/cli/` — CLI command implementations
- `src/config/` — Configuration schemas and loaders
- `src/parsers/` — File parsers (frontmatter, etc.)
- `src/schemas/` — Zod validation schemas
- `src/services/` — Core business logic services
- `src/main.ts` — Application entry point

### Module Documentation

Always include file-level documentation with responsibilities and the Implementation Plan step the module implements. Use clear section separators for large files, and include types/interfaces near the top.

### Type Definitions

Export types that consumers need and keep internal types private. Provide thorough JSDoc or TypeScript comments for public types.

### Configuration Schema

Use Zod for config validation and keep config options in `exo.config.toml` examples. Provide default values and bounds where possible.

### Service Pattern

Constructor-based DI: pass `config`, `db`, and `provider` into services. Keep side effects out of constructors where feasible.

### System Constraints & Patterns
- **Runtime Persistence**: The .exo/Active, Workspace/Requests, and Workspace/Plans folders are the "Database". Code must respect file-system atomicity (use `writeTextFile` with atomic renaming where possible).
- **Activity Journal**: All side-effects (file writes, executions, errors) MUST be logged to the Activity Journal (`.exo/journal.db`) via `EventLogger`.
- **Security Modes**:
    - **Sandboxed**: No network, no file access (default).
    - **Hybrid**: Read-only access to specific "Portal" paths.
    - **Note**: Always use `PathResolver` to validate paths before access.
- **MCP Enforcement**: In Hybrid mode, agents can read files directly but MUST use MCP tools for writes (to ensure auditability).

### Configuration Constants & Magic Numbers

**ALL magic numbers MUST be configurable constants** centralized in `src/config/constants.ts`. Never use hardcoded numeric literals in business logic.

**Requirements:**
- ✅ Extract ALL numeric literals > 1 into named constants
- ✅ Group related constants by module/feature in `constants.ts`
- ✅ Use descriptive names with `DEFAULT_` prefix
- ✅ Import and use constants instead of literals
- ✅ Update constants file when adding new configurable values

**Examples:**
```typescript
// ❌ BAD: Magic numbers in code
const timeout = 30000;
const maxRetries = 3;
const delay = Math.pow(2, attempt) * 100;

// ✅ GOOD: Configurable constants
import { DEFAULT_GIT_COMMAND_TIMEOUT_MS, DEFAULT_GIT_MAX_RETRIES, DEFAULT_GIT_RETRY_BACKOFF_BASE_MS } from "../config/constants.ts";

const timeout = DEFAULT_GIT_COMMAND_TIMEOUT_MS;
const maxRetries = DEFAULT_GIT_MAX_RETRIES;
const delay = Math.pow(2, attempt) * DEFAULT_GIT_RETRY_BACKOFF_BASE_MS;
```

**Constants File Structure:**
- Group constants by module/feature with clear section headers
- Include JSDoc comments explaining purpose and units
- Use consistent naming patterns
- Keep related constants together

---

```
