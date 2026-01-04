# Agent Templates

This directory contains **abstract agent patterns** designed to be used as starting points for creating new agents.

## What are Templates?

Unlike **Examples** (which are fully defined personas like "Code Reviewer"), **Templates** are structural skeletons. They define *how* an agent thinks or interacts (e.g., "Pipeline Step", "Collaborator", "Judge") but leave the *who* (persona) and *what* (specific task) to you.

## Available Templates

### 1. Pipeline Agent (`pipeline-agent.md.template`)
**Pattern:** Step-by-step processing
**Use Case:** Agents that perform a specific transformation in a larger flow.
**Key Features:**
- Focused system prompt
- Input/Output format constraints
- Deterministic 5-step methodology

### 2. Collaborative Agent (`collaborative-agent.md.template`)
**Pattern:** Multi-agent interaction
**Use Case:** Agents that need to hand off work or reach consensus.
**Key Features:**
- Instructions for context sharing
- Handoff protocols
- Flow integration support

### 3. Reflexive Agent (`reflexive-agent.md.template`) 🆕
**Pattern:** Self-critique and improvement
**Use Case:** Quality-critical tasks where first drafts need refinement.
**Key Features:**
- Self-critique protocol (accuracy, completeness, quality, safety)
- Confidence scoring (0-100)
- Iterative refinement loop (configurable iterations)
- Early exit when quality threshold met

**When to use:**
- Code review agents
- Technical writing agents
- Analysis/audit agents
- Any task where output quality is critical

### 4. Research Agent (`research-agent.md.template`) 🆕
**Pattern:** Information gathering with citations
**Use Case:** Exploration, documentation research, dependency analysis.
**Key Features:**
- Structured research methodology (5 phases)
- Source reliability evaluation
- Citation requirements (numbered references)
- Gap and uncertainty reporting
- Memory Bank integration (optional)

**When to use:**
- Codebase exploration
- Architecture documentation
- Bug root cause analysis
- Dependency investigation

### 5. Judge Agent (`judge-agent.md.template`) 🆕
**Pattern:** LLM-as-a-Judge evaluation
**Use Case:** Quality gates, compliance checks, approval workflows.
**Key Features:**
- Weighted criteria scoring (0-100 per criterion)
- Structured verdict (PASS/CONDITIONAL/FAIL)
- Blocking issue identification
- Prioritized improvement suggestions
- JSON verdict for automation

**When to use:**
- Code review quality gates
- Documentation validation
- Plan approval workflows
- Compliance checking

## Template Comparison

| Template | Output Quality | Latency | Automation | Best For |
|----------|---------------|---------|------------|----------|
| Pipeline | Standard | Low | High | Transformations |
| Collaborative | Standard | Medium | Medium | Multi-agent flows |
| Reflexive | High | High | Medium | Quality-critical |
| Research | High | Medium | Low | Exploration |
| Judge | Structured | Medium | High | Quality gates |

## How to Use

1. **Choose a pattern** that matches your needs.
2. **Copy the template** to the parent directory (`Blueprints/Agents/`):
   ```bash
   cp templates/reflexive-agent.md.template ../my-reviewer.md
   ```
3. **Edit the file**:
   - **Update Frontmatter:** Change `agent_id`, `name`, and `model`.
   - **Define Persona:** Replace `{{placeholder}}` values.
   - **Customize Criteria:** Adjust confidence thresholds, evaluation criteria.
   - **Refine Capabilities:** Add/remove tools as needed.
4. **Validate:**
   ```bash
   exoctl blueprint validate my-reviewer
   ```

## Frontmatter Reference

### Common Fields (all templates)

```yaml
agent_id: "unique-id"          # Required: Unique identifier
name: "Display Name"           # Required: Human-readable name
model: "anthropic:claude-opus-4.5"  # Required: LLM model
capabilities: ["read_file"]    # Required: MCP tools allowed
version: "1.0.0"              # Semantic version
created: "2025-01-20T..."     # ISO timestamp
created_by: "author"          # Creator identifier
```

### Reflexive Agent Fields

```yaml
reflexive: true                # Enable reflexion runtime
max_reflexion_iterations: 3    # Max refinement loops
confidence_required: 80        # Minimum score to finalize
```

### Research Agent Fields

```yaml
memory_enabled: true           # Use Memory Bank for context
citation_required: true        # Enforce citation format
```

### Judge Agent Fields

```yaml
judge_mode: true               # Enable verdict parsing
criteria_version: "1.0"        # Criteria set version
verdict_threshold: 70          # PASS threshold score
```

## Implementation Status

| Template | Documentation | Runtime Support |
|----------|--------------|-----------------|
| Pipeline | ✅ Complete | ✅ Supported |
| Collaborative | ✅ Complete | ✅ Supported |
| Reflexive | ✅ Complete | 🔄 Phase 16.4 |
| Research | ✅ Complete | 🔄 Phase 16.6 |
| Judge | ✅ Complete | ✅ Supported |

See [Phase 16: Agent Orchestration Improvements](../../../agents/planning/phase-16-agent-orchestration-improvements.md) for implementation timeline.
