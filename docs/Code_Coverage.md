# Code Coverage

ExoFrame uses Deno's built-in coverage tool to track test coverage.

## Quick Start

```bash
# Run tests with coverage and view summary
deno task test:coverage
deno task coverage

# Generate HTML report (opens in browser)
deno task coverage:html

# Generate LCOV report (for CI/CD integration)
deno task coverage:lcov
```

## Using the Coverage Script

The `scripts/coverage.sh` script provides an all-in-one solution:

```bash
# Summary report (default)
./scripts/coverage.sh

# HTML report
./scripts/coverage.sh html

# LCOV report
./scripts/coverage.sh lcov

# Detailed line-by-line report
./scripts/coverage.sh detailed

# Generate all formats
./scripts/coverage.sh all
```

## Current Coverage

As of the last run:

| Metric                  | Coverage |
| ----------------------- | -------- |
| Overall Line Coverage   | 82.9%    |
| Overall Branch Coverage | 67.2%    |

### Per-Module Coverage

| Module                     | Branch % | Line % |
| -------------------------- | -------- | ------ |
| **CLI Commands**           |          |        |
| cli/base.ts                | 86.4%    | 83.5%  |
| cli/changeset_commands.ts  | 63.6%    | 89.0%  |
| cli/daemon_commands.ts     | 66.7%    | 79.4%  |
| cli/git_commands.ts        | 87.0%    | 94.9%  |
| cli/plan_commands.ts       | 73.7%    | 90.0%  |
| **Services**               |          |        |
| services/db.ts             | 43.8%    | 79.5%  |
| services/git_service.ts    | 64.0%    | 80.0%  |
| services/agent_runner.ts   | 60.0%    | 80.7%  |
| services/context_loader.ts | 55.9%    | 82.2%  |
| services/execution_loop.ts | 60.0%    | 85.8%  |
| **Parsers & Config**       |          |        |
| config/schema.ts           | 100.0%   | 100.0% |
| parsers/markdown.ts        | 71.4%    | 77.6%  |

## Coverage Reports

### Summary Report

The default report shows coverage percentages for each file and overall coverage.

### HTML Report

Interactive HTML report with:

- Line-by-line coverage highlighting
- Branch coverage visualization
- Sortable file list
- Drill-down navigation

Located at: `coverage/html/index.html`

### LCOV Report

Standard LCOV format for integration with:

- CI/CD pipelines (GitHub Actions, GitLab CI, etc.)
- Coverage tracking services (Codecov, Coveralls)
- IDE plugins

Located at: `coverage/lcov.info`

## Interpreting Coverage

### Line Coverage

Percentage of executable lines that were run during tests.

- ✅ Target: 80%+ for production code
- 🎯 Stretch goal: 90%+

### Branch Coverage

Percentage of decision branches (if/else, switch, ternary) that were taken.

- ✅ Target: 70%+ for production code
- 🎯 Stretch goal: 85%+

### Areas with Lower Coverage

Some modules have intentionally lower coverage:

- **config/service.ts** (61.1%): Error handling paths, rarely exercised
- **services/watcher.ts** (65.7%): File system edge cases
- **services/path_resolver.ts** (69.1%): Platform-specific paths

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run tests with coverage
  run: deno task test:coverage

- name: Generate LCOV report
  run: deno task coverage:lcov

- name: Upload to Codecov
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## Improving Coverage

When adding new features:

1. Write tests first (TDD approach)
2. Run coverage to identify gaps
3. Add tests for uncovered branches
4. Aim for 80%+ line coverage on new code

To find uncovered lines:

```bash
# Detailed report shows exact lines
./scripts/coverage.sh detailed

# HTML report highlights uncovered lines in red
./scripts/coverage.sh html
```

## Excluding Files

Coverage automatically excludes:

- Test files (`*.test.ts`, `*.test.js`)
- Files outside `src/` directory
- Third-party dependencies

To adjust exclusions, edit the `--exclude` pattern in `deno.json` tasks.
