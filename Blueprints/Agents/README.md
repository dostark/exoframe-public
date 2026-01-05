# Blueprint Templates - JSON Plan Schema

This directory contains agent blueprint templates that instruct LLMs to output JSON-formatted execution plans.

## Directory Structure

- `examples/`: **Reference Implementations**. Comprehensive, ready-to-use agent blueprints (e.g., `code-reviewer`, `security-auditor`). Use these to learn best practices or as a base for custom agents.
- `templates/`: **Abstract Patterns**. Reusable templates (e.g., `pipeline-agent`, `collaborative-agent`) with placeholders. Use these when you need a specific behavioral pattern but want to define the persona from scratch.
- `*.md`: **Active Blueprints**. Agents available for immediate use in your workspace (e.g., `default.md`, `senior-coder.md`).

## Skills Integration (Phase 17)

All blueprints support `default_skills` for automatic procedural knowledge injection:

```yaml
---
agent_id: "my-agent"
name: "My Agent"
model: "anthropic:claude-sonnet-4"
capabilities: ["read_file", "write_file"]
default_skills: ["code-review", "error-handling"]  # NEW
---
```

**Available Core Skills:** `code-review`, `security-first`, `tdd-methodology`, `error-handling`, `documentation-driven`, `typescript-patterns`, `commit-message`, `exoframe-conventions`

See `Memory/Skills/` for skill definitions.

## Usage Guide

### Using Active Blueprints
Active blueprints are ready to use:
```bash
exoctl request "Task description" --agent senior-coder
```

### Using Examples
Examples in `examples/` are for learning. To use one:
1. Copy it to this directory: `cp examples/code-reviewer.md .`
2. Run `exoctl blueprint validate code-reviewer` to check it.
3. Use it: `exoctl request "Review this code" --agent code-reviewer`

### Using Templates
Templates in `templates/` are for creating new agents:
1. Copy a template: `cp templates/pipeline-agent.md.template my-agent.md`
2. Edit the file to replace placeholders (e.g., `{{agent_name}}`) with your values.
3. Add appropriate `default_skills` for the agent's role.
4. Validate and use.

Each blueprint file contains:

1. **YAML Frontmatter** (between `---` delimiters)
   - agent_id, name, model, capabilities, default_skills, etc.

2. **System Prompt** (markdown body)
   - Agent persona and capabilities
   - **JSON Plan Schema** with examples
   - Response format instructions

## Available Blueprints

### Core Agents

| Agent | Model | Skills | Use Case |
|-------|-------|--------|----------|
| `default` | `ollama:codellama:13b` | `error-handling` | General-purpose coding |
| `senior-coder` | `ollama:codellama:7b-instruct` | `typescript-patterns`, `error-handling`, `code-review` | Complex implementations |
| `quality-judge` | `anthropic:claude-3-5-sonnet` | `code-review` | LLM-as-a-Judge evaluation |

### Specialist Agents

| Agent | Skills | Use Case |
|-------|--------|----------|
| `security-expert` | `security-first`, `code-review` | Security vulnerability analysis |
| `performance-engineer` | `code-review` | Performance optimization |
| `technical-writer` | `documentation-driven` | Documentation generation |
| `software-architect` | `exoframe-conventions`, `typescript-patterns` | Architecture design |
| `test-engineer` | `tdd-methodology`, `error-handling` | Test implementation |
| `product-manager` | - | Requirements analysis |
| `code-analyst` | `code-review`, `typescript-patterns` | Code structure analysis |
| `qa-engineer` | `tdd-methodology`, `error-handling` | Integration testing |

## JSON Plan Schema Reference

See `docs/Plan_Format_Reference.md` for the complete schema reference.

```json
{
  "title": "Plan title (required)",
  "description": "What this accomplishes (required)",
  "steps": [
    {
      "step": 1,
      "title": "Step title (required)",
      "description": "What this step does (required)",
      "tools": ["write_file"],
      "successCriteria": ["Criterion 1"],
      "dependencies": [],
      "rollback": "How to undo"
    }
  ],
  "estimatedDuration": "2-3 hours",
  "risks": ["Risk 1"]
}
```

## Creating New Blueprints

Use `exoctl blueprint create` or manually create following this template:

```markdown
+++
agent_id = "my-agent"
name = "My Custom Agent"
model = "provider:model-name"
capabilities = ["capability1", "capability2"]
created = "2025-12-09T00:00:00Z"
created_by = "your-email@example.com"
version = "1.0.0"
+++

# Agent Name

Agent description and persona...

## Response Format

You MUST respond with:
1. <thought> - Your analysis
2. <content> - Valid JSON matching PlanSchema

[Include JSON schema documentation here - see default.md or senior-coder.md]
```

## Validation

The system will:
1. Extract JSON from `<content>` tags
2. Validate against PlanSchema (src/schemas/plan_schema.ts)
3. Convert to markdown for storage (src/services/plan_adapter.ts)
4. Reject invalid plans with detailed error messages

## Testing

Test your blueprint with:
```bash
exoctl request "Your test request" --agent my-agent
```

Check the generated plan in `Inbox/Plans/` - it should contain properly formatted markdown converted from JSON.
