import { assertEquals, assertThrows } from "jsr:@std/assert@^1.0.0";
import { RequestSchema } from "../src/schemas/request.ts";
import { FrontmatterParser } from "../src/parsers/markdown.ts";
import { initTestDbService } from "./helpers/db.ts";

/**
 * Tests for Step 2.2: The Zod Frontmatter Parser
 *
 * Success Criteria (from Implementation Plan):
 * - Test 1: Valid frontmatter + Zod validation → Returns typed Request object
 * - Test 2: Missing required field (trace_id) → Throws validation error with specific field name
 * - Test 3: Invalid enum value (status: "banana") → Throws error listing valid options
 * - Test 4: Extra fields in frontmatter → Ignored (Zod strips unknown keys by default)
 * - Test 5: No frontmatter delimiters → Throws "No frontmatter found" error
 */

Deno.test("RequestSchema: valid frontmatter object passes validation", () => {
  const validRequest = {
    trace_id: "550e8400-e29b-41d4-a716-446655440000",
    agent_id: "coder-agent",
    status: "pending",
    priority: 8,
    tags: ["feature", "ui"],
  };

  const result = RequestSchema.parse(validRequest);

  assertEquals(result.trace_id, "550e8400-e29b-41d4-a716-446655440000");
  assertEquals(result.agent_id, "coder-agent");
  assertEquals(result.status, "pending");
  assertEquals(result.priority, 8);
  assertEquals(result.tags, ["feature", "ui"]);
});

Deno.test("RequestSchema: applies default values", () => {
  const minimalRequest = {
    trace_id: "550e8400-e29b-41d4-a716-446655440000",
    agent_id: "coder-agent",
    status: "pending",
  };

  const result = RequestSchema.parse(minimalRequest);

  assertEquals(result.priority, 5); // default
  assertEquals(result.tags, []); // default
});

Deno.test("RequestSchema: rejects missing required field (trace_id)", () => {
  const invalidRequest = {
    agent_id: "coder-agent",
    status: "pending",
  };

  const error = assertThrows(
    () => RequestSchema.parse(invalidRequest),
  ) as Error;

  // Should mention the missing field
  assertEquals(error.message.includes("trace_id"), true);
});

Deno.test("RequestSchema: rejects invalid enum value", () => {
  const invalidRequest = {
    trace_id: "550e8400-e29b-41d4-a716-446655440000",
    agent_id: "coder-agent",
    status: "banana", // invalid
  };

  const error = assertThrows(
    () => RequestSchema.parse(invalidRequest),
  ) as Error;

  // Should list valid options
  assertEquals(error.message.includes("pending"), true);
  assertEquals(error.message.includes("in_progress"), true);
});

Deno.test("RequestSchema: strips unknown fields", () => {
  const requestWithExtra = {
    trace_id: "550e8400-e29b-41d4-a716-446655440000",
    agent_id: "coder-agent",
    status: "pending",
    unknown_field: "should be stripped",
    another_extra: 123,
  };

  const result = RequestSchema.parse(requestWithExtra);

  // @ts-expect-error - checking that extra fields are stripped
  assertEquals(result.unknown_field, undefined);
  // @ts-expect-error - checking that extra fields are stripped
  assertEquals(result.another_extra, undefined);
});

Deno.test("FrontmatterParser: valid markdown with frontmatter", () => {
  const markdown = `---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
agent_id: "coder-agent"
status: "pending"
priority: 8
tags: ["feature", "ui"]
---

# Implement Login Page

Create a modern login page with:
- Email/password fields
- "Remember me" checkbox
`;

  const parser = new FrontmatterParser(); // No database
  const result = parser.parse(markdown);

  assertEquals(result.request.trace_id, "550e8400-e29b-41d4-a716-446655440000");
  assertEquals(result.request.agent_id, "coder-agent");
  assertEquals(result.request.status, "pending");
  assertEquals(result.body.includes("Implement Login Page"), true);
  assertEquals(result.body.includes("Email/password"), true);
});

Deno.test("FrontmatterParser: throws on missing frontmatter delimiters", () => {
  const markdown = `# Just a title

No frontmatter here!
`;

  const parser = new FrontmatterParser();

  const error = assertThrows(
    () => parser.parse(markdown),
  ) as Error;

  assertEquals(error.message.includes("No frontmatter found"), true);
});

Deno.test("FrontmatterParser: throws on invalid YAML syntax", () => {
  const markdown = `---
trace_id: "missing-closing-quote
agent_id: coder-agent
---

Body content
`;

  const parser = new FrontmatterParser();

  assertThrows(
    () => parser.parse(markdown),
  );
});

Deno.test("FrontmatterParser: throws on validation error with field details", () => {
  const markdown = `---
agent_id: "coder-agent"
status: "pending"
---

Missing trace_id field
`;

  const parser = new FrontmatterParser();

  const error = assertThrows(
    () => parser.parse(markdown),
  ) as Error;

  // Should mention validation failure
  assertEquals(error.message.includes("validation") || error.message.includes("trace_id"), true);
});

Deno.test("FrontmatterParser: handles empty body content", () => {
  const markdown = `---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
agent_id: "coder-agent"
status: "pending"
---
`;

  const parser = new FrontmatterParser();
  const result = parser.parse(markdown);

  assertEquals(result.body.trim(), "");
  assertEquals(result.request.trace_id, "550e8400-e29b-41d4-a716-446655440000");
});

Deno.test("FrontmatterParser logs successful validation", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    const parser = new FrontmatterParser(db);
    const markdown = `---
trace_id: "550e8400-e29b-41d4-a716-446655440000"
agent_id: "coder-agent"
status: "pending"
priority: 8
tags: ["feature", "ui"]
---\n\n# Test\n`;
    const result = parser.parse(markdown, "test.md");
    assertEquals(result.request.trace_id, "550e8400-e29b-41d4-a716-446655440000");

    // Allow time for batched write to flush
    await new Promise((resolve) => setTimeout(resolve, 150));

    const rows = [
      ...(db.instance as any).prepare("SELECT * FROM activity WHERE action_type = ?").all(["request.validated"]),
    ];
    assertEquals(rows.length, 1);
    const { actor, action_type, target, payload } = rows[0];
    assertEquals(actor, "system");
    assertEquals(action_type, "request.validated");
    assertEquals(target, "test.md");
    const payloadObj = JSON.parse(payload as string);
    assertEquals(payloadObj.trace_id, "550e8400-e29b-41d4-a716-446655440000");
  } finally {
    await cleanup();
  }
});

Deno.test("FrontmatterParser logs validation failure", async () => {
  const { db, cleanup } = await initTestDbService();
  try {
    const parser = new FrontmatterParser(db);
    const markdown = `---
agent_id: "coder-agent"
status: "pending"
---\n\n# Bad\n`;
    let caught = false;
    try {
      parser.parse(markdown, "bad.md");
    } catch {
      caught = true;
    }
    assertEquals(caught, true);

    // Allow time for batched write to flush
    await new Promise((resolve) => setTimeout(resolve, 150));

    const rows = [
      ...(db.instance as any).prepare("SELECT * FROM activity WHERE action_type = ?").all([
        "request.validation_failed",
      ]),
    ];
    assertEquals(rows.length, 1);
    const { actor, action_type, target, payload } = rows[0];
    assertEquals(actor, "system");
    assertEquals(action_type, "request.validation_failed");
    assertEquals(target, "bad.md");
    const payloadObj = JSON.parse(payload as string);
    assertEquals(Array.isArray(payloadObj.errors), true);
  } finally {
    await cleanup();
  }
});
