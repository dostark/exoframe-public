# EXOFRAME AGENT INSTRUCTIONS (docs) — (migrated)

This file has been migrated to `agents/docs/documentation.md` to provide a focused, machine-friendly location for documentation guidelines used by dev-time agents.

**DEPRECATION NOTICE:** The authoritative doc is `agents/docs/documentation.md`. This file will remain as a redirect for 3 months.

See: `agents/docs/documentation.md` for the full guidance.

## Core Documentation Patterns

### Pattern 1: The Refinement Loop

**Problem**: Initial implementation steps are always too brief and ambiguous.

**Solution**: Before implementing, explicitly request refinement of the plan.

**The Loop**:

1. **Identify** the next phase
2. **Request Refinement**: "Refine all steps in Phase X with success criteria, example inputs/outputs, error cases, and test requirements."
3. **Review**: Ensure success criteria are measurable
4. **Iterate** until the spec is implementation-ready

**Rule**: If you can't write clear success criteria, you're not ready to implement.

### Pattern 27: Documentation Cleanup Without Breaking History

**Practice**: Remove planning artifacts (like "Step 6.2" comments) from code once implemented. Keep history in git and planning docs.

**Rule**: Code should be clean and self-contained. Planning context belongs in the Implementation Plan, not in code comments.

## ⚠️ CRITICAL: Test-Driven Development & Implementation Plan

**All documentation changes MUST be coordinated with implementation work.**

Before modifying documentation:

1. **Check if a refined step exists** in `docs/ExoFrame_Implementation_Plan.md` for the
   related feature
2. **Update documentation alongside code changes** — never document unimplemented features
3. **Keep version numbers synchronized** across related documents
4. **Add TDD test cases** to the Implementation Plan when defining new behavior

**If documenting new functionality:**

- Ensure code is implemented and tested first
- Update the Implementation Plan step status to reflect completion
- Cross-reference related documents

---

## Document Directory Reference

### Core Architecture Documents

| Document                          | Purpose                                          | When to Update                                    |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| `ExoFrame_White_Paper.md`         | High-level vision, market positioning, use cases | Major feature additions, positioning changes      |
| `ExoFrame_Technical_Spec.md`      | Architecture, schemas, security model            | New components, API changes, schema modifications |
| `ExoFrame_Implementation_Plan.md` | Step-by-step build plan with TDD test cases      | Before/during any implementation work             |

### Development & Testing Documents

| Document                            | Purpose                                    | When to Update                               |
| ----------------------------------- | ------------------------------------------ | -------------------------------------------- |
| `ExoFrame_Testing_Strategy.md`      | Test pyramid, coverage targets, test types | New test categories, coverage policy changes |
| `ExoFrame_Manual_Test_Scenarios.md` | Pre-release manual QA scenarios            | New features requiring manual verification   |
| `Code_Coverage.md`                  | Current coverage status, commands          | After significant coverage changes           |
| `Coverage_Improvement_Plan.md`      | Modules below target, improvement actions  | When addressing coverage gaps                |

### Setup & Operations Documents

| Document                       | Purpose                                       | When to Update                                      |
| ------------------------------ | --------------------------------------------- | --------------------------------------------------- |
| `ExoFrame_Developer_Setup.md`  | Bootstrap local dev environment (Ubuntu/WSL2) | Dependency changes, new dev requirements            |
| `ExoFrame_Repository_Build.md` | Creating repo from scratch, GitHub setup      | Build process changes, new repository requirements  |
| `ExoFrame_User_Guide.md`       | End-user deployment, CLI usage, workflows     | New CLI commands, workflow changes, user-facing API |

### Reference & Historical Documents

| Document                      | Purpose                                           | When to Update                                     |
| ----------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| `Activity_Logging_Updates.md` | Implementation notes for activity logging changes | After modifying activity logging system            |
| `Building_with_AI_Agents.md`  | Field guide on TDD workflow with AI agents        | New patterns/lessons learned from AI collaboration |

---

## Implementation Plan Structure

The `ExoFrame_Implementation_Plan.md` is the **source of truth** for all implementation work.

### Required Step Structure

Each step MUST include:

```markdown
### Step X.Y: Feature Name

- **Dependencies:** Previous steps that must be completed
- **Rollback:** How to undo if the step fails
- **Action:** What to implement
- **Justification:** Why this step exists

**TDD Test Cases:**

1. `should do expected behavior when condition`
2. `should handle error case gracefully`
3. `should validate input correctly`

**Success Criteria:**

- [ ] Test case 1 passes
- [ ] Test case 2 passes
- [ ] Code coverage ≥70%
```

### Step Status Markers

- ✅ **COMPLETED** — Implementation done, tests passing
- 🔄 **IN PROGRESS** — Currently being worked on
- ❌ **BLOCKED** — Cannot proceed (document reason)
- (no marker) — Not yet started

---

## Version Synchronization

### Documents That Share Version Numbers

These documents MUST have synchronized version numbers:

- `ExoFrame_White_Paper.md`
- `ExoFrame_Technical_Spec.md`
- `ExoFrame_Implementation_Plan.md`
- `ExoFrame_User_Guide.md`

### Version Update Checklist

When incrementing version:

1. Update version in all synchronized documents
2. Update the "Release Date" field
3. Add entry to Change Log (if present)
4. Ensure no documents reference deprecated versions

---

## Terminology Consistency

### Required Terminology Section

All major documents MUST include the standard Terminology Reference section:

```markdown
## Terminology Reference

- **Activity Journal:** The SQLite database logging all events
- **Portal:** A symlinked directory providing agent access to external projects
- **Request:** A markdown file in `/Inbox/Requests` containing user intent
- **Plan:** An agent-generated proposal in `/Inbox/Plans`
- **Active Task:** An approved request in `/System/Active` being executed
- **Report:** An agent-generated summary in `/Knowledge/Reports` after completion
- **Trace ID:** UUID linking request → plan → execution → report
- **Lease:** Exclusive lock on a file (stored in `leases` table)
- **Actor:** Entity performing action (agent name, "system", or "user")
- **Blueprint:** TOML definition of an agent (model, capabilities, prompt)
```

### Term Usage Rules

- Use consistent capitalization (Activity Journal, not activity journal)
- Always link to the Terminology Reference on first use in a document
- Do not invent new terms without adding to the reference

---

## Document Formatting Standards

### Headers

```markdown
# Document Title

- **Version:** X.Y.Z
- **Release Date:** YYYY-MM-DD
- **Status:** [Planning|Engineering Specification|Active|Deprecated]
- **Reference:** [Related Document](./Related_Document.md)

---

## 1. First Major Section
```

### Code Examples

Always use fenced code blocks with language identifiers:

````markdown
```typescript
// TypeScript code here
```

```bash
# Shell commands here
```

```sql
-- SQL statements here
```
````

### Tables

Use consistent table formatting:

```markdown
| Column 1 | Column 2 | Column 3 |
| -------- | -------- | -------- |
| Data 1   | Data 2   | Data 3   |
```

---

## Cross-Reference Guidelines

### Linking Between Documents

Use relative paths for internal links:

```markdown
See [Implementation Plan](./ExoFrame_Implementation_Plan.md) Step 5.3.
Refer to [Testing Strategy](./ExoFrame_Testing_Strategy.md) Section 2.
```

### Referencing Code

When documenting code, include file paths:

```markdown
The `DatabaseService` class in `src/services/db.ts` handles...
See the schema definition in `migrations/001_init.sql`.
```

---

## Documentation Update Workflow

### Before Making Changes

1. Identify which documents are affected
2. Check current version numbers
3. Review the Implementation Plan for related steps

### Making Changes

1. Update content with accurate, tested information
2. Maintain consistent formatting
3. Update version numbers if significant change
4. Add Change Log entry if applicable

### After Making Changes

1. Run `deno fmt` on markdown files
2. Verify cross-references still work
3. Commit with descriptive message

---

## Common Documentation Tasks

### Adding a New Feature

1. Update `ExoFrame_Implementation_Plan.md` with new step
2. Implement feature following TDD
3. Update `ExoFrame_Technical_Spec.md` if architecture changes
4. Update `ExoFrame_User_Guide.md` with user-facing details
5. Add manual test scenario if needed

### Fixing a Bug

1. Document the fix in Implementation Plan (if significant)
2. Update affected documentation
3. Add regression test case

### Improving Coverage

1. Update `Coverage_Improvement_Plan.md` with analysis
2. Add test cases to Implementation Plan
3. Update `Code_Coverage.md` after improvements

---

## Document Quality Checklist

Before committing documentation changes, verify:

- [ ] Version numbers synchronized (if applicable)
- [ ] Terminology used consistently
- [ ] Cross-references are valid
- [ ] Code examples are accurate and tested
- [ ] Formatting follows standards
- [ ] No future tense for unimplemented features
- [ ] Change Log updated (if applicable)

---

## Final Step: Format Documentation

**ALWAYS run `deno fmt` after editing markdown files.**

```bash
# Format all docs
deno fmt docs/

# Check formatting without modifying
deno fmt --check docs/
```

This ensures consistent formatting across all documentation.
