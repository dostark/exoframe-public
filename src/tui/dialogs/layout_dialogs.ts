/**
 * Layout Dialogs - Split View Dialog Components
 *
 * Part of Phase 13.11: Split View Enhancement
 *
 * Provides:
 * - ViewPickerDialog for selecting views when splitting
 * - LayoutPresetDialog for choosing layout presets
 * - NamedLayoutDialog for saving/loading named layouts
 */

import { colorize, type TuiTheme } from "../utils/colors.ts";
import { DASHBOARD_ICONS } from "../tui_dashboard.ts";

// ===== View Picker Dialog =====

export interface ViewInfo {
  name: string;
  icon: string;
  description: string;
}

export const AVAILABLE_VIEWS: ViewInfo[] = [
  { name: "PortalManagerView", icon: "🌀", description: "Manage project portals" },
  { name: "PlanReviewerView", icon: "📋", description: "Review agent plans" },
  { name: "MonitorView", icon: "📊", description: "Real-time logs" },
  { name: "DaemonControlView", icon: "⚙️", description: "Daemon control" },
  { name: "AgentStatusView", icon: "🤖", description: "Agent health" },
  { name: "RequestManagerView", icon: "📥", description: "Manage requests" },
  { name: "MemoryView", icon: "💾", description: "Memory banks" },
];

export interface ViewPickerDialogState {
  isOpen: boolean;
  selectedIndex: number;
  purpose: "split" | "change" | "new";
  targetPaneId?: string;
}

export function createViewPickerState(): ViewPickerDialogState {
  return {
    isOpen: false,
    selectedIndex: 0,
    purpose: "split",
  };
}

export function renderViewPickerDialog(
  state: ViewPickerDialogState,
  theme: TuiTheme,
): string[] {
  if (!state.isOpen) return [];

  const lines: string[] = [];
  const title = state.purpose === "split"
    ? "Select View for New Pane"
    : state.purpose === "change"
    ? "Change View"
    : "Select View";

  lines.push(colorize("┌──────────────────────────────────────┐", theme.border, theme.reset));
  lines.push(
    colorize("│", theme.border, theme.reset) +
      colorize(` ${title.padEnd(36)} `, theme.h1, theme.reset) +
      colorize("│", theme.border, theme.reset),
  );
  lines.push(colorize("├──────────────────────────────────────┤", theme.border, theme.reset));

  for (let i = 0; i < AVAILABLE_VIEWS.length; i++) {
    const view = AVAILABLE_VIEWS[i];
    const isSelected = i === state.selectedIndex;
    const prefix = isSelected ? "▶ " : "  ";

    const shortName = view.name.replace("View", "");
    let line = `${prefix}${i + 1}. ${view.icon} ${shortName}`;
    line = line.padEnd(36);

    if (isSelected) {
      line = colorize(line, theme.primary, theme.reset);
    }

    lines.push(
      colorize("│", theme.border, theme.reset) + " " + line + " " +
        colorize("│", theme.border, theme.reset),
    );

    if (isSelected) {
      const desc = `   ${view.description}`.padEnd(36);
      lines.push(
        colorize("│", theme.border, theme.reset) + " " +
          colorize(desc, theme.textDim, theme.reset) + " " +
          colorize("│", theme.border, theme.reset),
      );
    }
  }

  lines.push(colorize("├──────────────────────────────────────┤", theme.border, theme.reset));
  lines.push(
    colorize("│", theme.border, theme.reset) +
      colorize(" ↑↓ Navigate  Enter Select  Esc Cancel", theme.textDim, theme.reset) +
      colorize("│", theme.border, theme.reset),
  );
  lines.push(colorize("└──────────────────────────────────────┘", theme.border, theme.reset));

  return lines;
}

export function handleViewPickerKey(
  state: ViewPickerDialogState,
  key: string,
): { state: ViewPickerDialogState; selectedView?: string; closed: boolean } {
  if (!state.isOpen) {
    return { state, closed: false };
  }

  const newState = { ...state };

  switch (key.toLowerCase()) {
    case "up":
    case "k":
      newState.selectedIndex = (state.selectedIndex - 1 + AVAILABLE_VIEWS.length) % AVAILABLE_VIEWS.length;
      return { state: newState, closed: false };

    case "down":
    case "j":
      newState.selectedIndex = (state.selectedIndex + 1) % AVAILABLE_VIEWS.length;
      return { state: newState, closed: false };

    case "enter":
      newState.isOpen = false;
      return {
        state: newState,
        selectedView: AVAILABLE_VIEWS[state.selectedIndex].name,
        closed: true,
      };

    case "escape":
    case "esc":
    case "q":
      newState.isOpen = false;
      return { state: newState, closed: true };

    default:
      // Number keys for quick selection
      if (key >= "1" && key <= "7") {
        const idx = parseInt(key) - 1;
        if (idx < AVAILABLE_VIEWS.length) {
          newState.isOpen = false;
          return {
            state: newState,
            selectedView: AVAILABLE_VIEWS[idx].name,
            closed: true,
          };
        }
      }
      return { state: newState, closed: false };
  }
}

// ===== Layout Preset Dialog =====

export interface LayoutPresetDialogState {
  isOpen: boolean;
  selectedIndex: number;
}

export function createLayoutPresetState(): LayoutPresetDialogState {
  return {
    isOpen: false,
    selectedIndex: 0,
  };
}

export interface LayoutPresetInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  shortcut: string;
}

export const LAYOUT_PRESET_INFO: LayoutPresetInfo[] = [
  { id: "single", name: "Single", icon: "□", description: "Full-screen single pane", shortcut: "1" },
  { id: "side-by-side", name: "Side by Side", icon: "▯▯", description: "Two panes left/right", shortcut: "2" },
  { id: "stacked", name: "Stacked", icon: "▭▭", description: "Two panes top/bottom", shortcut: "3" },
  { id: "quad", name: "Quad", icon: "⊞", description: "Four equal panes", shortcut: "4" },
  { id: "main-sidebar", name: "Main + Sidebar", icon: "▮▯", description: "Large main with sidebar", shortcut: "5" },
  { id: "triple", name: "Triple", icon: "▮▭", description: "Main with stacked sidebars", shortcut: "6" },
];

export function renderLayoutPresetDialog(
  state: LayoutPresetDialogState,
  theme: TuiTheme,
): string[] {
  if (!state.isOpen) return [];

  const lines: string[] = [];

  lines.push(colorize("┌────────────────────────────────────────┐", theme.border, theme.reset));
  lines.push(
    colorize("│", theme.border, theme.reset) +
      colorize("          Layout Presets               ", theme.h1, theme.reset) +
      colorize("│", theme.border, theme.reset),
  );
  lines.push(colorize("├────────────────────────────────────────┤", theme.border, theme.reset));

  for (let i = 0; i < LAYOUT_PRESET_INFO.length; i++) {
    const preset = LAYOUT_PRESET_INFO[i];
    const isSelected = i === state.selectedIndex;
    const prefix = isSelected ? "▶ " : "  ";

    let line = `${prefix}${preset.shortcut}. ${preset.icon} ${preset.name}`;
    line = line.padEnd(38);

    if (isSelected) {
      line = colorize(line, theme.primary, theme.reset);
    }

    lines.push(
      colorize("│", theme.border, theme.reset) + " " + line + " " +
        colorize("│", theme.border, theme.reset),
    );

    if (isSelected) {
      const desc = `   ${preset.description}`.padEnd(38);
      lines.push(
        colorize("│", theme.border, theme.reset) + " " +
          colorize(desc, theme.textDim, theme.reset) + " " +
          colorize("│", theme.border, theme.reset),
      );
    }
  }

  lines.push(colorize("├────────────────────────────────────────┤", theme.border, theme.reset));
  lines.push(
    colorize("│", theme.border, theme.reset) +
      colorize(" ↑↓ Navigate  Enter Select  Esc Cancel", theme.textDim, theme.reset) +
      colorize(" │", theme.border, theme.reset),
  );
  lines.push(colorize("└────────────────────────────────────────┘", theme.border, theme.reset));

  return lines;
}

export function handleLayoutPresetKey(
  state: LayoutPresetDialogState,
  key: string,
): { state: LayoutPresetDialogState; selectedPreset?: string; closed: boolean } {
  if (!state.isOpen) {
    return { state, closed: false };
  }

  const newState = { ...state };

  switch (key.toLowerCase()) {
    case "up":
    case "k":
      newState.selectedIndex = (state.selectedIndex - 1 + LAYOUT_PRESET_INFO.length) % LAYOUT_PRESET_INFO.length;
      return { state: newState, closed: false };

    case "down":
    case "j":
      newState.selectedIndex = (state.selectedIndex + 1) % LAYOUT_PRESET_INFO.length;
      return { state: newState, closed: false };

    case "enter":
      newState.isOpen = false;
      return {
        state: newState,
        selectedPreset: LAYOUT_PRESET_INFO[state.selectedIndex].id,
        closed: true,
      };

    case "escape":
    case "esc":
    case "q":
      newState.isOpen = false;
      return { state: newState, closed: true };

    default:
      // Number keys for quick selection
      if (key >= "1" && key <= "6") {
        const idx = parseInt(key) - 1;
        if (idx < LAYOUT_PRESET_INFO.length) {
          newState.isOpen = false;
          return {
            state: newState,
            selectedPreset: LAYOUT_PRESET_INFO[idx].id,
            closed: true,
          };
        }
      }
      return { state: newState, closed: false };
  }
}

// ===== Named Layout Dialog =====

export interface NamedLayoutDialogState {
  isOpen: boolean;
  mode: "save" | "load" | "delete";
  layouts: string[];
  selectedIndex: number;
  inputName: string;
  inputActive: boolean;
}

export function createNamedLayoutState(): NamedLayoutDialogState {
  return {
    isOpen: false,
    mode: "save",
    layouts: [],
    selectedIndex: 0,
    inputName: "",
    inputActive: false,
  };
}

export function renderNamedLayoutDialog(
  state: NamedLayoutDialogState,
  theme: TuiTheme,
): string[] {
  if (!state.isOpen) return [];

  const lines: string[] = [];
  const title = state.mode === "save" ? "Save Layout" : state.mode === "load" ? "Load Layout" : "Delete Layout";

  lines.push(colorize("┌────────────────────────────────────────┐", theme.border, theme.reset));
  lines.push(
    colorize("│", theme.border, theme.reset) +
      colorize(` ${title.padEnd(38)} `, theme.h1, theme.reset) +
      colorize("│", theme.border, theme.reset),
  );
  lines.push(colorize("├────────────────────────────────────────┤", theme.border, theme.reset));

  if (state.mode === "save") {
    // Show input field
    const inputLine = state.inputActive
      ? colorize(`Name: ${state.inputName}_`, theme.primary, theme.reset)
      : colorize(`Name: ${state.inputName || "(enter name)"}`, theme.text, theme.reset);

    lines.push(
      colorize("│", theme.border, theme.reset) + " " + inputLine.padEnd(38) + " " +
        colorize("│", theme.border, theme.reset),
    );
    lines.push(
      colorize("│", theme.border, theme.reset) + "                                        " +
        colorize("│", theme.border, theme.reset),
    );
  }

  // Show existing layouts
  if (state.layouts.length > 0) {
    lines.push(
      colorize("│", theme.border, theme.reset) +
        colorize(" Saved Layouts:                        ", theme.h2, theme.reset) +
        colorize("│", theme.border, theme.reset),
    );

    for (let i = 0; i < state.layouts.length; i++) {
      const layout = state.layouts[i];
      const isSelected = i === state.selectedIndex && state.mode !== "save";
      const prefix = isSelected ? "▶ " : "  ";

      let line = `${prefix}${DASHBOARD_ICONS.layout.save} ${layout}`;
      line = line.padEnd(38);

      if (isSelected) {
        line = colorize(line, theme.primary, theme.reset);
      }

      lines.push(
        colorize("│", theme.border, theme.reset) + " " + line + " " +
          colorize("│", theme.border, theme.reset),
      );
    }
  } else if (state.mode !== "save") {
    lines.push(
      colorize("│", theme.border, theme.reset) +
        colorize("   No saved layouts                    ", theme.textDim, theme.reset) +
        colorize("│", theme.border, theme.reset),
    );
  }

  lines.push(colorize("├────────────────────────────────────────┤", theme.border, theme.reset));

  const hint = state.mode === "save"
    ? " Type name, Enter to save, Esc cancel  "
    : state.mode === "delete"
    ? " Enter to delete, Esc to cancel        "
    : " Enter to load, Esc to cancel          ";

  lines.push(
    colorize("│", theme.border, theme.reset) +
      colorize(hint, theme.textDim, theme.reset) +
      colorize("│", theme.border, theme.reset),
  );
  lines.push(colorize("└────────────────────────────────────────┘", theme.border, theme.reset));

  return lines;
}

export function handleNamedLayoutKey(
  state: NamedLayoutDialogState,
  key: string,
): {
  state: NamedLayoutDialogState;
  action?: "save" | "load" | "delete";
  layoutName?: string;
  closed: boolean;
} {
  if (!state.isOpen) {
    return { state, closed: false };
  }

  const newState = { ...state };

  // Handle text input in save mode
  if (state.mode === "save" && state.inputActive) {
    if (key === "enter" && state.inputName.trim()) {
      newState.isOpen = false;
      newState.inputActive = false;
      return {
        state: newState,
        action: "save",
        layoutName: state.inputName.trim(),
        closed: true,
      };
    } else if (key === "escape" || key === "esc") {
      newState.isOpen = false;
      newState.inputActive = false;
      newState.inputName = "";
      return { state: newState, closed: true };
    } else if (key === "backspace") {
      newState.inputName = state.inputName.slice(0, -1);
      return { state: newState, closed: false };
    } else if (key.length === 1 && /[a-zA-Z0-9_-]/.test(key)) {
      newState.inputName = state.inputName + key;
      return { state: newState, closed: false };
    }
    return { state: newState, closed: false };
  }

  switch (key.toLowerCase()) {
    case "up":
    case "k":
      if (state.layouts.length > 0) {
        newState.selectedIndex = (state.selectedIndex - 1 + state.layouts.length) % state.layouts.length;
      }
      return { state: newState, closed: false };

    case "down":
    case "j":
      if (state.layouts.length > 0) {
        newState.selectedIndex = (state.selectedIndex + 1) % state.layouts.length;
      }
      return { state: newState, closed: false };

    case "enter":
      if (state.mode === "save") {
        newState.inputActive = true;
        return { state: newState, closed: false };
      } else if (state.layouts.length > 0) {
        newState.isOpen = false;
        return {
          state: newState,
          action: state.mode,
          layoutName: state.layouts[state.selectedIndex],
          closed: true,
        };
      }
      return { state: newState, closed: false };

    case "escape":
    case "esc":
    case "q":
      newState.isOpen = false;
      newState.inputName = "";
      newState.inputActive = false;
      return { state: newState, closed: true };

    default:
      return { state: newState, closed: false };
  }
}

// ===== Pane Swap Indicator =====

export function renderSwapIndicator(
  sourcePaneId: string,
  targetPaneId: string | null,
  theme: TuiTheme,
): string {
  if (targetPaneId) {
    return colorize(`Swap: ${sourcePaneId} ⇄ ${targetPaneId}`, theme.warning, theme.reset);
  }
  return colorize(`Swapping from: ${sourcePaneId} (Tab to select target)`, theme.primary, theme.reset);
}

// ===== Resize Mode Indicator =====

export interface ResizeModeState {
  isActive: boolean;
  paneId: string | null;
}

export function createResizeModeState(): ResizeModeState {
  return {
    isActive: false,
    paneId: null,
  };
}

export function renderResizeModeIndicator(state: ResizeModeState, theme: TuiTheme): string {
  if (!state.isActive) return "";
  return colorize(
    `[RESIZE MODE] Use Ctrl+Arrow keys to resize, Esc to exit`,
    theme.warning,
    theme.reset,
  );
}
