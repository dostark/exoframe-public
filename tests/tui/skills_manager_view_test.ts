/**
 * Skills Manager View Tests
 *
 * Phase 17.13: TUI Skills Support
 *
 * Tests for the SkillsManagerView TUI component.
 */

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MinimalSkillsServiceMock, SkillsManagerView, type SkillSummary } from "../../src/tui/skills_manager_view.ts";

// ===== Test Data =====

const TEST_SKILLS: SkillSummary[] = [
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
    },
    instructions: "Write failing test first, then implement",
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
];

// ===== SkillsManagerView Tests =====

Deno.test("SkillsManagerView: renders skill tree", async () => {
  const mockService = new MinimalSkillsServiceMock(TEST_SKILLS);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();
  const rendered = session.render();

  assertStringIncludes(rendered, "SKILLS MANAGER");
  assertStringIncludes(rendered, "TDD Methodology");
});

Deno.test("SkillsManagerView: navigates with keyboard", async () => {
  const mockService = new MinimalSkillsServiceMock(TEST_SKILLS);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Navigate down
  await session.handleInput("down");
  const state = session.getState();

  // Should have moved selection
  assertEquals(state.selectedSkillId !== null, true);
});

Deno.test("SkillsManagerView: shows skill detail on select", async () => {
  const mockService = new MinimalSkillsServiceMock(TEST_SKILLS);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Navigate to a skill (past the group header)
  await session.handleInput("down");
  await session.handleInput("down");

  // Show detail
  await session.handleInput("enter");

  assertEquals(session.isShowingDetail(), true);
  const detail = session.renderDetail();
  assertStringIncludes(detail, "Skill:");
});

Deno.test("SkillsManagerView: opens search dialog", async () => {
  const mockService = new MinimalSkillsServiceMock(TEST_SKILLS);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Open search dialog
  await session.handleInput("/");
  assertEquals(session.hasActiveDialog(), true);

  // Cancel search
  await session.handleInput("escape");
  assertEquals(session.hasActiveDialog(), false);
});

Deno.test("SkillsManagerView: groups by source", async () => {
  const mockService = new MinimalSkillsServiceMock(TEST_SKILLS);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  const state = session.getState();
  // Default grouping is by source
  assertEquals(state.groupBy, "source");

  const rendered = session.render();
  // Should show group headers
  assertStringIncludes(rendered, "Core Skills");
});

Deno.test("SkillsManagerView: cycles grouping mode", async () => {
  const mockService = new MinimalSkillsServiceMock(TEST_SKILLS);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Cycle grouping
  await session.handleInput("g");
  let state = session.getState();
  assertEquals(state.groupBy, "status");

  await session.handleInput("g");
  state = session.getState();
  assertEquals(state.groupBy, "none");

  await session.handleInput("g");
  state = session.getState();
  assertEquals(state.groupBy, "source");
});

Deno.test("SkillsManagerView: shows help screen", async () => {
  const mockService = new MinimalSkillsServiceMock(TEST_SKILLS);
  const view = new SkillsManagerView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Show help
  await session.handleInput("?");
  assertEquals(session.isShowingHelp(), true);

  const help = session.renderHelp();
  // renderHelp returns string[]
  assertStringIncludes(help.join("\n"), "Navigation");
  assertStringIncludes(help.join("\n"), "Actions");
});

// ===== AgentStatusView Skills Tests =====

Deno.test("AgentStatusView: displays defaultSkills in detail", async () => {
  // Import dynamically to avoid circular dependency issues
  const { AgentStatusView, MinimalAgentServiceMock } = await import(
    "../../src/tui/agent_status_view.ts"
  );

  const mockService = new MinimalAgentServiceMock([
    {
      id: "agent-1",
      name: "CodeReviewer",
      model: "gpt-4",
      status: "active" as const,
      lastActivity: new Date().toISOString(),
      capabilities: ["code-review"],
      defaultSkills: ["tdd-methodology", "typescript-patterns"],
    },
  ]);

  const view = new AgentStatusView(mockService);
  const session = view.createTuiSession(false);

  await session.initialize();

  // Navigate to agent and show detail (use handleKey as that's the AgentStatusView's method)
  await session.handleKey("down");
  await session.handleKey("enter");

  // renderDetail returns string[] in AgentStatusView
  const detail = session.renderDetail();
  const detailText = Array.isArray(detail) ? detail.join("\n") : detail;
  assertStringIncludes(detailText, "Default Skills:");
  assertStringIncludes(detailText, "tdd-methodology");
});

// ===== RequestManagerView Skills Tests =====

Deno.test("RequestManagerView: shows skills in request detail", async () => {
  // Import dynamically
  const { RequestManagerView, MinimalRequestServiceMock } = await import(
    "../../src/tui/request_manager_view.ts"
  );

  const requests = [
    {
      trace_id: "test-123",
      filename: "request-test.md",
      title: "Test Request",
      status: "completed",
      priority: "normal",
      agent: "code-reviewer",
      created: new Date().toISOString(),
      created_by: "test@example.com",
      source: "cli",
      skills: {
        explicit: ["security-audit"],
        autoMatched: ["code-review"],
        fromDefaults: ["typescript-patterns"],
        skipped: [],
      },
    },
  ];

  const mockService = new MinimalRequestServiceMock();
  const view = new RequestManagerView(mockService);
  const session = view.createTuiSession(requests);

  // Navigate to request and show detail (use handleKey for RequestManagerView)
  await session.handleKey("down");
  await session.handleKey("enter");

  // renderDetail returns string[] for RequestManager
  const detail = session.renderDetail();
  const detailText = Array.isArray(detail) ? detail.join("\n") : detail;
  assertStringIncludes(detailText, "Applied Skills:");
  assertStringIncludes(detailText, "security-audit");
});
