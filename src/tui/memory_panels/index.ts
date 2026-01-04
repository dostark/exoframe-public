/**
 * Memory Panels - Reusable panel components for Memory View
 *
 * Part of Phase 12.12: TUI Memory View - Core
 */

import type {
  ExecutionMemory,
  GlobalMemory,
  MemorySearchResult,
  MemoryUpdateProposal,
  ProjectMemory,
} from "../../schemas/memory_bank.ts";

// ===== Color Constants =====

export const MemoryColors = {
  global: "\x1b[35m", // Magenta
  project: "\x1b[34m", // Blue
  execution: "\x1b[32m", // Green
  pending: "\x1b[33m", // Yellow
  pattern: "\x1b[36m", // Cyan
  antiPattern: "\x1b[31m", // Red
  decision: "\x1b[35m", // Magenta
  insight: "\x1b[34m", // Blue
  troubleshooting: "\x1b[33m", // Yellow
  high: "\x1b[1m", // Bold
  medium: "",
  low: "\x1b[2m", // Dim
  reset: "\x1b[0m",
};

// ===== Panel Interface =====

export interface PanelRenderOptions {
  width: number;
  height: number;
  useColors: boolean;
}

// ===== Project Panel =====

export function renderProjectPanel(
  memory: ProjectMemory | null,
  portal: string,
  options: PanelRenderOptions,
): string {
  const lines: string[] = [];
  const { useColors } = options;
  const c = useColors ? MemoryColors : { project: "", reset: "", pattern: "", decision: "" };

  lines.push(`${c.project}# Project: ${portal}${c.reset}`);
  lines.push("");

  if (!memory) {
    lines.push("No memory bank initialized for this project.");
    lines.push("");
    lines.push("Memory banks are created automatically when:");
    lines.push("- An agent executes a task for this project");
    lines.push("- A pattern or decision is recorded");
    return lines.join("\n");
  }

  if (memory.overview) {
    lines.push("## Overview");
    const overview = memory.overview.length > 300 ? memory.overview.slice(0, 297) + "..." : memory.overview;
    lines.push(overview);
    lines.push("");
  }

  if (memory.patterns && memory.patterns.length > 0) {
    lines.push(
      `${c.pattern}## Patterns (${memory.patterns.length})${c.reset}`,
    );
    for (const p of memory.patterns.slice(0, 8)) {
      const tags = p.tags?.length ? ` [${p.tags.join(", ")}]` : "";
      lines.push(`  • ${p.name}${tags}`);
    }
    if (memory.patterns.length > 8) {
      lines.push(`  ... and ${memory.patterns.length - 8} more`);
    }
    lines.push("");
  }

  if (memory.decisions && memory.decisions.length > 0) {
    lines.push(
      `${c.decision}## Decisions (${memory.decisions.length})${c.reset}`,
    );
    for (const d of memory.decisions.slice(0, 5)) {
      lines.push(`  • ${d.decision}`);
    }
    if (memory.decisions.length > 5) {
      lines.push(`  ... and ${memory.decisions.length - 5} more`);
    }
    lines.push("");
  }

  if (memory.references && memory.references.length > 0) {
    lines.push(`## References (${memory.references.length})`);
    for (const r of memory.references.slice(0, 5)) {
      lines.push(`  • ${r.type}: ${r.path}`);
    }
    if (memory.references.length > 5) {
      lines.push(`  ... and ${memory.references.length - 5} more`);
    }
  }

  return lines.join("\n");
}

// ===== Global Panel =====

export function renderGlobalPanel(
  memory: GlobalMemory | null,
  options: PanelRenderOptions,
): string {
  const lines: string[] = [];
  const { useColors } = options;
  const c = useColors ? MemoryColors : { global: "", reset: "", pattern: "", antiPattern: "" };

  lines.push(`${c.global}# Global Memory${c.reset}`);
  lines.push("");

  if (!memory) {
    lines.push("Global memory not initialized.");
    lines.push("");
    lines.push("Run: exoctl memory init --global");
    return lines.join("\n");
  }

  if (memory.patterns && memory.patterns.length > 0) {
    lines.push(
      `${c.pattern}## Global Patterns (${memory.patterns.length})${c.reset}`,
    );
    for (const p of memory.patterns.slice(0, 5)) {
      lines.push(`  • ${p.name}`);
    }
    if (memory.patterns.length > 5) {
      lines.push(`  ... and ${memory.patterns.length - 5} more`);
    }
    lines.push("");
  }

  if (memory.anti_patterns && memory.anti_patterns.length > 0) {
    lines.push(
      `${c.antiPattern}## Anti-Patterns (${memory.anti_patterns.length})${c.reset}`,
    );
    for (const ap of memory.anti_patterns.slice(0, 5)) {
      lines.push(`  ⚠ ${ap.name}`);
    }
    if (memory.anti_patterns.length > 5) {
      lines.push(`  ... and ${memory.anti_patterns.length - 5} more`);
    }
    lines.push("");
  }

  if (memory.learnings && memory.learnings.length > 0) {
    lines.push(`## Learnings (${memory.learnings.length})`);
    for (const l of memory.learnings.slice(0, 8)) {
      lines.push(`  • ${l.title} [${l.category}]`);
    }
    if (memory.learnings.length > 8) {
      lines.push(`  ... and ${memory.learnings.length - 8} more`);
    }
  }

  return lines.join("\n");
}

// ===== Execution Panel =====

export function renderExecutionPanel(
  memory: ExecutionMemory | null,
  options: PanelRenderOptions,
): string {
  const lines: string[] = [];
  const { useColors } = options;
  const c = useColors ? MemoryColors : { execution: "", reset: "" };

  if (!memory) {
    lines.push("No execution selected.");
    return lines.join("\n");
  }

  const statusIcon = memory.status === "completed" ? "✓" : memory.status === "failed" ? "✗" : "◐";
  const statusColor = memory.status === "completed" ? "\x1b[32m" : memory.status === "failed" ? "\x1b[31m" : "\x1b[33m";

  lines.push(
    `${c.execution}# Execution: ${memory.trace_id.slice(0, 12)}...${c.reset}`,
  );
  lines.push("");

  lines.push("## Details");
  lines.push(
    `  Status: ${useColors ? statusColor : ""}${statusIcon} ${memory.status}${c.reset}`,
  );
  lines.push(`  Agent: ${memory.agent}`);
  lines.push(`  Started: ${formatDate(memory.started_at)}`);
  if (memory.completed_at) {
    lines.push(`  Completed: ${formatDate(memory.completed_at)}`);
  }
  lines.push("");

  if (memory.summary) {
    lines.push("## Summary");
    const summary = memory.summary.length > 200 ? memory.summary.slice(0, 197) + "..." : memory.summary;
    lines.push(`  ${summary}`);
    lines.push("");
  }

  const allChanges = [
    ...memory.changes.files_created,
    ...memory.changes.files_modified,
    ...memory.changes.files_deleted,
  ];
  if (allChanges.length > 0) {
    lines.push(`## Files Changed (${allChanges.length})`);
    for (const file of allChanges.slice(0, 5)) {
      lines.push(`  • ${file}`);
    }
    if (allChanges.length > 5) {
      lines.push(`  ... and ${allChanges.length - 5} more`);
    }
    lines.push("");
  }

  if (memory.lessons_learned && memory.lessons_learned.length > 0) {
    lines.push("## Lessons Learned");
    for (const lesson of memory.lessons_learned) {
      lines.push(`  💡 ${lesson}`);
    }
  }

  return lines.join("\n");
}

// ===== Execution List Panel =====

export function renderExecutionListPanel(
  executions: ExecutionMemory[],
  selectedIndex: number,
  options: PanelRenderOptions,
): string {
  const lines: string[] = [];
  const { height } = options;

  lines.push("# Recent Executions");
  lines.push("");

  if (executions.length === 0) {
    lines.push("No executions yet.");
    return lines.join("\n");
  }

  const maxVisible = Math.min(executions.length, height - 4);
  const startIdx = Math.max(0, selectedIndex - Math.floor(maxVisible / 2));
  const endIdx = Math.min(executions.length, startIdx + maxVisible);

  for (let i = startIdx; i < endIdx; i++) {
    const exec = executions[i];
    const selected = i === selectedIndex ? ">" : " ";
    const statusIcon = exec.status === "completed" ? "✓" : exec.status === "failed" ? "✗" : "◐";
    const summary = exec.summary?.slice(0, 40) ?? "";
    lines.push(`${selected} ${statusIcon} ${exec.trace_id.slice(0, 8)} ${summary}`);
  }

  if (executions.length > maxVisible) {
    lines.push("");
    lines.push(`Showing ${startIdx + 1}-${endIdx} of ${executions.length}`);
  }

  return lines.join("\n");
}

// ===== Search Panel =====

export function renderSearchPanel(
  query: string,
  results: MemorySearchResult[],
  selectedIndex: number,
  options: PanelRenderOptions,
): string {
  const lines: string[] = [];
  const { useColors } = options;

  lines.push("# Search Results");
  lines.push("");
  lines.push(`Query: "${query}"`);
  lines.push("");

  if (results.length === 0) {
    lines.push("No results found.");
    lines.push("");
    lines.push("Try:");
    lines.push("  • Different keywords");
    lines.push("  • Broader search terms");
    lines.push("  • Tag-based search with #tag");
    return lines.join("\n");
  }

  lines.push(`Found ${results.length} results:`);
  lines.push("");

  for (let i = 0; i < Math.min(results.length, 15); i++) {
    const result = results[i];
    const selected = i === selectedIndex ? ">" : " ";
    const score = (result.relevance_score ?? 0).toFixed(2);
    const typeColor = useColors ? getCategoryColor(result.type) : "";
    const reset = useColors ? MemoryColors.reset : "";

    lines.push(`${selected} ${typeColor}[${result.type}]${reset} ${result.title}`);
    lines.push(`    Score: ${score} | Portal: ${result.portal ?? "global"}`);
  }

  if (results.length > 15) {
    lines.push("");
    lines.push(`... and ${results.length - 15} more results`);
  }

  return lines.join("\n");
}

// ===== Pending Panel =====

export function renderPendingPanel(
  proposals: MemoryUpdateProposal[],
  selectedIndex: number,
  options: PanelRenderOptions,
): string {
  const lines: string[] = [];
  const { useColors } = options;
  const c = useColors ? MemoryColors : { pending: "", reset: "" };

  lines.push(`${c.pending}# Pending Proposals${c.reset}`);
  lines.push("");

  if (proposals.length === 0) {
    lines.push("No pending proposals.");
    lines.push("");
    lines.push("Proposals are created when agents identify");
    lines.push("patterns, decisions, or insights during execution.");
    return lines.join("\n");
  }

  lines.push(`${proposals.length} proposal(s) awaiting review:`);
  lines.push("");

  for (let i = 0; i < Math.min(proposals.length, 10); i++) {
    const proposal = proposals[i];
    const selected = i === selectedIndex ? ">" : " ";
    const age = formatAge(proposal.created_at);

    lines.push(`${selected} [${proposal.learning.category}] ${proposal.learning.title}`);
    lines.push(`    Scope: ${proposal.target_scope} | ${age}`);
  }

  if (proposals.length > 10) {
    lines.push("");
    lines.push(`... and ${proposals.length - 10} more`);
  }

  return lines.join("\n");
}

// ===== Stats Panel =====

export function renderStatsPanel(
  stats: {
    projectCount: number;
    executionCount: number;
    pendingCount: number;
    globalLearnings: number;
  },
  options: PanelRenderOptions,
): string {
  const lines: string[] = [];
  const { useColors } = options;
  const c = useColors ? MemoryColors : { global: "", project: "", execution: "", pending: "", reset: "" };

  lines.push("# Memory Statistics");
  lines.push("");
  lines.push(`${c.project}Projects:${c.reset}   ${stats.projectCount}`);
  lines.push(`${c.execution}Executions:${c.reset} ${stats.executionCount}`);
  lines.push(`${c.global}Learnings:${c.reset}  ${stats.globalLearnings}`);
  lines.push(`${c.pending}Pending:${c.reset}    ${stats.pendingCount}`);

  return lines.join("\n");
}

// ===== Helper Functions =====

function getCategoryColor(category: string): string {
  switch (category) {
    case "pattern":
      return MemoryColors.pattern;
    case "decision":
      return MemoryColors.decision;
    case "anti-pattern":
      return MemoryColors.antiPattern;
    case "insight":
      return MemoryColors.insight;
    case "troubleshooting":
      return MemoryColors.troubleshooting;
    default:
      return "";
  }
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
}

function formatAge(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins} min ago`;
    }
    if (diffHours < 24) {
      return `${diffHours} hours ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} days ago`;
  } catch {
    return dateStr;
  }
}
