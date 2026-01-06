See `.copilot/embeddings/example_precomputed_template.json` for a minimal, valid template to create precomputed embedding files.

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