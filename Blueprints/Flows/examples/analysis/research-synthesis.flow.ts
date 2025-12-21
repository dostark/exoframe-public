import { defineFlow } from "../../../src/flows/define_flow.ts";

/**
 * Research Synthesis Flow
 *
 * This example demonstrates synthesizing information from multiple research sources
 * into a comprehensive analysis. Multiple research agents gather information from
 * different perspectives, then a synthesis agent combines and analyzes the findings.
 *
 * Pattern: Parallel research → Synthesis analysis
 * Agents: literature-researcher, data-researcher, expert-consultant, synthesis-analyst
 */

export default defineFlow({
  id: "research-synthesis-flow",
  name: "Research Synthesis and Analysis",
  description: "Multi-source research synthesis with comprehensive analysis and recommendations",
  version: "1.0.0",
  steps: [
    {
      id: "literature-review",
      name: "Literature Review & Academic Research",
      agent: "literature-researcher",
      dependsOn: [],
      input: {
        source: "request",
        transform: "passthrough",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 3000,
      },
    },
    {
      id: "data-analysis",
      name: "Data Analysis & Quantitative Research",
      agent: "data-researcher",
      dependsOn: [],
      input: {
        source: "request",
        transform: "passthrough",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 3000,
      },
    },
    {
      id: "expert-insights",
      name: "Expert Insights & Qualitative Analysis",
      agent: "expert-consultant",
      dependsOn: [],
      input: {
        source: "request",
        transform: "passthrough",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 3000,
      },
    },
    {
      id: "methodology-assessment",
      name: "Methodology Assessment",
      agent: "methodology-expert",
      dependsOn: [],
      input: {
        source: "request",
        transform: "passthrough",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "gap-analysis",
      name: "Research Gaps & Future Directions",
      agent: "strategic-analyst",
      dependsOn: ["literature-review", "data-analysis", "expert-insights"],
      input: {
        source: "aggregate",
        from: ["literature-review", "data-analysis", "expert-insights"],
        transform: "merge_as_context",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "comprehensive-synthesis",
      name: "Comprehensive Synthesis & Recommendations",
      agent: "synthesis-analyst",
      dependsOn: ["literature-review", "data-analysis", "expert-insights", "methodology-assessment", "gap-analysis"],
      input: {
        source: "aggregate",
        from: ["literature-review", "data-analysis", "expert-insights", "methodology-assessment", "gap-analysis"],
        transform: "merge_as_context",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 5000,
      },
    },
  ],
  output: {
    from: "comprehensive-synthesis",
    format: "markdown",
  },
  settings: {
    maxParallelism: 4, // Parallel research streams
    failFast: false, // Continue if one research stream fails
    timeout: 1200000, // 20 minutes
  },
});

/*
Usage Example:
```bash
exoctl flow run --file research-synthesis-flow.flow.ts --request "
Conduct a comprehensive research synthesis on the impact of artificial intelligence
on software development productivity. Focus on:
- Quantitative studies measuring productivity metrics
- Qualitative insights from development teams
- Industry case studies and best practices
- Future trends and predictions
- Methodological approaches and their limitations
"
```

Expected Output:
- Executive summary with key findings
- Detailed analysis of research methodologies
- Quantitative data synthesis and meta-analysis
- Qualitative insights and expert opinions
- Identification of research gaps
- Practical recommendations for organizations
- Future research directions
- Bibliography and source evaluation
*/
