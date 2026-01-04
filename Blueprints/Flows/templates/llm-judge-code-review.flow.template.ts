import { defineFlow } from "../../../src/flows/define_flow.ts";

/**
 * LLM-as-a-Judge Code Review Flow
 *
 * This flow implements the LLM-as-a-Judge pattern for code review:
 * 1. Code is submitted for review
 * 2. Multiple specialized reviewers analyze different aspects
 * 3. A judge agent evaluates all reviews and the original code
 * 4. The judge produces a final, authoritative assessment
 *
 * Pattern: Fan-out to reviewers → Judge synthesizes → Final verdict
 *
 * This pattern is superior to simple aggregation because:
 * - The judge can identify contradictions between reviewers
 * - The judge applies consistent scoring criteria
 * - The judge can request clarification (future: feedback loop)
 * - Structured output enables quality gates
 *
 * Required Agents:
 * - code-analyzer: Initial code structure analysis
 * - security-reviewer: Security-focused review
 * - quality-reviewer: Code quality/maintainability review
 * - quality-judge: Final evaluation and verdict (see Blueprints/Agents/quality-judge.md)
 * - technical-writer: Report generation agent
 *
 * Built-in Transforms Used:
 * - passthrough: Pass data unchanged
 * - merge_as_context: Combine multiple outputs as markdown sections
 * - append_to_request: Include original request with step output
 */

export default defineFlow({
  id: "llm-judge-code-review",
  name: "LLM-as-a-Judge Code Review",
  description: "Multi-perspective code review with LLM judge for final assessment",
  version: "1.0.0",
  steps: [
    // Stage 1: Initial Analysis
    {
      id: "analyze-code",
      name: "Analyze Code Structure",
      agent: "code-analyzer",
      dependsOn: [],
      input: {
        source: "request",
        transform: "passthrough",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 1000,
      },
    },

    // Stage 2: Parallel Specialized Reviews
    {
      id: "security-review",
      name: "Security Analysis",
      agent: "security-reviewer",
      dependsOn: ["analyze-code"],
      input: {
        source: "step",
        stepId: "analyze-code",
        transform: "append_to_request", // Include original code + analysis
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "quality-review",
      name: "Code Quality Analysis",
      agent: "quality-reviewer",
      dependsOn: ["analyze-code"],
      input: {
        source: "step",
        stepId: "analyze-code",
        transform: "append_to_request",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },

    // Stage 3: Judge Evaluation
    // The judge receives all reviews formatted as markdown sections
    {
      id: "judge-evaluation",
      name: "Judge Final Assessment",
      agent: "quality-judge",
      dependsOn: ["security-review", "quality-review"],
      input: {
        source: "aggregate",
        from: ["analyze-code", "security-review", "quality-review"],
        transform: "merge_as_context", // Combines all as ## Step 1, ## Step 2, etc.
      },
      timeout: 60000, // Judge may need more time for thorough evaluation
      retry: {
        maxAttempts: 1,
        backoffMs: 3000,
      },
    },

    // Stage 4: Final Report Generation
    {
      id: "generate-report",
      name: "Generate Final Report",
      agent: "technical-writer",
      dependsOn: ["judge-evaluation"],
      input: {
        source: "aggregate",
        from: [
          "analyze-code",
          "security-review",
          "quality-review",
          "judge-evaluation",
        ],
        transform: "merge_as_context",
      },
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
  ],
  output: {
    from: "generate-report",
    format: "markdown",
  },
  settings: {
    maxParallelism: 2, // Security and quality reviews run in parallel
    failFast: false, // Continue even if one review fails
    timeout: 300000, // 5 minutes total
  },
});

/*
 * Usage:
 *
 * exoctl flow run --flow llm-judge-code-review --request "Review this code: ..."
 *
 * Or drop a request file:
 *
 * ```markdown
 * ---
 * flow: llm-judge-code-review
 * ---
 *
 * Please review the following TypeScript code for security and quality issues:
 *
 * ```typescript
 * // Your code here
 * ```
 * ```
 *
 * Agent Requirements:
 *
 * 1. code-analyzer: General code analysis agent
 *    - Can be the default senior-coder agent
 *
 * 2. security-reviewer: Security-focused agent
 *    - System prompt should emphasize OWASP, injection, auth issues
 *
 * 3. quality-reviewer: Code quality agent
 *    - System prompt should emphasize maintainability, SOLID, DRY
 *
 * 4. quality-judge: The judge agent (see judge.agent.yaml example)
 *    - Must output structured JSON evaluation
 *
 * 5. technical-writer: Report generation agent
 *    - Can be any documentation-focused agent
 *
 * Creating Missing Agents:
 *
 * exoctl blueprint create --id quality-judge --name "Quality Judge" \
 *   --system-prompt "You evaluate code review outputs..."
 *
 * Integration with Quality Gates (Phase 15.2):
 *
 * Once quality gates are implemented, add after judge-evaluation:
 *
 * {
 *   id: "quality-gate",
 *   type: "gate",
 *   dependsOn: ["judge-evaluation"],
 *   evaluate: {
 *     criteria: ["overall_score"],
 *     threshold: 0.7,
 *     onFail: "halt"
 *   }
 * }
 */
