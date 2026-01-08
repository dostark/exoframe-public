import { defineFlow } from "./define_flow.ts";

/**
 * Fan-Out/Fan-In Flow Template
 *
 * This template demonstrates a parallel processing pattern where a single input
 * is distributed to multiple parallel workers, then their results are aggregated.
 *
 * Use this template for:
 * - Parallel analysis of different aspects of the same data
 * - Multi-perspective evaluation or review
 * - Distributed processing with consolidation
 *
 * Pattern: Input → Split → [Worker 1, Worker 2, Worker 3] → Aggregate → Output
 */

export default defineFlow({
  id: "fan-out-fan-in-template",
  name: "Fan-Out/Fan-In Flow Template",
  description: "Template for parallel processing with result aggregation",
  version: "1.0.0",
  steps: [
    {
      id: "distribute",
      name: "Distribute Work",
      agent: "coordinator-agent", // Replace with your agent
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
      id: "worker-1",
      name: "Worker 1 - First Perspective",
      agent: "specialist-agent-1", // Replace with your agent
      dependsOn: ["distribute"],
      input: {
        source: "step",
        stepId: "distribute",
        transform: "passthrough", // Replace with perspective-specific transform
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "worker-2",
      name: "Worker 2 - Second Perspective",
      agent: "specialist-agent-2", // Replace with your agent
      dependsOn: ["distribute"],
      input: {
        source: "step",
        stepId: "distribute",
        transform: "passthrough", // Replace with perspective-specific transform
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "worker-3",
      name: "Worker 3 - Third Perspective",
      agent: "specialist-agent-3", // Replace with your agent
      dependsOn: ["distribute"],
      input: {
        source: "step",
        stepId: "distribute",
        transform: "passthrough", // Replace with perspective-specific transform
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "aggregate",
      name: "Aggregate Results",
      agent: "synthesizer-agent", // Replace with your agent
      dependsOn: ["worker-1", "worker-2", "worker-3"],
      input: {
        source: "aggregate",
        from: ["worker-1", "worker-2", "worker-3"],
        transform: "merge_as_context", // Combine all worker outputs
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 3000,
      },
    },
  ],
  output: {
    from: "aggregate",
    format: "markdown",
  },
  settings: {
    maxParallelism: 3, // Allow parallel execution of workers
    failFast: false, // Continue if one worker fails
    timeout: 600000, // 10 minutes
  },
});

/*
Customization Guide:

1. Replace agent names with your configured agents:
   - coordinator-agent → Your work distribution agent
   - specialist-agent-1/2/3 → Your specialized worker agents
   - synthesizer-agent → Your result aggregation agent

2. Adjust the number of workers based on your needs:
   - Add/remove worker steps as needed
   - Update dependsOn arrays accordingly
   - Adjust maxParallelism to match worker count

3. Customize transforms for each worker:
   - Use different transforms to give each worker a different perspective
   - Example: "extract_code", "analyze_security", "review_performance"

4. Modify aggregation strategy:
   - "merge_as_context" - Simple concatenation
   - "consensus_merge" - Find common conclusions
   - "weighted_combine" - Weight different perspectives
   - Custom aggregation transforms

5. Configure error handling:
   - failFast: false allows partial results
   - Individual worker retries prevent cascade failures

Example Usage:
```bash
exoctl flow run --file fan-out-fan-in-template.flow.ts --request "Analyze this codebase from multiple perspectives..."
```

Advanced Variations:
- Add a validation step after aggregation
- Include confidence scoring for each worker
- Implement voting/consensus mechanisms
*/
