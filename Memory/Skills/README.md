# Skills Directory

This directory contains **Skills** - procedural memory for ExoFrame agents.

## What are Skills?

Skills are reusable instruction modules that encode domain expertise, procedures, and best practices. They are automatically injected into agent prompts based on trigger conditions.

## Directory Structure

```
Memory/Skills/
├── index.json          # Skill registry with triggers for fast lookup
├── core/               # Built-in skills (shipped with ExoFrame)
│   ├── tdd-methodology.skill.md
│   ├── security-first.skill.md
│   └── ...
├── project/            # Project-specific skills
│   └── {portal}/       # Organized by portal
│       └── *.skill.md
└── learned/            # Skills derived from learnings
    └── *.skill.md
```

## Skill File Format

Skills use Markdown with YAML frontmatter:

```markdown
---
skill_id: "example-skill"
name: "Example Skill"
version: "1.0.0"
scope: "global"
status: "active"
source: "user"

triggers:
  keywords: ["example", "demo"]
  task_types: ["feature"]
  file_patterns: ["*.ts"]
  tags: ["example"]

constraints:
  - "Always do X"
  - "Never do Y"

quality_criteria:
  - name: "Criterion 1"
    weight: 50
  - name: "Criterion 2"
    weight: 50
---

# Skill Instructions

Your procedural instructions go here in Markdown format.

## Step 1
...

## Step 2
...
```

## CLI Commands

```bash
# List all skills
exoctl memory skill list

# Show skill details
exoctl memory skill show <skill-id>

# Create new skill
exoctl memory skill create <skill-id>

# Test trigger matching
exoctl memory skill match "<request>"

# Derive skill from learnings
exoctl memory skill derive <learning-ids...>
```

## Core Skills

| Skill ID | Purpose |
|----------|---------|
| `tdd-methodology` | Test-Driven Development workflow |
| `security-first` | Security-conscious development |
| `code-review` | Comprehensive code review checklist |
| `documentation-driven` | Documentation-first approach |
| `commit-message` | Conventional commit format |
| `error-handling` | Robust error handling patterns |
| `typescript-patterns` | TypeScript best practices |
| `exoframe-conventions` | ExoFrame-specific patterns |

## Related Documentation

- [Phase 17: Skills Architecture](../../agents/planning/phase-17-skills-architecture.md)
- [Memory Bank Documentation](../../docs/Memory_Bank_Architecture.md)
