# Phase 21: Actionable Items for Folder Structure Restructuring

**Created:** 2026-01-08
**Status:** 📋 Planning
**Priority:** High
**Estimated Duration:** 1-2 days
**Parent Phase:** [Phase 19: Folder Structure Restructuring](./phase-19-folder-restructuring.md)

---

## Motivation

Following the completion of Phase 19 planning, several actionable items have been identified to ensure the ExoFrame codebase, scripts, and tests fully align with the new domain-driven folder structure. These actions are critical for eliminating domain confusion, ensuring lifecycle clarity, and supporting maintainability and user experience.

---

## Actionable Items

### 1. Refactor Deployment Scripts

**Goal:**
Update `scaffold.sh` and `deploy_workspace.sh` to match the new folder structure and domain separation.

**Details:**
- Remove creation/copying of `Memory/Tasks` (should not exist).
- Copy the entire `Memory/` folder (with all files and subfolders) from the repository into the destination workspace, preserving its structure and contents. This ensures all persistent knowledge, execution history, indices, and project memory are available in the deployed workspace.
- Copy all content from `Blueprints/` (including subfolders), but do not copy the entire `templates/` folder.
- Copy all files from the top level of the `docs/` folder (i.e., files directly inside `docs/`), but do not copy any files from its subfolders (such as `dev/` or `not_actual/`).
- Move orphaned templates into `Blueprints/Agents/templates/` as per Phase 19.
- Ensure scripts do not create or reference deprecated folders (e.g., `Inbox/`, `System/Active/`).
- Add comments and output messages reflecting the new structure.

---

### 2. Update Test Files

**Goal:**
Align all test files (e.g., `scaffold_test.ts`) with the new folder structure.

**Details:**
- Remove checks for `Memory/Tasks` and any references to deprecated folders.
- Update assertions to expect only the new structure (e.g., `Workspace/Active/`, `Workspace/Archive/`).
- Ensure tests verify that all files and subfolders from `Blueprints/` are present in the scaffolded workspace.
- Ensure tests verify that all files and subfolders from `Memory/` are present in the scaffolded workspace.
- Add/Update tests for idempotency and correct output messages.

---

### 3. Remove Domain Confusion

**Goal:**
Enforce clear separation between runtime, lifecycle, and memory domains.

**Details:**
- Ensure only `Workspace/Active/` exists for in-progress work.
- Remove any code, scripts, or documentation referencing `Memory/Tasks/active` or similar.
- Document the rationale for this separation in the planning docs.

---

### 4. Documentation and Communication

**Goal:**
Update planning and user documentation to reflect the actionable changes.

**Details:**
- Add migration notes and rationale to the planning docs.
- Update any quick start or setup guides to match the new structure.
- Communicate the removal of deprecated folders and the new domain boundaries.

---

## Success Criteria

- [ ] Deployment scripts (`scaffold.sh`, `deploy_workspace.sh`) only create/copy the correct folders and files, including the entire `Memory/` folder.
- [ ] No references to `Memory/Tasks` or other deprecated folders in scripts, tests, or documentation.
- [ ] All tests pass, and test assertions match the new structure.
- [ ] Documentation clearly explains the new folder structure and domain separation.
- [ ] Users experience no ambiguity between runtime, lifecycle, and memory folders.

---

## Projected Tests

- ❌ `scaffold.sh` does not create `Memory/Tasks`
- ❌ `deploy_workspace.sh` only copies `Blueprints/` and `Memory/` content, not `templates/`
- ❌ `scaffold_test.ts` passes with new structure, fails if deprecated folders are present
- ❌ Idempotency: running scripts multiple times does not create extra or deprecated folders
- ❌ Output: scripts print correct messages for new structure

---

## Implementation Plan

1. Refactor `scaffold.sh` and `deploy_workspace.sh` as described.
2. Update and run all relevant tests, especially `scaffold_test.ts`.
3. Remove any code or documentation referencing deprecated folders.
4. Update planning and user documentation.
5. Review and validate with a full test suite run.

---

## Dependencies

- Completion of Phase 19 folder structure migration.
- Stable `Blueprints/` and `Workspace/` content.

---

## Risks & Mitigation

| Risk                                   | Impact | Mitigation                                 |
|-----------------------------------------|--------|---------------------------------------------|
| Missed references to deprecated folders | Medium | Comprehensive search and test coverage      |
| User confusion during transition        | Medium | Clear documentation and migration notes     |
| Test failures due to path changes       | High   | Update all tests and run full suite         |

---

## Timeline

| Step            | Duration | Deliverable        |
|-----------------|----------|--------------------|
| Script refactor | 0.5 day  | Updated scripts    |
| Test updates    | 0.5 day  | Passing tests      |
| Documentation   | 0.5 day  | Updated docs       |
| Validation      | 0.5 day  | Full test suite pass|

---

## Related Documentation

- [Phase 19: Folder Structure Restructuring](./phase-19-folder-restructuring.md)
- [ExoFrame Architecture](../../docs/ExoFrame_Architecture.md)

---

## Success Metrics

| Metric                    | Target |
|---------------------------|--------|
| Deprecated folders in repo| 0      |
| Test pass rate            | 100%   |
| User confusion reports    | 0      |
| Documentation coverage    | 100%   |

---

## Summary Table

| Folder/File                | Create/Copy? | Notes                                 |
|---------------------------|:------------:|---------------------------------------|
| Memory/Tasks/              |      ❌      | Remove all references                  |
| Memory/ (all content)      |      ✔️      | Copy entire folder with all files/subfolders |
| templates/ (folder)        |      ❌      | Do not copy folder                     |
| exo.config.sample.toml     |      ✔️      | Copy to root                           |
| README.md                  |      ✔️      | Copy to root                           |
| Blueprints/ (all content)  |      ✔️      | Copy all files and subfolders          |
| docs/ (top-level files only) |      ✔️      | Copy only files directly in docs/, not from subfolders |
