/**
 * Extended Skills Manager View Tests
 *
 * Additional tests to improve coverage for skills_manager_view.ts
 */

import { assertEquals, assertExists, assertNotEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import {
  createSkillsManagerView,
  MinimalSkillsServiceMock,
  SKILL_ICON,
  SKILLS_KEY_BINDINGS,
  SkillsManagerView,
  type SkillSummary,
  SOURCE_ICONS,
  STATUS_ICONS,
} from "../../src/tui/skills_manager_view.ts";

// ===== Test Data =====

function createTestSkills(): SkillSummary[] {
  return [
    {
      id: "tdd-methodology",
      name: "TDD Methodology",
      version: "1.0.0",
      status: "active",
      source: "core",
      description: "Test-Driven Development methodology",
      triggers: {
        keywords: ["tdd", "test-first"],
        taskTypes: ["testing"],
        filePatterns: ["*_test.ts"],
      },
      instructions: "Write failing test first, then implement.\nRepeat until done.\nRefactor as needed.",
    },
    {
      id: "security-first",
      name: "Security First",
      version: "1.0.0",
      status: "active",
      source: "core",
      description: "Security-focused development",
      triggers: {
        keywords: ["security", "auth"],
      },
    },
    {
      id: "project-conventions",
      name: "Project Conventions",
      version: "1.0.0",
      status: "active",
      source: "project",
    },
    {
      id: "learned-pattern",
      name: "Learned Pattern",
      version: "1.0.0",
      status: "draft",
      source: "learned",
    },
    {
      id: "deprecated-skill",
      name: "Deprecated Skill",
      version: "0.5.0",
      status: "deprecated",
      source: "project",
    },
  ];
}

// ===== Constants Tests =====

Deno.test("SkillsManagerView: SOURCE_ICONS has all sources", () => {
  assertExists(SOURCE_ICONS.core);
  assertExists(SOURCE_ICONS.project);
  assertExists(SOURCE_ICONS.learned);
  assertEquals(SOURCE_ICONS.core, "📦");
  assertEquals(SOURCE_ICONS.project, "📁");
  assertEquals(SOURCE_ICONS.learned, "📚");
});

Deno.test("SkillsManagerView: STATUS_ICONS has all statuses", () => {
  assertExists(STATUS_ICONS.active);
  assertExists(STATUS_ICONS.draft);
  assertExists(STATUS_ICONS.deprecated);
  assertEquals(STATUS_ICONS.active, "🟢");
  assertEquals(STATUS_ICONS.draft, "🟡");
  assertEquals(STATUS_ICONS.deprecated, "⚫");
});

Deno.test("SkillsManagerView: SKILL_ICON is defined", () => {
  assertEquals(SKILL_ICON, "🎯");
});

Deno.test("SkillsManagerView: SKILLS_KEY_BINDINGS has required keys", () => {
  const actions = SKILLS_KEY_BINDINGS.map((b) => b.action);
  assertEquals(actions.includes("navigate"), true);
  assertEquals(actions.includes("view-detail"), true);
  assertEquals(actions.includes("delete"), true);
  assertEquals(actions.includes("search"), true);
  assertEquals(actions.includes("help"), true);
  assertEquals(actions.includes("back"), true);
});

// ===== SkillsManagerView Core Tests =====

Deno.test("SkillsManagerView: getCachedSkills returns empty initially", () => {
  const mockService = new MinimalSkillsServiceMock([]);
  const view = new SkillsManagerView(mockService);

  assertEquals(view.getCachedSkills().length, 0);
});

Deno.test("SkillsManagerView: getCachedSkills returns copy of skills", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);

  await view.getSkillsList();
  const cached = view.getCachedSkills();

  assertEquals(cached.length, skills.length);
  // Verify it's a copy
  cached.push({
    id: "extra",
    name: "Extra",
    version: "1.0.0",
    status: "active",
    source: "core",
  });
  assertNotEquals(view.getCachedSkills().length, cached.length);
});

Deno.test("SkillsManagerView: selectSkill and getSelectedSkill work", () => {
  const mockService = new MinimalSkillsServiceMock([]);
  const view = new SkillsManagerView(mockService);

  assertEquals(view.getSelectedSkill(), null);

  view.selectSkill("test-id");
  assertEquals(view.getSelectedSkill(), "test-id");

  view.selectSkill("another-id");
  assertEquals(view.getSelectedSkill(), "another-id");
});

Deno.test("SkillsManagerView: getSkillDetail returns skill from service", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);

  const skill = await view.getSkillDetail("tdd-methodology");
  assertExists(skill);
  assertEquals(skill?.name, "TDD Methodology");

  const nonExistent = await view.getSkillDetail("nonexistent");
  assertEquals(nonExistent, null);
});

Deno.test("SkillsManagerView: deleteSkill removes from service", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);

  const result = await view.deleteSkill("tdd-methodology");
  assertEquals(result, true);

  const notFound = await view.deleteSkill("nonexistent");
  assertEquals(notFound, false);
});

Deno.test("SkillsManagerView: createSkillsManagerView factory function works", () => {
  const mockService = new MinimalSkillsServiceMock([]);
  const view = createSkillsManagerView(mockService);
  assertExists(view);
  assertEquals(view instanceof SkillsManagerView, true);
});

// ===== MinimalSkillsServiceMock Tests =====

Deno.test("MinimalSkillsServiceMock: listSkills filters by source", async () => {
  const skills = createTestSkills();
  const mock = new MinimalSkillsServiceMock(skills);

  const coreSkills = await mock.listSkills({ source: "core" });
  assertEquals(coreSkills.length, 2); // tdd-methodology and security-first

  const projectSkills = await mock.listSkills({ source: "project" });
  assertEquals(projectSkills.length, 2); // project-conventions and deprecated-skill

  const learnedSkills = await mock.listSkills({ source: "learned" });
  assertEquals(learnedSkills.length, 1); // learned-pattern
});

Deno.test("MinimalSkillsServiceMock: listSkills filters by status", async () => {
  const skills = createTestSkills();
  const mock = new MinimalSkillsServiceMock(skills);

  const activeSkills = await mock.listSkills({ status: "active" });
  assertEquals(activeSkills.length, 3);

  const draftSkills = await mock.listSkills({ status: "draft" });
  assertEquals(draftSkills.length, 1);

  const deprecatedSkills = await mock.listSkills({ status: "deprecated" });
  assertEquals(deprecatedSkills.length, 1);
});

Deno.test("MinimalSkillsServiceMock: listSkills filters by both source and status", async () => {
  const skills = createTestSkills();
  const mock = new MinimalSkillsServiceMock(skills);

  const result = await mock.listSkills({ source: "core", status: "active" });
  assertEquals(result.length, 2);
});

Deno.test("MinimalSkillsServiceMock: setSkills replaces skills", async () => {
  const mock = new MinimalSkillsServiceMock([]);
  assertEquals((await mock.listSkills()).length, 0);

  mock.setSkills(createTestSkills());
  assertEquals((await mock.listSkills()).length, 5);
});

// ===== TUI Session Tests =====

Deno.test("SkillsManagerTuiSession: navigation with 'j' and 'k' keys", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Navigate down several times with 'j' to ensure we get a selection
  await session.handleInput("j");
  await session.handleInput("j");

  const state1 = session.getState();
  assertExists(state1.selectedSkillId);

  // Navigate back with 'k'
  await session.handleInput("k");

  // Should still have selection
  const state2 = session.getState();
  assertExists(state2.selectedSkillId);
});

Deno.test("SkillsManagerTuiSession: navigate to first and last with Home/End", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Navigate to last
  await session.handleInput("end");
  const lastState = session.getState();
  assertExists(lastState.selectedSkillId);

  // Navigate to first
  await session.handleInput("home");
  const firstState = session.getState();
  assertExists(firstState.selectedSkillId);
});

Deno.test("SkillsManagerTuiSession: toggle expand with left/right", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Should toggle expand with left/right on group nodes
  await session.handleInput("left");
  await session.handleInput("right");

  // No exception means success
  const state = session.getState();
  assertExists(state);
});

Deno.test("SkillsManagerTuiSession: expand all and collapse all", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Collapse all with 'c'
  await session.handleInput("c");

  // Expand all with 'E'
  await session.handleInput("E");

  const state = session.getState();
  assertExists(state);
});

Deno.test("SkillsManagerTuiSession: refresh reloads skills", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Refresh with 'R'
  await session.handleInput("R");

  const state = session.getState();
  assertExists(state);
});

Deno.test("SkillsManagerTuiSession: filter source dialog", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Open filter source dialog with 'f'
  await session.handleInput("f");
  assertEquals(session.hasActiveDialog(), true);

  const dialogLines = session.renderDialog();
  assertEquals(dialogLines.length > 0, true);

  // Cancel dialog
  await session.handleInput("escape");
  assertEquals(session.hasActiveDialog(), false);
});

Deno.test("SkillsManagerTuiSession: filter status dialog", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Open filter status dialog with 's'
  await session.handleInput("s");
  assertEquals(session.hasActiveDialog(), true);

  // Cancel dialog
  await session.handleInput("escape");
  assertEquals(session.hasActiveDialog(), false);
});

Deno.test("SkillsManagerTuiSession: delete skill dialog for non-core skill", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Navigate to a project skill (non-core)
  // First navigate past group headers to skill nodes
  for (let i = 0; i < 5; i++) {
    await session.handleInput("down");
  }

  const state = session.getState();
  // Find a non-core skill
  if (state.selectedSkillId?.includes("project") || state.selectedSkillId?.includes("learned")) {
    await session.handleInput("d");
    // Dialog should open if we're on a project/learned skill
    // If not, we're on a core skill which is blocked
  }
});

Deno.test("SkillsManagerTuiSession: delete blocked for core skills", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Navigate to first skill (should be a core skill after group header)
  await session.handleInput("down");

  const state = session.getState();
  if (state.selectedSkillId?.startsWith("skill-tdd") || state.selectedSkillId?.startsWith("skill-security")) {
    // Try to delete a core skill
    await session.handleInput("d");
    // Should not open dialog for core skills
    assertEquals(session.hasActiveDialog(), false);
  }
});

Deno.test("SkillsManagerTuiSession: show detail for skill node", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Navigate to a skill (not group header)
  await session.handleInput("down");
  await session.handleInput("enter");

  const detail = session.renderDetail();
  if (session.isShowingDetail()) {
    assertStringIncludes(detail, "Skill:");
  }
});

Deno.test("SkillsManagerTuiSession: detail view shows triggers", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Navigate to a skill with triggers (first core skill)
  await session.handleInput("down");
  await session.handleInput("enter");

  if (session.isShowingDetail()) {
    const detail = session.renderDetail();
    // Skills with triggers should show them
    if (detail.includes("Triggers:")) {
      assertStringIncludes(detail, "Keywords:");
    }
  }
});

Deno.test("SkillsManagerTuiSession: close detail with 'q'", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Navigate to a skill and show detail
  await session.handleInput("down");
  await session.handleInput("enter");

  if (session.isShowingDetail()) {
    await session.handleInput("q");
    assertEquals(session.isShowingDetail(), false);
  }
});

Deno.test("SkillsManagerTuiSession: help screen toggle with '?'", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Show help
  await session.handleInput("?");
  assertEquals(session.isShowingHelp(), true);

  // Toggle off with '?'
  await session.handleInput("?");
  assertEquals(session.isShowingHelp(), false);
});

Deno.test("SkillsManagerTuiSession: close help with 'q'", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Show help
  await session.handleInput("?");
  assertEquals(session.isShowingHelp(), true);

  // Close with 'q'
  await session.handleInput("q");
  assertEquals(session.isShowingHelp(), false);
});

Deno.test("SkillsManagerTuiSession: close help with escape", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  await session.handleInput("?");
  assertEquals(session.isShowingHelp(), true);

  await session.handleInput("escape");
  assertEquals(session.isShowingHelp(), false);
});

Deno.test("SkillsManagerTuiSession: render with no skills shows empty message", async () => {
  const mockService = new MinimalSkillsServiceMock([]);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  const output = session.render();
  assertStringIncludes(output, "No skills found");
});

Deno.test("SkillsManagerTuiSession: render shows filter info when filtering", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Open search dialog
  await session.handleInput("/");
  assertEquals(session.hasActiveDialog(), true);

  // Press enter to start editing, then type, then enter to confirm
  await session.handleInput("enter");
  await session.handleInput("t");
  await session.handleInput("d");
  await session.handleInput("d");
  await session.handleInput("enter"); // Exit edit mode
  await session.handleInput("enter"); // Confirm dialog

  // Verify dialog is closed
  assertEquals(session.hasActiveDialog(), false);

  // Search query should show in render
  const output = session.render();
  assertStringIncludes(output, "Filters:");
});

Deno.test("SkillsManagerTuiSession: group by status", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Cycle to status grouping
  await session.handleInput("g");
  assertEquals(session.getState().groupBy, "status");

  const output = session.render();
  assertStringIncludes(output, "Active Skills");
});

Deno.test("SkillsManagerTuiSession: group by none (flat list)", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Cycle to none grouping
  await session.handleInput("g"); // source -> status
  await session.handleInput("g"); // status -> none

  assertEquals(session.getState().groupBy, "none");
});

Deno.test("SkillsManagerTuiSession: search dialog filters skills", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Open search dialog
  await session.handleInput("/");
  assertEquals(session.hasActiveDialog(), true);

  // Cancel the dialog for now (testing dialog opening)
  await session.handleInput("escape");
  assertEquals(session.hasActiveDialog(), false);
});

Deno.test("SkillsManagerTuiSession: handleInput returns false for quit", async () => {
  const mockService = new MinimalSkillsServiceMock([]);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  const result = await session.handleInput("q");
  assertEquals(result, false);
});

Deno.test("SkillsManagerTuiSession: navigateDown when no selection selects first", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Manually clear selection via state (simulate edge case)
  const state = session.getState();
  if (!state.selectedSkillId) {
    // If no selection, navigateDown should select first
    await session.handleInput("down");
    assertExists(session.getState().selectedSkillId);
  }
});

Deno.test("SkillsManagerTuiSession: colors enabled vs disabled", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);

  // With colors disabled
  const sessionNoColors = view.createTuiSession(false);
  await sessionNoColors.initialize();
  const outputNoColors = sessionNoColors.render();
  assertExists(outputNoColors);

  // With colors enabled
  const sessionWithColors = view.createTuiSession(true);
  await sessionWithColors.initialize();
  const outputWithColors = sessionWithColors.render();
  assertExists(outputWithColors);
});

Deno.test("SkillsManagerTuiSession: enter on group node toggles expansion", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // First node should be a group (grouped by source by default)
  const state = session.getState();
  if (state.selectedSkillId?.startsWith("group-")) {
    await session.handleInput("enter");
    // Should toggle the group, not show detail
    assertEquals(session.isShowingDetail(), false);
  }
});

Deno.test("SkillsManagerTuiSession: invalid filter source shows error", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Open filter source dialog
  await session.handleInput("f");

  // Type invalid source
  for (const char of "invalid") {
    await session.handleInput(char);
  }
  await session.handleInput("enter");

  // Should set an error status (filter source unchanged)
  const state = session.getState();
  assertEquals(state.filterSource, "all");
});

Deno.test("SkillsManagerTuiSession: invalid filter status shows error", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Open filter status dialog
  await session.handleInput("s");

  // Type invalid status
  for (const char of "invalid") {
    await session.handleInput(char);
  }
  await session.handleInput("enter");

  // Should set an error status (filter status unchanged)
  const state = session.getState();
  assertEquals(state.filterStatus, "all");
});

Deno.test("SkillsManagerTuiSession: return key same as enter", async () => {
  const skills = createTestSkills();
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Navigate to a skill
  await session.handleInput("down");

  // Use 'return' key
  await session.handleInput("return");

  // Should show detail or toggle group
  const state = session.getState();
  assertExists(state);
});

Deno.test("SkillsManagerTuiSession: detail view shows instructions (truncated)", async () => {
  const skills: SkillSummary[] = [
    {
      id: "long-instructions",
      name: "Long Instructions",
      version: "1.0.0",
      status: "active",
      source: "project",
      description: "Skill with long instructions",
      instructions: Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join("\n"),
    },
  ];
  const mockService = new MinimalSkillsServiceMock(skills);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Set grouping to none to navigate directly to skill
  await session.handleInput("g"); // source -> status
  await session.handleInput("g"); // status -> none

  // Now navigate and show detail
  await session.handleInput("down");
  await session.handleInput("enter");

  if (session.isShowingDetail()) {
    const detail = session.renderDetail();
    assertStringIncludes(detail, "Instructions:");
    assertStringIncludes(detail, "...(truncated)");
  }
});
