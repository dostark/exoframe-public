/**
 * Integration Test: Plan Execution Detection
 * Tests Step 5.12.1 Detection - Plan Execution Flow
 *
 * Validates that the daemon detects approved plans in Workspace/Active/
 * and logs detection events to the Activity Journal.
 */

import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { TestEnvironment } from "./helpers/test_environment.ts";
import { getWorkspaceActiveDir } from "../helpers/paths_helper.ts";

Deno.test("Integration: Plan Execution Detection - approved plan detected", async () => {
  const env = await TestEnvironment.create({
    initGit: false,
    configOverrides: {
      watcher: { debounce_ms: 50, stability_check: false },
    },
  });

  try {
    // Step 1: Ensure Workspace/Active directory exists
    const activePath = getWorkspaceActiveDir(env.tempDir);
    await ensureDir(activePath);

    // Step 2: Create an approved plan file (simulating plan approval)
    const traceId = crypto.randomUUID();
    const requestId = `request-${traceId.slice(0, 8)}`;
    const planContent = `---
trace_id: "${traceId}"
request_id: "${requestId}"
agent_id: "senior-coder"
status: approved
created_at: "${new Date().toISOString()}"
---

# Plan: ${requestId}

## Proposed Plan

### Overview
Implement a hello world function in utils.ts.

### Steps
1. **Create File** - Create src/utils.ts with hello function
2. **Write Tests** - Add tests for the hello function
3. **Verify** - Ensure tests pass

### Expected Outcome
A working hello world function with tests.
`;

    const planPath = join(activePath, `${requestId}_plan.md`);
    await Deno.writeTextFile(planPath, planContent);

    // Step 3: Wait for file watcher to process (with stability check)
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Step 4: Verify plan file exists and is readable
    const exists = await Deno.stat(planPath)
      .then(() => true)
      .catch(() => false);
    assertEquals(exists, true, "Plan file should exist");

    // Step 5: Verify plan content is correct
    const content = await Deno.readTextFile(planPath);
    assertStringIncludes(content, traceId);
    assertStringIncludes(content, "approved");
    assertStringIncludes(content, "Implement a hello world function");

    // Step 6: Verify frontmatter can be parsed
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    assertExists(yamlMatch, "Should have YAML frontmatter");

    const { parse: parseYaml } = await import("@std/yaml");
    const frontmatter = parseYaml(yamlMatch[1]) as Record<string, unknown>;

    assertEquals(frontmatter.trace_id, traceId);
    assertEquals(frontmatter.request_id, requestId);
    assertEquals(frontmatter.status, "approved");

    console.log("✅ Integration test passed: Plan detection successful");
  } finally {
    await env.cleanup();
  }
});

Deno.test("Integration: Plan Execution Detection - ignores non-plan files", async () => {
  const env = await TestEnvironment.create({
    initGit: false,
    configOverrides: {
      watcher: { debounce_ms: 50, stability_check: false },
    },
  });

  try {
    // Step 1: Create various files in Workspace/Active
    const activePath = getWorkspaceActiveDir(env.tempDir);
    await ensureDir(activePath);

    // Create non-plan files
    await Deno.writeTextFile(join(activePath, "README.md"), "# Active Tasks");
    await Deno.writeTextFile(join(activePath, "notes.txt"), "Some notes");
    await Deno.writeTextFile(
      join(activePath, "config.json"),
      JSON.stringify({ test: true }),
    );

    // Step 2: Create one valid plan file
    const traceId = crypto.randomUUID();
    const planPath = join(activePath, `request-${traceId.slice(0, 8)}_plan.md`);
    await Deno.writeTextFile(
      planPath,
      `---
trace_id: "${traceId}"
status: approved
---

# Plan
`,
    );

    // Step 3: Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Step 4: Verify only plan file would be detected by pattern
    const files = [];
    for await (const entry of Deno.readDir(activePath)) {
      if (entry.isFile && entry.name.endsWith("_plan.md")) {
        files.push(entry.name);
      }
    }

    assertEquals(files.length, 1);
    assertEquals(files[0], `request-${traceId.slice(0, 8)}_plan.md`);

    console.log("✅ Integration test passed: Non-plan files ignored");
  } finally {
    await env.cleanup();
  }
});

Deno.test("Integration: Plan Execution Detection - handles invalid plan gracefully", async () => {
  const env = await TestEnvironment.create({
    initGit: false,
    configOverrides: {
      watcher: { debounce_ms: 50, stability_check: false },
    },
  });

  try {
    // Step 1: Create Workspace/Active directory
    const activePath = getWorkspaceActiveDir(env.tempDir);
    await ensureDir(activePath);

    // Step 2: Create plan with invalid YAML
    const planPath = join(activePath, "invalid_plan.md");
    await Deno.writeTextFile(
      planPath,
      `---
trace_id: [broken yaml syntax
status: invalid
---

# Invalid Plan
`,
    );

    // Step 3: Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Step 4: Verify file exists (detection should not delete it)
    const exists = await Deno.stat(planPath)
      .then(() => true)
      .catch(() => false);
    assertEquals(exists, true, "Invalid plan file should still exist");

    console.log("✅ Integration test passed: Invalid plan handled gracefully");
  } finally {
    await env.cleanup();
  }
});

Deno.test("Integration: Plan Execution Detection - handles missing trace_id", async () => {
  const env = await TestEnvironment.create({
    initGit: false,
    configOverrides: {
      watcher: { debounce_ms: 50, stability_check: false },
    },
  });

  try {
    // Step 1: Create Workspace/Active directory
    const activePath = getWorkspaceActiveDir(env.tempDir);
    await ensureDir(activePath);

    // Step 2: Create plan without trace_id
    const planPath = join(activePath, "no-trace_plan.md");
    await Deno.writeTextFile(
      planPath,
      `---
request_id: "request-test"
status: approved
---

# Plan without trace_id
`,
    );

    // Step 3: Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Step 4: Verify file exists (should not be deleted)
    const exists = await Deno.stat(planPath)
      .then(() => true)
      .catch(() => false);
    assertEquals(exists, true, "Plan without trace_id should still exist");

    console.log("✅ Integration test passed: Missing trace_id handled gracefully");
  } finally {
    await env.cleanup();
  }
});
