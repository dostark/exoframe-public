import { defineFlow } from "./define_flow.ts";

export default defineFlow({
  id: "documentation",
  name: "Documentation Generation Flow",
  description: "Generate comprehensive documentation from code and requirements",
  version: "1.0.0",
  defaultSkills: ["documentation-driven"],
  steps: [
    {
      id: "extract-code-structure",
      name: "Extract Code Structure",
      agent: "code-analyst",
      dependsOn: [],
      input: {
        source: "request",
        transform: "extract-code-files",
      },
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "generate-api-docs",
      name: "Generate API Documentation",
      agent: "technical-writer",
      dependsOn: ["extract-code-structure"],
      input: {
        source: "step",
        stepId: "extract-code-structure",
        transform: "focus-api-elements",
      },
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "generate-user-guide",
      name: "Generate User Guide",
      agent: "technical-writer",
      dependsOn: ["extract-code-structure"],
      input: {
        source: "step",
        stepId: "extract-code-structure",
        transform: "focus-user-features",
      },
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "generate-architecture-docs",
      name: "Generate Architecture Documentation",
      agent: "software-architect",
      dependsOn: ["extract-code-structure"],
      input: {
        source: "step",
        stepId: "extract-code-structure",
        transform: "analyze-architecture",
      },
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "compile-documentation",
      name: "Compile Final Documentation",
      agent: "technical-writer",
      dependsOn: ["generate-api-docs", "generate-user-guide", "generate-architecture-docs"],
      input: {
        source: "aggregate",
        transform: "merge-documentation",
      },
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
  ],
  output: {
    from: "compile-documentation",
    format: "markdown",
  },
  settings: {
    maxParallelism: 3,
    failFast: false,
    timeout: 300000,
  },
});
