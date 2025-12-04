/**
 * MCP Prompts Tests
 */

import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { createMockConfig } from "../helpers/config.ts";
import { initTestDbService } from "../helpers/db.ts";
import {
  generateCreateChangesetPrompt,
  generateExecutePlanPrompt,
  generatePrompt,
  getPrompt,
  getPrompts,
} from "../../src/mcp/prompts.ts";

// ============================================================================
// Prompt List Tests
// ============================================================================

Deno.test("getPrompts: returns all available prompts", () => {
  const prompts = getPrompts();

  assertEquals(prompts.length, 2);
  assertEquals(prompts[0].name, "execute_plan");
  assertEquals(prompts[1].name, "create_changeset");
});

Deno.test("getPrompt: returns specific prompt by name", () => {
  const prompt = getPrompt("execute_plan");

  assertExists(prompt);
  assertEquals(prompt.name, "execute_plan");
  assertStringIncludes(prompt.description, "Execute");
  assertEquals(prompt.arguments?.length, 2);
});

Deno.test("getPrompt: returns null for unknown prompt", () => {
  const prompt = getPrompt("unknown_prompt");

  assertEquals(prompt, null);
});

// ============================================================================
// Execute Plan Prompt Tests
// ============================================================================

Deno.test("generateExecutePlanPrompt: generates prompt with plan details", async () => {
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig("/tmp/test");
    const result = generateExecutePlanPrompt(
      {
        plan_id: "test-plan-123",
        portal: "MyApp",
      },
      config,
      db,
    );

    assertExists(result);
    assertExists(result.description);
    assertStringIncludes(result.description, "test-plan-123");
    assertStringIncludes(result.description, "MyApp");

    assertEquals(result.messages.length, 1);
    assertEquals(result.messages[0].role, "user");
    assertStringIncludes(result.messages[0].content.text, "test-plan-123");
    assertStringIncludes(result.messages[0].content.text, "MyApp");
    assertStringIncludes(result.messages[0].content.text, "read_file");
    assertStringIncludes(result.messages[0].content.text, "write_file");
  } finally {
    await cleanup();
  }
});

Deno.test("generateExecutePlanPrompt: includes tool usage guidance", async () => {
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig("/tmp/test");
    const result = generateExecutePlanPrompt(
      {
        plan_id: "plan-456",
        portal: "TestPortal",
      },
      config,
      db,
    );

    const text = result.messages[0].content.text;

    // Should mention all available tools
    assertStringIncludes(text, "read_file");
    assertStringIncludes(text, "write_file");
    assertStringIncludes(text, "list_directory");
    assertStringIncludes(text, "git_status");
    assertStringIncludes(text, "git_create_branch");
    assertStringIncludes(text, "git_commit");
  } finally {
    await cleanup();
  }
});

Deno.test("generateExecutePlanPrompt: logs to Activity Journal", async () => {
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig("/tmp/test");
    generateExecutePlanPrompt(
      {
        plan_id: "log-test-plan",
        portal: "TestPortal",
      },
      config,
      db,
    );

    // Allow time for batched logging
    await new Promise((resolve) => setTimeout(resolve, 150));

    const logs = db.instance.prepare(
      "SELECT * FROM activity WHERE action_type = ?",
    ).all("mcp.prompts.execute_plan");

    assertEquals(logs.length, 1);
    const log = logs[0] as { target: string; payload: string };
    assertEquals(log.target, "log-test-plan");

    const payload = JSON.parse(log.payload);
    assertEquals(payload.portal, "TestPortal");
  } finally {
    await cleanup();
  }
});

// ============================================================================
// Create Changeset Prompt Tests
// ============================================================================

Deno.test("generateCreateChangesetPrompt: generates prompt with changeset details", async () => {
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig("/tmp/test");
    const result = generateCreateChangesetPrompt(
      {
        portal: "MyApp",
        description: "Add user authentication",
        trace_id: "trace-789",
      },
      config,
      db,
    );

    assertExists(result);
    assertExists(result.description);
    assertStringIncludes(result.description, "Add user authentication");

    assertEquals(result.messages.length, 1);
    assertEquals(result.messages[0].role, "user");
    assertStringIncludes(result.messages[0].content.text, "MyApp");
    assertStringIncludes(result.messages[0].content.text, "Add user authentication");
    assertStringIncludes(result.messages[0].content.text, "trace-789");
  } finally {
    await cleanup();
  }
});

Deno.test("generateCreateChangesetPrompt: includes git workflow guidance", async () => {
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig("/tmp/test");
    const result = generateCreateChangesetPrompt(
      {
        portal: "TestPortal",
        description: "Fix bug",
        trace_id: "trace-123",
      },
      config,
      db,
    );

    const text = result.messages[0].content.text;

    // Should mention git workflow steps
    assertStringIncludes(text, "feature branch");
    assertStringIncludes(text, "git_create_branch");
    assertStringIncludes(text, "git_status");
    assertStringIncludes(text, "git_commit");
    assertStringIncludes(text, "trace_id");
  } finally {
    await cleanup();
  }
});

Deno.test("generateCreateChangesetPrompt: logs to Activity Journal", async () => {
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig("/tmp/test");
    generateCreateChangesetPrompt(
      {
        portal: "TestPortal",
        description: "Test changeset",
        trace_id: "log-trace-456",
      },
      config,
      db,
    );

    // Allow time for batched logging
    await new Promise((resolve) => setTimeout(resolve, 150));

    const logs = db.instance.prepare(
      "SELECT * FROM activity WHERE action_type = ?",
    ).all("mcp.prompts.create_changeset");

    assertEquals(logs.length, 1);
    const log = logs[0] as { target: string; payload: string };
    assertEquals(log.target, "log-trace-456");

    const payload = JSON.parse(log.payload);
    assertEquals(payload.portal, "TestPortal");
    assertEquals(payload.description, "Test changeset");
  } finally {
    await cleanup();
  }
});

// ============================================================================
// Generic Prompt Generation Tests
// ============================================================================

Deno.test("generatePrompt: routes to execute_plan generator", async () => {
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig("/tmp/test");
    const result = generatePrompt(
      "execute_plan",
      {
        plan_id: "plan-999",
        portal: "TestPortal",
      },
      config,
      db,
    );

    assertExists(result);
    assertStringIncludes(result!.messages[0].content.text, "plan-999");
  } finally {
    await cleanup();
  }
});

Deno.test("generatePrompt: routes to create_changeset generator", async () => {
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig("/tmp/test");
    const result = generatePrompt(
      "create_changeset",
      {
        portal: "TestPortal",
        description: "Test change",
        trace_id: "trace-888",
      },
      config,
      db,
    );

    assertExists(result);
    assertStringIncludes(result!.messages[0].content.text, "Test change");
  } finally {
    await cleanup();
  }
});

Deno.test("generatePrompt: returns null for unknown prompt", async () => {
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig("/tmp/test");
    const result = generatePrompt(
      "unknown_prompt",
      {},
      config,
      db,
    );

    assertEquals(result, null);
  } finally {
    await cleanup();
  }
});
