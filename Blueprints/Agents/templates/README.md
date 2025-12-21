# Agent Templates

This directory contains **abstract agent patterns** designed to be used as starting points for creating new agents.

## What are Templates?

Unlike **Examples** (which are fully defined personas like "Code Reviewer"), **Templates** are structural skeletons. They define *how* an agent thinks or interacts (e.g., "Pipeline Step", "Collaborator") but leave the *who* (persona) and *what* (specific task) to you.

## Available Templates

### 1. Pipeline Agent (`pipeline-agent.md.template`)
**Pattern:** Step-by-step processing.
**Use Case:** Agents that perform a specific transformation in a larger flow.
**Key Features:**
- Focused system prompt
- Input/Output format constraints

### 2. Collaborative Agent (`collaborative-agent.md.template`)
**Pattern:** Multi-agent interaction.
**Use Case:** Agents that need to hand off work or reach consensus.
**Key Features:**
- Instructions for context sharing
- Handoff protocols

## How to Use

1. **Choose a pattern** that matches your needs.
2. **Copy the template** to the parent directory (`Blueprints/Agents/`):
   ```bash
   cp templates/pipeline-agent.md.template ../my-processor.md
   ```
3. **Edit the file**:
   - **Update Frontmatter:** Change `agent_id`, `name`, and `model`.
   - **Define Persona:** Replace `{agent_role}` and `{task_description}` placeholders.
   - **Refine Capabilities:** Add/remove tools as needed.
4. **Validate:**
   ```bash
   exoctl blueprint validate my-processor
   ```
