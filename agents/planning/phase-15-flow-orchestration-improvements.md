# Phase 15: Flow Orchestration Improvements

**Created:** January 4, 2026
**Status:** Planning
**Priority:** High

## Executive Summary

This document proposes enhancements to ExoFrame's Flow orchestration system based on analysis of current implementation and state-of-the-art agent orchestration patterns. The focus is on adding **quality gates**, **feedback loops**, **LLM-as-a-Judge evaluation**, and **conditional branching** while preserving ExoFrame's core principles of file-based workflows and traceable execution.

---

## Current State Analysis

### Strengths ✅

1. **Solid Foundation**: Well-implemented DAG-based dependency resolution with topological sort
2. **Parallel Execution**: Wave-based execution with configurable `maxParallelism`
3. **Extensible Transforms**: Built-in transforms + custom function support
4. **Comprehensive Logging**: Full activity journal integration
5. **Error Handling**: Retry mechanism with backoff, `failFast` option
6. **Template Library**: Pipeline, Fan-Out/Fan-In, and Staged templates

### Identified Weaknesses 🔴

| Weakness                     | Impact                                               | Current Workaround    |
| ---------------------------- | ---------------------------------------------------- | --------------------- |
| **Conditions not evaluated** | `condition` field in schema is ignored in FlowRunner | None - dead code      |
| **No quality gates**         | Can't gate progression based on quality thresholds   | Manual review         |
| **No feedback loops**        | Steps can't iterate based on output quality          | Retry entire flow     |
| **No LLM evaluation**        | No built-in way to assess output quality             | External evaluation   |
| **No dynamic routing**       | Can't branch based on step results                   | Create multiple flows |
| **No self-correction**       | Failed steps can only retry, not adapt               | Manual intervention   |
| **Output validation**        | No schema validation for step outputs                | Trust agent output    |
| **No consensus mechanisms**  | Parallel workers can't vote/agree                    | Manual synthesis      |

---

## State-of-the-Art Patterns (Not Yet in ExoFrame)

### 1. LLM-as-a-Judge Pattern

Use a specialized LLM to evaluate outputs from other agents, providing:

- Quality scores (0-1 scale)
- Structured feedback for improvement
- Pass/fail decisions for gates

### 2. Reflexion Pattern

Agent reflects on its own output, identifies issues, and iteratively improves:

- Self-critique step after each major output
- Improvement loop until quality threshold met
- Maximum iteration limit to prevent infinite loops

### 3. Constitutional AI Pattern

Outputs checked against defined principles/constraints:

- Define rules (e.g., "code must have tests", "no TODO comments")
- Evaluate compliance
- Iterate until compliant or max attempts

### 4. Multi-Agent Debate Pattern

Multiple agents argue different perspectives:

- Parallel analysis from different viewpoints
- Structured debate/challenge phase
- Synthesis that acknowledges disagreements

### 5. Consensus Pattern

Multiple agents vote or reach agreement:

- Parallel execution of same task
- Comparison/voting phase
- Majority or weighted consensus

---

## Proposed Improvements

### Phase 15.1: Implement Condition Evaluation

**Problem**: `condition` field exists in schema but is never evaluated.

**Solution**: Add condition evaluation before step execution:

```typescript
// In FlowRunner.executeStep()
if (step.condition) {
  const shouldExecute = this.evaluateCondition(step.condition, stepResults);
  if (!shouldExecute) {
    return { stepId, success: true, skipped: true, duration: 0, ... };
  }
}
```

**Condition Context**:

```typescript
interface ConditionContext {
  results: Map<string, StepResult>; // Previous step results
  request: FlowRequest; // Original request
  flow: Flow; // Flow definition
}
```

**Files to Modify**:

- `src/flows/flow_runner.ts` - Add `evaluateCondition()` method
- `src/schemas/flow.ts` - Document condition syntax
- `tests/flows/flow_runner_test.ts` - Add condition tests

---

### Phase 15.2: Add Quality Gate Step Type

**Problem**: No way to gate flow progression based on output quality.

**Solution**: Add new step type `gate` with evaluation criteria:

```typescript
// New step type in schema
interface GateStep extends FlowStep {
  type: "gate";
  evaluate: {
    agent: string; // Judge agent
    criteria: string[]; // What to evaluate
    threshold: number; // 0-1 pass threshold
    onFail: "retry" | "halt" | "continue-with-warning";
    maxRetries?: number;
  };
}
```

**Example Flow**:

```typescript
defineFlow({
  id: "quality-gated-review",
  steps: [
    {
      id: "generate-code",
      agent: "senior-coder",
      // ...
    },
    {
      id: "quality-gate",
      type: "gate",
      dependsOn: ["generate-code"],
      evaluate: {
        agent: "code-quality-judge",
        criteria: [
          "code_correctness",
          "follows_conventions",
          "has_tests",
          "no_security_issues",
        ],
        threshold: 0.8,
        onFail: "retry",
        maxRetries: 3,
      },
    },
    {
      id: "finalize",
      dependsOn: ["quality-gate"],
      // Only runs if gate passes
    },
  ],
});
```

**Files to Create/Modify**:

- `src/flows/gate_evaluator.ts` - New gate evaluation logic
- `src/schemas/flow.ts` - Add `GateStep` type
- `src/flows/flow_runner.ts` - Handle gate steps

---

### Phase 15.3: LLM-as-a-Judge Integration

**Problem**: No standardized way to evaluate agent outputs using LLM judgment.

**Solution**: Create judge agent blueprint and evaluation protocol.

**Judge Agent Blueprint**:

```yaml
# Blueprints/Agents/judge.agent.yaml
id: quality-judge
name: Quality Judge
system_prompt: |
  You are a quality assessment agent. Evaluate outputs against criteria.

  For each criterion, provide:
  1. Score (0.0-1.0)
  2. Reasoning (1-2 sentences)
  3. Specific issues found (if any)

  Output JSON format:
  {
    "overall_score": 0.85,
    "criteria_scores": {
      "criterion_name": { "score": 0.9, "reasoning": "...", "issues": [] }
    },
    "pass": true,
    "feedback": "Overall assessment..."
  }
```

**Evaluation Request Format**:

```typescript
interface JudgeRequest {
  content: string; // Content to evaluate
  criteria: EvaluationCriterion[];
  context?: string; // Original request for context
}

interface EvaluationCriterion {
  name: string;
  description: string;
  weight?: number; // Default 1.0
  required?: boolean; // Must pass for overall pass
}
```

**Built-in Criteria Library**:

```typescript
// src/flows/evaluation_criteria.ts
export const CRITERIA = {
  CODE_CORRECTNESS: {
    name: "code_correctness",
    description: "Code is syntactically correct and would compile/run",
  },
  HAS_TESTS: {
    name: "has_tests",
    description: "Implementation includes appropriate test coverage",
  },
  FOLLOWS_CONVENTIONS: {
    name: "follows_conventions",
    description: "Code follows project style and naming conventions",
  },
  NO_SECURITY_ISSUES: {
    name: "no_security_issues",
    description: "No obvious security vulnerabilities (injection, exposure)",
  },
  COMPLETENESS: {
    name: "completeness",
    description: "All requirements from the prompt are addressed",
  },
  CLARITY: {
    name: "clarity",
    description: "Output is clear, well-organized, and understandable",
  },
};
```

**Files to Create**:

- `src/flows/evaluation_criteria.ts` - Built-in criteria definitions
- `src/flows/judge_evaluator.ts` - Judge invocation and result parsing
- `Blueprints/Agents/judge.agent.yaml` - Judge agent blueprint

---

### Phase 15.4: Feedback Loop (Reflexion) Support

**Problem**: Steps can only retry with same input, can't improve based on feedback.

**Solution**: Add `feedback` transform and loop configuration:

```typescript
interface FeedbackLoopConfig {
  maxIterations: number;          // Safety limit
  targetScore: number;            // Stop when reached
  evaluator: string;              // Judge agent
  criteria: string[];
  feedbackTransform?: string;     // How to format feedback for retry
}

// New input source: "feedback"
{
  id: "improve-code",
  input: {
    source: "feedback",
    stepId: "generate-code",
    feedbackStepId: "evaluate-code"
  },
  loop: {
    maxIterations: 3,
    targetScore: 0.9,
    evaluator: "code-quality-judge",
    criteria: ["correctness", "completeness"]
  }
}
```

**Execution Flow**:

```
generate-code → evaluate-code → [score < 0.9?]
                                    ↓ yes
                        improve-code (with feedback)
                                    ↓
                        evaluate-code (iteration 2)
                                    ↓
                        [score < 0.9 && iterations < 3?]
                                    ...
                                    ↓ no
                              continue flow
```

**Files to Create/Modify**:

- `src/flows/feedback_loop.ts` - Loop execution logic
- `src/flows/transforms.ts` - Add `formatFeedback` transform
- `src/schemas/flow.ts` - Add loop configuration

---

### Phase 15.5: Conditional Branching

**Problem**: Flows are strictly DAG-based, can't branch based on results.

**Solution**: Add `branch` step type for dynamic routing:

```typescript
interface BranchStep {
  type: "branch";
  id: string;
  dependsOn: string[];
  branches: BranchCondition[];
  default?: string; // Default branch if no condition matches
}

interface BranchCondition {
  condition: string; // Expression evaluated against context
  goto: string; // Step ID to execute
}
```

**Example**:

```typescript
{
  type: "branch",
  id: "route-by-complexity",
  dependsOn: ["analyze-task"],
  branches: [
    {
      condition: "results['analyze-task'].complexity === 'simple'",
      goto: "quick-implementation"
    },
    {
      condition: "results['analyze-task'].complexity === 'complex'",
      goto: "detailed-design"
    }
  ],
  default: "detailed-design"
}
```

**Execution Changes**:

- Branch step evaluates conditions in order
- First matching condition determines next step
- Skips steps not on chosen branch path
- DAG validation must handle branch structures

---

### Phase 15.6: Consensus/Voting Pattern

**Problem**: Parallel workers produce multiple outputs without resolution.

**Solution**: Add consensus step type:

```typescript
interface ConsensusStep {
  type: "consensus";
  id: string;
  dependsOn: string[]; // Parallel workers to aggregate
  method: "majority" | "weighted" | "unanimous" | "judge";
  judge?: string; // Agent to resolve disagreements
  weights?: Record<string, number>; // For weighted method
}
```

**Consensus Methods**:

1. **majority**: Most common answer wins (requires structured outputs)
2. **weighted**: Weighted average of scores/decisions
3. **unanimous**: All must agree, else escalate
4. **judge**: LLM-as-a-Judge resolves disagreements

**Example - Multi-Reviewer Code Review**:

```typescript
defineFlow({
  id: "multi-reviewer-consensus",
  steps: [
    { id: "reviewer-1", agent: "security-expert", dependsOn: [] },
    { id: "reviewer-2", agent: "performance-expert", dependsOn: [] },
    { id: "reviewer-3", agent: "maintainability-expert", dependsOn: [] },
    {
      type: "consensus",
      id: "consensus",
      dependsOn: ["reviewer-1", "reviewer-2", "reviewer-3"],
      method: "judge",
      judge: "senior-architect",
    },
  ],
});
```

---

## New Flow Templates

### Template: LLM-as-a-Judge Quality Review

```typescript
// Blueprints/Flows/templates/llm-judge.flow.template.ts
import { defineFlow } from "../../../src/flows/define_flow.ts";

export default defineFlow({
  id: "llm-judge-template",
  name: "LLM-as-a-Judge Quality Review",
  description: "Evaluates output quality using an LLM judge with feedback loop",
  version: "1.0.0",
  steps: [
    {
      id: "initial-work",
      name: "Initial Work Generation",
      agent: "worker-agent",
      dependsOn: [],
      input: {
        source: "request",
        transform: "passthrough",
      },
    },
    {
      id: "judge-evaluation",
      name: "Quality Evaluation",
      agent: "quality-judge",
      dependsOn: ["initial-work"],
      input: {
        source: "step",
        stepId: "initial-work",
        transform: "wrap_for_evaluation",
      },
      // Judge outputs structured evaluation
    },
    {
      id: "quality-gate",
      name: "Quality Gate Check",
      type: "gate",
      dependsOn: ["judge-evaluation"],
      evaluate: {
        criteria: ["correctness", "completeness", "clarity"],
        threshold: 0.85,
        onFail: "retry-with-feedback",
      },
    },
    {
      id: "improvement",
      name: "Improve Based on Feedback",
      agent: "worker-agent",
      dependsOn: ["quality-gate"],
      condition: "results['quality-gate'].passed === false",
      input: {
        source: "aggregate",
        from: ["initial-work", "judge-evaluation"],
        transform: "format_improvement_request",
      },
      loop: {
        maxIterations: 2,
        backTo: "judge-evaluation",
      },
    },
    {
      id: "final-output",
      name: "Finalize Output",
      agent: "formatter-agent",
      dependsOn: ["quality-gate"],
      condition: "results['quality-gate'].passed === true",
      input: {
        source: "step",
        stepId: "initial-work",
        transform: "format_final",
      },
    },
  ],
  output: {
    from: "final-output",
    format: "markdown",
  },
  settings: {
    maxParallelism: 1,
    failFast: false,
    timeout: 600000,
  },
});
```

### Template: Self-Correcting Code Generation

```typescript
// Blueprints/Flows/templates/self-correcting.flow.template.ts
export default defineFlow({
  id: "self-correcting-code",
  name: "Self-Correcting Code Generation",
  description: "Generates code with automatic quality evaluation and improvement",
  version: "1.0.0",
  steps: [
    {
      id: "generate",
      name: "Generate Initial Code",
      agent: "senior-coder",
      dependsOn: [],
      input: { source: "request" },
    },
    {
      id: "self-review",
      name: "Self-Review",
      agent: "code-reviewer",
      dependsOn: ["generate"],
      input: {
        source: "aggregate",
        from: ["generate"],
        transform: "prepare_for_review",
      },
    },
    {
      id: "improve",
      name: "Address Review Feedback",
      agent: "senior-coder",
      dependsOn: ["self-review"],
      condition: "results['self-review'].issues.length > 0",
      input: {
        source: "aggregate",
        from: ["generate", "self-review"],
        transform: "combine_code_and_feedback",
      },
    },
    {
      id: "final-review",
      name: "Final Quality Check",
      agent: "quality-judge",
      dependsOn: ["improve", "generate"],
      input: {
        source: "step",
        stepId: "improve",
        fallbackStepId: "generate", // Use generate if improve was skipped
      },
    },
  ],
  output: {
    from: ["improve", "generate"], // Use improve if available, else generate
    format: "markdown",
  },
});
```

---

## Implementation Priority

| Phase | Component             | Effort | Impact | Priority |
| ----- | --------------------- | ------ | ------ | -------- |
| 15.1  | Condition Evaluation  | Low    | Medium | P1       |
| 15.2  | Quality Gate Steps    | Medium | High   | P1       |
| 15.3  | LLM-as-a-Judge        | Medium | High   | P1       |
| 15.4  | Feedback Loops        | High   | High   | P2       |
| 15.5  | Conditional Branching | High   | Medium | P2       |
| 15.6  | Consensus Pattern     | Medium | Medium | P3       |

---

## Backward Compatibility

All enhancements are **additive** - existing flows continue to work unchanged:

1. `condition` field already in schema, just needs evaluation
2. New step types (`gate`, `branch`, `consensus`) are optional
3. Loop configuration is optional
4. Judge agent is just another blueprint
5. New templates don't affect existing templates

---

## Success Metrics

1. **Condition Evaluation**: 100% of flows with conditions execute correctly
2. **Quality Gates**: Gate steps correctly pass/fail based on thresholds
3. **Judge Accuracy**: Judge evaluations correlate with human assessment (>80%)
4. **Feedback Improvement**: Loop improves quality score by >0.15 on average
5. **No Regressions**: All existing flow tests continue to pass

---

## Files to Create/Modify Summary

**New Files**:

- `src/flows/gate_evaluator.ts`
- `src/flows/judge_evaluator.ts`
- `src/flows/feedback_loop.ts`
- `src/flows/evaluation_criteria.ts`
- `src/flows/condition_evaluator.ts`
- `Blueprints/Agents/quality-judge.agent.yaml`
- `Blueprints/Flows/templates/llm-judge.flow.template.ts`
- `Blueprints/Flows/templates/self-correcting.flow.template.ts`
- `tests/flows/gate_evaluator_test.ts`
- `tests/flows/judge_evaluator_test.ts`
- `tests/flows/feedback_loop_test.ts`
- `tests/flows/condition_evaluator_test.ts`

**Modified Files**:

- `src/schemas/flow.ts` - Add new step types, loop config
- `src/flows/flow_runner.ts` - Handle conditions, gates, loops
- `src/flows/transforms.ts` - Add evaluation transforms
- `src/flows/dependency_resolver.ts` - Handle branch structures

---

## Next Steps

1. Review and approve this plan
2. Create implementation tickets for each phase
3. Start with Phase 15.1 (lowest risk, enables others)
4. Follow TDD approach for each component
5. Update documentation as features are added
