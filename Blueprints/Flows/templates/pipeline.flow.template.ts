import { defineFlow } from "./define_flow.ts";

/**
 * Pipeline Flow Template
 *
 * This template demonstrates a basic sequential pipeline pattern where steps
 * execute one after another, with each step receiving input from the previous step.
 *
 * Use this template for:
 * - Linear workflows with clear sequential dependencies
 * - Data processing pipelines
 * - Multi-stage validation or transformation processes
 *
 * Pattern: Step 1 → Step 2 → Step 3 → ... → Final Step
 */

export default defineFlow({
  id: "pipeline-template",
  name: "Pipeline Flow Template",
  description: "Template for sequential pipeline workflows",
  version: "1.0.0",
  steps: [
    {
      id: "initialize",
      name: "Initialize Process",
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
      id: "process-step-1",
      name: "First Processing Step",
      agent: "processor-agent", // Replace with your agent
      dependsOn: ["initialize"],
      input: {
        source: "step",
        stepId: "initialize",
        transform: "passthrough", // Replace with appropriate transform
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "process-step-2",
      name: "Second Processing Step",
      agent: "refiner-agent", // Replace with your agent
      dependsOn: ["process-step-1"],
      input: {
        source: "step",
        stepId: "process-step-1",
        transform: "passthrough", // Replace with appropriate transform
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "finalize",
      name: "Finalize Results",
      agent: "summarizer-agent", // Replace with your agent
      dependsOn: ["process-step-2"],
      input: {
        source: "step",
        stepId: "process-step-2",
        transform: "passthrough", // Replace with appropriate transform
      },
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
  ],
  output: {
    from: "finalize",
    format: "markdown",
  },
  settings: {
    maxParallelism: 1, // Sequential execution
    failFast: true,
    timeout: 300000, // 5 minutes
  },
});

/*
Customization Guide:

1. Replace agent names with your configured agents:
   - coordinator-agent → Your initialization/planning agent
   - processor-agent → Your main processing agent
   - refiner-agent → Your refinement/improvement agent
   - summarizer-agent → Your summarization agent

2. Update step names and descriptions to match your use case

3. Modify transforms based on your data flow needs:
   - "extract_code" - Extract code blocks
   - "merge_as_context" - Combine with additional context
   - "template_fill" - Fill templates with data
   - Custom transforms from src/flows/transforms.ts

4. Adjust retry logic based on step reliability

5. Update timeout and parallelism settings as needed

Example Usage:
```bash
exoctl flow run --file pipeline-template.flow.ts --request "Process this data..."
```
*/
