import { assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  type ExecutionMemory,
  ExecutionMemorySchema,
  type ProjectMemory,
  ProjectMemorySchema,
} from "../../src/schemas/memory_bank.ts";

Deno.test("ProjectMemorySchema: validates valid project memory", () => {
  const validProject: ProjectMemory = {
    portal: "my-project",
    overview: "A web application for task management",
    patterns: [
      {
        name: "Repository Pattern",
        description: "All database access goes through repository classes",
        examples: ["src/repositories/task_repository.ts", "src/repositories/user_repository.ts"],
        tags: ["architecture", "database"],
      },
    ],
    decisions: [
      {
        date: "2026-01-01",
        decision: "Use PostgreSQL instead of SQLite",
        rationale: "Need better concurrency support for multi-user scenarios",
        alternatives: ["SQLite", "MySQL"],
        tags: ["database", "architecture"],
      },
    ],
    references: [
      {
        type: "file",
        path: "src/database/schema.sql",
        description: "Database schema definition",
      },
      {
        type: "doc",
        path: "docs/architecture.md",
        description: "System architecture overview",
      },
    ],
  };

  const result = ProjectMemorySchema.safeParse(validProject);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.portal, "my-project");
    assertEquals(result.data.patterns.length, 1);
    assertEquals(result.data.decisions.length, 1);
    assertEquals(result.data.references.length, 2);
  }
});

Deno.test("ProjectMemorySchema: rejects missing required fields", () => {
  const invalidProject = {
    // Missing portal
    overview: "Some overview",
    patterns: [],
    decisions: [],
    references: [],
  };

  const result = ProjectMemorySchema.safeParse(invalidProject);
  assertEquals(result.success, false);
});

Deno.test("ProjectMemorySchema: allows empty arrays for optional collections", () => {
  const minimalProject = {
    portal: "minimal-project",
    overview: "Minimal project with no patterns or decisions yet",
    patterns: [],
    decisions: [],
    references: [],
  };

  const result = ProjectMemorySchema.safeParse(minimalProject);
  assertEquals(result.success, true);
});

Deno.test("ProjectMemorySchema: validates pattern structure", () => {
  const projectWithInvalidPattern = {
    portal: "test-project",
    overview: "Test",
    patterns: [
      {
        name: "Pattern Name",
        // Missing description
        examples: [],
      },
    ],
    decisions: [],
    references: [],
  };

  const result = ProjectMemorySchema.safeParse(projectWithInvalidPattern);
  assertEquals(result.success, false);
});

Deno.test("ProjectMemorySchema: validates reference type enum", () => {
  const projectWithInvalidRefType = {
    portal: "test-project",
    overview: "Test",
    patterns: [],
    decisions: [],
    references: [
      {
        type: "invalid-type", // Not in enum
        path: "some/path",
        description: "Description",
      },
    ],
  };

  const result = ProjectMemorySchema.safeParse(projectWithInvalidRefType);
  assertEquals(result.success, false);
});

Deno.test("ExecutionMemorySchema: validates valid execution memory", () => {
  const validExecution: ExecutionMemory = {
    trace_id: "550e8400-e29b-41d4-a716-446655440000",
    request_id: "REQ-123",
    started_at: "2026-01-03T10:00:00Z",
    completed_at: "2026-01-03T10:15:00Z",
    status: "completed",
    portal: "my-project",
    agent: "senior-coder",
    summary: "Added authentication middleware to Express app",
    context_files: ["src/middleware/auth.ts", "src/app.ts"],
    context_portals: ["my-project"],
    changes: {
      files_created: ["src/middleware/auth.ts"],
      files_modified: ["src/app.ts", "package.json"],
      files_deleted: [],
    },
    lessons_learned: [
      "Always validate JWT expiration",
      "Use environment variables for secrets",
    ],
  };

  const result = ExecutionMemorySchema.safeParse(validExecution);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.trace_id, "550e8400-e29b-41d4-a716-446655440000");
    assertEquals(result.data.status, "completed");
    assertEquals(result.data.changes.files_created.length, 1);
    assertEquals(result.data.lessons_learned?.length, 2);
  }
});

Deno.test("ExecutionMemorySchema: validates UUID format for trace_id", () => {
  const invalidUuid = {
    trace_id: "not-a-uuid",
    request_id: "REQ-123",
    started_at: "2026-01-03T10:00:00Z",
    status: "completed",
    portal: "my-project",
    agent: "senior-coder",
    summary: "Test summary",
    context_files: [],
    context_portals: [],
    changes: {
      files_created: [],
      files_modified: [],
      files_deleted: [],
    },
  };

  const result = ExecutionMemorySchema.safeParse(invalidUuid);
  assertEquals(result.success, false);
});

Deno.test("ExecutionMemorySchema: validates status enum", () => {
  const invalidStatus = {
    trace_id: "550e8400-e29b-41d4-a716-446655440000",
    request_id: "REQ-123",
    started_at: "2026-01-03T10:00:00Z",
    status: "invalid-status",
    portal: "my-project",
    agent: "senior-coder",
    summary: "Test summary",
    context_files: [],
    context_portals: [],
    changes: {
      files_created: [],
      files_modified: [],
      files_deleted: [],
    },
  };

  const result = ExecutionMemorySchema.safeParse(invalidStatus);
  assertEquals(result.success, false);
});

Deno.test("ExecutionMemorySchema: allows optional fields (completed_at, lessons_learned, error_message)", () => {
  const runningExecution = {
    trace_id: "550e8400-e29b-41d4-a716-446655440000",
    request_id: "REQ-123",
    started_at: "2026-01-03T10:00:00Z",
    // No completed_at (still running)
    status: "running",
    portal: "my-project",
    agent: "senior-coder",
    summary: "In progress",
    context_files: [],
    context_portals: [],
    changes: {
      files_created: [],
      files_modified: [],
      files_deleted: [],
    },
    // No lessons_learned, no error_message
  };

  const result = ExecutionMemorySchema.safeParse(runningExecution);
  assertEquals(result.success, true);
});

Deno.test("ExecutionMemorySchema: validates failed execution with error message", () => {
  const failedExecution: ExecutionMemory = {
    trace_id: "550e8400-e29b-41d4-a716-446655440000",
    request_id: "REQ-124",
    started_at: "2026-01-03T10:00:00Z",
    completed_at: "2026-01-03T10:01:00Z",
    status: "failed",
    portal: "my-project",
    agent: "senior-coder",
    summary: "Failed to add feature due to permission error",
    context_files: [],
    context_portals: [],
    changes: {
      files_created: [],
      files_modified: [],
      files_deleted: [],
    },
    error_message: "PermissionDenied: Cannot write to protected directory",
  };

  const result = ExecutionMemorySchema.safeParse(failedExecution);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.status, "failed");
    assertEquals(result.data.error_message, "PermissionDenied: Cannot write to protected directory");
  }
});

Deno.test("ExecutionMemorySchema: requires changes object with all file arrays", () => {
  const missingChanges = {
    trace_id: "550e8400-e29b-41d4-a716-446655440000",
    request_id: "REQ-123",
    started_at: "2026-01-03T10:00:00Z",
    status: "completed",
    portal: "my-project",
    agent: "senior-coder",
    summary: "Test summary",
    context_files: [],
    context_portals: [],
    // Missing changes object
  };

  const result = ExecutionMemorySchema.safeParse(missingChanges);
  assertEquals(result.success, false);
});

Deno.test("ProjectMemorySchema: validates decision structure with all fields", () => {
  const projectWithDecision = {
    portal: "test-project",
    overview: "Test project",
    patterns: [],
    decisions: [
      {
        date: "2026-01-01",
        decision: "Use TypeScript instead of JavaScript",
        rationale: "Better type safety and IDE support",
        alternatives: ["JavaScript", "Flow"],
        tags: ["language", "tooling"],
      },
    ],
    references: [],
  };

  const result = ProjectMemorySchema.safeParse(projectWithDecision);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.decisions[0].alternatives?.length, 2);
    assertEquals(result.data.decisions[0].tags?.length, 2);
  }
});

Deno.test("ProjectMemorySchema: allows decisions without optional fields", () => {
  const projectWithMinimalDecision = {
    portal: "test-project",
    overview: "Test project",
    patterns: [],
    decisions: [
      {
        date: "2026-01-01",
        decision: "Use REST API",
        rationale: "Simple and well-understood",
        // No alternatives or tags
      },
    ],
    references: [],
  };

  const result = ProjectMemorySchema.safeParse(projectWithMinimalDecision);
  assertEquals(result.success, true);
});
