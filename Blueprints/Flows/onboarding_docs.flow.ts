import { defineFlow } from "./define_flow.ts";

/**
 * Onboarding Documentation Flow
 *
 * A workflow for creating comprehensive onboarding documentation for
 * a codebase. Analyzes the project structure, identifies key concepts,
 * and generates getting started guides, architecture overviews, and
 * contribution guidelines.
 *
 * Use case: Creating documentation for new team members, open source
 * projects, or when establishing a new codebase.
 */
export default defineFlow({
  id: "onboarding-docs",
  name: "Onboarding Documentation Flow",
  description: "Generate comprehensive onboarding documentation for a codebase",
  version: "1.0.0",
  defaultSkills: ["documentation-driven"],
  steps: [
    {
      id: "analyze-project-structure",
      name: "Analyze Project Structure",
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
      id: "identify-key-concepts",
      name: "Identify Key Concepts & Patterns",
      agent: "software-architect",
      dependsOn: ["analyze-project-structure"],
      input: {
        source: "step",
        stepId: "analyze-project-structure",
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
      id: "generate-quickstart",
      name: "Generate Quick Start Guide",
      agent: "technical-writer",
      dependsOn: ["analyze-project-structure"],
      input: {
        source: "step",
        stepId: "analyze-project-structure",
        transform: "appendToRequest",
        transformArgs: { suffix: "\n\nCreate a quick start guide for developers new to this project." },
      },
      skills: ["documentation-driven"],
      timeout: 60000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "generate-architecture-overview",
      name: "Generate Architecture Overview",
      agent: "technical-writer",
      dependsOn: ["identify-key-concepts"],
      input: {
        source: "aggregate",
        from: ["analyze-project-structure", "identify-key-concepts"],
        transform: "mergeAsContext",
      },
      skills: ["documentation-driven"],
      timeout: 60000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "generate-dev-setup",
      name: "Generate Development Setup Guide",
      agent: "technical-writer",
      dependsOn: ["analyze-project-structure"],
      input: {
        source: "step",
        stepId: "analyze-project-structure",
        transform: "appendToRequest",
        transformArgs: { suffix: "\n\nCreate a detailed development environment setup guide." },
      },
      skills: ["documentation-driven"],
      timeout: 45000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "generate-contribution-guide",
      name: "Generate Contribution Guidelines",
      agent: "technical-writer",
      dependsOn: ["identify-key-concepts"],
      input: {
        source: "aggregate",
        from: ["analyze-project-structure", "identify-key-concepts"],
        transform: "appendToRequest",
        transformArgs: { suffix: "\n\nCreate contribution guidelines including code style, PR process, and testing requirements." },
      },
      skills: ["documentation-driven"],
      timeout: 45000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "generate-glossary",
      name: "Generate Glossary & Terminology",
      agent: "technical-writer",
      dependsOn: ["identify-key-concepts"],
      input: {
        source: "step",
        stepId: "identify-key-concepts",
        transform: "appendToRequest",
        transformArgs: { suffix: "\n\nCreate a glossary of key terms and concepts used in this project." },
      },
      skills: ["documentation-driven"],
      timeout: 30000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "compile-onboarding-docs",
      name: "Compile Onboarding Documentation",
      agent: "technical-writer",
      dependsOn: ["generate-quickstart", "generate-architecture-overview", "generate-dev-setup", "generate-contribution-guide", "generate-glossary"],
      input: {
        source: "aggregate",
        from: ["generate-quickstart", "generate-architecture-overview", "generate-dev-setup", "generate-contribution-guide", "generate-glossary"],
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
    from: "compile-onboarding-docs",
    format: "markdown",
  },
  settings: {
    maxParallelism: 4,
    failFast: false,
    timeout: 480000,
  },
});
