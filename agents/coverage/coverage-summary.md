---
type: coverage_summary
project: ExoFrame
generated_at: 2026-01-03
command: ./scripts/coverage.sh summary
notes:
  - Default run excludes LlamaProvider tests (use --with-llama)
---

# Coverage summary

Overall (src/): **Branch 79.2%**, **Line 83.5%**

## Notable low-coverage areas (by branch)

- ai/providers/llama_provider.ts — Branch 0.0%, Line 19.6% (excluded tests by default)
- cli/exoctl.ts — Branch 48.1%, Line 55.7%
- tui/plan_reviewer_view.ts — Branch 61.9%, Line 86.2%
- services/flow_validator.ts — Branch 64.7%, Line 65.2%
- cli/blueprint_commands.ts — Branch 67.6%, Line 81.8%

## High coverage highlights

- Many schema/config and provider modules are at or near 100% line + branch.

## Repro

- Summary: ./scripts/coverage.sh summary
- Include llama: ./scripts/coverage.sh summary --with-llama
- HTML report: ./scripts/coverage.sh html
- LCOV: ./scripts/coverage.sh lcov
