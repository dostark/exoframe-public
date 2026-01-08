import { defineFlow } from "./define_flow.ts";

/**
 * Staged Flow Template
 *
 * This template demonstrates a staged processing pattern where work progresses
 * through distinct phases, with each stage building upon the previous one.
 * Unlike pipelines, stages may involve different types of processing or agents.
 *
 * Use this template for:
 * - Multi-phase development processes
 * - Quality assurance workflows
 * - Iterative refinement processes
 * - Complex decision-making flows
 *
 * Pattern: Stage 1 → Stage 2 → Stage 3 → ... → Final Stage
 * Where each stage may use different agents or processing approaches
 */

export default defineFlow({
  id: "staged-template",
  name: "Staged Flow Template",
  description: "Template for multi-stage processing workflows",
  version: "1.0.0",
  steps: [
    {
      id: "stage-1-planning",
      name: "Stage 1: Planning & Analysis",
      agent: "planner-agent", // Replace with your agent
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
      id: "stage-2-development",
      name: "Stage 2: Development & Implementation",
      agent: "developer-agent", // Replace with your agent
      dependsOn: ["stage-1-planning"],
      input: {
        source: "step",
        stepId: "stage-1-planning",
        transform: "passthrough", // Replace with development transform
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "stage-3-validation",
      name: "Stage 3: Validation & Testing",
      agent: "tester-agent", // Replace with your agent
      dependsOn: ["stage-2-development"],
      input: {
        source: "aggregate",
        from: ["stage-1-planning", "stage-2-development"],
        transform: "merge_as_context", // Include planning context
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "stage-4-review",
      name: "Stage 4: Review & Refinement",
      agent: "reviewer-agent", // Replace with your agent
      dependsOn: ["stage-3-validation"],
      input: {
        source: "aggregate",
        from: ["stage-1-planning", "stage-2-development", "stage-3-validation"],
        transform: "merge_as_context", // Full context for review
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "stage-5-deployment",
      name: "Stage 5: Deployment & Documentation",
      agent: "deployer-agent", // Replace with your agent
      dependsOn: ["stage-4-review"],
      input: {
        source: "aggregate",
        from: ["stage-2-development", "stage-4-review"],
        transform: "merge_as_context", // Implementation + review feedback
      },
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
  ],
  output: {
    from: "stage-5-deployment",
    format: "markdown",
  },
  settings: {
    maxParallelism: 1, // Sequential stages
    failFast: true, // Stop on stage failure
    timeout: 900000, // 15 minutes
  },
});

/*
Customization Guide:

1. Replace agent names with your configured agents:
   - planner-agent → Your planning/analysis agent
   - developer-agent → Your implementation agent
   - tester-agent → Your testing/validation agent
   - reviewer-agent → Your review/quality agent
   - deployer-agent → Your deployment/documentation agent

2. Adjust stages based on your process:
   - Add/remove stages as needed
   - Modify stage names and descriptions
   - Update dependency chains

3. Configure input aggregation per stage:
   - Early stages: "request" or single step input
   - Later stages: "aggregate" from multiple previous stages
   - Use transforms to prepare data for each stage

4. Set appropriate timeouts and retry logic:
   - Planning stages: shorter timeouts
   - Development stages: longer timeouts with retries
   - Validation stages: moderate timeouts

5. Consider parallel opportunities within stages:
   - Some stages might allow parallel sub-tasks
   - Use maxParallelism > 1 for parallelizable stages

Example Usage:
```bash
exoctl flow run --file staged-template.flow.ts --request "Develop a new feature with full lifecycle..."
```

Advanced Variations:
- Add conditional branching based on stage results
- Include rollback/compensation steps
- Add quality gates between stages
- Implement iterative loops within stages
*/
