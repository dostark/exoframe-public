/**
 * TUI Help Screen Renderer
 *
 * Part of Phase 13.1: Shared TUI Infrastructure
 *
 * Provides consistent help screen rendering for all views.
 */

import { colorize, getTheme } from "./colors.ts";
import { renderBoxBottom, renderBoxLine, renderBoxLineCentered, renderBoxTop } from "./dialog_base.ts";
import type { KeyBinding } from "./keyboard.ts";

// ===== Help Section Types =====

export interface HelpSection {
  title: string;
  items: HelpItem[];
}

export interface HelpItem {
  key: string;
  description: string;
  category?: string;
}

export interface HelpScreenOptions {
  title: string;
  sections: HelpSection[];
  footer?: string;
  width?: number;
  useColors?: boolean;
}

// ===== Help Screen Rendering =====

/**
 * Render a help screen
 */
export function renderHelpScreen(options: HelpScreenOptions): string[] {
  const { title, sections, footer, width = 60, useColors = true } = options;
  const theme = getTheme(useColors);
  const innerWidth = width - 2;
  const lines: string[] = [];

  // Top border with title
  lines.push(renderBoxTop(innerWidth, ` ${title} `, theme));

  // Empty line
  lines.push(renderBoxLine("", innerWidth, theme));

  // Render each section
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    // Section title
    const sectionTitle = colorize(section.title, theme.h2, theme.reset);
    lines.push(renderBoxLine(`  ${sectionTitle}`, innerWidth, theme));
    lines.push(renderBoxLine("", innerWidth, theme));

    // Items
    for (const item of section.items) {
      const keyStr = colorize(item.key.padEnd(15), theme.code, theme.reset);
      const line = `    ${keyStr} ${item.description}`;
      lines.push(renderBoxLine(line, innerWidth, theme));
    }

    // Add space between sections (except last)
    if (i < sections.length - 1) {
      lines.push(renderBoxLine("", innerWidth, theme));
    }
  }

  // Empty line before footer
  lines.push(renderBoxLine("", innerWidth, theme));

  // Footer
  if (footer) {
    const footerText = colorize(footer, theme.textDim, theme.reset);
    lines.push(renderBoxLineCentered(footerText, innerWidth, theme));
    lines.push(renderBoxLine("", innerWidth, theme));
  }

  // Bottom border
  lines.push(renderBoxBottom(innerWidth, theme));

  return lines;
}

/**
 * Convert KeyBindings to HelpSections
 */
export function keyBindingsToHelpSections<T extends string>(
  bindings: KeyBinding<T>[],
): HelpSection[] {
  // Group by category
  const categories = new Map<string, HelpItem[]>();

  for (const binding of bindings) {
    const category = binding.category ?? "General";
    const items = categories.get(category) ?? [];
    items.push({
      key: binding.key,
      description: binding.description,
      category: binding.category,
    });
    categories.set(category, items);
  }

  // Convert to sections
  const sections: HelpSection[] = [];
  for (const [title, items] of categories) {
    sections.push({ title, items });
  }

  return sections;
}

// ===== Standard Help Sections =====

/**
 * Standard navigation help section
 */
export function getNavigationHelpSection(): HelpSection {
  return {
    title: "Navigation",
    items: [
      { key: "↑/k", description: "Move up" },
      { key: "↓/j", description: "Move down" },
      { key: "Home", description: "Go to first item" },
      { key: "End", description: "Go to last item" },
      { key: "Enter", description: "Select/expand item" },
      { key: "Escape", description: "Go back/cancel" },
    ],
  };
}

/**
 * Standard search help section
 */
export function getSearchHelpSection(): HelpSection {
  return {
    title: "Search",
    items: [
      { key: "s, /", description: "Start search" },
      { key: "Enter", description: "Execute search" },
      { key: "Escape", description: "Cancel search" },
      { key: "Backspace", description: "Delete character" },
    ],
  };
}

/**
 * Standard tree help section
 */
export function getTreeHelpSection(): HelpSection {
  return {
    title: "Tree Navigation",
    items: [
      { key: "Enter", description: "Expand/collapse node" },
      { key: "←", description: "Collapse node or go to parent" },
      { key: "→", description: "Expand node or go to first child" },
      { key: "Space", description: "Toggle selection" },
    ],
  };
}

/**
 * Standard global help section
 */
export function getGlobalHelpSection(): HelpSection {
  return {
    title: "Global",
    items: [
      { key: "?", description: "Toggle help" },
      { key: "R", description: "Refresh" },
      { key: "Tab", description: "Next panel/pane" },
      { key: "Shift+Tab", description: "Previous panel/pane" },
      { key: "q", description: "Quit" },
    ],
  };
}

// ===== Quick Help Bar =====

/**
 * Render a quick help bar (single line)
 */
export function renderQuickHelp(
  items: { key: string; action: string }[],
  useColors: boolean = true,
): string {
  const theme = getTheme(useColors);
  const parts: string[] = [];

  for (const item of items) {
    const keyPart = colorize(item.key, theme.code, theme.reset);
    parts.push(`${keyPart} ${item.action}`);
  }

  return parts.join("  ");
}

/**
 * Get standard quick help items
 */
export function getStandardQuickHelp(): { key: string; action: string }[] {
  return [
    { key: "?", action: "Help" },
    { key: "R", action: "Refresh" },
    { key: "s", action: "Search" },
    { key: "q", action: "Quit" },
  ];
}

// ===== Help Dialog =====

/**
 * Simple help dialog state
 */
export interface HelpDialogState {
  visible: boolean;
  scrollOffset: number;
  content: string[];
}

/**
 * Create help dialog state
 */
export function createHelpDialogState(): HelpDialogState {
  return {
    visible: false,
    scrollOffset: 0,
    content: [],
  };
}

/**
 * Toggle help dialog
 */
export function toggleHelpDialog(
  state: HelpDialogState,
  content?: string[],
): HelpDialogState {
  return {
    ...state,
    visible: !state.visible,
    content: content ?? state.content,
    scrollOffset: 0,
  };
}

/**
 * Scroll help dialog
 */
export function scrollHelpDialog(
  state: HelpDialogState,
  direction: "up" | "down",
  visibleLines: number,
): HelpDialogState {
  if (!state.visible) return state;

  const maxOffset = Math.max(0, state.content.length - visibleLines);
  let newOffset = state.scrollOffset;

  if (direction === "up") {
    newOffset = Math.max(0, newOffset - 1);
  } else {
    newOffset = Math.min(maxOffset, newOffset + 1);
  }

  return {
    ...state,
    scrollOffset: newOffset,
  };
}

/**
 * Handle help dialog key
 */
export function handleHelpKey(
  state: HelpDialogState,
  key: string,
  visibleLines: number,
): { state: HelpDialogState; handled: boolean } {
  if (!state.visible) {
    if (key === "?" || key === "F1") {
      return {
        state: toggleHelpDialog(state),
        handled: true,
      };
    }
    return { state, handled: false };
  }

  switch (key) {
    case "escape":
    case "?":
    case "q":
      return {
        state: toggleHelpDialog(state),
        handled: true,
      };
    case "up":
    case "k":
      return {
        state: scrollHelpDialog(state, "up", visibleLines),
        handled: true,
      };
    case "down":
    case "j":
      return {
        state: scrollHelpDialog(state, "down", visibleLines),
        handled: true,
      };
    case "home":
      return {
        state: { ...state, scrollOffset: 0 },
        handled: true,
      };
    case "end":
      return {
        state: {
          ...state,
          scrollOffset: Math.max(0, state.content.length - visibleLines),
        },
        handled: true,
      };
    default:
      // Consume all keys when help is visible
      return { state, handled: true };
  }
}
