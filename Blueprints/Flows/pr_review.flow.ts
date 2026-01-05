import { defineFlow } from "../../src/flows/define_flow.ts";

/**
 * PR Review Flow
 *
 * A comprehensive pull request review workflow that examines code changes
 * from multiple perspectives: code quality, security, performance, and
 * documentation.
 *
 * Use case: Automated PR review before human review, or as a pre-merge
 * quality gate.
 */
export default defineFlow({
  id: "pr-review",
  name: "Pull Request Review Flow",
  description: "Comprehensive PR review covering code quality, security, performance, and documentation",
  version: "1.0.0",
  defaultSkills: ["code-review"],
  steps: [
    {
      id: "diff-analysis",
      name: "Analyze PR Diff",
      agent: "code-analyst",
      dependsOn: [],
      input: {
        source: "request",
        transform: "passthrough",
      },
      skills: ["code-review", "typescript-patterns"],
      timeout: 60000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "code-quality-review",
      name: "Code Quality Review",
      agent: "senior-coder",
      dependsOn: ["diff-analysis"],
      input: {
        source: "step",
        stepId: "diff-analysis",
        transform: "mergeAsContext",
      },
      skills: ["code-review", "typescript-patterns"],
      timeout: 60000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "security-review",
      name: "Security Review",
      agent: "security-expert",
      dependsOn: ["diff-analysis"],
      input: {
        source: "step",
        stepId: "diff-analysis",
        transform: "mergeAsContext",
      },
      skills: ["security-first"],
      timeout: 45000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "performance-review",
      name: "Performance Impact Review",
      agent: "performance-engineer",
      dependsOn: ["diff-analysis"],
      input: {
        source: "step",
        stepId: "diff-analysis",
        transform: "mergeAsContext",
      },
      skills: ["code-review"],
      timeout: 45000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "test-coverage-review",
      name: "Test Coverage Review",
      agent: "test-engineer",
      dependsOn: ["diff-analysis"],
      input: {
        source: "step",
        stepId: "diff-analysis",
        transform: "mergeAsContext",
      },
      skills: ["tdd-methodology"],
      timeout: 45000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "documentation-review",
      name: "Documentation Review",
      agent: "technical-writer",
      dependsOn: ["diff-analysis"],
      input: {
        source: "step",
        stepId: "diff-analysis",
        transform: "mergeAsContext",
      },
      skills: ["documentation-driven"],
      timeout: 30000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "consolidate-feedback",
      name: "Consolidate Review Feedback",
      agent: "quality-judge",
      dependsOn: ["code-quality-review", "security-review", "performance-review", "test-coverage-review", "documentation-review"],
      input: {
        source: "aggregate",
        from: ["code-quality-review", "security-review", "performance-review", "test-coverage-review", "documentation-review"],
        transform: "mergeAsContext",
      },
      skills: ["code-review"],
      timeout: 60000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "generate-pr-report",
      name: "Generate PR Review Report",
      agent: "technical-writer",
      dependsOn: ["consolidate-feedback"],
      input: {
        source: "aggregate",
        from: ["diff-analysis", "consolidate-feedback"],
        transform: "mergeAsContext",
      },
      skills: ["documentation-driven"],
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
  ],
  output: {
    from: "generate-pr-report",
    format: "markdown",
  },
  settings: {
    maxParallelism: 5, // Run parallel reviews for speed
    failFast: false, // Continue even if one review fails
    timeout: 360000,
  },
});
