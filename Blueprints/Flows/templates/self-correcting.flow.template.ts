import { defineFlow } from "../../../src/flows/define_flow.ts";

/**
 * Self-Correcting Flow Template
 *
 * Phase 15: Demonstrates the self-correcting pattern using:
 * - LLM-as-a-Judge evaluation (Phase 15.3)
 * - Quality assessment with built-in criteria
 * - Iterative refinement through feedback
 *
 * This pattern implements iterative improvement where:
 * 1. An agent generates initial output
 * 2. A judge evaluates the output against quality criteria
 * 3. If quality is insufficient, a refiner improves it
 * 4. The final output is produced
 *
 * NOTE: Full feedback loop automation requires schema extensions.
 * This template demonstrates the pattern with manual iteration.
 * See Phase 15.4 FeedbackLoop class for programmatic usage.
 *
 * Use Cases:
 * - Code generation with automatic quality validation
 * - Documentation that must meet specific standards
 * - Any output requiring quality assessment and refinement
 *
 * Required Agents:
 * - generator-agent: Creates initial content
 * - quality-judge: Evaluates output quality (structured JSON output)
 * - refiner-agent: Improves content based on feedback
 *
 * Built-in Criteria (from Phase 15.3):
 * - CODE_CORRECTNESS: Validates syntax and semantics
 * - CODE_COMPLETENESS: Ensures all requirements addressed
 * - FOLLOWS_CONVENTIONS: Checks style compliance
 * - ERROR_HANDLING: Validates error handling presence
 */

export default defineFlow({
  id: "self-correcting-template",
  name: "Self-Correcting Flow Template",
  description:
    "Template for quality-checked flows with LLM-as-a-Judge evaluation",
  version: "1.0.0",
  steps: [
    // Step 1: Initial Generation
    {
      id: "generate-initial",
      name: "Generate Initial Output",
      agent: "generator-agent", // Replace with your generation agent
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

    // Step 2: Quality Evaluation (Judge)
    // The judge agent should output structured JSON with:
    // { overallScore, criteriaScores, pass, feedback, suggestions }
    {
      id: "evaluate-quality",
      name: "Evaluate Output Quality",
      agent: "quality-judge",
      dependsOn: ["generate-initial"],
      input: {
        source: "aggregate",
        from: ["generate-initial"],
        transform: "merge_as_context",
      },
      // Judge will evaluate against criteria defined in its prompt
      retry: {
        maxAttempts: 1,
        backoffMs: 2000,
      },
    },

    // Step 3: Refinement Based on Evaluation
    // Uses feedback from judge to improve the output
    {
      id: "refine-output",
      name: "Refine Output Based on Feedback",
      agent: "refiner-agent", // Replace with your refinement agent
      dependsOn: ["evaluate-quality"],
      input: {
        source: "aggregate",
        from: ["generate-initial", "evaluate-quality"],
        transform: "merge_as_context",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },

    // Step 4: Final Output Assembly
    {
      id: "finalize-output",
      name: "Finalize Output",
      agent: "generator-agent",
      dependsOn: ["refine-output"],
      input: {
        source: "step",
        stepId: "refine-output",
        transform: "passthrough",
      },
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
  ],
  output: {
    from: "finalize-output",
    format: "markdown",
  },
  settings: {
    maxParallelism: 1, // Sequential for feedback flow
    failFast: false, // Allow partial success
    timeout: 600000, // 10 minutes (iterative process takes time)
  },
});

/*
 * Customization Guide:
 *
 * 1. AGENTS:
 *    Replace placeholder agents with your configured agents:
 *    - generator-agent → Your code/content generation agent
 *    - quality-judge → Agent with structured JSON output for evaluation
 *    - refiner-agent → Agent specialized in improvements based on feedback
 *
 * 2. QUALITY JUDGE SETUP:
 *    The judge agent should be configured to output structured JSON:
 *
 *    ```json
 *    {
 *      "overallScore": 0.85,
 *      "criteriaScores": {
 *        "code_correctness": { "score": 0.9, "reasoning": "...", "passed": true },
 *        "completeness": { "score": 0.8, "reasoning": "...", "passed": true }
 *      },
 *      "pass": true,
 *      "feedback": "Overall good quality...",
 *      "suggestions": ["Consider adding...", "Improve..."]
 *    }
 *    ```
 *
 * 3. PROGRAMMATIC FEEDBACK LOOPS:
 *    For automated iteration until quality threshold is met,
 *    use the FeedbackLoop class directly:
 *
 *    ```typescript
 *    import { FeedbackLoop, FeedbackLoopConfig } from "../../src/flows/feedback_loop.ts";
 *    import { GateEvaluator } from "../../src/flows/gate_evaluator.ts";
 *    import { CRITERIA } from "../../src/flows/evaluation_criteria.ts";
 *
 *    const config: FeedbackLoopConfig = {
 *      maxIterations: 3,
 *      targetScore: 0.85,
 *      evaluator: "quality-judge",
 *      criteria: [CRITERIA.CODE_CORRECTNESS, CRITERIA.CODE_COMPLETENESS],
 *      minImprovement: 0.05,
 *    };
 *
 *    const feedbackLoop = new FeedbackLoop(gateEvaluator, improvementAgent);
 *    const result = await feedbackLoop.run(config, initialContent, originalRequest);
 *    ```
 *
 * 4. BUILT-IN CRITERIA (Phase 15.3):
 *    Available criteria from evaluation_criteria.ts:
 *    - CODE_CORRECTNESS: Syntax and semantic correctness
 *    - CODE_COMPLETENESS: All requirements addressed
 *    - HAS_TESTS: Test coverage present
 *    - FOLLOWS_CONVENTIONS: Style compliance
 *    - NO_SECURITY_ISSUES: Security best practices
 *    - ERROR_HANDLING: Error handling quality
 *    - CLARITY: Clear, organized output
 *    - ACCURACY: Factually correct
 *    - RELEVANCE: On-topic response
 *    - DOCUMENTATION_QUALITY: Good documentation
 *
 * Usage Examples:
 *
 * CLI:
 * ```bash
 * exoctl flow run --flow self-correcting-template \
 *   --request "Implement a TypeScript function that validates email addresses"
 * ```
 *
 * Request file:
 * ```markdown
 * ---
 * flow: self-correcting-template
 * tags: [code-generation, quality]
 * ---
 *
 * Create a function that:
 * 1. Validates email format
 * 2. Checks domain existence
 * 3. Returns detailed validation result
 *
 * Include error handling and tests.
 * ```
 *
 * Creating the Quality Judge Agent:
 *
 * ```bash
 * exoctl blueprint create --id quality-judge \
 *   --name "Quality Judge" \
 *   --model anthropic:claude-sonnet
 * ```
 *
 * Then edit Blueprints/Agents/quality-judge.md to include:
 *
 * ```markdown
 * +++
 * agent_id = "quality-judge"
 * name = "Quality Judge"
 * model = "anthropic:claude-3-sonnet"
 * capabilities = ["evaluation", "scoring"]
 * +++
 *
 * # Quality Judge
 *
 * You are an expert code reviewer and quality evaluator.
 *
 * Evaluate outputs against these criteria:
 * - Code correctness and syntax
 * - Completeness of implementation
 * - Adherence to conventions
 * - Error handling quality
 *
 * ALWAYS return structured JSON:
 * {
 *   "overallScore": 0.0-1.0,
 *   "criteriaScores": { ... },
 *   "pass": boolean,
 *   "feedback": "...",
 *   "suggestions": [...]
 * }
 * ```
 *
 * Integration with ExoFrame Phase 15 Components:
 *
 * This template demonstrates the pattern. For full automation:
 * - ConditionEvaluator: Parses gate/branch conditions
 * - GateEvaluator: Validates quality checkpoints
 * - JudgeEvaluator: Executes LLM-based evaluation
 * - FeedbackLoop: Manages iterative refinement
 * - EvaluationCriteria: Built-in quality standards
 *
 * See docs/ExoFrame_Architecture.md#flow-orchestration-architecture
 * for detailed component documentation.
 */
