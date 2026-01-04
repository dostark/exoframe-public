/**
 * TUI Status Bar Utilities
 *
 * Part of Phase 13.1: Shared TUI Infrastructure
 *
 * Provides consistent status bar rendering for all views.
 */

import { colorize, getTheme, padEnd, type TuiTheme, visibleLength } from "./colors.ts";
import { renderSpinner, type SpinnerState, type SpinnerStyle } from "./spinner.ts";

// ===== Status Bar Types =====

export interface StatusBarItem {
  text: string;
  color?: string;
  icon?: string;
  priority?: number;
}

export interface StatusBarConfig {
  width: number;
  useColors: boolean;
  showSpinner?: boolean;
  spinnerStyle?: SpinnerStyle;
}

export interface StatusBarState {
  leftItems: StatusBarItem[];
  rightItems: StatusBarItem[];
  message?: string;
  messageType?: "info" | "success" | "warning" | "error";
  spinner?: SpinnerState;
}

// ===== Status Bar Rendering =====

/**
 * Create initial status bar state
 */
export function createStatusBarState(): StatusBarState {
  return {
    leftItems: [],
    rightItems: [],
    message: undefined,
    messageType: undefined,
    spinner: undefined,
  };
}

/**
 * Render status bar
 */
export function renderStatusBar(
  state: StatusBarState,
  config: StatusBarConfig,
): string {
  const theme = getTheme(config.useColors);
  const { width } = config;

  // Build left side
  let leftContent = "";

  // Add spinner if active
  if (state.spinner?.active && config.showSpinner) {
    const spinnerStr = renderSpinner(state.spinner, {
      style: config.spinnerStyle,
      useColors: config.useColors,
    });
    leftContent += spinnerStr + " ";
  }

  // Add left items
  for (const item of state.leftItems) {
    const itemStr = formatStatusItem(item, theme);
    leftContent += itemStr + " ";
  }

  // Add message
  if (state.message) {
    const msgColor = getMessageColor(state.messageType, theme);
    leftContent += colorize(state.message, msgColor, theme.reset);
  }

  // Build right side
  let rightContent = "";
  for (const item of state.rightItems) {
    const itemStr = formatStatusItem(item, theme);
    rightContent += " " + itemStr;
  }

  // Calculate spacing
  const leftLen = visibleLength(leftContent);
  const rightLen = visibleLength(rightContent);
  const spacerLen = Math.max(1, width - leftLen - rightLen);
  const spacer = " ".repeat(spacerLen);

  // Combine and apply background
  let bar = leftContent + spacer + rightContent;

  // Truncate if needed
  if (visibleLength(bar) > width) {
    bar = truncateWithEllipsis(bar, width, theme);
  }

  // Apply status bar styling
  if (config.useColors) {
    return `\x1b[7m${padEnd(bar, width)}\x1b[0m`;
  }

  return padEnd(bar, width);
}

/**
 * Format a status item
 */
function formatStatusItem(item: StatusBarItem, theme: TuiTheme): string {
  let text = item.text;

  if (item.icon) {
    text = `${item.icon} ${text}`;
  }

  if (item.color) {
    text = colorize(text, item.color, theme.reset);
  }

  return text;
}

/**
 * Get color for message type
 */
function getMessageColor(type: StatusBarState["messageType"], theme: TuiTheme): string {
  switch (type) {
    case "success":
      return theme.success;
    case "warning":
      return theme.warning;
    case "error":
      return theme.error;
    case "info":
    default:
      return theme.info;
  }
}

/**
 * Truncate string with ellipsis, preserving ANSI codes
 */
function truncateWithEllipsis(text: string, maxLen: number, _theme: TuiTheme): string {
  let visibleLen = 0;
  let i = 0;

  while (i < text.length && visibleLen < maxLen - 1) {
    if (text[i] === "\x1b" && text[i + 1] === "[") {
      let j = i + 2;
      while (j < text.length && text[j] !== "m") j++;
      i = j + 1;
    } else {
      visibleLen++;
      i++;
    }
  }

  return text.slice(0, i) + "…";
}

// ===== Common Status Bar Helpers =====

/**
 * Create a view title item
 */
export function createViewTitleItem(title: string, theme: TuiTheme): StatusBarItem {
  return {
    text: title,
    color: theme.textBold,
    priority: 100,
  };
}

/**
 * Create a count badge item
 */
export function createCountItem(count: number, label: string, theme: TuiTheme): StatusBarItem {
  return {
    text: `${count} ${label}`,
    color: theme.textDim,
    priority: 50,
  };
}

/**
 * Create a status indicator item
 */
export function createStatusItem(
  status: "active" | "pending" | "completed" | "failed",
  label?: string,
  theme?: TuiTheme,
): StatusBarItem {
  const icons: Record<string, string> = {
    active: "●",
    pending: "◐",
    completed: "✓",
    failed: "✗",
  };

  const colors: Record<string, string> = {
    active: theme?.statusActive ?? "",
    pending: theme?.statusPending ?? "",
    completed: theme?.statusCompleted ?? "",
    failed: theme?.statusFailed ?? "",
  };

  return {
    text: label ?? status,
    icon: icons[status],
    color: colors[status],
    priority: 75,
  };
}

/**
 * Create position indicator (e.g., "5/10")
 */
export function createPositionItem(current: number, total: number, theme: TuiTheme): StatusBarItem {
  return {
    text: `${current}/${total}`,
    color: theme.textDim,
    priority: 25,
  };
}

/**
 * Create timestamp item
 */
export function createTimestampItem(date: Date, theme: TuiTheme): StatusBarItem {
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return {
    text: time,
    color: theme.textDim,
    priority: 10,
  };
}

// ===== Status Bar Updates =====

/**
 * Set status bar message
 */
export function setStatusMessage(
  state: StatusBarState,
  message: string,
  type: StatusBarState["messageType"] = "info",
): StatusBarState {
  return {
    ...state,
    message,
    messageType: type,
  };
}

/**
 * Clear status bar message
 */
export function clearStatusMessage(state: StatusBarState): StatusBarState {
  return {
    ...state,
    message: undefined,
    messageType: undefined,
  };
}

/**
 * Set left items
 */
export function setLeftItems(state: StatusBarState, items: StatusBarItem[]): StatusBarState {
  return {
    ...state,
    leftItems: items.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
  };
}

/**
 * Set right items
 */
export function setRightItems(state: StatusBarState, items: StatusBarItem[]): StatusBarState {
  return {
    ...state,
    rightItems: items.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
  };
}

/**
 * Set spinner state
 */
export function setSpinner(state: StatusBarState, spinner: SpinnerState | undefined): StatusBarState {
  return {
    ...state,
    spinner,
  };
}

// ===== Multi-Line Status Bar =====

export interface MultiLineStatusBarState extends StatusBarState {
  lines: string[];
  expanded: boolean;
}

/**
 * Create multi-line status bar state
 */
export function createMultiLineStatusBarState(): MultiLineStatusBarState {
  return {
    ...createStatusBarState(),
    lines: [],
    expanded: false,
  };
}

/**
 * Add status line
 */
export function addStatusLine(
  state: MultiLineStatusBarState,
  line: string,
  maxLines: number = 5,
): MultiLineStatusBarState {
  const newLines = [...state.lines, line];
  if (newLines.length > maxLines) {
    newLines.shift();
  }
  return {
    ...state,
    lines: newLines,
  };
}

/**
 * Render multi-line status bar
 */
export function renderMultiLineStatusBar(
  state: MultiLineStatusBarState,
  config: StatusBarConfig,
): string[] {
  const result: string[] = [];

  // Main status bar
  result.push(renderStatusBar(state, config));

  // Additional lines if expanded
  if (state.expanded && state.lines.length > 0) {
    const theme = getTheme(config.useColors);
    for (const line of state.lines) {
      const styledLine = colorize(padEnd(line, config.width), theme.textDim, theme.reset);
      result.push(styledLine);
    }
  }

  return result;
}
