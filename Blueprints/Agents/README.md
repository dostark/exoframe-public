# Blueprint Templates - JSON Plan Schema

This directory contains agent blueprint templates that instruct LLMs to output JSON-formatted execution plans.

## Directory Structure

- `examples/`: **Reference Implementations**. Comprehensive, ready-to-use agent blueprints (e.g., `code-reviewer`, `security-auditor`). Use these to learn best practices or as a base for custom agents.
- `templates/`: **Abstract Patterns**. Reusable templates (e.g., `pipeline-agent`, `collaborative-agent`) with placeholders. Use these when you need a specific behavioral pattern but want to define the persona from scratch.
- `*.md`: **Active Blueprints**. Agents available for immediate use in your workspace (e.g., `default.md`, `senior-coder.md`).

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
2. Edit the file to replace placeholders (e.g., `{agent_name}`) with your values.
3. Validate and use.

Each blueprint file contains:

1. **TOML Frontmatter** (between `+++` delimiters)
   - agent_id, name, model, capabilities, etc.

2. **System Prompt** (markdown body)
   - Agent persona and capabilities
   - **JSON Plan Schema** with examples
   - Response format instructions

## Available Blueprints

### default.md
- Model: `ollama:codellama:13b`
- Use case: General-purpose coding tasks
- Capabilities: code_generation, planning, debugging

### senior-coder.md
- Model: `anthropic:claude-3-5-sonnet`
- Use case: Complex implementations requiring expert-level planning
- Capabilities: code_generation, architecture, debugging, testing, code_review

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
