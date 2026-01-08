import { defineFlow } from "./define_flow.ts";

/**
 * API Design Flow
 *
 * A workflow for designing new APIs. Takes requirements and produces
 * a comprehensive API design with endpoints, schemas, error handling,
 * and documentation.
 *
 * Use case: When designing new REST/GraphQL APIs or extending existing ones.
 */
export default defineFlow({
  id: "api-design",
  name: "API Design Flow",
  description: "Design and document APIs from requirements to OpenAPI specification",
  version: "1.0.0",
  defaultSkills: ["typescript-patterns", "documentation-driven"],
  steps: [
    {
      id: "gather-requirements",
      name: "Gather API Requirements",
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
      id: "design-architecture",
      name: "Design API Architecture",
      agent: "software-architect",
      dependsOn: ["gather-requirements"],
      input: {
        source: "step",
        stepId: "gather-requirements",
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
      id: "define-endpoints",
      name: "Define Endpoints & Routes",
      agent: "senior-coder",
      dependsOn: ["design-architecture"],
      input: {
        source: "step",
        stepId: "design-architecture",
        transform: "mergeAsContext",
      },
      skills: ["typescript-patterns"],
      timeout: 60000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "design-schemas",
      name: "Design Request/Response Schemas",
      agent: "senior-coder",
      dependsOn: ["design-architecture"],
      input: {
        source: "step",
        stepId: "design-architecture",
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
      id: "security-design",
      name: "Design Authentication & Security",
      agent: "security-expert",
      dependsOn: ["design-architecture"],
      input: {
        source: "step",
        stepId: "design-architecture",
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
      id: "error-handling",
      name: "Design Error Handling",
      agent: "senior-coder",
      dependsOn: ["define-endpoints", "design-schemas"],
      input: {
        source: "aggregate",
        from: ["define-endpoints", "design-schemas"],
        transform: "mergeAsContext",
      },
      skills: ["error-handling", "typescript-patterns"],
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "performance-considerations",
      name: "Performance & Scalability Review",
      agent: "performance-engineer",
      dependsOn: ["define-endpoints", "design-schemas"],
      input: {
        source: "aggregate",
        from: ["design-architecture", "define-endpoints", "design-schemas"],
        transform: "mergeAsContext",
      },
      skills: ["code-review"],
      timeout: 30000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "compile-api-spec",
      name: "Compile API Specification",
      agent: "technical-writer",
      dependsOn: ["define-endpoints", "design-schemas", "security-design", "error-handling", "performance-considerations"],
      input: {
        source: "aggregate",
        from: ["gather-requirements", "design-architecture", "define-endpoints", "design-schemas", "security-design", "error-handling", "performance-considerations"],
        transform: "mergeAsContext",
      },
      skills: ["documentation-driven"],
      timeout: 60000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
  ],
  output: {
    from: "compile-api-spec",
    format: "markdown",
  },
  settings: {
    maxParallelism: 3,
    failFast: false,
    timeout: 420000,
  },
});
