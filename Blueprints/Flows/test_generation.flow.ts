import { defineFlow } from "../../src/flows/define_flow.ts";

/**
 * Test Suite Generation Flow
 *
 * A workflow for generating comprehensive test suites for existing code.
 * Analyzes the code structure, identifies test scenarios, and generates
 * unit tests, integration tests, and edge case coverage.
 *
 * Use case: Adding tests to untested code, improving test coverage,
 * or creating tests before refactoring.
 */
export default defineFlow({
  id: "test-generation",
  name: "Test Suite Generation Flow",
  description: "Generate comprehensive test suites including unit, integration, and edge case tests",
  version: "1.0.0",
  defaultSkills: ["tdd-methodology", "typescript-patterns"],
  steps: [
    {
      id: "analyze-code-structure",
      name: "Analyze Code Structure",
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
      id: "identify-test-scenarios",
      name: "Identify Test Scenarios",
      agent: "test-engineer",
      dependsOn: ["analyze-code-structure"],
      input: {
        source: "step",
        stepId: "analyze-code-structure",
        transform: "mergeAsContext",
      },
      skills: ["tdd-methodology"],
      timeout: 45000,
      retry: {
        maxAttempts: 2,
        backoffMs: 1000,
      },
    },
    {
      id: "generate-unit-tests",
      name: "Generate Unit Tests",
      agent: "test-engineer",
      dependsOn: ["identify-test-scenarios"],
      input: {
        source: "aggregate",
        from: ["analyze-code-structure", "identify-test-scenarios"],
        transform: "mergeAsContext",
      },
      skills: ["tdd-methodology", "typescript-patterns"],
      timeout: 90000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "generate-integration-tests",
      name: "Generate Integration Tests",
      agent: "qa-engineer",
      dependsOn: ["identify-test-scenarios"],
      input: {
        source: "aggregate",
        from: ["analyze-code-structure", "identify-test-scenarios"],
        transform: "mergeAsContext",
      },
      skills: ["tdd-methodology", "error-handling"],
      timeout: 90000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "identify-edge-cases",
      name: "Identify Edge Cases",
      agent: "security-expert",
      dependsOn: ["analyze-code-structure"],
      input: {
        source: "step",
        stepId: "analyze-code-structure",
        transform: "mergeAsContext",
      },
      skills: ["security-first", "error-handling"],
      timeout: 45000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "generate-edge-case-tests",
      name: "Generate Edge Case Tests",
      agent: "test-engineer",
      dependsOn: ["identify-edge-cases", "generate-unit-tests"],
      input: {
        source: "aggregate",
        from: ["identify-edge-cases", "generate-unit-tests"],
        transform: "mergeAsContext",
      },
      skills: ["tdd-methodology", "error-handling"],
      timeout: 60000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "review-test-quality",
      name: "Review Test Quality",
      agent: "quality-judge",
      dependsOn: ["generate-unit-tests", "generate-integration-tests", "generate-edge-case-tests"],
      input: {
        source: "aggregate",
        from: ["generate-unit-tests", "generate-integration-tests", "generate-edge-case-tests"],
        transform: "mergeAsContext",
      },
      skills: ["code-review", "tdd-methodology"],
      timeout: 45000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "compile-test-suite",
      name: "Compile Complete Test Suite",
      agent: "technical-writer",
      dependsOn: ["review-test-quality"],
      input: {
        source: "aggregate",
        from: ["generate-unit-tests", "generate-integration-tests", "generate-edge-case-tests", "review-test-quality"],
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
    from: "compile-test-suite",
    format: "markdown",
  },
  settings: {
    maxParallelism: 3,
    failFast: false,
    timeout: 480000,
  },
});
