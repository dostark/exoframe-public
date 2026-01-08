import { defineFlow } from "./define_flow.ts";

/**
 * Security Audit Flow
 *
 * A comprehensive security audit workflow that analyzes code for vulnerabilities,
 * assesses risks, and provides remediation guidance.
 *
 * Use case: Pre-release security review, compliance audits, or periodic
 * security assessments of the codebase.
 */
export default defineFlow({
  id: "security-audit",
  name: "Security Audit Flow",
  description: "Comprehensive security audit with vulnerability assessment and remediation plan",
  version: "1.0.0",
  defaultSkills: ["security-first", "code-review"],
  steps: [
    {
      id: "static-analysis",
      name: "Static Security Analysis",
      agent: "security-expert",
      dependsOn: [],
      input: {
        source: "request",
        transform: "passthrough",
      },
      skills: ["security-first"],
      timeout: 60000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "dependency-audit",
      name: "Dependency Vulnerability Check",
      agent: "security-expert",
      dependsOn: [],
      input: {
        source: "request",
        transform: "appendToRequest",
        transformArgs: { suffix: "\n\nFocus specifically on dependencies and third-party packages." },
      },
      skills: ["security-first"],
      timeout: 45000,
      retry: {
        maxAttempts: 2,
        backoffMs: 1000,
      },
    },
    {
      id: "auth-review",
      name: "Authentication & Authorization Review",
      agent: "security-expert",
      dependsOn: [],
      input: {
        source: "request",
        transform: "appendToRequest",
        transformArgs: { suffix: "\n\nFocus on authentication, authorization, and access control patterns." },
      },
      skills: ["security-first"],
      timeout: 45000,
      retry: {
        maxAttempts: 2,
        backoffMs: 1000,
      },
    },
    {
      id: "data-protection",
      name: "Data Protection Assessment",
      agent: "security-expert",
      dependsOn: [],
      input: {
        source: "request",
        transform: "appendToRequest",
        transformArgs: { suffix: "\n\nFocus on data encryption, PII handling, and sensitive data exposure." },
      },
      skills: ["security-first"],
      timeout: 45000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "consolidate-findings",
      name: "Consolidate Security Findings",
      agent: "security-expert",
      dependsOn: ["static-analysis", "dependency-audit", "auth-review", "data-protection"],
      input: {
        source: "aggregate",
        from: ["static-analysis", "dependency-audit", "auth-review", "data-protection"],
        transform: "mergeAsContext",
      },
      skills: ["security-first", "code-review"],
      timeout: 45000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "risk-assessment",
      name: "Risk Assessment & Prioritization",
      agent: "software-architect",
      dependsOn: ["consolidate-findings"],
      input: {
        source: "step",
        stepId: "consolidate-findings",
        transform: "mergeAsContext",
      },
      skills: ["security-first"],
      timeout: 30000,
      retry: {
        maxAttempts: 1,
        backoffMs: 1000,
      },
    },
    {
      id: "remediation-plan",
      name: "Create Remediation Plan",
      agent: "senior-coder",
      dependsOn: ["consolidate-findings", "risk-assessment"],
      input: {
        source: "aggregate",
        from: ["consolidate-findings", "risk-assessment"],
        transform: "mergeAsContext",
      },
      skills: ["security-first", "typescript-patterns"],
      timeout: 60000,
      retry: {
        maxAttempts: 2,
        backoffMs: 2000,
      },
    },
    {
      id: "generate-report",
      name: "Generate Security Report",
      agent: "technical-writer",
      dependsOn: ["consolidate-findings", "risk-assessment", "remediation-plan"],
      input: {
        source: "aggregate",
        from: ["consolidate-findings", "risk-assessment", "remediation-plan"],
        transform: "mergeAsContext",
      },
      skills: ["documentation-driven"],
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
    maxParallelism: 4, // Run initial audits in parallel
    failFast: false, // Continue even if one audit area fails
    timeout: 480000,
  },
});
