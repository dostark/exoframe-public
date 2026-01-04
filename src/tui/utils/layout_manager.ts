/**
 * Layout Manager - Split View Layout Management
 *
 * Part of Phase 13.11: Split View Enhancement
 *
 * Provides:
 * - Layout presets (single, side-by-side, top-bottom, quad, etc.)
 * - Pane resize with constraints
 * - Pane swap functionality
 * - Named layout save/restore
 * - Layout validation and normalization
 */

import { colorize, type TuiTheme } from "./colors.ts";

// ===== Layout Types =====

export interface LayoutPane {
  id: string;
  viewName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  focused: boolean;
  maximized?: boolean;
  previousBounds?: PaneBounds;
}

export interface PaneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  name: string;
  panes: LayoutPane[];
  activePaneId: string;
  version: string;
  createdAt?: string;
  description?: string;
}

export interface LayoutPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  shortcut: string;
  create: (width: number, height: number, views: string[]) => LayoutPane[];
}

// ===== Layout Constants =====

export const LAYOUT_VERSION = "1.2";

export const MIN_PANE_WIDTH = 20;
export const MIN_PANE_HEIGHT = 5;
export const MAX_PANES = 6;

// ===== Layout Presets =====

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "single",
    name: "Single",
    description: "Single full-screen pane",
    icon: "□",
    shortcut: "1",
    create: (width, height, views) => [{
      id: "main",
      viewName: views[0] || "PortalManagerView",
      x: 0,
      y: 0,
      width,
      height,
      focused: true,
    }],
  },
  {
    id: "side-by-side",
    name: "Side by Side",
    description: "Two panes, vertical split",
    icon: "▯▯",
    shortcut: "2",
    create: (width, height, views) => {
      const halfWidth = Math.floor(width / 2);
      return [
        {
          id: "left",
          viewName: views[0] || "PortalManagerView",
          x: 0,
          y: 0,
          width: halfWidth,
          height,
          focused: true,
        },
        {
          id: "right",
          viewName: views[1] || "MonitorView",
          x: halfWidth,
          y: 0,
          width: width - halfWidth,
          height,
          focused: false,
        },
      ];
    },
  },
  {
    id: "stacked",
    name: "Stacked",
    description: "Two panes, horizontal split",
    icon: "▭▭",
    shortcut: "3",
    create: (width, height, views) => {
      const halfHeight = Math.floor(height / 2);
      return [
        {
          id: "top",
          viewName: views[0] || "PortalManagerView",
          x: 0,
          y: 0,
          width,
          height: halfHeight,
          focused: true,
        },
        {
          id: "bottom",
          viewName: views[1] || "MonitorView",
          x: 0,
          y: halfHeight,
          width,
          height: height - halfHeight,
          focused: false,
        },
      ];
    },
  },
  {
    id: "quad",
    name: "Quad",
    description: "Four equal panes",
    icon: "⊞",
    shortcut: "4",
    create: (width, height, views) => {
      const halfWidth = Math.floor(width / 2);
      const halfHeight = Math.floor(height / 2);
      return [
        {
          id: "top-left",
          viewName: views[0] || "PortalManagerView",
          x: 0,
          y: 0,
          width: halfWidth,
          height: halfHeight,
          focused: true,
        },
        {
          id: "top-right",
          viewName: views[1] || "PlanReviewerView",
          x: halfWidth,
          y: 0,
          width: width - halfWidth,
          height: halfHeight,
          focused: false,
        },
        {
          id: "bottom-left",
          viewName: views[2] || "MonitorView",
          x: 0,
          y: halfHeight,
          width: halfWidth,
          height: height - halfHeight,
          focused: false,
        },
        {
          id: "bottom-right",
          viewName: views[3] || "DaemonControlView",
          x: halfWidth,
          y: halfHeight,
          width: width - halfWidth,
          height: height - halfHeight,
          focused: false,
        },
      ];
    },
  },
  {
    id: "main-sidebar",
    name: "Main + Sidebar",
    description: "Large main pane with sidebar",
    icon: "▮▯",
    shortcut: "5",
    create: (width, height, views) => {
      const mainWidth = Math.floor(width * 0.7);
      return [
        {
          id: "main",
          viewName: views[0] || "PortalManagerView",
          x: 0,
          y: 0,
          width: mainWidth,
          height,
          focused: true,
        },
        {
          id: "sidebar",
          viewName: views[1] || "MonitorView",
          x: mainWidth,
          y: 0,
          width: width - mainWidth,
          height,
          focused: false,
        },
      ];
    },
  },
  {
    id: "triple",
    name: "Triple",
    description: "Main pane with two stacked sidebars",
    icon: "▮▭",
    shortcut: "6",
    create: (width, height, views) => {
      const mainWidth = Math.floor(width * 0.6);
      const halfHeight = Math.floor(height / 2);
      return [
        {
          id: "main",
          viewName: views[0] || "PortalManagerView",
          x: 0,
          y: 0,
          width: mainWidth,
          height,
          focused: true,
        },
        {
          id: "sidebar-top",
          viewName: views[1] || "PlanReviewerView",
          x: mainWidth,
          y: 0,
          width: width - mainWidth,
          height: halfHeight,
          focused: false,
        },
        {
          id: "sidebar-bottom",
          viewName: views[2] || "MonitorView",
          x: mainWidth,
          y: halfHeight,
          width: width - mainWidth,
          height: height - halfHeight,
          focused: false,
        },
      ];
    },
  },
];

// ===== Layout Manager Class =====

export class LayoutManager {
  private terminalWidth: number;
  private terminalHeight: number;
  private namedLayouts: Map<string, Layout> = new Map();

  constructor(width: number = 80, height: number = 24) {
    this.terminalWidth = width;
    this.terminalHeight = height;
  }

  // ===== Terminal Size =====

  setTerminalSize(width: number, height: number): void {
    this.terminalWidth = width;
    this.terminalHeight = height;
  }

  getTerminalSize(): { width: number; height: number } {
    return { width: this.terminalWidth, height: this.terminalHeight };
  }

  // ===== Preset Operations =====

  getPresets(): LayoutPreset[] {
    return LAYOUT_PRESETS;
  }

  getPresetById(id: string): LayoutPreset | undefined {
    return LAYOUT_PRESETS.find((p) => p.id === id);
  }

  getPresetByShortcut(shortcut: string): LayoutPreset | undefined {
    return LAYOUT_PRESETS.find((p) => p.shortcut === shortcut);
  }

  applyPreset(presetId: string, views: string[]): LayoutPane[] {
    const preset = this.getPresetById(presetId);
    if (!preset) {
      throw new Error(`Unknown layout preset: ${presetId}`);
    }
    return preset.create(this.terminalWidth, this.terminalHeight, views);
  }

  // ===== Pane Operations =====

  splitPane(
    panes: LayoutPane[],
    paneId: string,
    direction: "vertical" | "horizontal",
    newViewName: string,
  ): LayoutPane[] {
    if (panes.length >= MAX_PANES) {
      throw new Error(`Maximum panes (${MAX_PANES}) reached`);
    }

    const pane = panes.find((p) => p.id === paneId);
    if (!pane) {
      throw new Error(`Pane not found: ${paneId}`);
    }

    const newId = `pane-${Date.now()}`;

    if (direction === "vertical") {
      const halfWidth = Math.floor(pane.width / 2);
      if (halfWidth < MIN_PANE_WIDTH) {
        throw new Error(`Pane too narrow to split (min: ${MIN_PANE_WIDTH})`);
      }

      // Resize original pane
      pane.width = halfWidth;

      // Create new pane
      const newPane: LayoutPane = {
        id: newId,
        viewName: newViewName,
        x: pane.x + halfWidth,
        y: pane.y,
        width: pane.width,
        height: pane.height,
        focused: false,
      };

      return [...panes, newPane];
    } else {
      const halfHeight = Math.floor(pane.height / 2);
      if (halfHeight < MIN_PANE_HEIGHT) {
        throw new Error(`Pane too short to split (min: ${MIN_PANE_HEIGHT})`);
      }

      // Resize original pane
      pane.height = halfHeight;

      // Create new pane
      const newPane: LayoutPane = {
        id: newId,
        viewName: newViewName,
        x: pane.x,
        y: pane.y + halfHeight,
        width: pane.width,
        height: pane.height,
        focused: false,
      };

      return [...panes, newPane];
    }
  }

  closePane(panes: LayoutPane[], paneId: string): LayoutPane[] {
    if (panes.length <= 1) {
      throw new Error("Cannot close the last pane");
    }

    const index = panes.findIndex((p) => p.id === paneId);
    if (index === -1) {
      throw new Error(`Pane not found: ${paneId}`);
    }

    const closedPane = panes[index];
    const remaining = panes.filter((p) => p.id !== paneId);

    // Expand adjacent pane to fill the space
    // Find pane that shares an edge
    const adjacent = this.findAdjacentPane(remaining, closedPane);
    if (adjacent) {
      this.expandToFill(adjacent, closedPane);
    }

    // Ensure at least one pane is focused
    if (!remaining.some((p) => p.focused) && remaining.length > 0) {
      remaining[0].focused = true;
    }

    return remaining;
  }

  private findAdjacentPane(panes: LayoutPane[], closed: LayoutPane): LayoutPane | undefined {
    // Prefer horizontal adjacency (same row)
    const horizontal = panes.find(
      (p) =>
        p.y === closed.y &&
        p.height === closed.height &&
        (p.x + p.width === closed.x || closed.x + closed.width === p.x),
    );
    if (horizontal) return horizontal;

    // Try vertical adjacency (same column)
    const vertical = panes.find(
      (p) =>
        p.x === closed.x &&
        p.width === closed.width &&
        (p.y + p.height === closed.y || closed.y + closed.height === p.y),
    );
    if (vertical) return vertical;

    // Fall back to first pane
    return panes[0];
  }

  private expandToFill(pane: LayoutPane, closed: LayoutPane): void {
    // If same row, expand horizontally
    if (pane.y === closed.y && pane.height === closed.height) {
      if (pane.x + pane.width === closed.x) {
        // Closed was to the right
        pane.width += closed.width;
      } else if (closed.x + closed.width === pane.x) {
        // Closed was to the left
        pane.x = closed.x;
        pane.width += closed.width;
      }
    } else if (pane.x === closed.x && pane.width === closed.width) {
      if (pane.y + pane.height === closed.y) {
        // Closed was below
        pane.height += closed.height;
      } else if (closed.y + closed.height === pane.y) {
        // Closed was above
        pane.y = closed.y;
        pane.height += closed.height;
      }
    }
  }

  resizePane(
    panes: LayoutPane[],
    paneId: string,
    direction: "left" | "right" | "up" | "down",
    amount: number = 5,
  ): LayoutPane[] {
    const pane = panes.find((p) => p.id === paneId);
    if (!pane) {
      throw new Error(`Pane not found: ${paneId}`);
    }

    // Find adjacent pane that will be affected
    const affected = this.findAffectedPane(panes, pane, direction);

    switch (direction) {
      case "left":
        if (pane.width - amount >= MIN_PANE_WIDTH) {
          pane.width -= amount;
          if (affected && affected.x > pane.x) {
            affected.x -= amount;
            affected.width += amount;
          }
        }
        break;
      case "right":
        if (affected && affected.width - amount >= MIN_PANE_WIDTH) {
          pane.width += amount;
          affected.x += amount;
          affected.width -= amount;
        } else if (!affected && pane.x + pane.width + amount <= this.terminalWidth) {
          pane.width += amount;
        }
        break;
      case "up":
        if (pane.height - amount >= MIN_PANE_HEIGHT) {
          pane.height -= amount;
          if (affected && affected.y > pane.y) {
            affected.y -= amount;
            affected.height += amount;
          }
        }
        break;
      case "down":
        if (affected && affected.height - amount >= MIN_PANE_HEIGHT) {
          pane.height += amount;
          affected.y += amount;
          affected.height -= amount;
        } else if (!affected && pane.y + pane.height + amount <= this.terminalHeight) {
          pane.height += amount;
        }
        break;
    }

    return panes;
  }

  private findAffectedPane(
    panes: LayoutPane[],
    source: LayoutPane,
    direction: "left" | "right" | "up" | "down",
  ): LayoutPane | undefined {
    switch (direction) {
      case "right":
        return panes.find(
          (p) =>
            p.id !== source.id &&
            p.x === source.x + source.width &&
            this.overlapsVertically(p, source),
        );
      case "left":
        return panes.find(
          (p) =>
            p.id !== source.id &&
            p.x + p.width === source.x &&
            this.overlapsVertically(p, source),
        );
      case "down":
        return panes.find(
          (p) =>
            p.id !== source.id &&
            p.y === source.y + source.height &&
            this.overlapsHorizontally(p, source),
        );
      case "up":
        return panes.find(
          (p) =>
            p.id !== source.id &&
            p.y + p.height === source.y &&
            this.overlapsHorizontally(p, source),
        );
    }
  }

  private overlapsVertically(a: LayoutPane, b: LayoutPane): boolean {
    return !(a.y + a.height <= b.y || b.y + b.height <= a.y);
  }

  private overlapsHorizontally(a: LayoutPane, b: LayoutPane): boolean {
    return !(a.x + a.width <= b.x || b.x + b.width <= a.x);
  }

  swapPanes(panes: LayoutPane[], paneId1: string, paneId2: string): LayoutPane[] {
    const pane1 = panes.find((p) => p.id === paneId1);
    const pane2 = panes.find((p) => p.id === paneId2);

    if (!pane1 || !pane2) {
      throw new Error("One or both panes not found");
    }

    // Swap view names (keep positions)
    const tempView = pane1.viewName;
    pane1.viewName = pane2.viewName;
    pane2.viewName = tempView;

    return panes;
  }

  maximizePane(panes: LayoutPane[], paneId: string): LayoutPane[] {
    const pane = panes.find((p) => p.id === paneId);
    if (!pane) {
      throw new Error(`Pane not found: ${paneId}`);
    }

    if (pane.maximized) {
      // Restore
      if (pane.previousBounds) {
        pane.x = pane.previousBounds.x;
        pane.y = pane.previousBounds.y;
        pane.width = pane.previousBounds.width;
        pane.height = pane.previousBounds.height;
        pane.previousBounds = undefined;
      }
      pane.maximized = false;
    } else {
      // Maximize
      pane.previousBounds = {
        x: pane.x,
        y: pane.y,
        width: pane.width,
        height: pane.height,
      };
      pane.x = 0;
      pane.y = 0;
      pane.width = this.terminalWidth;
      pane.height = this.terminalHeight;
      pane.maximized = true;
    }

    return panes;
  }

  // ===== Named Layouts =====

  saveNamedLayout(name: string, panes: LayoutPane[], activePaneId: string): Layout {
    const layout: Layout = {
      name,
      panes: panes.map((p) => ({ ...p })),
      activePaneId,
      version: LAYOUT_VERSION,
      createdAt: new Date().toISOString(),
    };
    this.namedLayouts.set(name, layout);
    return layout;
  }

  loadNamedLayout(name: string): Layout | undefined {
    return this.namedLayouts.get(name);
  }

  deleteNamedLayout(name: string): boolean {
    return this.namedLayouts.delete(name);
  }

  listNamedLayouts(): string[] {
    return Array.from(this.namedLayouts.keys());
  }

  getNamedLayouts(): Layout[] {
    return Array.from(this.namedLayouts.values());
  }

  // ===== Layout Serialization =====

  serializeLayout(panes: LayoutPane[], activePaneId: string): string {
    const layout: Layout = {
      name: "default",
      panes: panes.map((p) => ({
        id: p.id,
        viewName: p.viewName,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        focused: p.focused,
        maximized: p.maximized,
      })),
      activePaneId,
      version: LAYOUT_VERSION,
    };
    return JSON.stringify(layout, null, 2);
  }

  deserializeLayout(json: string): Layout | null {
    try {
      const layout = JSON.parse(json);
      if (this.validateLayout(layout)) {
        return layout;
      }
      return null;
    } catch {
      return null;
    }
  }

  validateLayout(layout: unknown): layout is Layout {
    if (typeof layout !== "object" || layout === null) return false;
    const l = layout as Record<string, unknown>;

    if (typeof l.name !== "string") return false;
    if (!Array.isArray(l.panes)) return false;
    if (typeof l.activePaneId !== "string") return false;
    if (typeof l.version !== "string") return false;

    for (const pane of l.panes) {
      if (typeof pane !== "object" || pane === null) return false;
      const p = pane as Record<string, unknown>;
      if (typeof p.id !== "string") return false;
      if (typeof p.viewName !== "string") return false;
      if (typeof p.x !== "number") return false;
      if (typeof p.y !== "number") return false;
      if (typeof p.width !== "number") return false;
      if (typeof p.height !== "number") return false;
    }

    return true;
  }

  // ===== Layout Normalization =====

  normalizeLayout(panes: LayoutPane[]): LayoutPane[] {
    // Ensure panes fit within terminal bounds
    return panes.map((pane) => {
      // First normalize position
      const x = Math.max(0, Math.min(pane.x, this.terminalWidth - MIN_PANE_WIDTH));
      const y = Math.max(0, Math.min(pane.y, this.terminalHeight - MIN_PANE_HEIGHT));
      // Then normalize size based on new position
      const width = Math.max(MIN_PANE_WIDTH, Math.min(pane.width, this.terminalWidth - x));
      const height = Math.max(MIN_PANE_HEIGHT, Math.min(pane.height, this.terminalHeight - y));
      return { ...pane, x, y, width, height };
    });
  }
}

// ===== Rendering Helpers =====

export function renderLayoutPresetPicker(
  presets: LayoutPreset[],
  selectedIndex: number,
  theme: TuiTheme,
): string[] {
  const lines: string[] = [];

  lines.push(colorize("┌────────────────────────────────────────┐", theme.border, theme.reset));
  lines.push(
    colorize("│", theme.border, theme.reset) +
      colorize("          Layout Presets               ", theme.h1, theme.reset) +
      colorize("│", theme.border, theme.reset),
  );
  lines.push(colorize("├────────────────────────────────────────┤", theme.border, theme.reset));

  for (let i = 0; i < presets.length; i++) {
    const preset = presets[i];
    const isSelected = i === selectedIndex;
    const prefix = isSelected ? "▶ " : "  ";
    const suffix = isSelected ? " ◀" : "  ";

    let line = `${prefix}${preset.shortcut}. ${preset.icon} ${preset.name}${suffix}`;
    line = line.padEnd(38);

    if (isSelected) {
      line = colorize(line, theme.primary, theme.reset);
    }

    lines.push(
      colorize("│", theme.border, theme.reset) + " " + line + " " +
        colorize("│", theme.border, theme.reset),
    );

    // Show description for selected
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
      colorize(" Enter to apply, Esc to cancel        ", theme.textDim, theme.reset) +
      colorize("│", theme.border, theme.reset),
  );
  lines.push(colorize("└────────────────────────────────────────┘", theme.border, theme.reset));

  return lines;
}

export function renderPaneBorder(pane: LayoutPane, theme: TuiTheme): string {
  const icon = pane.focused ? "●" : "○";
  const viewShort = pane.viewName.replace("View", "");
  const maxLabel = pane.maximized ? " [MAX]" : "";

  if (pane.focused) {
    return colorize(`${icon} ${viewShort}${maxLabel}`, theme.primary, theme.reset);
  }
  return colorize(`${icon} ${viewShort}${maxLabel}`, theme.textDim, theme.reset);
}

export function renderResizeIndicator(
  direction: "left" | "right" | "up" | "down",
  theme: TuiTheme,
): string {
  const arrows: Record<string, string> = {
    left: "◀",
    right: "▶",
    up: "▲",
    down: "▼",
  };
  return colorize(`Resize ${arrows[direction]}`, theme.primary, theme.reset);
}

// ===== Default Export =====

export function createLayoutManager(width?: number, height?: number): LayoutManager {
  return new LayoutManager(width, height);
}
