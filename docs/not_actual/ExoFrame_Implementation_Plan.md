# ExoFrame Implementation Plan

- **Version:** 1.8.0
- **Release Date:** 2026-01-03
- **Philosophy:** Walking Skeleton (End-to-End first, features second).
- **Runtime:** Deno.
- **Target:** Honest MVP (Personal Developer Tool supporting both local sovereign agents and federated third-party
  agents).

### Change Log

- **v1.8.0 (2026-01-03):** Added Phase 12 (Obsidian Retirement & Memory Banks Migration), renumbered Phase 12 (MCP Server) to Phase 13, marked Phase 5 for deprecation in v1.1.
- **v1.7.0 (2025-12-02):** Completed Phase 11 (Testing & QA), added comprehensive test coverage documentation.
- **v1.6.0:** Clarified market positioning vs IDE agents, added Phase 7 Flow orchestration (multi-agent coordination), updated Executive Summary in White Paper.
- **v1.4.0:** Introduced hybrid agent orchestration, clarified dual-mode context handling, and refreshed documentation
  references.
- **v1.3.x:** Tightened governance (owners, dependencies, rollback), clarified security/test linkages, expanded
  migration strategy, and added context-loader + watcher safeguards.
- **v1.2.x:** Initial Deno migration baseline.

---

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

---

## Execution Governance

| Phase    | Timebox | Entry Criteria                        | Exit Criteria                                        |
| -------- | ------- | ------------------------------------- | ---------------------------------------------------- |
| Phase 1  | 1 week  | Repo initialized, change log approved | Daemon boots, storage scaffolds exist                |
| Phase 2  | 1 week  | Phase 1 exit + watcher harness        | Watcher + parser tests pass                          |
| Phase 3  | 2 weeks | Validated config + mock LLM           | Request → Plan loop verified                         |
| Phase 4  | 1 week  | Stable agent runtime                  | Git + tool registry exercised                        |
| Phase 5  | 1 week  | CLI scaffold merged                   | Obsidian vault validated (DEPRECATED in v1.1)        |
| Phase 6  | 2 weeks | Phase 5 complete + portal system      | Plan execution via MCP working end-to-end            |
| Phase 7  | 1 week  | All prior phases code-complete        | Flow orchestration working                           |
| Phase 8  | 1 week  | System stable with Ollama             | Cloud LLM providers (Anthropic/OpenAI/Google Gemini) |
| Phase 9  | 1 week  | Core functionality stable             | UX improvements + UI evaluation done                 |
| Phase 10 | 2 days  | Testing complete                      | Testing strategy documented                          |
| Phase 11 | 1 week  | Phases 1-10 complete                  | Comprehensive test coverage achieved                 |
| Phase 12 | 1 week  | Phase 11 complete                     | Obsidian retired, Memory Banks implemented           |
| Phase 13 | 1-2 wks | Phases 1-12 complete                  | MCP server operational                               |
| Phase 16 | 2 weeks | Core agent system stable              | Agent orchestration improvements complete ✅         |

---
