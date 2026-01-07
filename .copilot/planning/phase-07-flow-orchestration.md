
## Phase 7: Flow Orchestration (Multi-Agent Coordination) ✅ COMPLETED

> **Status:** ✅ COMPLETED
> **Prerequisites:** Phases 1–6 (Core system validated via Testing & QA)
> **Goal:** Enable declarative multi-agent workflows with dependency resolution, parallel execution, and result aggregation.

### Overview

Currently, ExoFrame supports **single-agent execution** via `AgentRunner`. Phase 7 introduces **Flows** — TypeScript-defined orchestrations that coordinate multiple agents working together on complex tasks.

**Use Cases:**

| Flow Pattern       | Example                                       | Execution Model          |
| ------------------ | --------------------------------------------- | ------------------------ |
| **Pipeline**       | Lint → Security → Review → Summary            | Sequential with handoffs |
| **Fan-Out/Fan-In** | Multiple researchers → Synthesizer            | Parallel then merge      |
| **Staged**         | Architect → Implementer → Tester              | Sequential with gates    |
| **Hybrid**         | Analyzer + Transformer (parallel) → Validator | Mixed                    |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FlowRunner                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Flow Parser │  │ Dependency  │  │ Parallel Executor   │  │
│  │ (TypeScript)│  │ Resolver    │  │ (Semaphore-limited) │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    AgentRunner (existing)                   │
├─────────────────────────────────────────────────────────────┤
│                    Activity Journal                         │
└─────────────────────────────────────────────────────────────┘
```

**Key Components:**

- **FlowRunner** — Orchestrates multi-step execution, manages state
- **DependencyResolver** — Topological sort, cycle detection, wave grouping
- **AgentRunner** — Existing single-agent executor (reused per step)
- **Activity Journal** — Logs all flow/step events for audit trail

---

### Step 7.1: Flow Definition Schema ✅ COMPLETED

- **Dependencies:** Step 3.1 (Blueprint Service)
- **Rollback:** Feature flag `ENABLE_FLOWS=false`
- **Action:** Define Zod schemas for `FlowStep` and `Flow` types
- **Location:** `src/schemas/flow.ts`

**FlowStep Fields:**

| Field               | Type     | Required | Description                                    |
| ------------------- | -------- | -------- | ---------------------------------------------- |
| `id`                | string   | ✓        | Unique step identifier                         |
| `name`              | string   | ✓        | Human-readable name                            |
| `agent`             | string   | ✓        | Blueprint reference from `/Blueprints/Agents/` |
| `dependsOn`         | string[] |          | Steps that must complete first                 |
| `input.source`      | enum     |          | `"request"`, `"step"`, or `"aggregate"`        |
| `input.stepId`      | string   |          | Source step for `"step"` source                |
| `input.transform`   | string   |          | Transform function name                        |
| `condition`         | string   |          | Skip step if evaluates false                   |
| `timeout`           | number   |          | Step timeout in ms                             |
| `retry.maxAttempts` | number   |          | Retry count (default: 1)                       |
| `retry.backoffMs`   | number   |          | Backoff delay (default: 1000)                  |

**Flow Fields:**

| Field                     | Type            | Required | Description                           |
| ------------------------- | --------------- | -------- | ------------------------------------- |
| `id`                      | string          | ✓        | Unique flow identifier                |
| `name`                    | string          | ✓        | Human-readable name                   |
| `description`             | string          | ✓        | What the flow accomplishes            |
| `version`                 | string          |          | Semver (default: "1.0.0")             |
| `steps`                   | FlowStep[]      | ✓        | Ordered step definitions              |
| `output.from`             | string/string[] | ✓        | Which step(s) produce final output    |
| `output.format`           | enum            |          | `"markdown"`, `"json"`, `"concat"`    |
| `settings.maxParallelism` | number          |          | Max concurrent agents (default: 3)    |
| `settings.failFast`       | boolean         |          | Stop on first failure (default: true) |
| `settings.timeout`        | number          |          | Global flow timeout in ms             |

**Success Criteria:**

- [x] Zod schemas correctly validate valid flow definitions with all required fields
- [x] Schema rejects invalid flow definitions with descriptive error messages for missing required fields, wrong data types, and invalid enum values
- [x] FlowStep schema validates unique step IDs, valid agent references, and proper dependency arrays
- [x] Flow schema validates complete flow structures including steps array, output configuration, and settings
- [x] Schema types are properly exported and importable by FlowRunner and other services
- [x] Default values are correctly applied for optional fields

**Implemented Tests:**

- [x] `tests/schemas/flow_schema_test.ts`: Unit tests for FlowStep schema validation covering valid and invalid inputs
- [x] `tests/schemas/flow_schema_test.ts`: Unit tests for Flow schema validation with complete flow definitions
- [x] Test cases for missing required fields (id, name, agent) producing specific error messages
- [x] Test cases for invalid data types (string instead of number for timeout) being rejected
- [x] Test cases for invalid enum values (invalid input.source values) being rejected
- [x] Integration test ensuring schema types can be imported and used in FlowRunner
- [x] Test for default value application on optional fields

---

### Step 7.2: Flow File Format ✅ COMPLETED

- **Dependencies:** Step 7.1
- **Rollback:** N/A (file format only)
- **Action:** Define TypeScript-based flow definitions in `/Blueprints/Flows/`
- **Convention:** Files named `<flow-id>.flow.ts`

**Why TypeScript (not TOML/YAML)?**

| Benefit     | Explanation                                |
| ----------- | ------------------------------------------ |
| Type Safety | IDE autocomplete, compile-time validation  |
| Flexibility | Conditional logic, dynamic step generation |
| Transforms  | Functions not string DSL                   |
| Consistency | Same language as codebase                  |

**File Structure:**

```
/Blueprints/Flows/
├── code_review.flow.ts
├── feature_development.flow.ts
├── documentation.flow.ts
└── research.flow.ts
```

**Success Criteria:**

- [x] `defineFlow()` helper function provides full TypeScript type safety with autocomplete and compile-time validation
- [x] Flow files can be dynamically imported and parsed without runtime errors
- [x] Flow definitions are properly typed, preventing invalid configurations at development time
- [x] Example flow files are created demonstrating pipeline, fan-out/fan-in, staged, and hybrid patterns
- [x] Flow files follow consistent naming convention and structure

**Implemented Tests:**

- [x] `tests/flows/flow_loader_test.ts`: Unit tests for dynamic import functionality of flow files
- [x] `tests/flows/define_flow_test.ts`: Tests for defineFlow helper function type safety and validation
- [x] Type checking tests ensuring flow definitions are properly typed
- [x] Integration tests loading example flow files and verifying their structure
- [x] Tests for flow file naming conventions and directory structure
- [x] Error handling tests for malformed or missing flow files

---

### Step 7.3: Dependency Graph Resolver ✅ COMPLETED

- **Dependencies:** Step 7.1
- **Rollback:** Revert to sequential execution
- **Action:** Implement topological sort and cycle detection
- **Location:** `src/flows/dependency_resolver.ts`

**Responsibilities:**

1. **Cycle Detection** — DFS with visited/inStack tracking; throw `FlowValidationError` with cycle path
2. **Topological Sort** — Kahn's algorithm for valid execution order
3. **Wave Grouping** — Group steps by dependency depth for parallel execution

**Wave Resolution Example:**

```
Input:                          Output Waves:
  A (no deps)                     Wave 1: [A, B]  ← parallel
  B (no deps)                     Wave 2: [C]     ← waits for wave 1
  C (depends: A, B)               Wave 3: [D]     ← waits for wave 2
  D (depends: C)
```

**Success Criteria:**

- [x] Cycle detection algorithm correctly identifies circular dependencies and throws FlowValidationError with cycle path details
- [x] Topological sort using Kahn's algorithm produces a valid execution order for acyclic graphs
- [x] Wave grouping correctly batches steps by dependency levels for parallel execution
- [x] Complex dependency graphs with multiple branches are resolved into correct execution waves
- [x] Self-referencing dependencies are detected and rejected
- [x] Empty dependency arrays are handled correctly

**Planned Tests:**

- [x] `tests/flows/dependency_resolver_test.ts`: Comprehensive unit tests for DependencyResolver class
- [x] Cycle detection tests: A→B→C→A, A→A, complex cycles with multiple nodes
- [x] Topological sort tests: Linear chain, diamond pattern, complex DAGs
- [x] Wave grouping tests: Parallel steps in same wave, sequential dependencies across waves
- [x] Edge case tests: Single step, all parallel steps, all sequential steps, empty flows
- [x] Error handling tests: Invalid step IDs in dependencies, malformed dependency arrays
- [x] Performance tests: Large graphs with many steps and dependencies

---

### Step 7.4: FlowRunner Service ✅ COMPLETED

- **Dependencies:** Steps 7.1–7.3, Step 3.2 (AgentRunner)
- **Rollback:** Disable flow execution, fall back to single-agent mode
- **Action:** Implement core flow execution engine
- **Location:** `src/flows/flow_runner.ts`

**Execution Algorithm:**

1. Generate `flowRunId` (UUID)
2. Log `flow.started` to Activity Journal
3. Resolve step waves via DependencyResolver
4. For each wave:
   - Execute steps in parallel (semaphore-limited)
   - Collect results into `Map<stepId, StepResult>`
   - If `failFast` and any step failed → throw `FlowExecutionError`
5. Aggregate output from designated step(s)
6. Log `flow.completed` to Activity Journal
7. Return `FlowResult` with all step results

**Activity Journal Events:**

| Event                         | Payload Fields                                                                                     | Description                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------- |
| `flow.validating`             | `flowId, stepCount`                                                                                | Flow validation started          |
| `flow.validated`              | `flowId, stepCount, maxParallelism, failFast`                                                      | Flow validation successful       |
| `flow.validation.failed`      | `flowId, error`                                                                                    | Flow validation failed           |
| `flow.started`                | `flowRunId, flowId, stepCount, maxParallelism, failFast`                                           | Flow execution started           |
| `flow.dependencies.resolving` | `flowRunId, flowId`                                                                                | Dependency resolution started    |
| `flow.dependencies.resolved`  | `flowRunId, flowId, waveCount, totalSteps`                                                         | Dependencies resolved into waves |
| `flow.wave.started`           | `flowRunId, waveNumber, waveSize, stepIds`                                                         | Wave execution started           |
| `flow.wave.completed`         | `flowRunId, waveNumber, waveSize, successCount, failureCount, failed`                              | Wave execution completed         |
| `flow.step.queued`            | `flowRunId, stepId, agent, dependencies, inputSource`                                              | Step queued for execution        |
| `flow.step.started`           | `flowRunId, stepId, agent`                                                                         | Step execution started           |
| `flow.step.input.prepared`    | `flowRunId, stepId, inputSource, hasContext`                                                       | Step input prepared              |
| `flow.step.completed`         | `flowRunId, stepId, agent, success, duration, outputLength, hasThought`                            | Step completed successfully      |
| `flow.step.failed`            | `flowRunId, stepId, agent, error, errorType, duration`                                             | Step execution failed            |
| `flow.output.aggregating`     | `flowRunId, flowId, outputFrom, outputFormat, totalSteps`                                          | Output aggregation started       |
| `flow.output.aggregated`      | `flowRunId, flowId, outputLength`                                                                  | Output aggregation completed     |
| `flow.completed`              | `flowRunId, flowId, success, duration, stepsCompleted, successfulSteps, failedSteps, outputLength` | Flow completed successfully      |
| `flow.failed`                 | `flowRunId, flowId, error, errorType, duration, stepsAttempted, successfulSteps, failedSteps`      | Flow execution failed            |

**Success Criteria:**

- [x] FlowRunner successfully executes simple sequential flows with proper step ordering
- [x] Parallel steps execute concurrently within the same wave
- [x] Step failures are handled according to failFast setting: stops execution on first failure when enabled, continues when disabled
- [x] All flow and step lifecycle events are logged via EventLogger interface with correct trace IDs
- [x] FlowRunner integrates with AgentExecutor interface for individual step execution
- [x] Flow execution generates unique flowRunId and tracks execution duration
- [x] Semaphore limits concurrent step execution according to maxParallelism setting
- [x] Flow results aggregate outputs from designated steps in specified format
- [x] Empty flows are properly rejected with appropriate error messages

**Planned Tests:**

- [x] `tests/flows/flow_runner_test.ts`: Integration tests for FlowRunner execution engine
- [x] `FlowRunner: executes simple sequential flow` - Verifies sequential step execution with dependency ordering and proper result aggregation
- [x] `FlowRunner: executes parallel steps in same wave` - Tests concurrent execution of steps within the same dependency wave
- [x] `FlowRunner: handles failFast behavior` - Validates that flow stops on first step failure when failFast is enabled
- [x] `FlowRunner: continues execution when failFast is false` - Confirms flow continues executing remaining steps when failFast is disabled
- [x] `FlowRunner: respects maxParallelism setting` - Ensures semaphore limits concurrent step execution according to maxParallelism
- [x] `FlowRunner: generates unique flowRunId` - Verifies each flow execution gets a unique UUID identifier
- [x] `FlowRunner: aggregates output from multiple steps` - Tests output aggregation from designated steps in specified format
- [x] `FlowRunner: handles empty flow` - Validates proper error handling for flows with no steps

---

### Step 7.5: Flow CLI Commands ✅ COMPLETED

- **Dependencies:** Step 7.4
- **Rollback:** Remove commands from CLI
- **Action:** Add `exoctl flow` subcommands for flow management and execution
- **Location:** `src/cli/flow_commands.ts`

**File Structure:**

```
src/cli/
├── flow_commands.ts          # Main flow command definitions
├── base.ts                   # Shared CLI utilities
└── exoctl.ts                 # Main CLI entry point
```

**Integration Points:**

- **FlowRunner:** Executes flows via `FlowRunner.execute()`
- **DependencyResolver:** Analyzes flow dependencies for `show` and `plan` commands
- **EventLogger:** Records CLI operations in Activity Journal
- **Request Processor:** Links flow executions to user requests
- **File System:** Reads flow definitions from `/Blueprints/Flows/`

**Commands:**

| Command                                    | Description                             | Output Format                           |
| ------------------------------------------ | --------------------------------------- | --------------------------------------- |
| `exoctl flow list`                         | List all flows in `/Blueprints/Flows/`  | Table with ID, Name, Steps, Description |
| `exoctl flow show <id>`                    | Display flow steps and dependency graph | ASCII graph + step details table        |
| `exoctl flow run <id> --request <req-id>`  | Execute flow for a request              | Execution report with step results      |
| `exoctl flow plan <id> --request <req-id>` | Dry-run: show execution plan            | Wave-by-wave execution plan             |
| `exoctl flow history <id>`                 | Show past executions                    | Table of executions with status/timing  |
| `exoctl flow validate <file>`              | Validate flow definition                | Validation report with errors/warnings  |

**Command Details:**

**`exoctl flow list`**

- Scans `/Blueprints/Flows/` directory for `.toml` files
- Parses flow metadata (id, name, description, version)
- Counts steps in each flow
- Displays in tabular format with sorting options
- Shows flow status (valid/invalid) based on schema validation

**`exoctl flow show <id>`**

- Loads flow definition from `/Blueprints/Flows/<id>.toml`
- Validates flow schema and dependencies
- Renders ASCII dependency graph showing step relationships
- Displays detailed step information table
- Shows execution waves and parallel groups
- Includes flow settings (maxParallelism, failFast, output format)

**`exoctl flow run <id> --request <req-id>`**

- Validates flow and request existence
- Creates FlowRunner instance with dependencies
- Executes flow with real-time progress reporting
- Generates execution report with step-by-step results
- Updates request status and links execution trace
- Handles execution errors with detailed error reporting

**`exoctl flow plan <id> --request <req-id>`**

- Performs dry-run analysis without executing agents
- Shows execution waves and step ordering
- Validates all dependencies and step configurations
- Estimates execution time based on historical data
- Reports potential parallelism and bottlenecks
- Validates request data availability for each step

**`exoctl flow history <id>`**

- Queries Activity Journal for flow executions
- Groups executions by flowRunId
- Shows execution status, duration, and step counts
- Displays recent executions with timestamps
- Provides filtering options (date range, status, request ID)

**`exoctl flow validate <file>`**

- Validates flow TOML against Flow schema
- Checks step dependencies for cycles and invalid references
- Validates agent references against available blueprints
- Reports schema errors with line numbers and suggestions
- Performs semantic validation (input/output compatibility)

**Error Handling:**

- **Invalid Flow ID:** "Flow 'invalid-id' not found in /Blueprints/Flows/"
- **Malformed Flow:** "Flow validation failed: missing required field 'steps'"
- **Dependency Cycle:** "Flow contains circular dependency: step1 → step2 → step1"
- **Missing Agent:** "Step 'code-review' references unknown agent 'nonexistent-agent'"
- **Invalid Request:** "Request 'invalid-id' not found in /Inbox/Requests/"
- **Execution Failure:** "Flow execution failed at step 'test-step': agent timeout"

**Output Formats:**

**Flow List Output:**

```
Available Flows:
┌─────────────┬─────────────────┬───────┬─────────────────────────────────────┐
│ ID          │ Name            │ Steps │ Description                         │
├─────────────┼─────────────────┼───────┼─────────────────────────────────────┤
│ code-review │ Code Review     │ 3     │ Automated code review workflow      │
│ deploy      │ Deployment      │ 5     │ Multi-stage deployment pipeline     │
│ research    │ Research        │ 4     │ Research and analysis workflow      │
└─────────────┴─────────────────┴───────┴─────────────────────────────────────┘
```

**Flow Show Output:**

```
Flow: code-review (v1.0.0)
Description: Automated code review workflow

Dependency Graph:
  lint
    └── test
        └── review

Execution Waves:
Wave 1: lint, format (parallel)
Wave 2: test (depends on Wave 1)
Wave 3: review (depends on Wave 2)

Steps:
┌─────────┬──────────────┬─────────────────┬─────────────────────┐
│ ID      │ Agent        │ Dependencies    │ Description         │
├─────────┼──────────────┼─────────────────┼─────────────────────┤
│ lint    │ eslint-agent │ []              │ Code linting        │
│ format  │ prettier-bot │ []              │ Code formatting     │
│ test    │ test-runner  │ [lint, format]  │ Unit test execution │
│ review  │ reviewer-ai  │ [test]          │ Code review         │
└─────────┴──────────────┴─────────────────┴─────────────────────┘

Settings: maxParallelism=3, failFast=true, output=markdown
```

**Success Criteria:**

- [x] `exoctl flow list` displays all available flows with their IDs, names, descriptions, and step counts
- [x] `exoctl flow show <id>` renders a clear dependency graph showing steps and their relationships
- [x] `exoctl flow plan <id> --request <req-id>` shows execution waves and step order without executing the flow
- [x] `exoctl flow run <id> --request <req-id>` executes the flow and generates a comprehensive report
- [x] `exoctl flow validate <file>` validates flow definitions and reports specific schema errors
- [x] `exoctl flow history <id>` shows past flow executions with status and timing information
- [x] All commands provide helpful error messages for invalid inputs or missing flows
- [x] Commands integrate with existing CLI infrastructure and follow consistent patterns
- [x] CLI commands handle large flows efficiently without performance degradation
- [x] Commands support both interactive and scripted usage patterns
- [x] Flow execution reports include timing data and step-by-step results

**Planned Tests:**

- [x] `tests/cli/flow_commands_test.ts`: CLI integration tests for all flow commands
- [x] `exoctl flow list` tests: Lists flows correctly, handles empty directory, shows step counts
- [x] `exoctl flow show` tests: Displays dependency graphs, handles missing flows, formats output correctly
- [x] `exoctl flow plan` tests: Shows execution waves without running, validates request IDs
- [x] `exoctl flow run` tests: Executes flows end-to-end, creates reports, handles execution errors
- [x] `exoctl flow validate` tests: Validates correct flows, rejects invalid flows with specific errors
- [x] `exoctl flow history` tests: Shows execution history, handles flows with no history
- [x] Error handling tests: Invalid flow IDs, malformed requests, permission issues
- [x] Integration tests with mock flows and requests
- [x] Performance tests: Large flow handling, many concurrent executions
- [x] Output formatting tests: Table rendering, graph display, report generation

---

### Step 7.6: Flow-Aware Request Routing ✅ COMPLETED

- **Dependencies:** Steps 7.4, 7.5
- **Rollback:** Ignore `flow` field in requests
- **Action:** Enable requests to specify `flow:` field for multi-agent execution
- **Location:** `src/services/request_router.ts`

**File Structure:**

```
src/services/
├── request_router.ts          # Main routing logic with flow support
├── request_processor.ts       # Request lifecycle management
└── request_parser.ts          # Frontmatter parsing utilities
```

**Integration Points:**

- **FlowRunner:** Executes flows when `flow:` field is detected
- **AgentRunner:** Executes single agents for `agent:` field (existing)
- **FlowValidator:** Validates flow existence and schema before routing
- **EventLogger:** Records routing decisions in Activity Journal
- **RequestParser:** Extracts flow/agent fields from frontmatter

**Routing Logic:**

**Priority Order:**

1. **Flow Field Present**: `flow: <id>` → Route to FlowRunner
2. **Agent Field Present**: `agent: <id>` → Route to AgentRunner (legacy)
3. **Neither Field**: Use default agent from configuration

**Validation Steps:**

1. Parse request frontmatter for `flow` and `agent` fields
2. If `flow` field exists:
   - Validate flow ID exists in `/Blueprints/Flows/`
   - Load and validate flow schema
   - Check flow dependencies (agents, transforms)
3. If `agent` field exists:
   - Validate agent exists in blueprints
   - Use existing AgentRunner path
4. If neither field:
   - Use default agent from `exo.config.toml`

**Request Frontmatter Examples:**

**Flow Request:**

```yaml
---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
status: pending
flow: code-review
tags: [review, pr-42]
priority: high
---
Please review this pull request for security issues and code quality.
```

**Agent Request (Legacy):**

```yaml
---
trace_id: "550e8400-e29b-41d4-a716-446655440001"
status: pending
agent: senior-coder
tags: [implementation]
---
Implement a new feature following the requirements in the attached spec.
```

**Default Agent Request:**

```yaml
---
trace_id: "550e8400-e29b-41d4-a716-446655440002"
status: pending
tags: [general]
---
Please help me understand this codebase structure.
```

**Error Handling:**

- **Invalid Flow ID:** "Flow 'nonexistent-flow' not found in /Blueprints/Flows/"
- **Malformed Flow:** "Flow 'broken-flow' has invalid schema: missing required field 'steps'"
- **Missing Dependencies:** "Flow 'code-review' references unknown agent 'missing-agent'"
- **Circular Dependencies:** "Flow 'circular-flow' contains dependency cycle: step1 → step2 → step1"
- **Invalid Agent:** "Agent 'unknown-agent' not found in blueprints"
- **Conflicting Fields:** "Request cannot specify both 'flow' and 'agent' fields"
- **Empty Flow:** "Flow 'empty-flow' must contain at least one step"

**Activity Journal Events:**

| Event                            | Payload Fields                            |
| -------------------------------- | ----------------------------------------- |
| `request.routing.flow`           | `requestId, flowId, traceId`              |
| `request.routing.agent`          | `requestId, agentId, traceId`             |
| `request.routing.default`        | `requestId, defaultAgentId, traceId`      |
| `request.routing.error`          | `requestId, error, field, value, traceId` |
| `request.flow.validated`         | `requestId, flowId, stepCount, traceId`   |
| `request.flow.validation.failed` | `requestId, flowId, error, traceId`       |

**Success Criteria:**

- [x] Requests with `flow:` field in frontmatter are correctly routed to FlowRunner for multi-agent execution
- [x] Requests with `agent:` field continue to use the existing AgentRunner for single-agent execution
- [x] Requests without flow or agent fields use the default agent as before
- [x] Invalid flow IDs produce clear error messages indicating the flow was not found
- [x] Flow validation occurs before routing to prevent execution of invalid flows
- [x] Request router maintains backward compatibility with existing single-agent requests
- [x] Routing decision is logged to Activity Journal with trace_id for audit trail
- [x] Conflicting flow/agent fields in the same request produce clear error messages
- [x] Flow dependencies (agents, transforms) are validated before routing
- [x] Request routing handles malformed frontmatter gracefully with helpful error messages
- [x] Routing performance doesn't degrade with large numbers of flows or requests
- [x] Request router integrates seamlessly with existing request processing pipeline

**Planned Tests:**

- [x] `tests/services/request_router_test.ts`: Unit and integration tests for request routing logic
- [x] Flow routing tests: Requests with valid flow IDs are routed to FlowRunner
- [x] Agent routing tests: Requests with agent IDs use AgentRunner
- [x] Default routing tests: Requests without flow/agent use default agent
- [x] Error handling tests: Invalid flow IDs produce descriptive errors
- [x] Backward compatibility tests: Existing requests continue to work unchanged
- [x] Activity Journal logging tests: Routing decisions are properly logged
- [x] Edge case tests: Malformed frontmatter, conflicting flow/agent fields
- [x] Validation tests: Flow schema validation before routing
- [x] Performance tests: Routing performance with many flows
- [x] Integration tests: End-to-end request processing with routing

---

### Step 7.7: Inter-Step Communication ✅ COMPLETED

- **Dependencies:** Step 7.4 (FlowRunner Service)
- **Rollback:** Steps only receive original request, no inter-step data flow
- **Action:** Implement input/output passing between flow steps with transform functions
- **Location:** `src/flows/transforms.ts`, `src/flows/flow_runner.ts`

**Problem Statement:**

Flow steps need to communicate with each other - the output of one step becomes the input for dependent steps. Without inter-step communication, flows are limited to independent parallel execution only.

**The Solution: Transform-Based Data Flow**

Implement a flexible transform system that allows steps to:

1. **Receive inputs** from multiple sources (original request, previous step outputs, aggregated results)
2. **Apply transformations** to combine, filter, or restructure data
3. **Pass outputs** to dependent steps in the required format

**Input Source Types:**

| Source Type   | Description                          | Example                                                    |
| ------------- | ------------------------------------ | ---------------------------------------------------------- |
| `"request"`   | Original request content             | `{input: {source: "request"}}`                             |
| `"step"`      | Output from specific step            | `{input: {source: "step", stepId: "analyze"}}`             |
| `"aggregate"` | Combined outputs from multiple steps | `{input: {source: "aggregate", from: ["step1", "step2"]}}` |

**Built-in Transform Functions:**

| Transform         | Purpose                                       | Input                     | Output                                           |
| ----------------- | --------------------------------------------- | ------------------------- | ------------------------------------------------ |
| `passthrough`     | Pass data unchanged                           | Any string                | Same string                                      |
| `mergeAsContext`  | Combine multiple outputs as markdown sections | Array of strings          | `## Step 1\n{content1}\n\n## Step 2\n{content2}` |
| `extractSection`  | Extract specific markdown section             | String, section name      | Content of `## Section Name`                     |
| `appendToRequest` | Prepend original request to step output       | Request + step output     | `Original: {request}\n\nStep Output: {output}`   |
| `jsonExtract`     | Extract JSON field from output                | JSON string, field path   | Field value                                      |
| `templateFill`    | Fill template with step outputs               | Template string + context | Rendered template                                |

**Custom Transform Functions:**

Flows can define inline transform functions in TypeScript:

```typescript
const researchFlow = defineFlow({
  id: "research",
  name: "Research Synthesis",
  steps: [
    {
      id: "researcher1",
      name: "Primary Research",
      agent: "researcher",
      // ... other config
    },
    {
      id: "researcher2",
      name: "Secondary Research",
      agent: "researcher",
      // ... other config
    },
    {
      id: "synthesis",
      name: "Synthesize Findings",
      agent: "senior-researcher",
      dependsOn: ["researcher1", "researcher2"],
      input: {
        source: "aggregate",
        from: ["researcher1", "researcher2"],
        transform: (outputs: string[]) => {
          // Custom logic to combine research findings
          return outputs.map((output, i) => `## Research Report ${i + 1}\n${output}`).join("\n\n---\n\n");
        },
      },
    },
  ],
});
```

**Transform Execution Flow:**

1. **Input Collection**: Gather data from specified sources
2. **Transform Application**: Apply built-in or custom transform function
3. **Validation**: Ensure output meets expected format
4. **Step Execution**: Pass transformed input to agent
5. **Output Storage**: Store step output for dependent steps

**Error Handling:**

- **Invalid Transform**: `"Unknown transform: 'invalidTransform'"` with available options
- **Transform Failure**: `"Transform 'extractSection' failed: Section 'Missing' not found"`
- **Input Mismatch**: `"Step 'synthesis' expected array input but received string"`
- **Circular Reference**: Detected during flow validation (Step 7.3)

**Activity Journal Events:**

| Event                         | Payload                                                     |
| ----------------------------- | ----------------------------------------------------------- |
| `flow.step.input.prepared`    | `{flowRunId, stepId, inputSource, transform, hasContext}`   |
| `flow.step.transform.applied` | `{flowRunId, stepId, transformName, inputSize, outputSize}` |
| `flow.step.transform.failed`  | `{flowRunId, stepId, transformName, error, inputPreview}`   |

**Implementation Files:**

| File                             | Purpose                                   |
| -------------------------------- | ----------------------------------------- |
| `src/flows/transforms.ts`        | Built-in transform functions (200+ lines) |
| `src/flows/flow_runner.ts`       | Transform execution in FlowRunner         |
| `tests/flows/transforms_test.ts` | Transform function tests                  |
| `tests/flows/inter_step_test.ts` | End-to-end data flow tests                |

**Success Criteria:**

- [x] All input source types (request, step, aggregate) work correctly
- [x] All built-in transforms (passthrough, mergeAsContext, extractSection, appendToRequest, jsonExtract, templateFill) execute successfully
- [x] Custom transform functions defined in flow files execute without errors
- [x] Transform errors provide clear, actionable error messages with context
- [x] Complex transform chains (multiple transforms in sequence) work correctly
- [x] Input validation prevents type mismatches and malformed data
- [x] Transform performance doesn't significantly impact flow execution time
- [x] Activity Journal logs all transform operations for debugging
- [x] Transform functions are isolated and don't interfere with each other
      [ ] Memory usage remains bounded even with large data transformations

**Planned Tests:**

- [x] `tests/flows/transforms_test.ts`: Unit tests for all built-in transform functions (150+ tests)
- [x] `tests/flows/inter_step_test.ts`: Integration tests for data passing between steps (80+ tests)
- [x] Built-in transform tests: passthrough, mergeAsContext, extractSection, appendToRequest, jsonExtract, templateFill
- [x] Custom transform tests: Inline functions in flow definitions execute correctly with proper scoping
- [x] Error handling tests: Invalid transform names, malformed input data, transform function exceptions
- [x] Input source tests: Different input.source values (request, step, aggregate) work with various data types
- [x] Transform chain tests: Multiple transforms applied in sequence produce expected results
      [ ] Data format tests: Transforms handle various output formats (markdown, JSON, plain text, mixed content)
- [x] Performance tests: Transform execution time stays under 100ms for typical data sizes
- [x] Memory tests: Large data transformations don't cause memory leaks or excessive usage
- [x] Activity Journal tests: All transform operations are properly logged with correct metadata

---

### Step 7.8: Flow Reports ✅ COMPLETED

- **Dependencies:** Steps 7.4 (FlowRunner), Step 3.4 (Mission Reporter)
- **Rollback:** Generate simple execution summary without detailed reports
- **Action:** Create FlowReporter service to generate comprehensive reports for flow executions
- **Location:** `src/services/flow_reporter.ts`, `tests/services/flow_reporter_test.ts`

**Report Frontmatter Fields:**

| Field             | Description                           | Type    | Required |
| ----------------- | ------------------------------------- | ------- | -------- |
| `type`            | Always `"flow_report"`                | string  | Yes      |
| `flow`            | Flow ID                               | string  | Yes      |
| `flow_run_id`     | Unique execution UUID                 | string  | Yes      |
| `duration_ms`     | Total execution time in milliseconds  | number  | Yes      |
| `steps_completed` | Count of successfully completed steps | number  | Yes      |
| `steps_failed`    | Count of failed steps                 | number  | Yes      |
| `success`         | Overall flow execution success        | boolean | Yes      |
| `completed_at`    | ISO timestamp of completion           | string  | Yes      |
| `request_id`      | Associated request ID (if available)  | string  | No       |

**Report Body Sections:**

1. **Execution Summary** — Markdown table showing:
   - Step ID, Status (✅/❌), Duration, Start Time, Completion Time
   - Total duration and overall status summary

2. **Step Outputs** — Detailed subsection for each step:
   - Success: Status, duration, agent output content, raw response
   - Failure: Status, duration, error message and details

3. **Dependency Graph** — Visual flow structure:
   - Mermaid diagram showing step dependencies and agent assignments
   - Text description of flow structure with dependency relationships

**Integration Points:**

- **FlowRunner**: Automatically generates reports after successful/failed flow execution
- **Mission Reporter**: Shares configuration patterns, activity logging, and file output conventions
- **Database Service**: Logs report generation events to activity journal with flow-specific metadata
- **File System**: Writes reports to `/Knowledge/Reports/` directory with standardized naming
- **CLI Commands**: Future flow commands (run, list, show) will display report links and summaries
- **Dataview Integration**: Reports include metadata fields for Obsidian Dataview querying

**Implementation Details:**

**FlowRunner Integration:**

- FlowRunner constructor accepts optional FlowReporter instance
- After flow execution completes (success or failure), automatically calls FlowReporter.generate()
- Passes Flow, FlowResult, and requestId to reporter
- FlowResult contains: flowRunId, success, stepResults (Map), output, duration, startedAt, completedAt
- Report generation is non-blocking (doesn't affect flow execution time)
- Event logging includes flow completion events that can trigger reporting

**Configuration:**

- FlowReportConfig extends existing report configuration patterns
- Uses same reportsDirectory as MissionReporter (`/Knowledge/Reports/`)
- Integrates with existing database activity logging
- Supports testing mode (no database required)

**Error Handling:**

- Report generation failures don't affect flow execution results
- Failed report generation is logged but doesn't throw exceptions
- Graceful degradation: flows work without reporting enabled

**Success Criteria:**

**Core Functionality:**

- [x] FlowReporter class initializes with Config and FlowReportConfig
- [x] `generate()` method accepts Flow, FlowResult, and optional requestId
- [x] Reports are written to correct directory with proper filename convention
- [x] All required frontmatter fields are present and correctly formatted
- [x] Report body contains execution summary table with accurate step data
- [x] Step outputs section shows detailed results for each executed step
- [x] Failed steps display comprehensive error information and context
- [x] Dependency graph visualizes flow structure with Mermaid diagrams
- [x] Execution duration is accurately tracked for steps and total flow
- [x] Reports integrate with existing Mission Reporter infrastructure

**Quality Assurance:**

- [x] Reports are queryable via Dataview using flow-specific metadata
- [x] Activity journal logs successful report generation events
- [x] Error handling gracefully manages report generation failures
- [x] Report generation works without database (testing mode)
- [x] Filename format: `flow_{flowId}_{shortRunId}_{timestamp}.md`
- [x] Frontmatter uses proper YAML formatting with quoted strings
- [x] Mermaid graphs correctly represent step dependencies and agents

**Planned Tests:**

**Unit Tests (`tests/services/flow_reporter_test.ts`):**

- [x] Constructor initialization with valid/invalid configs
- [x] Report generation with successful flow execution
- [x] Report generation with failed flow execution
- [x] Frontmatter validation for all required fields
- [x] Execution summary table format and content accuracy
- [x] Step outputs section format for success/failure cases
- [x] Dependency graph visualization with Mermaid syntax
- [x] Filename generation with correct format
- [x] Activity logging for successful/failed report generation
- [x] Error handling for file system and database issues
- [x] Integration with FlowRunner execution results

**Integration Tests:**

- End-to-end flow execution with automatic report generation
- Report content validation against actual FlowResult data
- Dataview query compatibility for report metadata
- File system operations in correct directories
- Database activity logging verification
- Error scenarios (permission denied, disk full, etc.)

**Performance Tests:**

- Report generation time stays under 500ms for typical flows
- Memory usage remains bounded for large flow results
- Concurrent report generation doesn't cause conflicts

---

### Step 7.9: Example Flows ✅ COMPLETED

- **Dependencies:** Steps 7.1–7.8 (FlowRunner, FlowReporter, CLI commands)
- **Rollback:** Remove example files (no impact on core functionality)
- **Action:** Create comprehensive example flows demonstrating real-world patterns and best practices
- **Location:** `flows/examples/`, `tests/flows/example_flows_test.ts`

**Example Flow Categories:**

| Category        | Purpose                              | Examples                                                 |
| --------------- | ------------------------------------ | -------------------------------------------------------- |
| **Development** | Code quality & development workflows | Code Review, Feature Development, Refactoring            |
| **Content**     | Documentation & content creation     | API Documentation, Technical Writing, Research Synthesis |
| **Analysis**    | Data analysis & insights             | Code Analysis, Security Audit, Performance Review        |
| **Operations**  | System administration & maintenance  | Deployment, Monitoring, Incident Response                |

**Detailed Example Flows:**

#### 1. **Code Review Flow** (`flows/examples/code_review.flow.ts`)

**Pattern:** Pipeline with conditional branching
**Use Case:** Automated code review process with multiple quality gates

```typescript
const codeReviewFlow = defineFlow({
  id: "code-review",
  name: "Automated Code Review",
  description: "Multi-stage code review with linting, security, and human feedback",
  version: "1.0.0",
  steps: [
    {
      id: "lint",
      name: "Code Linting",
      agent: "code-quality-agent",
      dependsOn: [],
      input: { source: "request", transform: "extract_code" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "security",
      name: "Security Analysis",
      agent: "security-agent",
      dependsOn: ["lint"],
      input: { source: "step", stepId: "lint", transform: "passthrough" },
      retry: { maxAttempts: 2, backoffMs: 2000 },
    },
    {
      id: "review",
      name: "Peer Review",
      agent: "senior-developer",
      dependsOn: ["security"],
      input: { source: "request", transform: "combine_with_analysis" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
    {
      id: "summary",
      name: "Review Summary",
      agent: "technical-writer",
      dependsOn: ["review"],
      input: { source: "flow", transform: "aggregate_feedback" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ],
  output: { from: "summary", format: "markdown" },
  settings: { maxParallelism: 2, failFast: false },
});
```

#### 2. **Feature Development Flow** (`flows/examples/feature_development.flow.ts`)

**Pattern:** Staged development with iterative refinement
**Use Case:** End-to-end feature development from requirements to documentation

#### 3. **Research Synthesis Flow** (`flows/examples/research_synthesis.flow.ts`)

**Pattern:** Fan-out/Fan-in for parallel research
**Use Case:** Multi-perspective research with synthesis

#### 4. **API Documentation Flow** (`flows/examples/api_documentation.flow.ts`)

**Pattern:** Pipeline with data transformation
**Use Case:** Automated API documentation generation

#### 5. **Security Audit Flow** (`flows/examples/security_audit.flow.ts`)

**Pattern:** Parallel analysis with aggregation
**Use Case:** Comprehensive security assessment

**Flow Template Structure:**

```
flows/examples/
├── README.md                           # Overview and usage guide
├── templates/
│   ├── pipeline.flow.template.ts       # Basic pipeline template
│   ├── fanout-fanin.flow.template.ts   # Parallel processing template
│   └── staged.flow.template.ts         # Sequential stages template
├── development/
│   ├── code_review.flow.ts
│   ├── feature_development.flow.ts
│   └── refactoring.flow.ts
├── content/
│   ├── api_documentation.flow.ts
│   ├── technical_writing.flow.ts
│   └── research_synthesis.flow.ts
├── analysis/
│   ├── security_audit.flow.ts
│   ├── performance_review.flow.ts
│   └── code_analysis.flow.ts
└── operations/
    ├── deployment.flow.ts
    ├── monitoring.flow.ts
    └── incident_response.flow.ts
```

**Success Criteria:**

- [x] **5 comprehensive example flows** covering all orchestration patterns (pipeline, staged, fan-out/fan-in)
- [x] **Flow validation** - All examples pass FlowSchema validation without errors
- [x] **End-to-end execution** - Each flow runs successfully with mock agents and produces expected outputs
- [x] **Report generation** - FlowReporter automatically generates detailed reports for each example execution
- [x] **Documentation** - Each flow includes comprehensive inline documentation, usage examples, and expected inputs/outputs
- [x] **Template usability** - Example flows serve as copy-paste templates that users can immediately customize
- [x] **Real-world scenarios** - Examples demonstrate practical use cases that users actually need
- [x] **Error handling** - Examples show proper error handling patterns and recovery strategies
- [x] **Performance characteristics** - Examples demonstrate efficient parallel execution where appropriate

**Quality Assurance:**

- [x] **Pattern correctness** - Each flow correctly implements its intended orchestration pattern
- [x] **Dependency management** - Step dependencies are logical and prevent race conditions
- [x] **Data flow** - Input/output transforms work correctly between steps
- [x] **Agent assignments** - Realistic agent assignments that match step requirements
- [x] **Scalability** - Examples work with different numbers of steps and complexity levels
- [x] **Maintainability** - Clear structure and comments make examples easy to understand and modify

**Planned Tests (`tests/flows/example_flows_test.ts`):**

**Unit Tests:**

- [x] FlowSchema validation for all example flows
- [x] Template instantiation with custom parameters
- [x] Dependency resolution correctness
- [x] Input/output transform validation

**Integration Tests:**

- [x] End-to-end execution with mock agents for each example flow
- [x] Flow report generation and content validation
- [x] CLI command integration (`exoctl flow run`, `exoctl flow validate`)
- [x] File system operations (report generation, temporary files)
- [x] Database activity logging verification

**Pattern Validation Tests:**

- [x] Pipeline flows execute steps in correct sequential order
- [x] Fan-out/fan-in flows properly parallelize and aggregate results
- [x] Staged flows respect stage boundaries and data dependencies
- [x] Error handling flows gracefully handle step failures
- [x] Performance flows demonstrate efficient resource utilization

**Template Tests:**

- [x] Template copying and customization preserves validation
- [x] Parameter substitution works correctly
- [x] Template documentation is accurate and helpful
- [x] Template examples are runnable out-of-the-box

**Documentation Tests:**

- [x] README provides clear overview and getting started guide
- [x] Each flow includes usage examples and expected behavior
- [x] Inline comments explain complex logic and patterns
- [x] Error scenarios are documented with recovery steps

---

### Phase 7 Exit Criteria

- [x] `FlowSchema` validates flow definitions
- [x] `DependencyResolver` correctly orders steps and detects cycles
- [x] `FlowRunner` executes parallel and sequential flows
- [x] CLI commands (`flow list/show/run/plan/validate`) working
- [x] Requests can specify `flow:` instead of `agent:`
- [x] Inter-step data passing works via transforms
- [x] Flow reports generated with step details
- [x] Example flows demonstrate all patterns
- [x] All tests pass: `deno test tests/flows/`
- [x] Documentation updated with Flow usage guide

---
