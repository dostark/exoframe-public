/**
 * Integration Test: Scenario 11 - Blueprint Management
 * Create → Validate → Edit → Use in Request → Remove
 *
 * Success Criteria:
 * - Test 1: Blueprint created with all required fields and valid TOML frontmatter
 * - Test 2: Template-based blueprint applies correct defaults (model, capabilities)
 * - Test 3: Custom system prompt from file is loaded correctly
 * - Test 4: Validation detects missing fields and invalid formats
 * - Test 5: Reserved names (system, test) are rejected
 * - Test 6: Duplicate agent_id names are rejected
 * - Test 7: Edit modifies existing blueprint and re-validates
 * - Test 8: Blueprint can be referenced in request creation
 * - Test 9: Removal deletes blueprint file from filesystem
 * - Test 10: All operations logged to Activity Journal with correct action types
 */

import { assert, assertEquals, assertExists, assertRejects, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { exists } from "@std/fs";
import { TestEnvironment } from "./helpers/test_environment.ts";
import { BlueprintCommands } from "../../src/cli/blueprint_commands.ts";

Deno.test("Integration: Blueprint Management - Full Lifecycle", async (t) => {
  const env = await TestEnvironment.create();
  const blueprintCommands = new BlueprintCommands(
    { config: env.config, db: env.db },
  );

  try {
    let customPromptPath: string;
    const testAgentId = "integration-test-agent";
    const coderAgentId = "integration-coder";
    const customAgentId = "custom-prompt-agent";

    // ========================================================================
    // Test 1: Create Blueprint from Scratch
    // ========================================================================
    await t.step("Test 1: Create blueprint with valid TOML frontmatter", async () => {
      const result = await blueprintCommands.create(testAgentId, {
        name: "Integration Test Agent",
        model: "ollama:codellama:13b",
        description: "Test agent for integration testing",
      });

      assertExists(result.path, "Blueprint path should be returned");
      assertEquals(result.agent_id, testAgentId);

      // Verify file exists
      const blueprintPath = join(env.tempDir, "Blueprints", "Agents", `${testAgentId}.md`);
      const fileExists = await exists(blueprintPath);
      assertEquals(fileExists, true, "Blueprint file should exist");

      // Verify TOML frontmatter format
      const content = await Deno.readTextFile(blueprintPath);
      assertStringIncludes(content, "+++", "Should use TOML delimiters");
      assertStringIncludes(content, `agent_id = "${testAgentId}"`);
      assertStringIncludes(content, `name = "Integration Test Agent"`);
      assertStringIncludes(content, `model = "ollama:codellama:13b"`);
      assertStringIncludes(content, "capabilities = [");

      // Verify Activity Journal
      await env.db.waitForFlush();
      const activities = env.db.instance.prepare(
        "SELECT * FROM activity WHERE action_type = 'blueprint.created' AND target LIKE ?",
      ).all(`%${testAgentId}%`);
      assertEquals(activities.length, 1, "Should log blueprint.created activity");
    });

    // ========================================================================
    // Test 2: Create Blueprint from Template
    // ========================================================================
    await t.step("Test 2: Template applies correct model and capabilities", async () => {
      const result = await blueprintCommands.create(coderAgentId, {
        name: "Integration Coder",
        template: "coder",
      });

      const blueprintPath = result.path;
      const content = await Deno.readTextFile(blueprintPath);

      // Verify template defaults
      assertStringIncludes(content, `model = "anthropic:claude-sonnet"`);
      assertStringIncludes(content, `"code_generation"`);
      assertStringIncludes(content, `"debugging"`);
      assertStringIncludes(content, `"testing"`);
      assertStringIncludes(content, "# Software Development Agent");

      // Verify system prompt contains coder-specific content
      assertStringIncludes(content, "multiple programming languages");
    });

    // ========================================================================
    // Test 3: Create Blueprint with Custom System Prompt from File
    // ========================================================================
    await t.step("Test 3: Custom system prompt loaded from file", async () => {
      // Create custom prompt file
      customPromptPath = join(env.tempDir, "custom-prompt.txt");
      const customPrompt = `# Custom Integration Test Agent

You are a specialized integration testing agent.

## Output Format

\`\`\`xml
<thought>
Integration test reasoning
</thought>

<content>
Test execution results
</content>
\`\`\``;

      await Deno.writeTextFile(customPromptPath, customPrompt);

      const result = await blueprintCommands.create(customAgentId, {
        name: "Custom Prompt Agent",
        model: "mock:test-model",
        systemPromptFile: customPromptPath,
      });

      const content = await Deno.readTextFile(result.path);
      assertStringIncludes(content, "Custom Integration Test Agent");
      assertStringIncludes(content, "specialized integration testing agent");
      assertStringIncludes(content, "Integration test reasoning");
    });

    // ========================================================================
    // Test 4: Validation Detects Invalid Blueprints
    // ========================================================================
    await t.step("Test 4: Validation detects missing fields", async () => {
      // Create invalid blueprint manually
      const invalidPath = join(env.tempDir, "Blueprints", "Agents", "invalid-test.md");
      const invalidContent = `+++
name = "Missing agent_id"
model = "ollama:llama2"
+++

Invalid blueprint without agent_id field
`;
      await Deno.writeTextFile(invalidPath, invalidContent);

      // Validation should return errors
      const result = await blueprintCommands.validate("invalid-test");
      assertEquals(result.valid, false, "Validation should fail");
      assert(result.errors.length > 0, "Should have validation errors");
      assert(
        result.errors.some((e) => e.includes("agent_id")),
        "Should report missing agent_id",
      );
    });

    // ========================================================================
    // Test 5: Reserved Names Rejected
    // ========================================================================
    await t.step("Test 5: Reserved agent_id names rejected", async () => {
      await assertRejects(
        async () =>
          await blueprintCommands.create("system", {
            name: "System Agent",
            model: "ollama:llama2",
          }),
        Error,
        "reserved",
      );

      await assertRejects(
        async () =>
          await blueprintCommands.create("test", {
            name: "Test Agent",
            model: "ollama:llama2",
          }),
        Error,
        "reserved",
      );
    });

    // ========================================================================
    // Test 6: Duplicate Names Rejected
    // ========================================================================
    await t.step("Test 6: Duplicate agent_id rejected", async () => {
      await assertRejects(
        async () =>
          await blueprintCommands.create(testAgentId, {
            name: "Duplicate Agent",
            model: "ollama:llama2",
          }),
        Error,
        "already exists",
      );
    });

    // ========================================================================
    // Test 7: Edit Blueprint
    // ========================================================================
    await t.step("Test 7: Edit modifies blueprint and re-validates", async () => {
      const blueprintPath = join(env.tempDir, "Blueprints", "Agents", `${testAgentId}.md`);
      const originalContent = await Deno.readTextFile(blueprintPath);

      // Modify blueprint directly (simulating manual edit)
      const modifiedContent = originalContent.replace(
        `model = "ollama:codellama:13b"`,
        `model = "ollama:llama2:latest"`,
      );
      await Deno.writeTextFile(blueprintPath, modifiedContent);

      // Validate the edit
      const result = await blueprintCommands.validate(testAgentId);
      assertEquals(result.valid, true);

      // Verify change persisted
      const updatedContent = await Deno.readTextFile(blueprintPath);
      assertStringIncludes(updatedContent, `model = "ollama:llama2:latest"`);
    });

    // ========================================================================
    // Test 8: Use Blueprint in Request
    // ========================================================================
    await t.step("Test 8: Blueprint referenced in request creation", async () => {
      const { filePath, traceId } = await env.createRequest(
        "Test request using custom agent",
        { agentId: testAgentId },
      );

      const content = await Deno.readTextFile(filePath);
      assertStringIncludes(content, `agent_id: ${testAgentId}`);

      // Verify request can be processed (blueprint exists and is valid)
      const blueprintPath = join(env.tempDir, "Blueprints", "Agents", `${testAgentId}.md`);
      const blueprintExists = await exists(blueprintPath);
      assertEquals(blueprintExists, true, "Blueprint should exist for request processing");
    });

    // ========================================================================
    // Test 9: List Blueprints
    // ========================================================================
    await t.step("Test 9: List shows all created blueprints", async () => {
      const blueprints = await blueprintCommands.list();

      assert(blueprints.length >= 3, "Should have at least 3 blueprints");

      const agentIds = blueprints.map((b) => b.agent_id);
      assert(agentIds.includes(testAgentId), "Should include test agent");
      assert(agentIds.includes(coderAgentId), "Should include coder agent");
      assert(agentIds.includes(customAgentId), "Should include custom agent");
    });

    // ========================================================================
    // Test 10: Show Blueprint Details
    // ========================================================================
    await t.step("Test 10: Show displays full blueprint content", async () => {
      const result = await blueprintCommands.show(testAgentId);

      assertExists(result.content, "Should return content");

      assertEquals(result.agent_id, testAgentId);
      assertEquals(result.name, "Integration Test Agent");
      assertStringIncludes(result.content, "<thought>");
      assertStringIncludes(result.content, "<content>");
    });

    // ========================================================================
    // Test 11: Remove Blueprints
    // ========================================================================
    await t.step("Test 11: Remove deletes blueprint file", async () => {
      // Remove test blueprints
      await blueprintCommands.remove(customAgentId, { force: true });
      await blueprintCommands.remove(coderAgentId, { force: true });
      await blueprintCommands.remove(testAgentId, { force: true });

      // Verify files deleted
      const testPath = join(env.tempDir, "Blueprints", "Agents", `${testAgentId}.md`);
      const coderPath = join(env.tempDir, "Blueprints", "Agents", `${coderAgentId}.md`);
      const customPath = join(env.tempDir, "Blueprints", "Agents", `${customAgentId}.md`);

      assertEquals(await exists(testPath), false, "Test agent blueprint should be deleted");
      assertEquals(await exists(coderPath), false, "Coder agent blueprint should be deleted");
      assertEquals(await exists(customPath), false, "Custom agent blueprint should be deleted");

      // Verify removal activity logged
      await env.db.waitForFlush();
      const activities = env.db.instance.prepare(
        "SELECT * FROM activity WHERE action_type = 'blueprint.removed'",
      ).all();
      assert(activities.length >= 3, "Should log removal activities");
    });

    // ========================================================================
    // Test 12: Activity Journal Completeness
    // ========================================================================
    await t.step("Test 12: All operations logged to Activity Journal", async () => {
      await env.db.waitForFlush();

      const blueprintActivities = env.db.instance.prepare(
        "SELECT action_type, COUNT(*) as count FROM activity WHERE action_type LIKE 'blueprint.%' GROUP BY action_type",
      ).all() as Array<{ action_type: string; count: number }>;

      const activityTypes = new Map(
        blueprintActivities.map((row) => [
          row.action_type,
          row.count,
        ]),
      );

      // Verify expected activity types exist
      assert(activityTypes.has("blueprint.created"), "Should log created events");
      assert(activityTypes.has("blueprint.removed"), "Should log removed events");

      // Verify counts
      assert(
        activityTypes.get("blueprint.created")! >= 3,
        "Should have created at least 3 blueprints",
      );
      assert(
        activityTypes.get("blueprint.removed")! >= 3,
        "Should have removed at least 3 blueprints",
      );
    });
  } finally {
    await env.cleanup();
  }
});
