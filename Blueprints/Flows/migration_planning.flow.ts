import { defineFlow } from "./define_flow.ts";

/**
 * Migration Planning Flow
 *
 * A workflow for planning code migrations (framework upgrades, language
 * version bumps, library replacements). Analyzes impact, creates a
 * migration plan, and identifies potential breaking changes.
 *
 * Use case: Planning major dependency upgrades, framework migrations,
 * or architectural changes.
 */
export default defineFlow({
  id: "migration-planning",
  name: "Migration Planning Flow",
  description: "Plan code migrations with impact analysis, risk assessment, and step-by-step execution plan",
  version: "1.0.0",
  defaultSkills: ["typescript-patterns", "code-review"],
  steps: [
    {
      id: "gather-requirements",
      name: "Gather Migration Requirements",
      agent: "product-manager",
      dependsOn: [],
      input: {
        source: "request",
        transform: "passthrough",
      },
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "analyze-current-state",
      name: "Analyze Current Codebase",
      agent: "code-analyst",
      dependsOn: [],
      input: {
        source: "request",
        transform: "passthrough",
      },
      skills: ["code-review", "typescript-patterns"],
      timeout: 90000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "impact-analysis",
      name: "Impact Analysis",
      agent: "software-architect",
      dependsOn: ["gather-requirements", "analyze-current-state"],
      input: {
        source: "aggregate",
        from: ["gather-requirements", "analyze-current-state"],
        transform: "mergeAsContext",
      },
      skills: ["exoframe-conventions", "typescript-patterns"],
      timeout: 60000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "breaking-changes",
      name: "Identify Breaking Changes",
      agent: "senior-coder",
      dependsOn: ["impact-analysis"],
      input: {
        source: "aggregate",
        from: ["gather-requirements", "impact-analysis"],
        transform: "mergeAsContext",
      },
      skills: ["typescript-patterns", "error-handling"],
      timeout: 60000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "risk-assessment",
      name: "Risk Assessment",
      agent: "qa-engineer",
      dependsOn: ["impact-analysis", "breaking-changes"],
      input: {
        source: "aggregate",
        from: ["impact-analysis", "breaking-changes"],
        transform: "mergeAsContext",
      },
      skills: ["tdd-methodology", "error-handling"],
      timeout: 45000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "security-considerations",
      name: "Security Considerations",
      agent: "security-expert",
      dependsOn: ["impact-analysis"],
      input: {
        source: "step",
        stepId: "impact-analysis",
        transform: "mergeAsContext",
      },
      skills: ["security-first"],
      timeout: 30000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "create-migration-plan",
      name: "Create Migration Plan",
      agent: "software-architect",
      dependsOn: ["breaking-changes", "risk-assessment", "security-considerations"],
      input: {
        source: "aggregate",
        from: ["gather-requirements", "impact-analysis", "breaking-changes", "risk-assessment", "security-considerations"],
        transform: "mergeAsContext",
      },
      skills: ["exoframe-conventions"],
      timeout: 90000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "testing-strategy",
      name: "Define Testing Strategy",
      agent: "test-engineer",
      dependsOn: ["create-migration-plan"],
      input: {
        source: "aggregate",
        from: ["breaking-changes", "create-migration-plan"],
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
      id: "generate-documentation",
      name: "Generate Migration Documentation",
      agent: "technical-writer",
      dependsOn: ["create-migration-plan", "testing-strategy"],
      input: {
        source: "aggregate",
        from: ["gather-requirements", "impact-analysis", "breaking-changes", "risk-assessment", "create-migration-plan", "testing-strategy"],
        transform: "mergeAsContext",
      },
      skills: ["documentation-driven"],
      timeout: 60000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
  ],
  output: {
    from: "generate-documentation",
    format: "markdown",
  },
  settings: {
    maxParallelism: 2,
    failFast: false,
    timeout: 540000,
  },
});
