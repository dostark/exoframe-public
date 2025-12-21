import { defineFlow } from "../../../src/flows/define_flow.ts";

/**
 * Feature Development Flow
 *
 * This example demonstrates a staged development process for implementing new features.
 * It follows a structured approach: planning → implementation → testing → documentation.
 * Each stage builds upon the previous one, with comprehensive context sharing.
 *
 * Pattern: Staged development with context accumulation
 * Agents: product-manager, senior-developer, qa-engineer, technical-writer
 */

export default defineFlow({
  id: "feature-development-flow",
  name: "Feature Development Workflow",
  description: "End-to-end feature development with planning, implementation, testing, and documentation",
  version: "1.0.0",
  steps: [
    {
      id: "requirements-analysis",
      name: "Requirements Analysis & Planning",
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
      id: "technical-design",
      name: "Technical Design & Architecture",
      agent: "senior-developer",
      dependsOn: ["requirements-analysis"],
      input: {
        source: "step",
        stepId: "requirements-analysis",
        transform: "passthrough",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "implementation",
      name: "Implementation & Coding",
      agent: "senior-developer",
      dependsOn: ["technical-design"],
      input: {
        source: "aggregate",
        from: ["requirements-analysis", "technical-design"],
        transform: "merge_as_context",
      },
      retry: {
        maxAttempts: 3,
        backoffMs: 5000,
      },
    },
    {
      id: "unit-testing",
      name: "Unit Testing & Validation",
      agent: "qa-engineer",
      dependsOn: ["implementation"],
      input: {
        source: "aggregate",
        from: ["requirements-analysis", "technical-design", "implementation"],
        transform: "merge_as_context",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 3000,
      },
    },
    {
      id: "integration-testing",
      name: "Integration Testing",
      agent: "qa-engineer",
      dependsOn: ["unit-testing"],
      input: {
        source: "aggregate",
        from: ["requirements-analysis", "implementation", "unit-testing"],
        transform: "merge_as_context",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 3000,
      },
    },
    {
      id: "documentation",
      name: "Documentation & User Guide",
      agent: "technical-writer",
      dependsOn: ["integration-testing"],
      input: {
        source: "aggregate",
        from: ["requirements-analysis", "technical-design", "implementation", "integration-testing"],
        transform: "merge_as_context",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
  ],
  output: {
    from: "documentation",
    format: "markdown",
  },
  settings: {
    maxParallelism: 1, // Sequential development stages
    failFast: true, // Stop on critical failures
    timeout: 1800000, // 30 minutes
  },
});

/*
Usage Example:
```bash
exoctl flow run --file feature-development-flow.flow.ts --request "
Implement a user authentication feature for our web application with the following requirements:
- Support email/password and social login (Google, GitHub)
- Include password reset functionality
- JWT-based session management
- Role-based access control (admin, user, guest)
- Secure against common attacks (CSRF, XSS, brute force)
- Mobile-responsive UI components
"
```

Expected Output:
- Complete feature implementation with all code files
- Comprehensive test suite (unit and integration tests)
- API documentation and usage examples
- User guide and deployment instructions
- Security considerations and best practices
- Performance benchmarks and scalability notes
*/
