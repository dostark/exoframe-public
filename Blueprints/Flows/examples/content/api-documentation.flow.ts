import { defineFlow } from "../../../../src/flows/define_flow.ts";

/**
 * API Documentation Flow
 *
 * This example demonstrates creating comprehensive API documentation through
 * staged processing: analysis → structure → content generation → review.
 * It combines code analysis with documentation best practices.
 *
 * Pattern: Sequential documentation pipeline
 * Agents: api-analyst, technical-writer, documentation-reviewer
 */

export default defineFlow({
  id: "api-documentation-flow",
  name: "API Documentation Generation",
  description: "Comprehensive API documentation from code analysis to publication-ready docs",
  version: "1.0.0",
  steps: [
    {
      id: "api-analysis",
      name: "API Structure Analysis",
      agent: "api-analyst",
      dependsOn: [],
      input: {
        source: "request",
        transform: "extract_code",
      },
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "endpoint-documentation",
      name: "Endpoint Documentation",
      agent: "technical-writer",
      dependsOn: ["api-analysis"],
      input: {
        source: "step",
        stepId: "api-analysis",
        transform: "passthrough",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "data-models",
      name: "Data Models & Schemas",
      agent: "technical-writer",
      dependsOn: ["api-analysis"],
      input: {
        source: "step",
        stepId: "api-analysis",
        transform: "passthrough",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "authentication-docs",
      name: "Authentication & Security",
      agent: "security-writer",
      dependsOn: ["api-analysis"],
      input: {
        source: "step",
        stepId: "api-analysis",
        transform: "passthrough",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "examples-integration",
      name: "Code Examples & Integration Guide",
      agent: "technical-writer",
      dependsOn: ["endpoint-documentation", "data-models", "authentication-docs"],
      input: {
        source: "aggregate",
        from: ["endpoint-documentation", "data-models", "authentication-docs"],
        transform: "merge_as_context",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 3000,
      },
    },
    {
      id: "documentation-review",
      name: "Documentation Review & Quality Assurance",
      agent: "documentation-reviewer",
      dependsOn: ["endpoint-documentation", "data-models", "authentication-docs", "examples-integration"],
      input: {
        source: "aggregate",
        from: ["endpoint-documentation", "data-models", "authentication-docs", "examples-integration"],
        transform: "merge_as_context",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
  ],
  output: {
    from: "documentation-review",
    format: "markdown",
  },
  settings: {
    maxParallelism: 3, // Parallel documentation generation
    failFast: false, // Continue if one section fails
    timeout: 900000, // 15 minutes
  },
});

/*
Usage Example:
```bash
exoctl flow run --file api-documentation-flow.flow.ts --request "
Generate comprehensive documentation for this REST API:

```typescript
// User Management API
interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: Date;
}

POST   /api/users          // Create user
GET    /api/users          // List users
GET    /api/users/:id      // Get user
PUT    /api/users/:id      // Update user
DELETE /api/users/:id      // Delete user

// Authentication
POST   /api/auth/login     // Login
POST   /api/auth/refresh   // Refresh token
POST   /api/auth/logout    // Logout
```
"
```

Expected Output:
- Complete API reference with all endpoints
- Request/response schemas and examples
- Authentication and authorization guide
- Error handling documentation
- Code examples in multiple languages
- SDK usage examples
- Best practices and troubleshooting
- Change log and version information
*/
