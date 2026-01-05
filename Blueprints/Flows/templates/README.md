# Flow Templates

This directory contains **abstract flow patterns** designed to be used as starting points for creating new flows.

## What are Templates?

Unlike **Examples** (which are concrete, runnable use cases), **Templates** are generic structures with placeholders. They define the *shape* of the workflow but leave the *logic* to you.

## Available Templates

### 1. Pipeline (`pipeline.flow.template.ts`)
**Pattern:** Linear sequence (Step 1 → Step 2 → Step 3).
**Use Case:** Data processing, multi-stage validation.
**Key Features:**
- Sequential dependencies
- Data passing between steps

### 2. Fan-out/Fan-in (`fan-out-fan-in.flow.template.ts`)
**Pattern:** Parallel execution followed by aggregation.
**Use Case:** Comprehensive reviews, multi-perspective analysis.
**Key Features:**
- Parallel step execution (`maxParallelism`)
- Aggregation step using `input.source: "aggregate"`

### 3. Staged Workflow (`staged.flow.template.ts`)
**Pattern:** Grouped steps with dependencies between groups.
**Use Case:** Complex processes with distinct phases (e.g., Plan → Execute → Verify).
**Key Features:**
- Dependencies on multiple previous steps
- Checkpoints between stages

### 4. LLM-as-a-Judge (`llm-judge-code-review.flow.template.ts`)
**Pattern:** Multi-perspective analysis with judge evaluation.
**Use Case:** Code review, content evaluation, quality assessment.
**Key Features:**
- Parallel specialized reviewers
- Judge agent evaluates all reviews
- Structured JSON output for quality gates
- Designed for future feedback loops

**Required Agents:**
- `code-analyzer` - Initial analysis
- `security-reviewer` - Security-focused review
- `quality-reviewer` - Code quality review
- `quality-judge` - Final evaluation (see `Blueprints/Agents/quality-judge.md`)
- `technical-writer` - Report generation

### 5. Self-Correcting (`self-correcting.flow.template.ts`) ✨ NEW
**Pattern:** Iterative improvement with feedback loops (Phase 15).
**Use Case:** High-quality code generation, documentation that must meet standards.
**Key Features:**
- LLM-as-a-Judge evaluation with built-in criteria
- Feedback loops using Reflexion pattern
- Quality gates for automated checkpoints
- Conditional branching based on quality scores
- Iterative refinement until quality threshold met

**Required Agents:**
- `generator-agent` - Initial content generation
- `quality-judge` - Quality evaluation
- `refiner-agent` - Improvement based on feedback

**Built-in Criteria Used:**
- `CODE_CORRECTNESS` - Syntax and semantic validation
- `CODE_COMPLETENESS` - Requirements coverage
- `FOLLOWS_CONVENTIONS` - Style compliance
- `ERROR_HANDLING` - Error handling presence

**Configuration Options:**
- `maxIterations` - Maximum refinement cycles (default: 3)
- `targetScore` - Quality threshold (default: 0.85)
- `minImprovement` - Stop if improvement < threshold (default: 0.05)

## How to Use

1. **Choose a pattern** that matches your needs.
2. **Copy the template** to the parent directory (`Blueprints/Flows/`):
   ```bash
   cp templates/pipeline.flow.template.ts ../my-process.flow.ts
   ```
3. **Edit the file**:
   - **Update Metadata:** Change `id`, `name`, and `description`.
   - **Assign Agents:** Replace placeholder agent names (e.g., `coordinator-agent`) with your actual agents (e.g., `senior-coder`).
   - **Define Inputs:** Configure how data flows into each step.
4. **Validate:**
   ```bash
   exoctl flow validate ../my-process.flow.ts
   ```
