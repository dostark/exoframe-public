# ExoFrame Source Development Guidelines

This document contains instructions for AI coding agents when creating or modifying modules in the ExoFrame `src/` directory.

## ⚠️ CRITICAL: Test-Driven Development Required

**All implementation or major modification of modules MUST strictly follow TDD (Test-Driven Development).**

Before writing any implementation code:

1. **Verify a refined step exists** in `docs/ExoFrame_Implementation_Plan.md` that covers the work
2. **Check the step includes TDD test cases** with specific test names and assertions
3. **Write tests first** based on the plan's test cases before implementing
4. **Run tests to confirm they fail** (red phase)
5. **Implement the minimum code** to make tests pass (green phase)
6. **Refactor** while keeping tests green
7. **Verify success criteria** - After all tests pass, validate the implementation against the Success Criteria defined in the Implementation Plan step

**If no refined step exists with TDD test cases:**

- STOP implementation
- Create or refine the step in `docs/ExoFrame_Implementation_Plan.md` first
- Include specific test cases with expected behaviors
- Get approval before proceeding

**⚠️ CRITICAL: Success Criteria Verification**

After completing implementation with all tests passing, you MUST:

1. **Review the Success Criteria** section in the Implementation Plan step
2. **Verify each criterion** is met by the implementation
3. **Document verification** - For each criterion, confirm it works as specified
4. **Report any gaps** - If any criteria are not met, implement the missing functionality
5. **Check Problems tab** - Review and address any TypeScript errors, lint warnings, or other issues flagged by VS Code
6. **Fix all problems** - Resolve compilation errors, type mismatches, unused imports, and code quality issues before marking step complete

**Do not consider a step complete** until ALL success criteria are verified and met. Tests passing is necessary but not sufficient - the implementation must fulfill all documented success criteria from the plan.

**Zero tolerance for Problems:** The implementation must have no TypeScript errors, no lint warnings, and pass all code quality checks. A clean Problems tab is required for completion.

This ensures all code is properly planned, tested, documented, and meets all requirements.

## Project Structure

```
src/
├── ai/                    # AI/LLM provider implementations
│   └── providers/         # Individual provider implementations
├── cli/                   # CLI command implementations
├── config/                # Configuration schemas and loaders
├── parsers/               # File parsers (frontmatter, etc.)
├── schemas/               # Zod validation schemas
├── services/              # Core business logic services
└── main.ts               # Application entry point
```

## Module Documentation

### Always include file-level documentation

```typescript
/**
 * ModuleName - Brief description of what this module does
 * Implements Step X.Y of the ExoFrame Implementation Plan
 *
 * Responsibilities:
 * 1. First responsibility
 * 2. Second responsibility
 * 3. Third responsibility
 */
```

### Use section separators for large files

```typescript
// ============================================================================
// Types and Interfaces
// ============================================================================

// ... types here ...

// ============================================================================
// Implementation
// ============================================================================

// ... implementation here ...
```

## Type Definitions

### Define interfaces before classes

```typescript
/**
 * Configuration for MyService
 */
export interface MyServiceConfig {
  /** Description of this field */
  optionOne: string;

  /** Description of this field */
  optionTwo: number;
}

/**
 * Result returned by myMethod
 */
export interface MyResult {
  success: boolean;
  data: unknown;
}
```

### Export types that consumers need

```typescript
// ✅ Export types used by consumers
export interface RequestMetadata { ... }
export type MockStrategy = "recorded" | "scripted" | "pattern";

// ❌ Keep internal types private
interface InternalState { ... }
```

## Configuration Schema

### Use Zod for validation

```typescript
import { z } from "zod";

export const MyConfigSchema = z.object({
  field_one: z.string().default("default_value"),
  field_two: z.number().min(1).max(100).default(50),
  optional_field: z.string().optional(),
});

export type MyConfig = z.infer<typeof MyConfigSchema>;
```

### Config Structure Requirements

The main `Config` type includes these required sections:

```typescript
{
  system: { root: string, log_level: string, version?: string },
  paths: { inbox: string, knowledge: string, system: string, blueprints: string },
  database: { batch_flush_ms: number, batch_max_size: number },
  watcher: { debounce_ms: number, stability_check: boolean },
  agents: { default_model: string, timeout_sec: number },
  portals: Array<{ alias: string, target_path: string }>,
  ai?: AiConfig,
}
```

## Service Pattern

### Constructor takes Config and dependencies

```typescript
export class MyService {
  constructor(
    private readonly config: Config,
    private readonly db: DatabaseService,
    private readonly provider: IModelProvider,
  ) {
    // Initialize internal state
  }
}
```

### Use dependency injection for testability

```typescript
// ✅ Accept dependencies in constructor
constructor(
  private readonly db: DatabaseService,
  private readonly provider: IModelProvider,
) {}

// ❌ Don't create dependencies internally
constructor() {
  this.db = new DatabaseService(config);  // Hard to test!
}
```

## Code Deduplication

### ⚠️ CRITICAL: Maintain Low Duplication Levels

**Target**: Keep code duplication below **3%** as measured by jscpd.

**Current Status**: 2.35% (937 lines, 99 clones) ✅

### Measure Duplication

Before and after significant changes, check duplication:

```bash
npx jscpd src tests --reporters json --output ./report
```

### Identify High-Impact Duplication

Find files with the most clones:

```bash
python3 -c "import json; data=json.load(open('report/jscpd-report.json')); \
  files={}; \
  for d in data['duplicates']: \
    for f in d['fragment']: \
      files[f['loc']] = files.get(f['loc'], 0) + 1; \
  sorted_files = sorted(files.items(), key=lambda x: x[1], reverse=True); \
  [print(f'{count} clones: {file}') for file, count in sorted_files[:10]]"
```

### Refactoring Guidelines

**When adding new features**:

1. Write tests and implementation in TDD manner
2. After tests pass, measure duplication
3. If duplication increases significantly (>0.2%), refactor before committing
4. Extract helper functions or base classes for repeated patterns
5. Re-run tests to ensure refactoring didn't break functionality
6. Verify duplication decreased

**Common duplication patterns to extract**:

- **Error handling blocks** - Extract to helper methods
- **Response formatting** - Create base class methods (e.g., `formatSuccess()`, `formatError()`)
- **Transaction management** - Extract to utility functions
- **Validation logic** - Create reusable validator functions
- **Configuration setup** - Extract to factory functions

**Example - Before (duplicated 5 times)**:

```typescript
try {
  const result = await operation();
  return { success: true, data: result };
} catch (error) {
  if (error instanceof Deno.errors.NotFound) {
    return { success: false, error: "Not found" };
  }
  return { success: false, error: error.message };
}
```

**Example - After (extracted helper)**:

```typescript
private formatSuccess(data: any): ToolResult {
  return { success: true, data };
}

private formatError(error: unknown): ToolResult {
  if (error instanceof Deno.errors.NotFound) {
    return { success: false, error: "Not found" };
  }
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

// Usage
try {
  const result = await operation();
  return this.formatSuccess(result);
} catch (error) {
  return this.formatError(error);
}
```

**Documentation**: See `docs/Remaining_Code_Duplication_Analysis.md` for detailed refactoring history and patterns.

## Activity Logging with EventLogger

### ⚠️ IMPORTANT: Use EventLogger for All Logging

**All operational events MUST be logged using `EventLogger`** — this ensures events are written to both console AND the Activity Journal for complete audit trail.

```typescript
import { EventLogger } from "../services/event_logger.ts";

// Initialize with database connection
const logger = new EventLogger({ db: dbService, prefix: "[MyService]" });

// Basic usage - logs to both console and Activity Journal
logger.info("config.loaded", "exo.config.toml", { checksum: "abc123" });
logger.warn("context.truncated", "loader", { files_skipped: 3 });
logger.error("provider.failed", "anthropic", { error: "rate_limited" });

// Create child logger for specific service/context
const serviceLogger = logger.child({
  actor: "agent:processor",
  traceId: crypto.randomUUID(),
});

serviceLogger.info("request.processing", filePath, { status: "started" });
```

### Actor Identity

Use appropriate actor values:

```typescript
// System events (daemon, services)
logger.child({ actor: "system" });

// Agent events (AI operations)
logger.child({ actor: "agent:senior-coder" });

// Human events (CLI commands) - resolves from git config or OS
const userIdentity = await EventLogger.getUserIdentity();
logger.child({ actor: userIdentity });
```

### When NOT to Use EventLogger

Keep plain `console.log` for:

1. **Read-only CLI display:** List results, show details, status output
2. **Interactive prompts:** User input handling
3. **Help text:** Command documentation
4. **Error fallbacks:** When Activity Journal itself fails

### Display-Only Logger for Console Output

For read-only CLI commands that only need console output (no Activity Journal), create a **display-only EventLogger** by omitting the `db` parameter:

```typescript
import { EventLogger } from "../services/event_logger.ts";

// Display-only logger (console output only, no DB writes)
const display = new EventLogger({});

// Use for read-only operations like listing, showing, status queries
display.info("request.list", "requests", { count: 5 });
display.info("daemon.status", "daemon", { status: "Running ✓", pid: 12345 });
display.error("cli.error", "command", { message: "Something went wrong" });
```

This approach:

- Maintains consistent output formatting across all CLI commands
- Avoids polluting Activity Journal with read-only query operations
- Uses the same EventLogger API for both display and journaled events

### Use consistent action type naming

```
{domain}.{action}

Examples:
- request.created
- request.processing
- request.planned
- request.failed
- plan.created
- plan.approved
- changeset.approved
- changeset.rejected
- daemon.started
- daemon.stopped
```

## Error Handling

### Use try-catch with meaningful error messages

```typescript
async process(filePath: string): Promise<string | null> {
  try {
    // ... processing logic
    return result;
  } catch (error) {
    console.error(`[MyService] Error processing: ${filePath}`, error);

    this.logActivity("request.failed", filePath, {
      error: error instanceof Error ? error.message : String(error),
    }, traceId);

    return null;
  }
}
```

### Validate inputs early

```typescript
async parseFile(filePath: string): Promise<ParsedFile | null> {
  // Check file exists
  if (!await exists(filePath)) {
    console.error(`[MyService] File not found: ${filePath}`);
    return null;
  }

  // Validate format
  const content = await Deno.readTextFile(filePath);
  if (!this.isValidFormat(content)) {
    console.error(`[MyService] Invalid format in: ${filePath}`);
    return null;
  }

  // ... continue processing
}
```

## Frontmatter Parsing

### Request files use YAML frontmatter (`---`)

```typescript
// Parse YAML frontmatter
const yamlMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
if (!yamlMatch) {
  console.error(`[Parser] Invalid YAML frontmatter format`);
  return null;
}

const yamlContent = yamlMatch[1];
const body = yamlMatch[2] || "";

import { parse as parseYaml } from "@std/yaml";
const frontmatter = parseYaml(yamlContent);
```

### Plan files use YAML frontmatter (`---`)

```typescript
// Parse YAML frontmatter (same as requests)
const yamlMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
if (!yamlMatch) {
  console.error(`[Parser] Invalid YAML frontmatter format`);
  return null;
}

const yamlContent = yamlMatch[1];
const body = yamlMatch[2] || "";

import { parse as parseYaml } from "@std/yaml";
const frontmatter = parseYaml(yamlContent);
```

## Path Handling

### Use join() for all path construction

```typescript
import { basename, join } from "@std/path";

const filePath = join(config.system.root, "Inbox", "Requests", "request.md");
const fileName = basename(filePath, ".md"); // "request"
```

### Use exists() to check file/directory

```typescript
import { exists } from "@std/fs";

if (!await exists(filePath)) {
  return null;
}
```

## Provider Interface

### Implement IModelProvider for AI providers

```typescript
import { IModelProvider, ModelOptions } from "../providers.ts";

export class MyProvider implements IModelProvider {
  async generate(
    prompt: string,
    options?: ModelOptions,
  ): Promise<string> {
    // Implementation
  }

  async generateStream(
    prompt: string,
    options?: ModelOptions,
  ): AsyncIterable<string> {
    // Implementation
  }
}
```

## CLI Commands

### Follow the command pattern

```typescript
export class MyCommands {
  constructor(
    private context: { config: Config; db: DatabaseService },
    private readonly workspaceRoot: string = Deno.cwd(),
  ) {}

  async create(description: string, options?: CreateOptions): Promise<CreateResult> {
    // Validate inputs
    // Perform action
    // Log activity
    // Return result
  }

  async list(filter?: string): Promise<ListResult[]> {
    // Query and filter
    // Return results
  }
}
```

## Import Conventions

### Standard library imports

```typescript
import { basename, join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { parse as parseToml } from "@std/toml";
import { parse as parseYaml } from "@std/yaml";
```

### Internal imports (relative paths)

```typescript
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";
import { IModelProvider } from "../ai/providers.ts";
```

### Use `type` imports for types only

```typescript
// ✅ Type-only import
import type { Config } from "../config/schema.ts";

// ✅ Mixed import
import { MyClass, type MyType } from "./module.ts";
```

## Async/Await Patterns

### Prefer async/await over raw promises

```typescript
// ✅ Clean async/await
async function processFiles(files: string[]): Promise<Result[]> {
  const results: Result[] = [];
  for (const file of files) {
    const result = await processFile(file);
    results.push(result);
  }
  return results;
}

// ❌ Avoid nested promises
function processFiles(files: string[]): Promise<Result[]> {
  return Promise.all(files.map((file) => processFile(file).then((result) => result)));
}
```

## Deno Permissions

### Modules should work with these permissions

```bash
deno run --allow-read --allow-write --allow-net --allow-env src/main.ts
```

### Document required permissions in module header

```typescript
/**
 * MyService - Description
 *
 * Required Deno permissions:
 * - --allow-read: Read config and data files
 * - --allow-write: Write output files
 * - --allow-net: API calls (if applicable)
 */
```

## Testing Considerations

### Design for testability

1. Accept dependencies via constructor
2. Use interfaces for external services
3. Avoid global state
4. Make side effects explicit

### Provide mock-friendly interfaces

```typescript
// Define interface for the service
export interface IMyService {
  process(input: string): Promise<Result>;
}

// Implementation
export class MyService implements IMyService {
  async process(input: string): Promise<Result> {
    // ... implementation
  }
}

// Tests can mock IMyService
```

## Console Output

### Use prefixed logging

```typescript
console.log(`[MyService] Processing: ${filePath}`);
console.error(`[MyService] Error: ${message}`);
console.warn(`[MyService] Warning: ${message}`);
```

### Include context in error messages

```typescript
// ✅ Good: includes context
console.error(`[RequestProcessor] Blueprint not found: ${agentId}`);
console.error(`[Parser] Invalid frontmatter format in: ${filePath}`);

// ❌ Bad: no context
console.error("Not found");
console.error("Invalid format");
```

## Code Style

### Use readonly for immutable properties

```typescript
export class MyService {
  private readonly config: Config;
  private readonly db: DatabaseService;

  constructor(config: Config, db: DatabaseService) {
    this.config = config;
    this.db = db;
  }
}
```

### Use private for internal methods

```typescript
export class MyService {
  // Public API
  async process(input: string): Promise<Result> {
    const parsed = await this.parseInput(input);
    return this.transformResult(parsed);
  }

  // Internal helpers
  private async parseInput(input: string): Promise<ParsedInput> {
    // ...
  }

  private transformResult(parsed: ParsedInput): Result {
    // ...
  }
}
```

## Blueprint Creation Guidelines

### When Creating Agent Blueprints

Blueprints define AI agents with specific capabilities, models, and system prompts. Follow these guidelines and use the comprehensive examples from Step 6.10 as templates.

**Blueprint File Structure:**

- Location: `Blueprints/Agents/{agent_id}.md` or `Blueprints/Agents/examples/{agent_id}.md`
- Format: YAML frontmatter with `---` delimiters + Markdown content
- Required fields: `name`, `model`, `capabilities`, `system_prompt`

**Validation Rules:**

1. **name**: Lowercase alphanumeric + hyphens only (e.g., `code-reviewer`)
2. **Reserved names**: Cannot use `system`, `default`, `test`
3. **Model format**: `provider:model-name` (e.g., `anthropic:claude-3-5-sonnet-20241022`)
4. **System prompt**: Must include clear role definition, capabilities, and output format instructions
5. **Capabilities**: Array of MCP tool names the agent can use

**Available MCP Tools:**

```typescript
// File operations
"read_file"; // Read files from portals
"write_file"; // Write files to portals
"list_directory"; // List directory contents

// Git operations
"git_create_branch"; // Create feature branches
"git_commit"; // Commit changes
"git_status"; // Check git status
```

**System Prompt Best Practices:**

1. **Clear Role Definition**: Start with "You are a [specialized role]..."
2. **Capability Description**: List what the agent can do
3. **Workflow Guidance**: Describe how the agent should approach tasks
4. **Output Format**: Specify expected response formats
5. **Context Awareness**: Mention portal and MCP tool usage

**Example System Prompts:**

```markdown
# Code Reviewer Agent

system_prompt: |
You are an expert code reviewer with 10+ years of experience in software development.
Your role is to analyze code changes for quality, security, and best practices.

When reviewing code:

1. Check for common security vulnerabilities
2. Validate code style and consistency
3. Identify potential bugs or edge cases
4. Suggest improvements for performance and maintainability
5. Ensure proper error handling and logging

Always provide constructive feedback with specific examples and actionable recommendations.

# Feature Developer Agent

system_prompt: |
You are a senior full-stack developer specializing in feature implementation.
Your expertise includes modern web development, API design, and best practices.

When implementing features:

1. Analyze requirements thoroughly
2. Design clean, maintainable solutions
3. Write comprehensive tests
4. Follow established patterns and conventions
5. Ensure proper error handling and validation

Always consider scalability, security, and user experience in your implementations.
```

**Available Templates:**

See Step 6.10 examples for comprehensive agent blueprints:

- `code-reviewer` - Quality-focused code review and analysis
- `feature-developer` - End-to-end feature implementation
- `api-documenter` - API documentation generation
- `security-auditor` - Security vulnerability assessment
- `research-synthesizer` - Research analysis and synthesis

**CLI Commands:**

```bash
# Create from template
exoctl blueprint create <agent-id> --name "Name" --model <provider:model> --template <template>

# List all blueprints
exoctl blueprint list

# Validate blueprint
exoctl blueprint validate <agent-id>

# Edit blueprint
exoctl blueprint edit <agent-id>
```

**Activity Logging:**
All blueprint operations are logged to Activity Journal:

- `blueprint.created` - When blueprint is created
- `blueprint.validated` - When validation is performed
- `blueprint.edited` - When blueprint is modified
- `blueprint.removed` - When blueprint is deleted

---

## Flow Creation Guidelines

### When Creating Multi-Agent Flows

Flows orchestrate multiple agents working together on complex tasks. Use the comprehensive examples from Step 7.9 as templates for different flow patterns.

**Flow File Structure:**

- Location: `flows/examples/{category}/{flow_name}.flow.ts`
- Format: TypeScript using `defineFlow()` helper
- Required fields: `id`, `name`, `description`, `version`, `steps[]`

**Flow Patterns (from Step 7.9 examples):**

1. **Pipeline**: Sequential execution (code-review.flow.ts)
   - Steps execute in order with dependencies
   - Each step builds on previous results
   - Best for linear workflows

2. **Fan-Out/Fan-In**: Parallel execution (research-synthesis.flow.ts)
   - Multiple agents work simultaneously
   - Results combined by final agent
   - Best for gathering diverse inputs

3. **Staged**: Conditional execution (feature-development.flow.ts)
   - Gates between stages
   - Human approval may be required
   - Best for iterative refinement

**Flow Definition Best Practices:**

```typescript
import { defineFlow } from "../define_flow.ts";

const myFlow = defineFlow({
  id: "my-custom-flow",
  name: "My Custom Flow",
  description: "Detailed description of what this flow accomplishes",
  version: "1.0.0",
  steps: [
    {
      id: "analyze",
      name: "Initial Analysis",
      agent: "research-synthesizer", // Use agents from Step 6.10 examples
      dependsOn: [], // No dependencies = first step
      input: { source: "request", transform: "passthrough" },
      retry: { maxAttempts: 2, backoffMs: 1000 },
    },
    {
      id: "implement",
      name: "Implementation",
      agent: "feature-developer",
      dependsOn: ["analyze"], // Must complete after analyze
      input: { source: "step", stepId: "analyze", transform: "extract_requirements" },
      retry: { maxAttempts: 1, backoffMs: 2000 },
    },
    {
      id: "review",
      name: "Code Review",
      agent: "code-reviewer",
      dependsOn: ["implement"],
      input: { source: "request", transform: "combine_with_implementation" },
      retry: { maxAttempts: 1, backoffMs: 1000 },
    },
  ],
});
```

**Input Source Types:**

- `"request"`: Use original request content
- `"step"`: Use output from another step
- `"context"`: Use shared context data

**Transform Functions:**

- `"passthrough"`: Use input as-is
- `"extract_code"`: Extract code blocks from input
- `"extract_requirements"`: Parse requirements from text
- `"combine_with_analysis"`: Merge multiple inputs
- `"jsonExtract"`: Extract JSON data
- `"templateFill"`: Fill template with variables

**Flow Categories (from Step 7.9):**

- **Development**: Code quality, feature development, refactoring
- **Content**: Documentation, technical writing, research synthesis
- **Analysis**: Code analysis, security audit, performance review
- **Operations**: Deployment, monitoring, incident response

**Flow Templates:**

See `flows/examples/templates/` for reusable patterns:

- `pipeline.flow.template.ts` - Sequential workflow template
- `fan-out-fan-in.flow.template.ts` - Parallel processing template
- `staged.flow.template.ts` - Multi-stage approval template

**Testing Flows:**

```typescript
// flows/examples/my_flow_test.ts
import { myFlow } from "./my_flow.flow.ts";

Deno.test("MyFlow: executes complete pipeline", async () => {
  // Test flow execution with mock agents
});

Deno.test("MyFlow: handles step failures gracefully", async () => {
  // Test error handling and retries
});

Deno.test("MyFlow: validates dependencies correctly", async () => {
  // Test dependency resolution
});
```

**Flow Execution:**

Flows are executed by the FlowRunner service with dependency resolution, parallel execution where possible, and comprehensive error handling. See Step 7.1-7.8 for FlowRunner implementation details.

---

## MCP Tool Usage Guidelines

### When Using MCP Tools in Agents

Agents interact with the file system and git repositories through MCP (Model Context Protocol) tools. Always use these tools instead of direct file system access.

**Available MCP Tools:**

```typescript
// File Operations
await useTool("read_file", {
  portal: "MyProject",
  path: "src/main.ts",
});

await useTool("write_file", {
  portal: "MyProject",
  path: "src/new_feature.ts",
  content: "// New feature implementation",
});

await useTool("list_directory", {
  portal: "MyProject",
  path: "src",
});

// Git Operations
await useTool("git_create_branch", {
  portal: "MyProject",
  branch: "feature/new-feature",
});

await useTool("git_commit", {
  portal: "MyProject",
  message: "feat: Add new feature implementation",
  files: ["src/new_feature.ts", "tests/new_feature_test.ts"],
});

await useTool("git_status", {
  portal: "MyProject",
});
```

**Portal Permissions:**

- Agents can only access portals listed in their `capabilities` and the portal's `agents_allowed` whitelist
- Operations are restricted by the portal's `operations` array (`["read", "write", "git"]`)
- Path traversal attacks (`../`) are blocked by the PathResolver
- Git branch names are validated (must follow patterns like `feat/`, `fix/`, `docs/`)

**Security Modes:**

1. **Sandboxed Mode** (recommended): Agent has no direct file access, all operations via MCP tools
2. **Hybrid Mode**: Agent can read portal files directly but must use MCP tools for writes

**Error Handling:**

```typescript
try {
  const result = await useTool("read_file", {
    portal: "MyProject",
    path: "src/main.ts",
  });
  // Process result
} catch (error) {
  if (error.message.includes("permission denied")) {
    // Handle permission errors
  } else if (error.message.includes("file not found")) {
    // Handle missing files
  }
  // Log error and continue
}
```

**Best Practices:**

1. **Validate paths** before using tools
2. **Check permissions** in system prompts
3. **Handle errors gracefully** - tools may fail due to permissions or file system issues
4. **Use appropriate portals** - match the task to the correct portal
5. **Log tool usage** - all tool invocations are logged to Activity Journal

---

## Portal Configuration Guidelines

### When Working with Portal Permissions

Portals provide controlled access to external project directories. Configure permissions carefully for security.

**Portal Configuration Structure:**

```toml
# exo.config.toml
[[portals]]
name = "MyProject"
path = "/home/user/projects/MyProject"
agents_allowed = ["feature-developer", "code-reviewer"]  # Whitelist
operations = ["read", "write", "git"]  # Allowed operations

[portals.MyProject.security]
mode = "sandboxed"  # or "hybrid"
audit_enabled = true
log_all_actions = true
```

**Security Mode Selection:**

- **Sandboxed**: Maximum security, no direct file access, all operations through MCP tools
- **Hybrid**: Performance optimized, direct read access but MCP tools required for writes

**Permission Validation:**

- Agent must be in `agents_allowed` array (or `"*"` for all agents)
- Operation must be in `operations` array
- Path must be within portal directory (no traversal outside)
- Git operations validate branch names and commit messages

**CLI Portal Management:**

```bash
# Add a portal
exoctl portal add MyProject /path/to/project --agents feature-developer,code-reviewer

# List portals
exoctl portal list

# Update portal permissions
exoctl portal update MyProject --agents feature-developer,api-documenter --operations read,write

# Remove portal
exoctl portal remove MyProject
```

**Activity Logging:**

All portal operations are logged:

- `portal.added` - Portal configuration added
- `portal.updated` - Portal permissions modified
- `portal.removed` - Portal removed
- `portal.access_granted` - Agent accessed portal
- `portal.access_denied` - Agent access blocked
- `portal.operation_performed` - MCP tool operation completed

## Final Step: Format Code

**ALWAYS run `deno fmt` as the final step after major code changes.**

```bash
# Format all files
deno fmt

# Check formatting without modifying
deno fmt --check
```

This ensures consistent code style across the codebase and prevents formatting-related lint errors.
