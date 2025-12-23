# ExoFrame Flow Examples

This directory contains comprehensive examples demonstrating ExoFrame's multi-agent flow orchestration capabilities. These examples serve as both learning resources and practical templates for building complex workflows.

## Overview

ExoFrame flows enable sophisticated multi-agent orchestration with support for:
- **Pipeline execution** - Sequential processing with data transformation
- **Parallel execution** - Concurrent processing with synchronization
- **Fan-out/Fan-in patterns** - Distribute work and aggregate results
- **Staged workflows** - Multi-phase processes with dependencies
- **Error handling** - Retry logic and failure recovery

## ⚠️ Prerequisites

These examples are **reference implementations**. They often use specialized agents (e.g., `security-reviewer`, `performance-reviewer`) that may not exist in your workspace by default.

**Before running an example:**
1. **Check the code:** Open the `.flow.ts` file and look for the `agent:` fields.
2. **Verify agents:** Run `exoctl blueprint list` to see if you have matching agents.
3. **Create missing agents:** Use `exoctl blueprint create` or copy from `Blueprints/Agents/examples/` if available.

## Example Categories

### 🔧 Development Workflows
Code quality assurance, feature development, and software engineering processes.

- **[Code Review Flow](development/code_review.flow.ts)** - Multi-stage code review with linting, security, and peer review
- **[Feature Development Flow](development/feature_development.flow.ts)** - End-to-end feature development from requirements to documentation
- **[Refactoring Flow](development/refactoring.flow.ts)** - Safe code refactoring with testing and validation

### 📝 Content Creation
Documentation, technical writing, and content generation workflows.

- **[API Documentation Flow](content/api_documentation.flow.ts)** - Automated API documentation generation
- **[Technical Writing Flow](content/technical_writing.flow.ts)** - Structured technical content creation
- **[Research Synthesis Flow](content/research_synthesis.flow.ts)** - Multi-perspective research with synthesis

### 🔍 Analysis & Assessment
Code analysis, security audits, and performance evaluations.

- **[Security Audit Flow](analysis/security_audit.flow.ts)** - Comprehensive security assessment
- **[Performance Review Flow](analysis/performance_review.flow.ts)** - Application performance analysis
- **[Code Analysis Flow](analysis/code_analysis.flow.ts)** - Comprehensive codebase analysis

### ⚙️ Operations & Maintenance
System administration, deployment, and operational workflows.

- **[Deployment Flow](operations/deployment.flow.ts)** - Safe application deployment
- **[Monitoring Setup Flow](operations/monitoring.flow.ts)** - System monitoring configuration
- **[Incident Response Flow](operations/incident_response.flow.ts)** - Automated incident handling

## Flow Patterns Demonstrated

### Pipeline Pattern
```typescript
// Sequential processing with data transformation
const pipelineFlow = defineFlow({
  steps: [
    { id: "step1", dependsOn: [], /* ... */ },
    { id: "step2", dependsOn: ["step1"], /* ... */ },
    { id: "step3", dependsOn: ["step2"], /* ... */ },
  ]
});
```

### Fan-out/Fan-in Pattern
```typescript
// Parallel processing with aggregation
const parallelFlow = defineFlow({
  steps: [
    { id: "worker1", dependsOn: [], /* ... */ },
    { id: "worker2", dependsOn: [], /* ... */ },
    { id: "worker3", dependsOn: [], /* ... */ },
    { id: "aggregator", dependsOn: ["worker1", "worker2", "worker3"], /* ... */ },
  ]
});
```

### Staged Pattern
```typescript
// Multi-phase workflow
const stagedFlow = defineFlow({
  steps: [
    // Stage 1
    { id: "stage1-task1", dependsOn: [], /* ... */ },
    { id: "stage1-task2", dependsOn: [], /* ... */ },

    // Stage 2 (depends on stage 1 completion)
    { id: "stage2-task1", dependsOn: ["stage1-task1", "stage1-task2"], /* ... */ },
    { id: "stage2-task2", dependsOn: ["stage1-task1", "stage1-task2"], /* ... */ },
  ]
});
```

## Getting Started

### Running an Example Flow

1. **List available flows:**
   ```bash
   exoctl flow list
   ```

2. **Run a specific flow:**
   ```bash
   exoctl flow run --id code-review --request "Please review this TypeScript code for best practices..."
   ```

3. **Validate a flow:**
   ```bash
   exoctl flow validate Blueprints/Flows/examples/development/code_review.flow.ts
   ```

### Using as Templates

1. **Copy an example:**
   ```bash
   cp Blueprints/Flows/examples/development/code_review.flow.ts my_custom_flow.flow.ts
   ```

2. **Modify for your needs:**
   - Update agent names to match your configured agents
   - Adjust step dependencies and data transformations
   - Customize retry logic and timeouts

3. **Test your flow:**
   ```bash
   exoctl flow validate my_custom_flow.flow.ts
   exoctl flow run --file my_custom_flow.flow.ts --request "Your request here..."
   ```

## Flow Configuration

### Input Sources
- `"request"` - Use the original user request
- `"step"` - Use output from a specific previous step
- `"aggregate"` - Combine outputs from multiple previous steps

### Data Transformations
- `"passthrough"` - Use data unchanged
- `"extract_code"` - Extract code blocks from input
- `"merge_as_context"` - Combine multiple inputs as context
- Custom transforms can be defined in `src/flows/transforms.ts`

### Execution Settings
- `maxParallelism` - Maximum concurrent steps (default: 3)
- `failFast` - Stop on first failure (default: true)
- `timeout` - Flow-level timeout in milliseconds

## Best Practices

### Flow Design
1. **Keep flows focused** - Each flow should solve one specific problem
2. **Use meaningful step IDs** - Choose descriptive, action-oriented names
3. **Handle errors gracefully** - Configure appropriate retry logic
4. **Document complex logic** - Add comments for non-obvious transformations

### Agent Selection
1. **Match agent capabilities** - Choose agents suited to each step's requirements
2. **Consider execution time** - Some agents may be slower but more thorough
3. **Balance cost and quality** - Different agents may have different cost profiles

### Testing & Validation
1. **Validate before running** - Always check flows with `exoctl flow validate`
2. **Test with sample data** - Use realistic test inputs
3. **Monitor execution** - Check activity logs for debugging
4. **Review generated reports** - Use FlowReporter output for analysis

## Integration with FlowReporter

All example flows automatically generate detailed execution reports when run, including:
- Step-by-step execution details
- Performance metrics and timing
- Dependency graphs (Mermaid format)
- Success/failure analysis
- Dataview-compatible metadata for optional Obsidian integration

Reports are saved to `Knowledge/Reports/` with filenames like:
`flow_code-review_run-abc123_2025-12-20T10-30-00.md`

## Contributing

When adding new examples:
1. Follow the established directory structure
2. Include comprehensive documentation
3. Add appropriate test cases
4. Ensure flows validate against FlowSchema
5. Test end-to-end execution with mock agents
6. Update this README with the new example

## Troubleshooting

### Common Issues

**Flow validation fails:**
- Check that all step dependencies exist
- Verify agent names match configured agents
- Ensure input sources and transforms are valid

**Execution hangs:**
- Check for circular dependencies
- Verify agents are properly configured
- Review timeout settings

**Unexpected results:**
- Examine FlowReporter output for step details
- Check activity logs for execution traces
- Validate input data and transformations

### Getting Help

- Check the [ExoFrame Documentation](../../docs/) for detailed guides
- Review [FlowRunner Implementation](../../src/flows/) for technical details
- Examine [Test Cases](../../tests/flows/) for usage examples
