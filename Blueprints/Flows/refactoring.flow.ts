import { defineFlow } from "./define_flow.ts";

/**
 * Refactoring Flow
 *
 * A workflow for safely refactoring existing code. Analyzes the code,
 * identifies improvement opportunities, implements changes, and ensures
 * the refactoring doesn't break existing functionality.
 *
 * Use case: When you need to improve code quality, reduce technical debt,
 * or restructure code for better maintainability.
 */
export default defineFlow({
  id: "refactoring",
  name: "Code Refactoring Flow",
  description: "Safe code refactoring with analysis, implementation, and validation",
  version: "1.0.0",
  defaultSkills: ["code-review", "typescript-patterns"],
  steps: [
    {
      id: "analyze-current-code",
      name: "Analyze Current Code",
      agent: "code-analyst",
      dependsOn: [],
      input: {
        source: "request",
        transform: "passthrough",
      },
      skills: ["code-review"],
      retry: {
        maxAttempts: 2,
        backoffMs: 1000,
      },
    },
    {
      id: "identify-improvements",
      name: "Identify Improvement Opportunities",
      agent: "software-architect",
      dependsOn: ["analyze-current-code"],
      input: {
        source: "step",
        stepId: "analyze-current-code",
        transform: "mergeAsContext",
      },
      skills: ["exoframe-conventions", "typescript-patterns"],
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "assess-risks",
      name: "Assess Refactoring Risks",
      agent: "qa-engineer",
      dependsOn: ["identify-improvements"],
      input: {
        source: "step",
        stepId: "identify-improvements",
        transform: "mergeAsContext",
      },
      skills: ["tdd-methodology"],
      timeout: 30000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "write-safety-tests",
      name: "Write Safety Tests",
      agent: "test-engineer",
      dependsOn: ["analyze-current-code"],
      input: {
        source: "step",
        stepId: "analyze-current-code",
        transform: "mergeAsContext",
      },
      skills: ["tdd-methodology", "error-handling"],
      retry: {
        maxAttempts: 2,
        backoffMs: 1000,
      },
    },
    {
      id: "implement-refactoring",
      name: "Implement Refactoring",
      agent: "senior-coder",
      dependsOn: ["identify-improvements", "assess-risks", "write-safety-tests"],
      input: {
        source: "aggregate",
        from: ["identify-improvements", "assess-risks", "write-safety-tests"],
        transform: "mergeAsContext",
      },
      skills: ["typescript-patterns", "error-handling"],
      timeout: 90000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "validate-refactoring",
      name: "Validate Refactoring",
      agent: "qa-engineer",
      dependsOn: ["implement-refactoring"],
      input: {
        source: "aggregate",
        from: ["write-safety-tests", "implement-refactoring"],
        transform: "mergeAsContext",
      },
      skills: ["tdd-methodology"],
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "final-review",
      name: "Final Code Review",
      agent: "quality-judge",
      dependsOn: ["validate-refactoring"],
      input: {
        source: "aggregate",
        from: ["analyze-current-code", "implement-refactoring", "validate-refactoring"],
        transform: "mergeAsContext",
      },
      skills: ["code-review"],
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
  ],
  output: {
    from: "final-review",
    format: "markdown",
  },
  settings: {
    maxParallelism: 2,
    failFast: true,
    timeout: 360000,
  },
});
