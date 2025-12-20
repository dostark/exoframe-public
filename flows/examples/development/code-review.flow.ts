import { defineFlow } from "../../../src/flows/define_flow.ts";

/**
 * Code Review Flow
 *
 * This example demonstrates a comprehensive code review process using a fan-out/fan-in
 * pattern. Multiple specialized agents analyze the code from different perspectives
 * (security, performance, maintainability, best practices), then a senior reviewer
 * synthesizes their findings into actionable feedback.
 *
 * Pattern: Fan-out analysis → Fan-in synthesis
 * Agents: security-reviewer, performance-reviewer, maintainability-reviewer,
 *         best-practices-reviewer, senior-reviewer
 */

export default defineFlow({
  id: "code-review-flow",
  name: "Comprehensive Code Review",
  description: "Multi-perspective code review with specialized analysis and synthesis",
  version: "1.0.0",
  steps: [
    {
      id: "security-analysis",
      name: "Security Analysis",
      agent: "security-reviewer",
      dependsOn: [],
      input: {
        source: "request",
        transform: "extract_code",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "performance-analysis",
      name: "Performance Analysis",
      agent: "performance-reviewer",
      dependsOn: [],
      input: {
        source: "request",
        transform: "extract_code",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "maintainability-analysis",
      name: "Maintainability Analysis",
      agent: "maintainability-reviewer",
      dependsOn: [],
      input: {
        source: "request",
        transform: "extract_code",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "best-practices-analysis",
      name: "Best Practices Analysis",
      agent: "best-practices-reviewer",
      dependsOn: [],
      input: {
        source: "request",
        transform: "extract_code",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "synthesis-review",
      name: "Synthesis and Final Review",
      agent: "senior-reviewer",
      dependsOn: [
        "security-analysis",
        "performance-analysis",
        "maintainability-analysis",
        "best-practices-analysis",
      ],
      input: {
        source: "aggregate",
        from: [
          "security-analysis",
          "performance-analysis",
          "maintainability-analysis",
          "best-practices-analysis",
        ],
        transform: "merge_as_context",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 3000,
      },
    },
  ],
  output: {
    from: "synthesis-review",
    format: "markdown",
  },
  settings: {
    maxParallelism: 4, // Parallel analysis steps
    failFast: false, // Continue if one analysis fails
    timeout: 600000, // 10 minutes
  },
});

/*
Usage Example:
```bash
exoctl flow run --file code-review-flow.flow.ts --request "
Please review this TypeScript function for security, performance, maintainability, and best practices:

```typescript
function processUserData(users: User[]): ProcessedData {
  const results = [];
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (user.isActive) {
      results.push({
        id: user.id,
        name: user.name.toLowerCase(),
        email: user.email,
        processedAt: new Date().toISOString()
      });
    }
  }
  return { data: results, count: results.length };
}
```
"
```

Expected Output:
- Security vulnerabilities and recommendations
- Performance bottlenecks and optimizations
- Maintainability issues and refactoring suggestions
- Best practices compliance and improvements
- Prioritized action items with severity levels
- Overall code quality assessment
*/
