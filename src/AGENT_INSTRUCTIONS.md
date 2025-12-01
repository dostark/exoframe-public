# ExoFrame Source Development Guidelines

This document contains instructions for AI coding agents when creating or modifying modules in the ExoFrame `src/` directory.

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

## Activity Logging

### Log important actions to Activity Journal

```typescript
private logActivity(
  actionType: string,
  target: string,
  payload: Record<string, unknown>,
  traceId?: string,
): void {
  try {
    this.db.logActivity(
      "agent",        // actor: "agent", "human", or "system"
      actionType,     // e.g., "request.processing", "plan.created"
      target,         // path or identifier
      payload,        // additional context
      traceId,        // for trace correlation
      null,           // agentId (optional)
    );
  } catch (error) {
    console.error(`[MyService] Failed to log activity:`, error);
  }
}
```

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

### Request files use TOML frontmatter (`+++`)

```typescript
// Parse TOML frontmatter
const tomlMatch = content.match(/^\+\+\+\n([\s\S]*?)\n\+\+\+\n?([\s\S]*)$/);
if (!tomlMatch) {
  console.error(`[Parser] Invalid TOML frontmatter format`);
  return null;
}

const tomlContent = tomlMatch[1];
const body = tomlMatch[2] || "";

import { parse as parseToml } from "@std/toml";
const frontmatter = parseToml(tomlContent);
```

### Plan files use YAML frontmatter (`---`)

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

## Final Step: Format Code

**ALWAYS run `deno fmt` as the final step after major code changes.**

```bash
# Format all files
deno fmt

# Check formatting without modifying
deno fmt --check
```

This ensures consistent code style across the codebase and prevents formatting-related lint errors.
