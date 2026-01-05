---
id: "550e8400-e29b-41d4-a716-446655440008"
created_at: "2026-01-05T00:00:00.000Z"
source: "user"
scope: "project"
project: "ExoFrame"
status: "active"
skill_id: "exoframe-conventions"
name: "ExoFrame Development Conventions"
version: "1.0.0"
description: "ExoFrame-specific patterns, conventions, and best practices"

triggers:
  keywords:
    - exoframe
    - agent
    - flow
    - blueprint
    - portal
    - memory
    - activity
  task_types:
    - feature
    - bugfix
    - refactor
  file_patterns:
    - "src/**/*.ts"
    - "tests/**/*.ts"
  tags:
    - exoframe
    - conventions

constraints:
  - "Use existing patterns from the codebase"
  - "Follow the service-based architecture"
  - "Maintain schema-first approach with Zod"
  - "Write tests using Deno.test"

output_requirements:
  - "Follows ExoFrame architectural patterns"
  - "Uses initTestDbService() for test databases"
  - "Includes proper Activity Journal logging"

quality_criteria:
  - name: "Pattern Consistency"
    description: "Code follows established ExoFrame patterns"
    weight: 40
  - name: "Test Coverage"
    description: "New code has tests"
    weight: 35
  - name: "Schema Validation"
    description: "Uses Zod schemas for validation"
    weight: 25

compatible_with:
  agents:
    - "*"

usage_count: 0
---

# ExoFrame Development Conventions

Follow these ExoFrame-specific patterns and conventions:

## 1. Project Structure

```
src/
├── commands/        # CLI command implementations
├── config/          # Configuration schemas and loading
├── flows/           # Flow orchestration
├── schemas/         # Zod schemas for all data types
├── services/        # Core services (stateful)
└── utils/           # Pure utility functions

tests/               # Mirror of src/ structure
tests_infra/         # Test infrastructure helpers

Blueprints/          # Agent and Flow definitions
├── Agents/          # Agent blueprints (markdown)
└── Flows/           # Flow definitions (TypeScript)

Memory/              # Memory Banks
├── Projects/        # Project-specific memory
├── Execution/       # Execution history
├── Global/          # Cross-project learnings
└── Skills/          # Procedural memory (skills)
```

## 2. Service Pattern

Services are the core building blocks:

```typescript
// src/services/example.ts

import { z } from "zod";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";

// Define schema for service data
export const ExampleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  // ...
});

export type Example = z.infer<typeof ExampleSchema>;

/**
 * ExampleService - Description of what it does
 *
 * Handles:
 * - Thing 1
 * - Thing 2
 */
export class ExampleService {
  constructor(
    private config: Config,
    private db: DatabaseService,
  ) {}

  /**
   * Get example by ID
   */
  async getById(id: string): Promise<Example | null> {
    // Implementation
  }

  /**
   * Log activity for auditing
   */
  private logActivity(event: {
    event_type: string;
    target: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.db.logActivity(
      "system",
      event.event_type,
      event.target,
      event.metadata || {},
    );
  }
}
```

## 3. Test Patterns

Use Deno.test with initTestDbService():

```typescript
// tests/services/example_test.ts

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { initTestDbService } from "../../tests_infra/db_test_utils.ts";
import { ExampleService } from "../../src/services/example.ts";

Deno.test("ExampleService", async (t) => {
  // Setup test database
  const db = initTestDbService();
  const config = { /* test config */ };
  const service = new ExampleService(config, db);

  await t.step("getById returns null for missing ID", async () => {
    const result = await service.getById("nonexistent");
    assertEquals(result, null);
  });

  await t.step("getById returns example when found", async () => {
    // Setup test data
    const created = await service.create({ name: "Test" });

    const result = await service.getById(created.id);
    assertExists(result);
    assertEquals(result.name, "Test");
  });
});
```

## 4. Schema-First Design

Define schemas before implementation:

```typescript
// src/schemas/example.ts

import { z } from "zod";

/**
 * Example input schema - used for creation
 */
export const ExampleInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

/**
 * Example schema - includes generated fields
 */
export const ExampleSchema = ExampleInputSchema.extend({
  id: z.string().uuid(),
  created_at: z.string().datetime(),
});

// Export types
export type ExampleInput = z.infer<typeof ExampleInputSchema>;
export type Example = z.infer<typeof ExampleSchema>;
```

## 5. Activity Journal Integration

Log significant events:

```typescript
// Event types follow pattern: category.entity.action
const EVENT_TYPES = {
  // Memory events
  "memory.project.created": "Project memory created",
  "memory.learning.approved": "Learning approved",

  // Flow events
  "flow.started": "Flow execution started",
  "flow.completed": "Flow execution completed",

  // Agent events
  "agent.invoked": "Agent was invoked",
  "agent.completed": "Agent completed execution",
};
```

## 6. Flow Definitions

Define flows in Blueprints/Flows/:

```typescript
// Blueprints/Flows/example.flow.ts

import { defineFlow } from "../../src/flows/define_flow.ts";

export default defineFlow({
  id: "example-flow",
  name: "Example Flow",
  description: "Does something useful",
  version: "1.0.0",

  steps: [
    {
      id: "step-1",
      agent: "analyzer",
      task: "Analyze the request",
    },
    {
      id: "step-2",
      agent: "implementer",
      task: "Implement the solution",
      dependsOn: ["step-1"],
    },
  ],
});
```

## 7. Configuration

Use exo.config.toml for settings:

```toml
# exo.config.toml
[system]
root = "."

[skills]
enabled = true
auto_match = true
max_skills_per_request = 5
```

## 8. Common Imports

```typescript
// Standard library
import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";

// Testing
import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert@1";

// Validation
import { z } from "zod";

// ExoFrame internal
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";
```

## 9. Error Handling

Use typed errors:

```typescript
export class ExoFrameError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "ExoFrameError";
  }
}

export class FlowExecutionError extends ExoFrameError {
  constructor(flowId: string, stepId: string, cause: Error) {
    super(
      `Flow ${flowId} failed at step ${stepId}: ${cause.message}`,
      "FLOW_EXECUTION_ERROR",
    );
  }
}
```
