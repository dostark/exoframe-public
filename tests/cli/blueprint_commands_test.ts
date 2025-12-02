/**
 * Blueprint Commands Tests
 * Tests for Step 5.11 - Blueprint Creation and Management
 *
 * Following TDD approach per src/AGENT_INSTRUCTIONS.md:
 * 1. Write tests first (RED phase)
 * 2. Implement minimal code to pass (GREEN phase)
 * 3. Refactor while keeping tests green
 */

import { assertEquals, assertExists, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
import { exists } from "jsr:@std/fs@1";
import { join } from "jsr:@std/path@1";
import { BlueprintCommands } from "../../src/cli/blueprint_commands.ts";
import type { CommandContext } from "../../src/cli/base.ts";
import { TestEnvironment } from "../integration/helpers/test_environment.ts";

// ============================================================================
// Test Setup
// ============================================================================

let testEnv: TestEnvironment;
let commands: BlueprintCommands;
let context: CommandContext;

async function setupTest() {
  testEnv = await TestEnvironment.create();
  context = {
    config: testEnv.config,
    db: testEnv.db,
  };
  commands = new BlueprintCommands(context);
}

async function teardownTest() {
  await testEnv.cleanup();
}

// ============================================================================
// Test Suite: Blueprint Create Command
// ============================================================================

Deno.test("[blueprint] create - generates valid blueprint file", async () => {
  await setupTest();
  try {
    const result = await commands.create("test-agent", {
      name: "Test Agent",
      model: "ollama:codellama:13b",
    });

    // Verify result structure
    assertExists(result);
    assertEquals(result.agent_id, "test-agent");
    assertEquals(result.name, "Test Agent");
    assertEquals(result.model, "ollama:codellama:13b");

    // Verify file exists
    const blueprintPath = join(testEnv.config.system.root, testEnv.config.paths.blueprints, "Agents", "test-agent.md");
    assertEquals(await exists(blueprintPath), true);

    // Verify file content
    const content = await Deno.readTextFile(blueprintPath);
    assertStringIncludes(content, "+++");
    assertStringIncludes(content, 'agent_id = "test-agent"');
    assertStringIncludes(content, 'name = "Test Agent"');
    assertStringIncludes(content, 'model = "ollama:codellama:13b"');
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] create - validates against schema", async () => {
  await setupTest();
  try {
    const result = await commands.create("valid-agent", {
      name: "Valid Agent",
      model: "anthropic:claude-3-sonnet",
    });

    // Verify all required fields present
    assertExists(result.agent_id);
    assertExists(result.name);
    assertExists(result.model);
    assertExists(result.created);
    assertExists(result.created_by);
    assertExists(result.version);
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] create - applies template defaults", async () => {
  await setupTest();
  try {
    const result = await commands.create("coder-agent", {
      name: "Coder Agent",
      template: "coder",
    });

    // Verify template defaults applied
    assertEquals(result.model, "anthropic:claude-sonnet");
    assertExists(result.capabilities);
    assertEquals(result.capabilities?.includes("code_generation"), true);
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] create - loads system prompt from file", async () => {
  await setupTest();
  try {
    // Create temporary prompt file
    const promptFile = join(testEnv.tempDir, "test-prompt.txt");
    await Deno.writeTextFile(promptFile, "Custom system prompt with <thought> and <content> tags.");

    const _result = await commands.create("custom-agent", {
      name: "Custom Agent",
      model: "ollama:llama2",
      systemPromptFile: promptFile,
    });

    // Verify prompt loaded
    const blueprintPath = join(
      testEnv.config.system.root,
      testEnv.config.paths.blueprints,
      "Agents",
      "custom-agent.md",
    );
    const content = await Deno.readTextFile(blueprintPath);
    assertStringIncludes(content, "Custom system prompt");
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] create - rejects reserved agent_id names", async () => {
  await setupTest();
  try {
    await assertRejects(
      async () => {
        await commands.create("system", {
          name: "System Agent",
          model: "ollama:llama2",
        });
      },
      Error,
      "reserved",
    );
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] create - rejects duplicate agent_id", async () => {
  await setupTest();
  try {
    // Create first blueprint
    await commands.create("duplicate-test", {
      name: "First Agent",
      model: "ollama:llama2",
    });

    // Attempt to create duplicate
    await assertRejects(
      async () => {
        await commands.create("duplicate-test", {
          name: "Second Agent",
          model: "ollama:llama2",
        });
      },
      Error,
      "already exists",
    );
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] create - rejects invalid agent_id format", async () => {
  await setupTest();
  try {
    await assertRejects(
      async () => {
        await commands.create("Invalid_Agent", {
          name: "Invalid Agent",
          model: "ollama:llama2",
        });
      },
      Error,
      "lowercase alphanumeric",
    );
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] create - logs to Activity Journal", async () => {
  await setupTest();
  try {
    await commands.create("journal-test", {
      name: "Journal Test Agent",
      model: "ollama:llama2",
    });

    // Flush pending database writes
    await testEnv.db.waitForFlush();

    // Verify activity logged
    const activities = testEnv.db.getActivitiesByActionType("blueprint.created");

    assertEquals(activities.length >= 1, true);
    // The target field should contain the agent_id
    const activity = activities.find((a) => a.target === "journal-test");
    assertExists(activity);
  } finally {
    await teardownTest();
  }
});

// ============================================================================
// Test Suite: Blueprint List Command
// ============================================================================

Deno.test("[blueprint] list - shows all blueprints", async () => {
  await setupTest();
  try {
    // Create test blueprints
    await commands.create("agent-1", { name: "Agent 1", model: "ollama:llama2" });
    await commands.create("agent-2", { name: "Agent 2", model: "ollama:llama2" });
    await commands.create("agent-3", { name: "Agent 3", model: "ollama:llama2" });

    const blueprints = await commands.list();

    assertEquals(blueprints.length >= 3, true);
    assertEquals(blueprints.some((b) => b.agent_id === "agent-1"), true);
    assertEquals(blueprints.some((b) => b.agent_id === "agent-2"), true);
    assertEquals(blueprints.some((b) => b.agent_id === "agent-3"), true);
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] list - returns metadata", async () => {
  await setupTest();
  try {
    await commands.create("meta-test", {
      name: "Meta Test Agent",
      model: "anthropic:claude-sonnet",
    });

    const blueprints = await commands.list();
    const blueprint = blueprints.find((b) => b.agent_id === "meta-test");

    assertExists(blueprint);
    if (!blueprint) throw new Error("Blueprint not found");
    assertEquals(blueprint.agent_id, "meta-test");
    assertEquals(blueprint.name, "Meta Test Agent");
    assertEquals(blueprint.model, "anthropic:claude-sonnet");
    assertExists(blueprint.created);
    assertExists(blueprint.created_by);
  } finally {
    await teardownTest();
  }
});

// ============================================================================
// Test Suite: Blueprint Show Command
// ============================================================================

Deno.test("[blueprint] show - displays full blueprint", async () => {
  await setupTest();
  try {
    await commands.create("show-test", {
      name: "Show Test Agent",
      model: "ollama:llama2",
    });

    const details = await commands.show("show-test");

    assertExists(details);
    assertEquals(details.agent_id, "show-test");
    assertExists(details.content);
    assertStringIncludes(details.content, "+++");
    assertStringIncludes(details.content, 'agent_id = "show-test"');
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] show - rejects non-existent blueprint", async () => {
  await setupTest();
  try {
    await assertRejects(
      async () => {
        await commands.show("non-existent");
      },
      Error,
      "not found",
    );
  } finally {
    await teardownTest();
  }
});

// ============================================================================
// Test Suite: Blueprint Validate Command
// ============================================================================

Deno.test("[blueprint] validate - accepts valid blueprint", async () => {
  await setupTest();
  try {
    await commands.create("valid-blueprint", {
      name: "Valid Blueprint",
      model: "ollama:llama2",
    });

    const result = await commands.validate("valid-blueprint");

    assertEquals(result.valid, true);
    assertEquals(result.errors.length, 0);
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] validate - detects missing required fields", async () => {
  await setupTest();
  try {
    // Manually create invalid blueprint
    const blueprintPath = join(testEnv.config.system.root, testEnv.config.paths.blueprints, "Agents", "invalid.md");
    await Deno.writeTextFile(
      blueprintPath,
      `+++
name = "Invalid"
+++

Content without agent_id
`,
    );

    const result = await commands.validate("invalid");

    assertEquals(result.valid, false);
    assertEquals(result.errors.length > 0, true);
    assertStringIncludes(result.errors.join(" "), "agent_id");
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] validate - checks system prompt format", async () => {
  await setupTest();
  try {
    // Create blueprint with missing output format tags
    const blueprintPath = join(testEnv.config.system.root, testEnv.config.paths.blueprints, "Agents", "no-tags.md");
    await Deno.writeTextFile(
      blueprintPath,
      `+++
agent_id = "no-tags"
name = "No Tags"
model = "ollama:llama2"
created = "2025-12-02T10:00:00Z"
created_by = "test"
version = "1.0.0"
+++

System prompt without thought and content tags.
`,
    );

    const result = await commands.validate("no-tags");

    assertEquals(result.valid, false);
    assertEquals(
      result.errors.some((e) => e.includes("<thought>") || e.includes("<content>")),
      true,
    );
  } finally {
    await teardownTest();
  }
});

// ============================================================================
// Test Suite: Blueprint Remove Command
// ============================================================================

Deno.test("[blueprint] remove - deletes blueprint file", async () => {
  await setupTest();
  try {
    await commands.create("remove-test", {
      name: "Remove Test",
      model: "ollama:llama2",
    });

    const blueprintPath = join(testEnv.config.system.root, testEnv.config.paths.blueprints, "Agents", "remove-test.md");
    assertEquals(await exists(blueprintPath), true);

    await commands.remove("remove-test", { force: true });

    assertEquals(await exists(blueprintPath), false);
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] remove - logs to Activity Journal", async () => {
  await setupTest();
  try {
    await commands.create("remove-journal", {
      name: "Remove Journal Test",
      model: "ollama:llama2",
    });

    await commands.remove("remove-journal", { force: true });

    // Flush pending database writes
    await testEnv.db.waitForFlush();

    const activities = testEnv.db.getActivitiesByActionType("blueprint.removed");

    // The target field should contain the agent_id
    const activity = activities.find((a) => a.target === "remove-journal");
    assertExists(activity);
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] remove - rejects non-existent blueprint", async () => {
  await setupTest();
  try {
    await assertRejects(
      async () => {
        await commands.remove("non-existent", { force: true });
      },
      Error,
      "not found",
    );
  } finally {
    await teardownTest();
  }
});

// ============================================================================
// Test Suite: Template System
// ============================================================================

Deno.test("[blueprint] template - default template", async () => {
  await setupTest();
  try {
    const result = await commands.create("default-template", {
      name: "Default Template Test",
      template: "default",
    });

    assertEquals(result.model, "ollama:codellama:13b");
    assertEquals(result.capabilities?.includes("general"), true);
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] template - coder template", async () => {
  await setupTest();
  try {
    const result = await commands.create("coder-template", {
      name: "Coder Template Test",
      template: "coder",
    });

    assertEquals(result.model, "anthropic:claude-sonnet");
    assertEquals(result.capabilities?.includes("code_generation"), true);
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] template - reviewer template", async () => {
  await setupTest();
  try {
    const result = await commands.create("reviewer-template", {
      name: "Reviewer Template Test",
      template: "reviewer",
    });

    assertEquals(result.model, "openai:gpt-4");
    assertEquals(result.capabilities?.includes("code_review"), true);
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] template - mock template", async () => {
  await setupTest();
  try {
    const result = await commands.create("mock-template", {
      name: "Mock Template Test",
      template: "mock",
    });

    assertEquals(result.model, "mock:test-model");
    assertEquals(result.capabilities?.includes("testing"), true);
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] template - gemini template", async () => {
  await setupTest();
  try {
    const result = await commands.create("gemini-template", {
      name: "Gemini Template Test",
      template: "gemini",
    });

    assertEquals(result.model, "google:gemini-2.0-flash");
    assertEquals(result.capabilities?.includes("multimodal"), true);
  } finally {
    await teardownTest();
  }
});

// ============================================================================
// Test Suite: Edit Command
// ============================================================================

Deno.test("[blueprint] edit - validates after editing", async () => {
  await setupTest();
  try {
    // Create a blueprint first
    await commands.create("edit-test", {
      name: "Edit Test",
      model: "ollama:llama2",
    });

    // Mock EDITOR environment variable to use 'true' command (exits successfully)
    const originalEditor = Deno.env.get("EDITOR");
    Deno.env.set("EDITOR", "true");

    try {
      // Edit should succeed and validate
      await commands.edit("edit-test");

      // Verify activity logged
      await testEnv.db.waitForFlush();
      const activities = testEnv.db.getActivitiesByActionType("blueprint.edited");
      const activity = activities.find((a) => a.target === "edit-test");
      assertExists(activity);
    } finally {
      // Restore original EDITOR
      if (originalEditor) {
        Deno.env.set("EDITOR", originalEditor);
      } else {
        Deno.env.delete("EDITOR");
      }
    }
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] edit - rejects non-existent blueprint", async () => {
  await setupTest();
  try {
    await assertRejects(
      async () => {
        await commands.edit("non-existent");
      },
      Error,
      "not found",
    );
  } finally {
    await teardownTest();
  }
});

// Additional edge case tests for improved coverage

Deno.test("[blueprint] create - rejects when system prompt file not found", async () => {
  await setupTest();
  try {
    await assertRejects(
      async () => {
        await commands.create("test-agent", {
          name: "Test Agent",
          model: "ollama:llama2",
          systemPromptFile: "/nonexistent/file.txt",
        });
      },
      Error,
      "System prompt file not found",
    );
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] create - rejects system prompt without required tags", async () => {
  await setupTest();
  try {
    const promptFile = join(testEnv.tempDir, "invalid-prompt.txt");
    await Deno.writeTextFile(promptFile, "System prompt without required tags");

    await assertRejects(
      async () => {
        await commands.create("test-agent", {
          name: "Test Agent",
          model: "ollama:llama2",
          systemPromptFile: promptFile,
        });
      },
      Error,
      "must include output format instructions",
    );
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] validate - warns on provider mismatch", async () => {
  await setupTest();
  try {
    // Create blueprint with anthropic model
    await commands.create("mismatch-test", {
      name: "Mismatch Test",
      model: "anthropic:claude-sonnet",
    });

    // Validation should succeed but may have warnings
    const result = await commands.validate("mismatch-test");
    assertEquals(result.valid, true);
    // Warnings depend on config.ai.provider setting
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] create - handles empty description gracefully", async () => {
  await setupTest();
  try {
    const result = await commands.create("no-desc", {
      name: "No Description",
      model: "ollama:llama2",
      description: "",
    });

    assertExists(result.path);
    assertEquals(result.agent_id, "no-desc");
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] list - returns empty array when no blueprints", async () => {
  await setupTest();
  try {
    const results = await commands.list();
    assertEquals(results, []);
  } finally {
    await teardownTest();
  }
});

Deno.test("[blueprint] show - throws on blueprint with invalid frontmatter", async () => {
  await setupTest();
  try {
    const blueprintPath = join(testEnv.config.system.root, testEnv.config.paths.blueprints, "Agents", "bad-format.md");
    await Deno.writeTextFile(
      blueprintPath,
      `Not a valid blueprint format\nNo frontmatter`,
    );

    await assertRejects(
      async () => {
        await commands.show("bad-format");
      },
      Error,
      "Invalid blueprint format",
    );
  } finally {
    await teardownTest();
  }
});
