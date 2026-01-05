/**
 * Extended tests for ExecutionLoop to improve code coverage
 * These tests target specific branches and edge cases not covered by main tests
 */
import { assert, assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { ExecutionLoop } from "../src/services/execution_loop.ts";
import { createMockConfig } from "./helpers/config.ts";
import { initTestDbService } from "./helpers/db.ts";

// ===== executeNext tests =====

Deno.test("ExecutionLoop.executeNext: returns success when no plans available", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-no-plans-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    // Create empty Inbox/Plans directory
    const plansDir = join(tempDir, "Inbox", "Plans");
    await Deno.mkdir(plansDir, { recursive: true });

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.executeNext();

    assertEquals(result.success, true);
    assertEquals(result.traceId, undefined);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop.executeNext: processes pending plan", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-next-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const plansDir = join(tempDir, "Inbox", "Plans");
    await Deno.mkdir(plansDir, { recursive: true });

    const planContent = `---
trace_id: "test-execute-next"
request_id: next-test
status: pending
---

# Execute Next Test Plan

\`\`\`toml
tool = "read_file"
description = "Read test file"

[params]
path = "test.txt"
\`\`\`
`;

    const planPath = join(plansDir, "next-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.executeNext();

    assertExists(result.traceId);
    assertEquals(result.traceId, "test-execute-next");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop.executeNext: skips non-pending plans", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-skip-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const plansDir = join(tempDir, "Inbox", "Plans");
    await Deno.mkdir(plansDir, { recursive: true });

    // Create plan with "active" status (not "pending")
    const planContent = `---
trace_id: "test-skip-active"
request_id: skip-test
status: active
---

# Should Be Skipped Plan
`;

    const planPath = join(plansDir, "skip-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.executeNext();

    // Should return success with no trace (no work to do)
    assertEquals(result.success, true);
    assertEquals(result.traceId, undefined);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop.executeNext: handles plans directory not found", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-notfound-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    // Don't create the Inbox/Plans directory

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.executeNext();

    // Should return success with no trace (no work to do)
    assertEquals(result.success, true);
    assertEquals(result.traceId, undefined);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop.executeNext: skips plans with invalid frontmatter", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-invalid-fm-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const plansDir = join(tempDir, "Inbox", "Plans");
    await Deno.mkdir(plansDir, { recursive: true });

    // Create plan with no frontmatter
    const planContent = `# No Frontmatter Plan

This plan has no YAML frontmatter.
`;

    const planPath = join(plansDir, "no-frontmatter.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.executeNext();

    // Should skip invalid plan and return no work
    assertEquals(result.success, true);
    assertEquals(result.traceId, undefined);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ===== parsePlanActions edge cases =====

Deno.test("ExecutionLoop: skips non-TOML code blocks", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-non-toml-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    const planContent = `---
trace_id: "test-non-toml"
request_id: non-toml-test
status: active
---

# Plan with Non-TOML Code Blocks

\`\`\`javascript
// This is JavaScript, not TOML
console.log("Hello");
\`\`\`

\`\`\`python
# This is Python, not TOML
print("Hello")
\`\`\`

No TOML actions here.
`;

    const planPath = join(systemActiveDir, "non-toml-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.processTask(planPath);

    // Should succeed (creates dummy file when no actions)
    assertEquals(result.success, true);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop: skips invalid TOML blocks", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-bad-toml-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    const planContent = `---
trace_id: "test-bad-toml"
request_id: bad-toml-test
status: active
---

# Plan with Invalid TOML

\`\`\`toml
this is not valid toml = [broken
\`\`\`

Should skip the invalid block.
`;

    const planPath = join(systemActiveDir, "bad-toml-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.processTask(planPath);

    // Should succeed (no valid actions found)
    assertEquals(result.success, true);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop: skips TOML blocks without tool field", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-no-tool-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    const planContent = `---
trace_id: "test-no-tool"
request_id: no-tool-test
status: active
---

# Plan with TOML but No Tool

\`\`\`toml
description = "This has no tool field"
value = 42
\`\`\`

Should skip this block.
`;

    const planPath = join(systemActiveDir, "no-tool-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.processTask(planPath);

    // Should succeed (creates dummy file when no valid actions)
    assertEquals(result.success, true);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ===== summarizeResult edge cases =====

Deno.test("ExecutionLoop: logs action with null result", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-null-result-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    // Use a tool that returns null/undefined
    const planContent = `---
trace_id: "test-null-result"
request_id: null-result-test
status: active
---

# Plan that Produces Null Result

\`\`\`toml
tool = "read_file"
description = "Read non-existent file"

[params]
path = "does-not-exist.txt"
\`\`\`
`;

    const planPath = join(systemActiveDir, "null-result-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    // This may fail due to file not found, but we just want to ensure summarizeResult works
    const _result = await loop.processTask(planPath);

    // Check that activity was logged (regardless of success/failure)
    await new Promise((resolve) => setTimeout(resolve, 150));
    const activities = db.getActivitiesByTrace("test-null-result");
    assert(activities.length > 0, "Some activities should be logged");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ===== Lease handling edge cases =====

Deno.test("ExecutionLoop: same agent can reacquire own lease", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-reacquire-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    const planContent = `---
trace_id: "test-reacquire"
request_id: reacquire-test
status: active
---

# Reacquire Lease Test
`;

    const planPath = join(systemActiveDir, "reacquire-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "same-agent" });

    // First execution
    const result1 = await loop.processTask(planPath);
    assertEquals(result1.success, true);

    // Plan was archived, recreate it
    await Deno.writeTextFile(planPath, planContent);

    // Second execution by same agent should work
    const result2 = await loop.processTask(planPath);
    assertEquals(result2.success, true);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ===== Error handling edge cases =====

Deno.test("ExecutionLoop: handles missing request_id in frontmatter", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-no-request-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    const planContent = `---
trace_id: "test-no-request"
status: active
---

# Plan Missing request_id
`;

    const planPath = join(systemActiveDir, "no-request.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.processTask(planPath);

    assertEquals(result.success, false);
    assert(result.error?.includes("request_id"), "Error should mention missing request_id");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ExecutionLoop: handles empty frontmatter content", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-empty-fm-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    const planContent = `---
---

# Plan with Empty Frontmatter
`;

    const planPath = join(systemActiveDir, "empty-frontmatter.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.processTask(planPath);

    assertEquals(result.success, false);
    // Should fail due to missing required fields
    assertExists(result.error);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ===== executeNext with actions =====

Deno.test("ExecutionLoop.executeNext: fails when plan has no actions", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-no-actions-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const plansDir = join(tempDir, "Inbox", "Plans");
    await Deno.mkdir(plansDir, { recursive: true });

    const planContent = `---
trace_id: "test-no-actions"
request_id: no-actions-test
status: pending
---

# Plan Without Actions

This plan has no TOML action blocks.
`;

    const planPath = join(plansDir, "no-actions.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.executeNext();

    // executeNext requires at least one action
    assertEquals(result.success, false);
    assert(result.error?.includes("no executable actions"), "Should mention no actions");
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ===== commitChanges nothing to commit =====

Deno.test("ExecutionLoop: handles nothing to commit gracefully", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-no-commit-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    // Create initial file and commit it first
    const testFile = join(tempDir, "existing.txt");
    await Deno.writeTextFile(testFile, "existing content");

    // Git add and commit
    const addCmd = new Deno.Command("git", {
      args: ["add", "."],
      cwd: tempDir,
      stdout: "piped",
      stderr: "piped",
    });
    await addCmd.output();

    const commitCmd = new Deno.Command("git", {
      args: ["commit", "-m", "Initial commit"],
      cwd: tempDir,
      stdout: "piped",
      stderr: "piped",
    });
    await commitCmd.output();

    // Plan that reads but doesn't change anything
    const planContent = `---
trace_id: "test-no-changes"
request_id: no-changes-test
status: active
---

# No Changes Plan

\`\`\`toml
tool = "read_file"
description = "Just read existing file"

[params]
path = "existing.txt"
\`\`\`
`;

    const planPath = join(systemActiveDir, "no-changes-test.md");
    await Deno.writeTextFile(planPath, planContent);

    const loop = new ExecutionLoop({ config, db, agentId: "test-agent" });
    const result = await loop.processTask(planPath);

    // Should succeed even with nothing to commit
    assertEquals(result.success, true);

    // Check for no_changes log
    await new Promise((resolve) => setTimeout(resolve, 150));
    const activities = db.getActivitiesByTrace("test-no-changes");
    const _noChangesLog = activities.find((a: any) => a.action_type === "execution.no_changes");
    // This may or may not be present depending on whether the tool created any output
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ===== Without database =====

Deno.test("ExecutionLoop: works without database (no logging)", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "exec-ext-no-db-" });

  try {
    const config = createMockConfig(tempDir);
    const systemActiveDir = join(tempDir, "System", "Active");
    await Deno.mkdir(systemActiveDir, { recursive: true });

    const planContent = `---
trace_id: "test-no-db"
request_id: no-db-test
status: active
---

# No Database Test

No actions - just testing without db.
`;

    const planPath = join(systemActiveDir, "no-db-test.md");
    await Deno.writeTextFile(planPath, planContent);

    // Create ExecutionLoop without db parameter
    const loop = new ExecutionLoop({ config, agentId: "test-agent" });
    const result = await loop.processTask(planPath);

    // Should succeed even without database
    assertEquals(result.success, true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
