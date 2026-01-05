# ExoFrame Flows

This directory contains Flow definitions and templates for multi-agent orchestration.

## Directory Structure

- `examples/`: **Reference Implementations**. Comprehensive, educational examples demonstrating complex patterns (e.g., fan-out/fan-in) and specialized agent usage. Use these to learn and as a base for complex custom flows.
- `templates/`: **Abstract Patterns**. Generic, reusable structures (e.g., Pipeline, Staged) with placeholders. Use these as a starting point for new flows when you know the structure but need to define the logic.
- `*.flow.ts`: **Active Flows**. Ready-to-use flows available in your workspace. These typically use standard agents and are simpler than examples.

## Skills Integration (Phase 17)

Flows support `defaultSkills` at the flow level and `skills` at the step level:

```typescript
export default defineFlow({
  id: "my-flow",
  name: "My Flow",
  defaultSkills: ["typescript-patterns"],  // Applied to all steps
  steps: [
    {
      id: "step-1",
      agent: "senior-coder",
      skills: ["security-first"],  // Override for this step only
      // ...
    }
  ]
});
```

**Skill Priority:**
1. Step-level `skills` (highest)
2. Flow-level `defaultSkills`
3. Blueprint `default_skills` (fallback)

## Usage Guide

### Running Active Flows
Active flows in this directory can be run immediately:
```bash
exoctl flow run --id code-review
```

### Using Examples
Examples in `examples/` are for learning. To use one:
1. Copy it to this directory: `cp examples/development/code-review.flow.ts .`
2. Review the required agents in the file.
3. Create any missing agents using `exoctl blueprint create`.
4. Run the flow.

### Using Templates
Templates in `templates/` are for building new flows:
1. Copy a template: `cp templates/pipeline.flow.template.ts my-new-flow.flow.ts`
2. Edit the file to replace placeholders (e.g., `agent: "coordinator-agent"`) with your actual agents.
3. Add `defaultSkills` for common behaviors across steps.
4. Customize the logic.

## Available Flows

| Flow | Description | Agents Used | Default Skills |
|------|-------------|-------------|----------------|
| `code-review` | Multi-agent code review | `senior-coder`, `security-expert`, `performance-engineer`, `technical-writer` | `code-review` |
| `feature-development` | End-to-end feature development | `product-manager`, `software-architect`, `senior-coder`, `test-engineer`, `qa-engineer` | `typescript-patterns` |
| `documentation` | Documentation generation | `code-analyst`, `technical-writer`, `software-architect` | `documentation-driven` |

## What are Flows?

Flows enable sophisticated multi-agent orchestration with support for:
- Pipeline execution
- Parallel execution
- Fan-out/Fan-in patterns
- Staged workflows

## Creating New Flows

Flows are defined in TypeScript using the `defineFlow` helper.

```typescript
import { defineFlow } from "exoframe/flows";

export default defineFlow({
  id: "my-flow",
  name: "My Custom Flow",
  defaultSkills: ["error-handling"],  // Applied to all steps
  steps: [
    // ...
  ]
});
```

See `examples/` for detailed usage patterns.
