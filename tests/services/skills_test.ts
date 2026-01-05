/**
 * Skills Service Tests
 *
 * Phase 17: Skills Architecture
 */

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { join } from "@std/path";
import { exists } from "@std/fs";
import { SkillsService } from "../../src/services/skills.ts";
import { initTestDbService } from "../helpers/db.ts";

// ===== Directory Structure Tests =====

Deno.test("SkillsService: initialize creates directory structure", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    const skillsDir = join(config.system.root, "Memory", "Skills");
    assertEquals(await exists(skillsDir), true);
    assertEquals(await exists(join(skillsDir, "core")), true);
    assertEquals(await exists(join(skillsDir, "learned")), true);
    assertEquals(await exists(join(skillsDir, "project")), true);
    assertEquals(await exists(join(skillsDir, "index.json")), true);
  } finally {
    await cleanup();
  }
});

// ===== CRUD Operations Tests =====

Deno.test("SkillsService: createSkill creates and indexes skill", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    const skill = await service.createSkill({
      skill_id: "test-skill",
      name: "Test Skill",
      version: "1.0.0",
      description: "A test skill",
      scope: "global",
      status: "active",
      source: "user",
      triggers: {
        keywords: ["test", "example"],
        task_types: ["testing"],
      },
      instructions: "Test instructions here",
    }, "learned");

    assertExists(skill.id);
    assertEquals(skill.skill_id, "test-skill");
    assertEquals(skill.name, "Test Skill");
    assertEquals(skill.usage_count, 0);

    // Verify file was created
    const skillPath = join(config.system.root, "Memory", "Skills", "learned", "test-skill.skill.md");
    assertEquals(await exists(skillPath), true);
  } finally {
    await cleanup();
  }
});

Deno.test("SkillsService: getSkill retrieves created skill", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    // Create a skill first
    await service.createSkill({
      skill_id: "get-test-skill",
      name: "Get Test Skill",
      version: "1.0.0",
      description: "Test get operation",
      scope: "global",
      status: "active",
      source: "user",
      triggers: {
        keywords: ["get", "test"],
      },
      instructions: "Get test instructions",
    }, "learned");

    const skill = await service.getSkill("get-test-skill");
    assertExists(skill);
    assertEquals(skill?.name, "Get Test Skill");
    assertEquals(skill?.instructions, "Get test instructions");
  } finally {
    await cleanup();
  }
});

Deno.test("SkillsService: getSkill returns null for missing skill", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    const skill = await service.getSkill("nonexistent-skill");
    assertEquals(skill, null);
  } finally {
    await cleanup();
  }
});

Deno.test("SkillsService: listSkills returns all active skills", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    // Create multiple skills
    await service.createSkill({
      skill_id: "list-skill-1",
      name: "List Skill 1",
      version: "1.0.0",
      description: "First skill",
      scope: "global",
      status: "active",
      source: "user",
      triggers: { keywords: ["one"] },
      instructions: "Instructions 1",
    }, "learned");

    await service.createSkill({
      skill_id: "list-skill-2",
      name: "List Skill 2",
      version: "1.0.0",
      description: "Second skill",
      scope: "global",
      status: "draft",
      source: "user",
      triggers: { keywords: ["two"] },
      instructions: "Instructions 2",
    }, "learned");

    const allSkills = await service.listSkills();
    const activeSkills = await service.listSkills({ status: "active" });
    const draftSkills = await service.listSkills({ status: "draft" });

    // Should have at least the skills we created
    const listSkills = allSkills.filter((s) => s.skill_id.startsWith("list-skill"));
    assertEquals(listSkills.length >= 2, true);

    const activeList = activeSkills.filter((s) => s.skill_id.startsWith("list-skill"));
    assertEquals(activeList.length >= 1, true);

    const draftList = draftSkills.filter((s) => s.skill_id.startsWith("list-skill"));
    assertEquals(draftList.length >= 1, true);
  } finally {
    await cleanup();
  }
});

Deno.test("SkillsService: updateSkill modifies skill", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    await service.createSkill({
      skill_id: "update-test",
      name: "Update Test",
      version: "1.0.0",
      description: "Before update",
      scope: "global",
      status: "draft",
      source: "user",
      triggers: { keywords: ["update"] },
      instructions: "Original instructions",
    }, "learned");

    const updated = await service.updateSkill("update-test", {
      name: "Updated Name",
      version: "1.1.0",
      instructions: "Updated instructions",
    });

    assertExists(updated);
    assertEquals(updated?.name, "Updated Name");
    assertEquals(updated?.version, "1.1.0");
    assertEquals(updated?.instructions, "Updated instructions");
    assertEquals(updated?.skill_id, "update-test"); // ID unchanged
  } finally {
    await cleanup();
  }
});

Deno.test("SkillsService: activateSkill changes draft to active", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    await service.createSkill({
      skill_id: "activate-test",
      name: "Activate Test",
      version: "1.0.0",
      description: "To be activated",
      scope: "global",
      status: "draft",
      source: "user",
      triggers: { keywords: ["activate"] },
      instructions: "Activation test",
    }, "learned");

    const result = await service.activateSkill("activate-test");
    assertEquals(result, true);

    const skill = await service.getSkill("activate-test");
    assertEquals(skill?.status, "active");
  } finally {
    await cleanup();
  }
});

Deno.test("SkillsService: deprecateSkill marks skill as deprecated", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    await service.createSkill({
      skill_id: "deprecate-test",
      name: "Deprecate Test",
      version: "1.0.0",
      description: "To be deprecated",
      scope: "global",
      status: "active",
      source: "user",
      triggers: { keywords: ["deprecate"] },
      instructions: "Deprecation test",
    }, "learned");

    const result = await service.deprecateSkill("deprecate-test");
    assertEquals(result, true);

    const skill = await service.getSkill("deprecate-test");
    assertEquals(skill?.status, "deprecated");
  } finally {
    await cleanup();
  }
});

// ===== Trigger Matching Tests =====

Deno.test("SkillsService: matchSkills returns skills matching keywords", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    await service.createSkill({
      skill_id: "keyword-match",
      name: "Keyword Match",
      version: "1.0.0",
      description: "Matches keywords",
      scope: "global",
      status: "active",
      source: "user",
      triggers: {
        keywords: ["implement", "feature", "create"],
      },
      instructions: "Keyword matching test",
    }, "learned");

    const matches = await service.matchSkills({
      keywords: ["implement", "new", "feature"],
    });

    const matched = matches.find((m) => m.skillId === "keyword-match");
    assertExists(matched);
    assertEquals(matched.confidence > 0, true);
    assertExists(matched.matchedTriggers.keywords);
  } finally {
    await cleanup();
  }
});

Deno.test("SkillsService: matchSkills returns skills matching task types", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    await service.createSkill({
      skill_id: "tasktype-match",
      name: "Task Type Match",
      version: "1.0.0",
      description: "Matches task types",
      scope: "global",
      status: "active",
      source: "user",
      triggers: {
        task_types: ["bugfix", "security"],
      },
      instructions: "Task type matching test",
    }, "learned");

    const matches = await service.matchSkills({
      taskType: "bugfix",
    });

    const matched = matches.find((m) => m.skillId === "tasktype-match");
    assertExists(matched);
    assertEquals(matched.matchedTriggers.task_types, ["bugfix"]);
  } finally {
    await cleanup();
  }
});

Deno.test("SkillsService: matchSkills returns skills matching file patterns", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    await service.createSkill({
      skill_id: "filepattern-match",
      name: "File Pattern Match",
      version: "1.0.0",
      description: "Matches file patterns",
      scope: "global",
      status: "active",
      source: "user",
      triggers: {
        file_patterns: ["*.ts", "src/**/*.js"],
      },
      instructions: "File pattern matching test",
    }, "learned");

    const matches = await service.matchSkills({
      filePaths: ["test.ts", "other.py"],
    });

    const matched = matches.find((m) => m.skillId === "filepattern-match");
    assertExists(matched);
    assertExists(matched.matchedTriggers.file_patterns);
  } finally {
    await cleanup();
  }
});

Deno.test("SkillsService: matchSkills excludes non-active skills", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    await service.createSkill({
      skill_id: "draft-skill",
      name: "Draft Skill",
      version: "1.0.0",
      description: "A draft skill",
      scope: "global",
      status: "draft",
      source: "user",
      triggers: {
        keywords: ["draft", "exclusive", "unique-keyword-xyz"],
      },
      instructions: "Should not match",
    }, "learned");

    const matches = await service.matchSkills({
      keywords: ["draft", "exclusive", "unique-keyword-xyz"],
    });

    const matched = matches.find((m) => m.skillId === "draft-skill");
    assertEquals(matched, undefined);
  } finally {
    await cleanup();
  }
});

Deno.test("SkillsService: matchSkills extracts keywords from request text", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    await service.createSkill({
      skill_id: "text-extract",
      name: "Text Extract",
      version: "1.0.0",
      description: "Test keyword extraction",
      scope: "global",
      status: "active",
      source: "user",
      triggers: {
        keywords: ["authentication", "login"],
      },
      instructions: "Text extraction test",
    }, "learned");

    const matches = await service.matchSkills({
      requestText: "Please implement authentication for the login page",
    });

    const matched = matches.find((m) => m.skillId === "text-extract");
    assertExists(matched);
  } finally {
    await cleanup();
  }
});

Deno.test("SkillsService: matchSkills respects maxSkillsPerRequest limit", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    // Create many skills with the same trigger
    for (let i = 0; i < 10; i++) {
      await service.createSkill({
        skill_id: `limit-test-${i}`,
        name: `Limit Test ${i}`,
        version: "1.0.0",
        description: "Limit test",
        scope: "global",
        status: "active",
        source: "user",
        triggers: {
          keywords: ["limitspecial", "testspecial"],
        },
        instructions: `Limit test ${i}`,
      }, "learned");
    }

    const matches = await service.matchSkills({
      keywords: ["limitspecial", "testspecial"],
    });

    // Default maxSkillsPerRequest is 5
    assertEquals(matches.length <= 5, true);
  } finally {
    await cleanup();
  }
});

// ===== Skill Context Building Tests =====

Deno.test("SkillsService: buildSkillContext generates markdown context", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    await service.createSkill({
      skill_id: "context-test",
      name: "Context Test Skill",
      version: "1.0.0",
      description: "For context building",
      scope: "global",
      status: "active",
      source: "user",
      triggers: { keywords: ["context"] },
      instructions: "Do the context thing step by step",
      constraints: ["Must follow rule 1", "Must follow rule 2"],
      quality_criteria: [
        { name: "Quality", weight: 50 },
        { name: "Speed", weight: 50 },
      ],
    }, "learned");

    const context = await service.buildSkillContext(["context-test"]);

    assertEquals(context.includes("Context Test Skill"), true);
    assertEquals(context.includes("Do the context thing step by step"), true);
    assertEquals(context.includes("Must follow rule 1"), true);
    assertEquals(context.includes("Quality"), true);
  } finally {
    await cleanup();
  }
});

Deno.test("SkillsService: buildSkillContext handles missing skills", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    const context = await service.buildSkillContext(["nonexistent-1", "nonexistent-2"]);
    assertEquals(context, "");
  } finally {
    await cleanup();
  }
});

Deno.test("SkillsService: buildSkillContext combines multiple skills", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    await service.createSkill({
      skill_id: "multi-1",
      name: "Multi Skill 1",
      version: "1.0.0",
      description: "First skill",
      scope: "global",
      status: "active",
      source: "user",
      triggers: { keywords: ["multi"] },
      instructions: "Instructions for skill 1",
    }, "learned");

    await service.createSkill({
      skill_id: "multi-2",
      name: "Multi Skill 2",
      version: "1.0.0",
      description: "Second skill",
      scope: "global",
      status: "active",
      source: "user",
      triggers: { keywords: ["multi"] },
      instructions: "Instructions for skill 2",
    }, "learned");

    const context = await service.buildSkillContext(["multi-1", "multi-2"]);

    assertEquals(context.includes("Multi Skill 1"), true);
    assertEquals(context.includes("Multi Skill 2"), true);
    assertEquals(context.includes("Instructions for skill 1"), true);
    assertEquals(context.includes("Instructions for skill 2"), true);
  } finally {
    await cleanup();
  }
});

// ===== Skill Derivation Tests =====

Deno.test("SkillsService: deriveSkillFromLearnings creates skill with derived_from", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    const learningIds = ["learning-1", "learning-2", "learning-3"];

    const skill = await service.deriveSkillFromLearnings(learningIds, {
      skill_id: "derived-skill",
      name: "Derived Skill",
      version: "1.0.0",
      description: "Derived from learnings",
      scope: "global",
      status: "draft",
      triggers: { keywords: ["derived"] },
      instructions: "Derived instructions",
    });

    assertEquals(skill.source, "learned");
    assertEquals(skill.derived_from, learningIds);
    assertEquals(skill.status, "draft"); // Always starts as draft
  } finally {
    await cleanup();
  }
});

// ===== Skill Index Management Tests =====

Deno.test("SkillsService: rebuildIndex scans all skill directories", async () => {
  const { db, config, cleanup } = await initTestDbService();

  try {
    const service = new SkillsService(config, db);
    await service.initialize();

    // Create skills in different locations
    await service.createSkill({
      skill_id: "index-learned",
      name: "Learned Index Test",
      version: "1.0.0",
      description: "In learned dir",
      scope: "global",
      status: "active",
      source: "learned",
      triggers: { keywords: ["index"] },
      instructions: "Index test",
    }, "learned");

    // Rebuild index
    await service.rebuildIndex();

    const skills = await service.listSkills();
    const found = skills.find((s) => s.skill_id === "index-learned");
    assertExists(found);
  } finally {
    await cleanup();
  }
});
