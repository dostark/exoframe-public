import { defineFlow } from "../../../src/flows/define_flow.ts";

/**
 * Security Audit Flow
 *
 * This example demonstrates a comprehensive security audit using multiple specialized
 * security agents. Each agent focuses on different aspects of security (code security,
 * infrastructure, compliance, risk assessment), then results are synthesized.
 *
 * Pattern: Parallel security analysis → Risk assessment synthesis
 * Agents: code-security-auditor, infrastructure-security-auditor,
 *         compliance-auditor, risk-assessor, security-synthesizer
 */

export default defineFlow({
  id: "security-audit-flow",
  name: "Comprehensive Security Audit",
  description: "Multi-dimensional security assessment with risk analysis and remediation recommendations",
  version: "1.0.0",
  steps: [
    {
      id: "code-security-scan",
      name: "Code Security Analysis",
      agent: "code-security-auditor",
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
      id: "infrastructure-security",
      name: "Infrastructure Security Assessment",
      agent: "infrastructure-security-auditor",
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
      id: "compliance-check",
      name: "Compliance & Regulatory Review",
      agent: "compliance-auditor",
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
      id: "dependency-analysis",
      name: "Dependency & Supply Chain Security",
      agent: "dependency-auditor",
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
      id: "risk-assessment",
      name: "Risk Assessment & Prioritization",
      agent: "risk-assessor",
      dependsOn: ["code-security-scan", "infrastructure-security", "compliance-check", "dependency-analysis"],
      input: {
        source: "aggregate",
        from: ["code-security-scan", "infrastructure-security", "compliance-check", "dependency-analysis"],
        transform: "merge_as_context",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 3000,
      },
    },
    {
      id: "remediation-planning",
      name: "Remediation Planning & Recommendations",
      agent: "security-synthesizer",
      dependsOn: ["risk-assessment"],
      input: {
        source: "aggregate",
        from: ["code-security-scan", "infrastructure-security", "compliance-check", "dependency-analysis", "risk-assessment"],
        transform: "merge_as_context",
      },
      retry: {
        maxAttempts: 2,
        backoffMs: 5000,
      },
    },
  ],
  output: {
    from: "remediation-planning",
    format: "markdown",
  },
  settings: {
    maxParallelism: 4, // Parallel security assessments
    failFast: false, // Continue audit even if some checks fail
    timeout: 900000, // 15 minutes
  },
});

/*
Usage Example:
```bash
exoctl flow run --file security-audit-flow.flow.ts --request "
Perform a comprehensive security audit of this Node.js authentication service:

Key Components:
- JWT token generation and validation
- Password hashing with bcrypt
- Rate limiting and brute force protection
- Input validation and sanitization
- Database connection with PostgreSQL
- HTTPS configuration
- CORS settings
- Environment variable management

Dependencies:
- express: ^4.18.0
- bcryptjs: ^2.4.3
- jsonwebtoken: ^9.0.0
- pg: ^8.8.0
- helmet: ^6.0.0
- express-rate-limit: ^6.6.0

Please assess for OWASP Top 10 vulnerabilities, compliance requirements,
infrastructure security, and provide prioritized remediation recommendations.
"
```

Expected Output:
- Executive summary with overall security posture
- Detailed vulnerability findings by category
- Risk assessment with CVSS scores and business impact
- Compliance gaps and regulatory considerations
- Prioritized remediation roadmap
- Security best practices recommendations
- Monitoring and incident response guidance
*/
