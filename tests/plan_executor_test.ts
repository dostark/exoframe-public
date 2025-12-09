import { assert, assertEquals, assertExists, assertRejects } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { type PlanContext, PlanExecutor } from "../src/services/plan_executor.ts";
import { MockProvider } from "../src/ai/providers.ts";
import { createGitTestContext, GitTestHelper } from "./helpers/git_test_helper.ts";

Deno.test("PlanExecutor: executes plan steps successfully", async () => {
  const { tempDir, db, cleanup, config, git } = await createGitTestContext("plan-exec-test-");
  const helper = new GitTestHelper(tempDir);

  try {
    // Setup git repo
    await git.ensureRepository();
    await git.ensureIdentity();

    // Mock LLM response with TOML actions
    const mockResponse = `
Here are the actions for the step:

\`\`\`toml
[[actions]]
tool = "write_file"
description = "Create test file"
[actions.params]
path = "test.txt"
content = "Hello World"
\`\`\`
`;
    const mockProvider = new MockProvider(mockResponse);

    // Initialize executor
    const executor = new PlanExecutor(config, mockProvider, db);

    // Prepare plan context
    const context: PlanContext = {
      trace_id: "trace-123",
      request_id: "req-123",
      agent: "test-agent",
      frontmatter: {
        trace_id: "trace-123",
        request_id: "req-123",
      },
      steps: [
        {
          number: 1,
          title: "Create File",
          content: "Create a file named test.txt with content 'Hello World'",
        },
      ],
    };

    // Execute plan
    const planPath = join(tempDir, "System/Active/plan.md");
    const sha = await executor.execute(planPath, context);

    // Verify result
    assertExists(sha, "Should return commit SHA");

    // Verify file created
    const fileContent = await Deno.readTextFile(join(tempDir, "test.txt"));
    assertEquals(fileContent, "Hello World");

    // Verify commit
    const commitMsg = await helper.getLastCommitMessage();
    // Since final commit had no changes, the last commit is the step commit
    assertEquals(commitMsg.includes("Step 1: Create File"), true);
    assertEquals(commitMsg.includes("Executed by agent"), false); // Final commit message not present

    // Verify step commit exists (intermediate commit)
    // We can check logs or just trust the final state for now,
    // but let's check if we have more than 1 commit (initial + step + final)
    // Actually GitTestHelper doesn't have commit count easily, but we can check log
    const log = await helper.runGit(["log", "--oneline"]);
    const commits = log.trim().split("\n");
    // Should have at least: "Complete plan...", "Step 1:...", "Initial commit" (if created by helper?)
    // GitTestHelper init doesn't create initial commit usually unless specified.
    // GitService.ensureRepository does init.
    // So we expect: "Complete plan...", "Step 1:..."
    assert(commits.length >= 2, "Should have at least 2 commits");
    assert(log.includes("Step 1: Create File"), "Should have step commit");
  } finally {
    await cleanup();
  }
});

Deno.test("PlanExecutor: handles multiple steps", async () => {
  const { tempDir, db, cleanup, config, git } = await createGitTestContext("plan-exec-multi-");
  const _helper = new GitTestHelper(tempDir);

  try {
    await git.ensureRepository();
    await git.ensureIdentity();

    // Mock LLM response - we need different responses for different steps
    // But MockProvider returns static response.
    // We might need to subclass MockProvider or make it smarter if we want dynamic responses.
    // For now, let's use a single response that works for both steps (e.g. overwriting same file or creating different files if we could control it)
    // Since we can't easily control it with simple MockProvider, let's just make it create the same file content but maybe different path if the prompt included path?
    // No, MockProvider ignores prompt.

    // Let's create a SmartMockProvider for this test
    class SmartMockProvider extends MockProvider {
      override generate(prompt: string): Promise<string> {
        if (prompt.includes("CURRENT TASK:\nStep 1")) {
          return Promise.resolve(`
\`\`\`toml
[[actions]]
tool = "write_file"
[actions.params]
path = "step1.txt"
content = "Step 1"
\`\`\`
`);
        } else if (prompt.includes("CURRENT TASK:\nStep 2")) {
          return Promise.resolve(`
\`\`\`toml
[[actions]]
tool = "write_file"
[actions.params]
path = "step2.txt"
content = "Step 2"
\`\`\`
`);
        }
        return Promise.resolve("");
      }
    }

    const mockProvider = new SmartMockProvider("");
    const executor = new PlanExecutor(config, mockProvider, db);

    const context: PlanContext = {
      trace_id: "trace-456",
      request_id: "req-456",
      agent: "test-agent",
      frontmatter: {},
      steps: [
        { number: 1, title: "Step 1", content: "Do step 1" },
        { number: 2, title: "Step 2", content: "Do step 2" },
      ],
    };

    const sha = await executor.execute("plan.md", context);
    assertExists(sha);

    // Verify both files created
    const content1 = await Deno.readTextFile(join(tempDir, "step1.txt"));
    assertEquals(content1, "Step 1");
    const content2 = await Deno.readTextFile(join(tempDir, "step2.txt"));
    assertEquals(content2, "Step 2");
  } finally {
    await cleanup();
  }
});

Deno.test("PlanExecutor: handles tool execution failure", async () => {
  const { tempDir: _tempDir, db, cleanup, config, git } = await createGitTestContext("plan-exec-fail-");

  try {
    await git.ensureRepository();
    await git.ensureIdentity();

    // Mock response with invalid tool usage (e.g. write to root which might be allowed but let's try something that fails)
    // Or just use a non-existent tool? ToolRegistry throws if tool not found?
    // ToolRegistry throws "Unknown tool" if not found.
    const mockResponse = `
\`\`\`toml
[[actions]]
tool = "non_existent_tool"
[actions.params]
foo = "bar"
\`\`\`
`;
    const mockProvider = new MockProvider(mockResponse);
    const executor = new PlanExecutor(config, mockProvider, db);

    const context: PlanContext = {
      trace_id: "trace-fail",
      request_id: "req-fail",
      agent: "test-agent",
      frontmatter: {},
      steps: [{ number: 1, title: "Fail", content: "Fail" }],
    };

    // Should throw
    await assertRejects(
      async () => await executor.execute("plan.md", context),
      Error,
      "Tool 'non_existent_tool' not found",
    );
  } finally {
    await cleanup();
  }
});
