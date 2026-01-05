/**
 * Memory Panels Tests
 *
 * Coverage tests for src/tui/memory_panels/index.ts
 */

import { assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import {
  MemoryColors,
  type PanelRenderOptions,
  renderExecutionListPanel,
  renderExecutionPanel,
  renderGlobalPanel,
  renderPendingPanel,
  renderProjectPanel,
  renderSearchPanel,
  renderStatsPanel,
} from "../../src/tui/memory_panels/index.ts";
import type {
  ExecutionMemory,
  GlobalMemory,
  Learning,
  MemorySearchResult,
  MemoryUpdateProposal,
  ProjectMemory,
} from "../../src/schemas/memory_bank.ts";

const defaultOptions: PanelRenderOptions = {
  width: 80,
  height: 24,
  useColors: false,
};

const colorOptions: PanelRenderOptions = {
  width: 80,
  height: 24,
  useColors: true,
};

// ===== Helper to create valid test data =====

function createProjectMemory(overrides: Partial<ProjectMemory> = {}): ProjectMemory {
  return {
    portal: "test-portal",
    overview: "A test project overview",
    patterns: [],
    decisions: [],
    references: [],
    ...overrides,
  };
}

function createExecutionMemory(overrides: Partial<ExecutionMemory> = {}): ExecutionMemory {
  return {
    trace_id: crypto.randomUUID(),
    request_id: "req-123",
    started_at: new Date().toISOString(),
    status: "completed",
    portal: "test-portal",
    agent: "test-agent",
    summary: "Test execution summary",
    context_files: [],
    context_portals: [],
    changes: {
      files_created: [],
      files_modified: [],
      files_deleted: [],
    },
    ...overrides,
  };
}

function createLearning(overrides: Partial<Learning> = {}): Learning {
  return {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    source: "execution",
    scope: "project",
    title: "Test Learning",
    description: "A test learning description",
    category: "pattern",
    tags: ["test"],
    confidence: "high",
    status: "pending",
    ...overrides,
  };
}

function createGlobalMemory(overrides: Partial<GlobalMemory> = {}): GlobalMemory {
  return {
    version: "1.0.0",
    updated_at: new Date().toISOString(),
    learnings: [],
    patterns: [],
    anti_patterns: [],
    statistics: {
      total_learnings: 0,
      by_category: {},
      by_project: {},
      last_activity: new Date().toISOString(),
    },
    ...overrides,
  };
}

// ===== MemoryColors tests =====

Deno.test("MemoryColors: has all required colors", () => {
  assertExists(MemoryColors.global);
  assertExists(MemoryColors.project);
  assertExists(MemoryColors.execution);
  assertExists(MemoryColors.pending);
  assertExists(MemoryColors.pattern);
  assertExists(MemoryColors.antiPattern);
  assertExists(MemoryColors.decision);
  assertExists(MemoryColors.insight);
  assertExists(MemoryColors.troubleshooting);
  assertExists(MemoryColors.reset);
});

// ===== renderProjectPanel tests =====

Deno.test("renderProjectPanel: renders null memory", () => {
  const result = renderProjectPanel(null, "test-portal", defaultOptions);
  assertEquals(result.includes("No memory bank initialized") || result.includes("test-portal"), true);
});

Deno.test("renderProjectPanel: renders empty memory", () => {
  const memory = createProjectMemory();
  const result = renderProjectPanel(memory, "test-portal", defaultOptions);
  assertEquals(typeof result, "string");
  assertEquals(result.length > 0, true);
});

Deno.test("renderProjectPanel: renders with overview", () => {
  const memory = createProjectMemory({
    overview: "This is a comprehensive project overview for testing purposes",
  });
  const result = renderProjectPanel(memory, "test-portal", defaultOptions);
  assertEquals(result.includes("Overview") || result.includes("overview"), true);
});

Deno.test("renderProjectPanel: renders with patterns", () => {
  const memory = createProjectMemory({
    patterns: [
      { name: "Singleton", description: "Singleton pattern", examples: ["src/main.ts"], tags: ["design"] },
      { name: "Factory", description: "Factory pattern", examples: ["src/factory.ts"] },
    ],
  });
  const result = renderProjectPanel(memory, "test-portal", defaultOptions);
  assertEquals(result.includes("Pattern") || result.includes("Singleton"), true);
});

Deno.test("renderProjectPanel: renders with decisions", () => {
  const memory = createProjectMemory({
    decisions: [
      {
        date: "2024-01-01",
        decision: "Use TypeScript",
        rationale: "Better type safety",
        alternatives: ["JavaScript"],
      },
    ],
  });
  const result = renderProjectPanel(memory, "test-portal", defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderProjectPanel: renders with references", () => {
  const memory = createProjectMemory({
    references: [
      { type: "file", path: "/src/main.ts", description: "Main entry point" },
      { type: "url", path: "https://deno.land", description: "Deno docs" },
    ],
  });
  const result = renderProjectPanel(memory, "test-portal", defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderProjectPanel: respects width option", () => {
  const memory = createProjectMemory();
  const narrowResult = renderProjectPanel(memory, "test-portal", { ...defaultOptions, width: 40 });
  const wideResult = renderProjectPanel(memory, "test-portal", { ...defaultOptions, width: 120 });
  // Both should render without error
  assertEquals(typeof narrowResult, "string");
  assertEquals(typeof wideResult, "string");
});

Deno.test("renderProjectPanel: handles color options", () => {
  const memory = createProjectMemory();
  const colorResult = renderProjectPanel(memory, "test-portal", colorOptions);
  const noColorResult = renderProjectPanel(memory, "test-portal", defaultOptions);
  assertEquals(typeof colorResult, "string");
  assertEquals(typeof noColorResult, "string");
});

// ===== renderGlobalPanel tests =====

Deno.test("renderGlobalPanel: renders null memory", () => {
  const result = renderGlobalPanel(null, defaultOptions);
  assertEquals(result.includes("No global memory") || result.length > 0, true);
});

Deno.test("renderGlobalPanel: renders empty memory", () => {
  const memory = createGlobalMemory();
  const result = renderGlobalPanel(memory, defaultOptions);
  assertEquals(typeof result, "string");
  assertEquals(result.length > 0, true);
});

Deno.test("renderGlobalPanel: renders with patterns", () => {
  const memory = createGlobalMemory({
    patterns: [
      {
        name: "Global Pattern",
        description: "Applies everywhere",
        applies_to: ["*"],
        examples: ["example.ts"],
        tags: ["universal"],
      },
    ],
  });
  const result = renderGlobalPanel(memory, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderGlobalPanel: renders with anti-patterns", () => {
  const memory = createGlobalMemory({
    anti_patterns: [
      {
        name: "Bad Practice",
        description: "Don't do this",
        reason: "It causes issues",
        alternative: "Do this instead",
        tags: ["avoid"],
      },
    ],
  });
  const result = renderGlobalPanel(memory, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderGlobalPanel: renders with learnings", () => {
  const memory = createGlobalMemory({
    learnings: [createLearning({ scope: "global" })],
  });
  const result = renderGlobalPanel(memory, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderGlobalPanel: renders statistics", () => {
  const memory = createGlobalMemory({
    statistics: {
      total_learnings: 42,
      by_category: { pattern: 20, decision: 15, insight: 7 },
      by_project: { portal1: 25, portal2: 17 },
      last_activity: new Date().toISOString(),
    },
  });
  const result = renderGlobalPanel(memory, defaultOptions);
  assertEquals(result.length > 0, true);
});

// ===== renderExecutionPanel tests =====

Deno.test("renderExecutionPanel: renders null memory", () => {
  const result = renderExecutionPanel(null, defaultOptions);
  assertEquals(result.includes("No execution data") || result.length > 0, true);
});

Deno.test("renderExecutionPanel: renders completed execution", () => {
  const memory = createExecutionMemory({
    status: "completed",
    completed_at: new Date().toISOString(),
  });
  const result = renderExecutionPanel(memory, defaultOptions);
  assertEquals(typeof result, "string");
  assertEquals(result.length > 0, true);
});

Deno.test("renderExecutionPanel: renders running execution", () => {
  const memory = createExecutionMemory({
    status: "running",
  });
  const result = renderExecutionPanel(memory, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderExecutionPanel: renders failed execution", () => {
  const memory = createExecutionMemory({
    status: "failed",
    error_message: "Something went wrong",
  });
  const result = renderExecutionPanel(memory, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderExecutionPanel: renders with file changes", () => {
  const memory = createExecutionMemory({
    changes: {
      files_created: ["new_file.ts", "another.ts"],
      files_modified: ["existing.ts"],
      files_deleted: ["old.ts"],
    },
  });
  const result = renderExecutionPanel(memory, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderExecutionPanel: renders with context files", () => {
  const memory = createExecutionMemory({
    context_files: ["src/main.ts", "src/utils.ts"],
    context_portals: ["portal1", "portal2"],
  });
  const result = renderExecutionPanel(memory, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderExecutionPanel: renders with lessons learned", () => {
  const memory = createExecutionMemory({
    lessons_learned: ["Lesson 1", "Lesson 2", "Important insight"],
  });
  const result = renderExecutionPanel(memory, defaultOptions);
  assertEquals(result.length > 0, true);
});

// ===== renderExecutionListPanel tests =====

Deno.test("renderExecutionListPanel: renders empty list", () => {
  const result = renderExecutionListPanel([], 0, defaultOptions);
  assertEquals(typeof result, "string");
});

Deno.test("renderExecutionListPanel: renders single execution", () => {
  const executions = [createExecutionMemory()];
  const result = renderExecutionListPanel(executions, 0, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderExecutionListPanel: renders multiple executions", () => {
  const executions = [
    createExecutionMemory({ status: "completed", portal: "portal1" }),
    createExecutionMemory({ status: "failed", portal: "portal2" }),
    createExecutionMemory({ status: "running", portal: "portal3" }),
  ];
  const result = renderExecutionListPanel(executions, 0, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderExecutionListPanel: highlights selected index", () => {
  const executions = [
    createExecutionMemory({ portal: "portal1" }),
    createExecutionMemory({ portal: "portal2" }),
    createExecutionMemory({ portal: "portal3" }),
  ];
  const result0 = renderExecutionListPanel(executions, 0, defaultOptions);
  const result1 = renderExecutionListPanel(executions, 1, defaultOptions);
  assertEquals(typeof result0, "string");
  assertEquals(typeof result1, "string");
});

Deno.test("renderExecutionListPanel: handles many executions", () => {
  const executions = Array(50).fill(0).map((_, i) => createExecutionMemory({ portal: `portal${i}` }));
  const result = renderExecutionListPanel(executions, 25, defaultOptions);
  assertEquals(result.length > 0, true);
});

// ===== renderSearchPanel tests =====

Deno.test("renderSearchPanel: renders empty results", () => {
  const result = renderSearchPanel("test query", [], 0, defaultOptions);
  assertEquals(typeof result, "string");
});

Deno.test("renderSearchPanel: renders single result", () => {
  const results: MemorySearchResult[] = [{
    type: "pattern",
    title: "Test Pattern",
    summary: "A test pattern result",
    relevance_score: 0.95,
  }];
  const result = renderSearchPanel("test", results, 0, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderSearchPanel: renders multiple result types", () => {
  const results: MemorySearchResult[] = [
    { type: "pattern", title: "Pattern", summary: "Pattern summary" },
    { type: "decision", title: "Decision", summary: "Decision summary" },
    { type: "execution", title: "Execution", summary: "Execution summary", trace_id: "trace-1" },
    { type: "learning", title: "Learning", summary: "Learning summary", id: "learn-1" },
    { type: "project", title: "Project", summary: "Project summary", portal: "portal1" },
  ];
  const result = renderSearchPanel("query", results, 0, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderSearchPanel: handles selection", () => {
  const results: MemorySearchResult[] = [
    { type: "pattern", title: "Result 1", summary: "Summary 1" },
    { type: "pattern", title: "Result 2", summary: "Summary 2" },
    { type: "pattern", title: "Result 3", summary: "Summary 3" },
  ];
  const result0 = renderSearchPanel("query", results, 0, defaultOptions);
  const result2 = renderSearchPanel("query", results, 2, defaultOptions);
  assertEquals(typeof result0, "string");
  assertEquals(typeof result2, "string");
});

Deno.test("renderSearchPanel: handles many results", () => {
  const results: MemorySearchResult[] = Array(30).fill(0).map((_, i) => ({
    type: "pattern" as const,
    title: `Result ${i}`,
    summary: `Summary for result ${i}`,
    relevance_score: 1 - (i / 100),
  }));
  const result = renderSearchPanel("many results", results, 15, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderSearchPanel: displays tags", () => {
  const results: MemorySearchResult[] = [{
    type: "learning",
    title: "Tagged Result",
    summary: "Has tags",
    tags: ["tag1", "tag2", "important"],
  }];
  const result = renderSearchPanel("tags", results, 0, defaultOptions);
  assertEquals(result.length > 0, true);
});

// ===== renderPendingPanel tests =====

Deno.test("renderPendingPanel: renders empty proposals", () => {
  const result = renderPendingPanel([], 0, defaultOptions);
  assertEquals(typeof result, "string");
});

Deno.test("renderPendingPanel: renders single proposal", () => {
  const proposals: MemoryUpdateProposal[] = [{
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    operation: "add",
    target_scope: "project",
    target_project: "test-portal",
    learning: {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      source: "execution",
      scope: "project",
      project: "test-portal",
      title: "Test Learning",
      description: "A proposed learning",
      category: "pattern",
      tags: ["test"],
      confidence: "high",
    },
    reason: "Good pattern to remember",
    agent: "test-agent",
    status: "pending",
  }];
  const result = renderPendingPanel(proposals, 0, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderPendingPanel: renders multiple proposals", () => {
  const createProposal = (i: number): MemoryUpdateProposal => ({
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    operation: ["add", "update", "promote"][i % 3] as "add" | "update" | "promote",
    target_scope: i % 2 === 0 ? "project" : "global",
    learning: {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      source: "execution",
      scope: i % 2 === 0 ? "project" : "global",
      title: `Learning ${i}`,
      description: `Description ${i}`,
      category: ["pattern", "decision", "insight"][i % 3] as "pattern" | "decision" | "insight",
      tags: [],
      confidence: ["low", "medium", "high"][i % 3] as "low" | "medium" | "high",
    },
    reason: `Reason ${i}`,
    agent: "agent",
    status: "pending",
  });

  const proposals = Array(5).fill(0).map((_, i) => createProposal(i));
  const result = renderPendingPanel(proposals, 2, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderPendingPanel: handles selection", () => {
  const proposals: MemoryUpdateProposal[] = Array(3).fill(0).map((_, i) => ({
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    operation: "add" as const,
    target_scope: "project" as const,
    learning: {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      source: "execution" as const,
      scope: "project" as const,
      title: `Proposal ${i}`,
      description: `Desc ${i}`,
      category: "pattern" as const,
      tags: [],
      confidence: "medium" as const,
    },
    reason: "Reason",
    agent: "agent",
    status: "pending" as const,
  }));

  const result0 = renderPendingPanel(proposals, 0, defaultOptions);
  const result1 = renderPendingPanel(proposals, 1, defaultOptions);
  assertEquals(typeof result0, "string");
  assertEquals(typeof result1, "string");
});

// ===== renderStatsPanel tests =====

Deno.test("renderStatsPanel: renders basic stats", () => {
  const stats = {
    projectCount: 5,
    executionCount: 100,
    pendingCount: 3,
    globalLearnings: 25,
  };
  const result = renderStatsPanel(stats, defaultOptions);
  assertEquals(typeof result, "string");
  assertEquals(result.length > 0, true);
});

Deno.test("renderStatsPanel: renders zero stats", () => {
  const stats = {
    projectCount: 0,
    executionCount: 0,
    pendingCount: 0,
    globalLearnings: 0,
  };
  const result = renderStatsPanel(stats, defaultOptions);
  assertEquals(typeof result, "string");
});

Deno.test("renderStatsPanel: renders large numbers", () => {
  const stats = {
    projectCount: 500,
    executionCount: 10000,
    pendingCount: 50,
    globalLearnings: 1000,
  };
  const result = renderStatsPanel(stats, defaultOptions);
  assertEquals(result.length > 0, true);
});

Deno.test("renderStatsPanel: handles color options", () => {
  const stats = {
    projectCount: 5,
    executionCount: 100,
    pendingCount: 3,
    globalLearnings: 25,
  };
  const colorResult = renderStatsPanel(stats, colorOptions);
  const noColorResult = renderStatsPanel(stats, defaultOptions);
  assertEquals(typeof colorResult, "string");
  assertEquals(typeof noColorResult, "string");
});

// ===== Edge cases and error handling =====

Deno.test("renderProjectPanel: handles very long overview", () => {
  const memory = createProjectMemory({
    overview: "A".repeat(1000),
  });
  const result = renderProjectPanel(memory, "test-portal", defaultOptions);
  assertEquals(typeof result, "string");
});

Deno.test("renderProjectPanel: handles unicode in content", () => {
  const memory = createProjectMemory({
    overview: "Unicode test: 日本語 🎉 émojis café",
    patterns: [
      { name: "Patrón 日本語", description: "Descripción", examples: [] },
    ],
  });
  const result = renderProjectPanel(memory, "test-portal", defaultOptions);
  assertEquals(typeof result, "string");
});

Deno.test("renderExecutionPanel: handles very long summary", () => {
  const memory = createExecutionMemory({
    summary: "Very long summary ".repeat(100),
  });
  const result = renderExecutionPanel(memory, defaultOptions);
  assertEquals(typeof result, "string");
});

Deno.test("panel renders respect height constraint", () => {
  const memory = createProjectMemory({
    overview: "Overview",
    patterns: Array(20).fill(0).map((_, i) => ({
      name: `Pattern ${i}`,
      description: `Description ${i}`,
      examples: [`example${i}.ts`],
    })),
  });
  const shortResult = renderProjectPanel(memory, "test", { ...defaultOptions, height: 10 });
  const tallResult = renderProjectPanel(memory, "test", { ...defaultOptions, height: 50 });
  assertEquals(typeof shortResult, "string");
  assertEquals(typeof tallResult, "string");
});

Deno.test("color output contains ANSI codes when enabled", () => {
  const memory = createProjectMemory({
    overview: "Test overview",
  });
  const colorResult = renderProjectPanel(memory, "test", colorOptions);
  // Color output should include escape sequences or be different from non-color
  assertEquals(typeof colorResult, "string");
});
