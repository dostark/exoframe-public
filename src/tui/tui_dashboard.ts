/**
 * TUI Dashboard - Unified Dashboard Entry Point
 *
 * Part of Phase 13.9: Dashboard Integration
 *
 * This is the main entry point for the ExoFrame TUI, integrating all
 * enhanced views into a unified dashboard with:
 * - Multi-pane split view support
 * - Global help overlay
 * - View switching indicators
 * - Notification system
 * - Layout persistence
 */

import { PortalManagerView } from "./portal_manager_view.ts";
import { PlanReviewerView } from "./plan_reviewer_view.ts";
import { MonitorView } from "./monitor_view.ts";
import { DaemonControlView } from "./daemon_control_view.ts";
import { AgentStatusView } from "./agent_status_view.ts";
import { RequestManagerView } from "./request_manager_view.ts";
import { MemoryView } from "./memory_view.ts";
import { SkillsManagerView } from "./skills_manager_view.ts";
import {
  MockAgentService,
  MockDaemonService,
  MockLogService,
  MockMemoryService,
  MockPlanService,
  MockPortalService,
  MockRequestService,
  MockSkillsService,
} from "./tui_dashboard_mocks.ts";
import { colorize, getTheme, type TuiTheme } from "./utils/colors.ts";
import { type HelpSection, renderHelpScreen } from "./utils/help_renderer.ts";
import type { KeyBinding } from "./utils/keyboard.ts";
import { Table } from "https://deno.land/x/cliffy@v0.25.7/mod.ts";

// Type alias for convenience
type Theme = TuiTheme;

// ===== Dashboard View State =====

export interface DashboardViewState {
  showHelp: boolean;
  showNotifications: boolean;
  showViewPicker: boolean;
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;
  notifications: Notification[];
  currentTheme: string;
  highContrast: boolean;
  screenReader: boolean;
}

export interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  timestamp: Date;
  dismissed: boolean;
  autoExpire: boolean;
  duration: number; // milliseconds
}

// ===== Dashboard Icons =====

export const DASHBOARD_ICONS = {
  views: {
    PortalManagerView: "🌀",
    PlanReviewerView: "📋",
    MonitorView: "📊",
    DaemonControlView: "⚙️",
    AgentStatusView: "🤖",
    RequestManagerView: "📥",
    MemoryView: "💾",
    SkillsManagerView: "🎯",
  } as Record<string, string>,
  pane: {
    focused: "●",
    unfocused: "○",
    split: "│",
    horizontal: "─",
    corner: "┼",
  },
  notification: {
    info: "ℹ️",
    success: "✅",
    warning: "⚠️",
    error: "❌",
    bell: "🔔",
  },
  layout: {
    single: "□",
    vertical: "▯▯",
    horizontal: "▭▭",
    quad: "⊞",
    save: "💾",
    load: "📂",
    reset: "🔄",
  },
} as const;

// ===== Dashboard Key Bindings =====

type DashboardAction =
  | "next_pane"
  | "prev_pane"
  | "split_vertical"
  | "split_horizontal"
  | "close_pane"
  | "maximize_pane"
  | "save_layout"
  | "restore_layout"
  | "reset_layout"
  | "show_help"
  | "show_notifications"
  | "show_view_picker"
  | "quit"
  | "view_1"
  | "view_2"
  | "view_3"
  | "view_4"
  | "view_5"
  | "view_6"
  | "view_7";

export const DASHBOARD_KEY_BINDINGS: KeyBinding<DashboardAction>[] = [
  // Navigation
  { key: "Tab", action: "next_pane", description: "Next pane", category: "Navigation" },
  { key: "Shift+Tab", action: "prev_pane", description: "Previous pane", category: "Navigation" },
  { key: "1-7", action: "view_1", description: "Jump to pane 1-7", category: "Navigation" },

  // Layout
  { key: "v", action: "split_vertical", description: "Split pane vertically", category: "Layout" },
  { key: "h", action: "split_horizontal", description: "Split pane horizontally", category: "Layout" },
  { key: "c", action: "close_pane", description: "Close current pane", category: "Layout" },
  { key: "z", action: "maximize_pane", description: "Maximize/restore pane", category: "Layout" },
  { key: "s", action: "save_layout", description: "Save layout", category: "Layout" },
  { key: "r", action: "restore_layout", description: "Restore layout", category: "Layout" },
  { key: "d", action: "reset_layout", description: "Reset to default", category: "Layout" },

  // Dialogs
  { key: "?", action: "show_help", description: "Show help", category: "General" },
  { key: "n", action: "show_notifications", description: "Toggle notifications", category: "General" },
  { key: "p", action: "show_view_picker", description: "View picker", category: "General" },
  { key: "Esc/q", action: "quit", description: "Quit dashboard", category: "General" },
];

// ===== Help Sections =====

export function getDashboardHelpSections(): HelpSection[] {
  return [
    {
      title: "Navigation",
      items: [
        { key: "Tab", description: "Switch to next pane" },
        { key: "Shift+Tab", description: "Switch to previous pane" },
        { key: "1-7", description: "Jump directly to pane" },
      ],
    },
    {
      title: "Layout Management",
      items: [
        { key: "v", description: "Split pane vertically (left/right)" },
        { key: "h", description: "Split pane horizontally (top/bottom)" },
        { key: "c", description: "Close current pane" },
        { key: "z", description: "Maximize/restore pane (zoom)" },
      ],
    },
    {
      title: "Layout Persistence",
      items: [
        { key: "s", description: "Save current layout" },
        { key: "r", description: "Restore saved layout" },
        { key: "d", description: "Reset to default layout" },
      ],
    },
    {
      title: "View Navigation",
      items: [
        { key: "p", description: "Open view picker dialog" },
        { key: "n", description: "Toggle notification panel" },
        { key: "?", description: "Show this help screen" },
      ],
    },
    {
      title: "Available Views",
      items: [
        { key: "🌀 Portal Manager", description: "Manage portal aliases" },
        { key: "📋 Plan Reviewer", description: "Review and approve plans" },
        { key: "📊 Monitor", description: "View system logs" },
        { key: "⚙️ Daemon Control", description: "Manage daemon" },
        { key: "🤖 Agent Status", description: "View agent status" },
        { key: "📥 Request Manager", description: "Manage requests" },
        { key: "💾 Memory", description: "Memory management" },
      ],
    },
    {
      title: "Exit",
      items: [
        { key: "Esc/q", description: "Quit dashboard" },
      ],
    },
  ];
}

// ===== Pane and Dashboard Interfaces =====

export interface Pane {
  id: string;
  view: any;
  x: number;
  y: number;
  width: number;
  height: number;
  focused: boolean;
  maximized?: boolean;
  previousBounds?: { x: number; y: number; width: number; height: number };
}

export interface TuiDashboard {
  // State
  panes: Pane[];
  activePaneId: string;
  views: any[];
  state: DashboardViewState;
  theme: Theme;

  // Core methods
  handleKey(key: string): number;
  render(): Promise<void>;
  renderStatusBar(): string;
  renderViewIndicator(): string;
  renderGlobalHelp(): string[];
  renderNotifications(): string[];

  // Pane management
  splitPane(direction: "vertical" | "horizontal"): void;
  closePane(paneId: string): void;
  resizePane(paneId: string, deltaWidth: number, deltaHeight: number): void;
  switchPane(paneId: string): void;
  maximizePane(paneId: string): void;
  restorePane(paneId: string): void;

  // Layout persistence
  saveLayout(): Promise<void>;
  restoreLayout(): Promise<void>;
  resetToDefault(): void;

  // Notifications
  notify(message: string, type?: "info" | "success" | "warning" | "error"): void;
  dismissNotification(id: string): void;
  clearNotifications(): void;

  // Legacy support
  portalManager: {
    service: any;
    renderPortalList: (portals: any[]) => string;
  };
  accessibility: {
    highContrast: boolean;
    screenReader: boolean;
  };
  keybindings: {
    nextView: string;
    prevView: string;
    notify: string;
    splitVertical: string;
    splitHorizontal: string;
    closePane: string;
  };
}

export function tryEnableRawMode(): boolean {
  try {
    const stdinAny = Deno.stdin as any;
    if (typeof stdinAny.isTerminal === "function" && stdinAny.isTerminal()) {
      if (typeof stdinAny.setRaw === "function") {
        stdinAny.setRaw(true);
        return true;
      }
    }
  } catch (_err) {
    // best-effort: ignore errors
  }
  return false;
}

export function tryDisableRawMode(): boolean {
  try {
    const stdinAny = Deno.stdin as any;
    if (typeof stdinAny.setRaw === "function") {
      stdinAny.setRaw(false);
      return true;
    }
  } catch (_err) {
    // ignore
  }
  return false;
}

// ===== Notification Management =====

let notificationIdCounter = 0;

export function createNotification(
  message: string,
  type: "info" | "success" | "warning" | "error" = "info",
  autoExpire = true,
  duration = 5000,
): Notification {
  return {
    id: `notification-${++notificationIdCounter}`,
    type,
    message,
    timestamp: new Date(),
    dismissed: false,
    autoExpire,
    duration,
  };
}

// ===== Default Dashboard State =====

export function createDefaultDashboardState(): DashboardViewState {
  return {
    showHelp: false,
    showNotifications: false,
    showViewPicker: false,
    isLoading: false,
    loadingMessage: "",
    error: null,
    notifications: [],
    currentTheme: "dark",
    highContrast: false,
    screenReader: false,
  };
}

// ===== View Indicator Rendering =====

export function renderViewIndicator(panes: Pane[], activePaneId: string, theme: Theme): string {
  const indicators: string[] = [];

  for (let i = 0; i < panes.length; i++) {
    const pane = panes[i];
    const icon = DASHBOARD_ICONS.views[pane.view.name] || "📦";
    const focusIndicator = pane.id === activePaneId ? DASHBOARD_ICONS.pane.focused : DASHBOARD_ICONS.pane.unfocused;

    const paneLabel = `${focusIndicator} ${i + 1}:${icon}`;

    if (pane.id === activePaneId) {
      indicators.push(colorize(paneLabel, theme.primary, theme.reset));
    } else {
      indicators.push(colorize(paneLabel, theme.textDim, theme.reset));
    }
  }

  return indicators.join("  ");
}

// ===== Global Help Overlay Rendering =====

export function renderGlobalHelpOverlay(_theme: Theme): string[] {
  const sections = getDashboardHelpSections();
  return renderHelpScreen({
    title: "ExoFrame Dashboard Help",
    sections,
    footer: "Press ? or Esc to close help",
    width: 70,
    useColors: true,
  });
}

// ===== Notification Panel Rendering =====

export function renderNotificationPanel(
  notifications: Notification[],
  theme: Theme,
  maxHeight = 10,
): string[] {
  const lines: string[] = [];
  const activeNotifications = notifications.filter((n) => !n.dismissed);

  if (activeNotifications.length === 0) {
    lines.push(colorize("  No notifications", theme.textDim, theme.reset));
    return lines;
  }

  // Header
  lines.push(
    colorize(
      `${DASHBOARD_ICONS.notification.bell} Notifications (${activeNotifications.length})`,
      theme.h2,
      theme.reset,
    ),
  );
  lines.push("");

  // Show most recent notifications (up to maxHeight - 2 for header)
  const visibleNotifications = activeNotifications.slice(-(maxHeight - 2));

  for (const notification of visibleNotifications) {
    const icon = DASHBOARD_ICONS.notification[notification.type];
    const timeAgo = formatTimeAgo(notification.timestamp);

    let messageColor = theme.text;
    if (notification.type === "error") messageColor = theme.error;
    else if (notification.type === "warning") messageColor = theme.warning;
    else if (notification.type === "success") messageColor = theme.success;
    else if (notification.type === "info") messageColor = theme.primary;

    const line = `  ${icon} ${colorize(notification.message, messageColor, theme.reset)} ${
      colorize(`(${timeAgo})`, theme.textDim, theme.reset)
    }`;
    lines.push(line);
  }

  if (activeNotifications.length > visibleNotifications.length) {
    const more = activeNotifications.length - visibleNotifications.length;
    lines.push(colorize(`  ... and ${more} more`, theme.textDim, theme.reset));
  }

  return lines;
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ===== View Picker Rendering =====

export function renderViewPicker(
  views: any[],
  currentViewIndex: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];

  lines.push(colorize("┌────────────────────────────────────┐", theme.border, theme.reset));
  lines.push(
    colorize("│", theme.border, theme.reset) +
      colorize("          Select View             ", theme.h1, theme.reset) +
      colorize("│", theme.border, theme.reset),
  );
  lines.push(colorize("├────────────────────────────────────┤", theme.border, theme.reset));

  for (let i = 0; i < views.length; i++) {
    const view = views[i];
    const icon = DASHBOARD_ICONS.views[view.name] || "📦";
    const shortName = view.name.replace("View", "");

    const isSelected = i === currentViewIndex;
    const prefix = isSelected ? "▶ " : "  ";
    const suffix = isSelected ? " ◀" : "  ";

    let line = `${prefix}${i + 1}. ${icon} ${shortName}${suffix}`;
    line = line.padEnd(34);

    if (isSelected) {
      line = colorize(line, theme.primary, theme.reset);
    }

    lines.push(colorize("│", theme.border, theme.reset) + " " + line + " " + colorize("│", theme.border, theme.reset));
  }

  lines.push(colorize("├────────────────────────────────────┤", theme.border, theme.reset));
  lines.push(
    colorize("│", theme.border, theme.reset) +
      colorize(" Enter to select, Esc to cancel   ", theme.textDim, theme.reset) +
      colorize("│", theme.border, theme.reset),
  );
  lines.push(colorize("└────────────────────────────────────┘", theme.border, theme.reset));

  return lines;
}

// ===== Pane Title Bar Rendering =====

export function renderPaneTitleBar(pane: Pane, theme: Theme): string {
  const icon = DASHBOARD_ICONS.views[pane.view.name] || "📦";
  const name = pane.view.name.replace("View", "");
  const focusIndicator = pane.focused ? "●" : "○";
  const maxIndicator = pane.maximized ? " [MAX]" : "";

  const title = `${focusIndicator} ${icon} ${name}${maxIndicator}`;

  if (pane.focused) {
    return colorize(title, theme.primary, theme.reset);
  }
  return colorize(title, theme.textDim, theme.reset);
}

export async function launchTuiDashboard(
  options: { testMode?: boolean; nonInteractive?: boolean } = {},
): Promise<TuiDashboard | undefined> {
  // Minimal idiomatic dashboard object for TDD
  const portalService = new MockPortalService();
  const planService = new MockPlanService();
  const logService = new MockLogService();
  const daemonService = new MockDaemonService();
  const agentService = new MockAgentService();
  const requestService = new MockRequestService();
  const memoryService = new MockMemoryService();
  const skillsService = new MockSkillsService();
  const views = [
    Object.assign(new PortalManagerView(portalService), { name: "PortalManagerView" }),
    Object.assign(new PlanReviewerView(planService), { name: "PlanReviewerView" }),
    Object.assign(new MonitorView(logService), { name: "MonitorView" }),
    Object.assign(new DaemonControlView(daemonService), { name: "DaemonControlView" }),
    Object.assign(new AgentStatusView(agentService), { name: "AgentStatusView" }),
    Object.assign(new RequestManagerView(requestService), { name: "RequestManagerView" }),
    Object.assign(new MemoryView(memoryService), { name: "MemoryView" }),
    Object.assign(new SkillsManagerView(skillsService), { name: "SkillsManagerView" }),
  ].map((view) => {
    const v: any = view;
    if (typeof v.getFocusableElements !== "function") {
      if (v.name === "PortalManagerView") {
        v.getFocusableElements = () => ["portal-list", "action-buttons", "status-bar"];
      } else {
        v.getFocusableElements = () => ["main"];
      }
    }
    return v;
  });

  // Initialize with single pane
  const initialPane: Pane = {
    id: "main",
    view: views[0],
    x: 0,
    y: 0,
    width: 80,
    height: 24,
    focused: true,
    maximized: false,
  };
  const panes: Pane[] = [initialPane];
  let activePaneId = "main";

  // Initialize state
  const state: DashboardViewState = createDefaultDashboardState();
  const theme: Theme = getTheme(true);

  // View picker state
  let viewPickerIndex = 0;

  if (options.testMode) {
    // Return a testable dashboard object with panes, keyboard nav, and rendering
    const portalView = views[0];
    return {
      panes,
      activePaneId,
      views,
      state,
      theme,
      handleKey(key: string) {
        // Handle help overlay
        if (this.state.showHelp) {
          if (key === "?" || key === "escape" || key === "esc") {
            this.state.showHelp = false;
          }
          return panes.findIndex((p) => p.id === this.activePaneId);
        }

        // Handle view picker
        if (this.state.showViewPicker) {
          if (key === "escape" || key === "esc") {
            this.state.showViewPicker = false;
          } else if (key === "up" || key === "k") {
            viewPickerIndex = (viewPickerIndex - 1 + views.length) % views.length;
          } else if (key === "down" || key === "j") {
            viewPickerIndex = (viewPickerIndex + 1) % views.length;
          } else if (key === "enter") {
            // Change current pane's view
            const activePane = panes.find((p) => p.id === this.activePaneId);
            if (activePane) {
              activePane.view = views[viewPickerIndex];
            }
            this.state.showViewPicker = false;
          } else if (key >= "1" && key <= "7") {
            const idx = parseInt(key) - 1;
            if (idx < views.length) {
              const activePane = panes.find((p) => p.id === this.activePaneId);
              if (activePane) {
                activePane.view = views[idx];
              }
              this.state.showViewPicker = false;
            }
          }
          return panes.findIndex((p) => p.id === this.activePaneId);
        }

        // Normal key handling
        if (key === "?" || key === "f1") {
          this.state.showHelp = true;
        } else if (key === "p") {
          this.state.showViewPicker = true;
          viewPickerIndex = 0;
        } else if (key === "n") {
          this.state.showNotifications = !this.state.showNotifications;
        } else if (key === "tab") {
          const currentIndex = panes.findIndex((p) => p.id === this.activePaneId);
          const nextIndex = (currentIndex + 1) % panes.length;
          this.activePaneId = panes[nextIndex].id;
          panes.forEach((p) => p.focused = false);
          panes[nextIndex].focused = true;
        } else if (key === "shift+tab") {
          const currentIndex = panes.findIndex((p) => p.id === this.activePaneId);
          const prevIndex = (currentIndex - 1 + panes.length) % panes.length;
          this.activePaneId = panes[prevIndex].id;
          panes.forEach((p) => p.focused = false);
          panes[prevIndex].focused = true;
        } else if (key >= "1" && key <= "7") {
          // Direct pane navigation
          const idx = parseInt(key) - 1;
          if (idx < panes.length) {
            panes.forEach((p) => p.focused = false);
            panes[idx].focused = true;
            this.activePaneId = panes[idx].id;
          }
        } else if (key === "v") { // Split vertical
          const activePane = panes.find((p) => p.id === this.activePaneId);
          if (activePane && panes.length < 4) {
            const newId = `pane-${panes.length}`;
            const halfWidth = Math.floor(activePane.width / 2);
            activePane.width = halfWidth;
            const newPane: Pane = {
              id: newId,
              view: this.views[panes.length % this.views.length],
              x: activePane.x + halfWidth,
              y: activePane.y,
              width: activePane.width,
              height: activePane.height,
              focused: false,
              maximized: false,
            };
            panes.push(newPane);
            this.notify("Pane split vertically", "info");
          }
        } else if (key === "h") { // Split horizontal
          const activePane = panes.find((p) => p.id === this.activePaneId);
          if (activePane && panes.length < 4) {
            const newId = `pane-${panes.length}`;
            const halfHeight = Math.floor(activePane.height / 2);
            activePane.height = halfHeight;
            const newPane: Pane = {
              id: newId,
              view: this.views[panes.length % this.views.length],
              x: activePane.x,
              y: activePane.y + halfHeight,
              width: activePane.width,
              height: activePane.height,
              focused: false,
              maximized: false,
            };
            panes.push(newPane);
            this.notify("Pane split horizontally", "info");
          }
        } else if (key === "c") { // Close pane
          if (panes.length > 1) {
            const index = panes.findIndex((p) => p.id === this.activePaneId);
            panes.splice(index, 1);
            this.activePaneId = panes[0].id;
            panes[0].focused = true;
            this.notify("Pane closed", "info");
          }
        } else if (key === "z") { // Maximize/restore
          this.maximizePane(this.activePaneId);
        } else if (key === "enter") { // Enter
          // No-op for test
        } else if (key === "s") { // Save layout
          if (this.saveLayout) this.saveLayout();
        } else if (key === "r") { // Restore layout
          if (this.restoreLayout) this.restoreLayout();
        } else if (key === "d") { // Reset to default
          if (this.resetToDefault) this.resetToDefault();
        }
        return panes.findIndex((p) => p.id === this.activePaneId);
      },
      async render() {
        // Test mode render - does nothing
      },
      renderStatusBar() {
        const activePane = panes.find((p) => p.id === this.activePaneId);
        const indicator = renderViewIndicator(panes, this.activePaneId, this.theme);
        const notificationCount = this.state.notifications.filter((n) => !n.dismissed).length;
        const notificationBadge = notificationCount > 0 ? ` 🔔${notificationCount}` : "";
        return `${indicator} │ Active: ${activePane?.view.name}${notificationBadge}`;
      },
      renderViewIndicator() {
        return renderViewIndicator(panes, this.activePaneId, this.theme);
      },
      renderGlobalHelp() {
        return renderGlobalHelpOverlay(this.theme);
      },
      renderNotifications() {
        return renderNotificationPanel(this.state.notifications, this.theme);
      },
      portalManager: {
        service: (portalView as any).service,
        renderPortalList: (portalView as any).renderPortalList.bind(portalView),
      },
      notify(message: string, type: "info" | "success" | "warning" | "error" = "info") {
        const notification = createNotification(message, type);
        this.state.notifications.push(notification);

        // Auto-expire notifications - skip in test mode to avoid timer leaks
        // In production mode, this would auto-dismiss after duration
      },
      dismissNotification(id: string) {
        const notification = this.state.notifications.find((n) => n.id === id);
        if (notification) {
          notification.dismissed = true;
        }
      },
      clearNotifications() {
        this.state.notifications = [];
      },
      accessibility: {
        highContrast: false,
        screenReader: false,
      },
      keybindings: {
        nextView: "Tab",
        prevView: "Shift+Tab",
        notify: "n",
        splitVertical: "v",
        splitHorizontal: "h",
        closePane: "c",
      },
      splitPane(direction: "vertical" | "horizontal") {
        const activePane = panes.find((p) => p.id === this.activePaneId);
        if (!activePane) return;
        const newId = `pane-${panes.length}`;
        if (direction === "vertical") {
          // Split vertically: left-right
          const halfWidth = Math.floor(activePane.width / 2);
          activePane.width = halfWidth;
          const newPane: Pane = {
            id: newId,
            view: views[1], // Default to next view
            x: activePane.x + halfWidth,
            y: activePane.y,
            width: activePane.width,
            height: activePane.height,
            focused: false,
            maximized: false,
          };
          panes.push(newPane);
        } else {
          // Split horizontally: top-bottom
          const halfHeight = Math.floor(activePane.height / 2);
          activePane.height = halfHeight;
          const newPane: Pane = {
            id: newId,
            view: views[1],
            x: activePane.x,
            y: activePane.y + halfHeight,
            width: activePane.width,
            height: activePane.height,
            focused: false,
            maximized: false,
          };
          panes.push(newPane);
        }
      },
      closePane(paneId: string) {
        const index = panes.findIndex((p) => p.id === paneId);
        if (index === -1 || panes.length === 1) return; // Can't close last pane
        panes.splice(index, 1);
        if (this.activePaneId === paneId) {
          this.activePaneId = panes[0].id;
          panes[0].focused = true;
        }
      },
      resizePane(paneId: string, deltaWidth: number, deltaHeight: number) {
        const pane = panes.find((p) => p.id === paneId);
        if (pane) {
          pane.width = Math.max(10, pane.width + deltaWidth);
          pane.height = Math.max(5, pane.height + deltaHeight);
        }
      },
      switchPane(paneId: string) {
        const pane = panes.find((p) => p.id === paneId);
        if (pane) {
          panes.forEach((p) => p.focused = false);
          pane.focused = true;
          this.activePaneId = paneId;
        }
      },
      maximizePane(paneId: string) {
        const pane = panes.find((p) => p.id === paneId);
        if (!pane) return;

        if (pane.maximized) {
          // Restore
          if (pane.previousBounds) {
            pane.x = pane.previousBounds.x;
            pane.y = pane.previousBounds.y;
            pane.width = pane.previousBounds.width;
            pane.height = pane.previousBounds.height;
          }
          pane.maximized = false;
          this.notify("Pane restored", "info");
        } else {
          // Maximize
          pane.previousBounds = { x: pane.x, y: pane.y, width: pane.width, height: pane.height };
          pane.x = 0;
          pane.y = 0;
          pane.width = 80;
          pane.height = 24;
          pane.maximized = true;
          this.notify("Pane maximized", "info");
        }
      },
      restorePane(paneId: string) {
        const pane = panes.find((p) => p.id === paneId);
        if (pane && pane.maximized) {
          this.maximizePane(paneId);
        }
      },
      saveLayout() {
        // Mock save - in production this would write to file
        // For testing, we can override this method
        return Promise.resolve();
      },
      restoreLayout() {
        // Mock restore - in production this would read from file
        // For testing, we can override this method
        return Promise.resolve();
      },
      resetToDefault() {
        // Reset to single pane with PortalManagerView
        panes.length = 0;
        panes.push({
          id: "main",
          view: views[0],
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          focused: true,
          maximized: false,
        });
        this.activePaneId = "main";
        this.state.notifications = [];
        this.notify("Layout reset to default", "info");
      },
    } as TuiDashboard;
  }
  // Production TUI integration using console-based rendering
  // TODO: Replace with full deno-tui integration when available

  // Production state
  const prodState: DashboardViewState = createDefaultDashboardState();
  const prodNotifications: Notification[] = [];

  // Helper to add notification
  const addNotification = (message: string, type: "info" | "success" | "warning" | "error" = "info") => {
    const notification = createNotification(message, type);
    prodNotifications.push(notification);
    // Auto-expire
    if (notification.autoExpire) {
      setTimeout(() => {
        notification.dismissed = true;
      }, notification.duration);
    }
  };

  // Layout persistence
  const layoutFile = `${Deno.env.get("HOME")}/.exoframe/tui_layout.json`;

  const saveLayout = async () => {
    try {
      await Deno.mkdir(`${Deno.env.get("HOME")}/.exoframe`, { recursive: true });
      const layout = {
        panes: panes.map((p) => ({
          id: p.id,
          viewName: p.view.name,
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
          focused: p.focused,
          maximized: p.maximized,
        })),
        activePaneId,
        version: "1.1",
      };
      await Deno.writeTextFile(layoutFile, JSON.stringify(layout, null, 2));
      addNotification("Layout saved", "success");
    } catch (error) {
      addNotification(`Failed to save layout: ${error}`, "error");
    }
  };

  const restoreLayout = async () => {
    try {
      const content = await Deno.readTextFile(layoutFile);
      const layout = JSON.parse(content);
      if ((layout.version === "1.0" || layout.version === "1.1") && layout.panes) {
        panes.length = 0;
        for (const p of layout.panes) {
          const view = views.find((v) => v.name === p.viewName) || views[0];
          panes.push({
            id: p.id,
            view,
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
            focused: p.focused,
            maximized: p.maximized ?? false,
          });
        }
        activePaneId = layout.activePaneId || panes[0]?.id || "main";
        addNotification("Layout restored", "success");
      }
    } catch (_error) {
      // If restore fails, keep default layout
      console.log("Using default layout (restore failed)");
    }
  };

  const resetToDefault = () => {
    panes.length = 0;
    panes.push({
      id: "main",
      view: views[0],
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      focused: true,
      maximized: false,
    });
    activePaneId = "main";
    addNotification("Layout reset to default", "info");
  };

  // Restore layout on startup
  await restoreLayout();

  console.clear();
  console.log("ExoFrame TUI Dashboard");
  console.log("======================");

  const portalView = views[0];

  const render = async () => {
    console.clear();

    // Header with view indicators
    console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
    console.log("║                         ExoFrame TUI Dashboard                               ║");
    console.log("╠══════════════════════════════════════════════════════════════════════════════╣");

    // View indicators
    const viewIndicator = renderViewIndicator(panes, activePaneId, theme);
    console.log(`║ ${viewIndicator.padEnd(76)} ║`);
    console.log("╠══════════════════════════════════════════════════════════════════════════════╣");

    // Help overlay
    if (prodState.showHelp) {
      const helpLines = renderGlobalHelpOverlay(theme);
      for (const line of helpLines) {
        console.log(line);
      }
      console.log("\nPress ? or Esc to close help");
      return;
    }

    // Notification panel
    if (prodState.showNotifications) {
      const notifLines = renderNotificationPanel(prodNotifications, theme);
      for (const line of notifLines) {
        console.log(line);
      }
      console.log("\nPress n to close notifications");
      return;
    }

    // Main content
    const activePane = panes.find((p) => p.id === activePaneId);
    if (activePane?.view.name === "PortalManagerView") {
      const portals = await portalView.service.listPortals();

      if (portals.length > 0) {
        const table = new Table();
        table.header(["Alias", "Target Path", "Status", "Permissions"]);
        for (const p of portals) {
          table.push([p.alias, p.targetPath, p.status, p.permissions]);
        }
        table.render();
      } else {
        console.log("No portals configured.");
      }
    } else {
      const titleBar = renderPaneTitleBar(activePane!, theme);
      console.log(titleBar);
      console.log("");
      console.log(`Viewing: ${activePane?.view.name}`);
      // TODO: Render other views
    }

    // Status bar
    console.log("");
    console.log("╠══════════════════════════════════════════════════════════════════════════════╣");

    // Show active notifications count
    const activeNotifs = prodNotifications.filter((n) => !n.dismissed);
    const notifBadge = activeNotifs.length > 0 ? ` 🔔 ${activeNotifs.length}` : "";

    console.log(`║ Status: Ready${notifBadge.padEnd(64)}║`);
    console.log("╠══════════════════════════════════════════════════════════════════════════════╣");
    console.log("║ Navigation: Tab/Shift+Tab | Split: v/h | Close: c | Maximize: z | Help: ?   ║");
    console.log("║ Layout: s=save, r=restore, d=default | n=notifications | p=view picker      ║");
    console.log("║ Exit: Esc                                                                    ║");
    console.log("╚══════════════════════════════════════════════════════════════════════════════╝");
  };

  await render();

  if (!options.nonInteractive) {
    // Interactive mode: attempt to enable raw mode when possible and provide a line-based fallback
    let rawEnabled = false;
    try {
      const stdinAny = Deno.stdin as any;
      const isTty = typeof stdinAny.isTerminal === "function" && stdinAny.isTerminal();
      if (isTty) {
        rawEnabled = tryEnableRawMode();
        if (!rawEnabled) console.warn("Warning: terminal raw mode not available; keyboard keys will require Enter.");
      } else {
        console.log("Non-tty stdin detected; using line-based input (press Enter after commands).");
      }

      const decoder = new TextDecoder();

      if (rawEnabled) {
        // Raw-mode loop - immediate key sequences
        for await (const chunk of Deno.stdin.readable) {
          const input = decoder.decode(chunk);
          const key = input; // preserve escape sequences

          // Handle help overlay
          if (prodState.showHelp) {
            if (key === "?" || key === "\x1b") {
              prodState.showHelp = false;
              await render();
            }
            continue;
          }

          // Handle notification panel
          if (prodState.showNotifications) {
            if (key === "n" || key === "\x1b") {
              prodState.showNotifications = false;
              await render();
            }
            continue;
          }

          if (key === "\x1b") { // Esc
            break;
          } else if (key === "?") { // Help
            prodState.showHelp = true;
            await render();
          } else if (key === "n") { // Notifications
            prodState.showNotifications = !prodState.showNotifications;
            await render();
          } else if (key === "\t") { // Tab
            const currentIndex = panes.findIndex((p) => p.id === activePaneId);
            const nextIndex = (currentIndex + 1) % panes.length;
            activePaneId = panes[nextIndex].id;
            panes.forEach((p) => p.focused = false);
            panes[nextIndex].focused = true;
            await render();
          } else if (key === "\x1b[Z") { // Shift+Tab (reverse)
            const currentIndex = panes.findIndex((p) => p.id === activePaneId);
            const prevIndex = (currentIndex - 1 + panes.length) % panes.length;
            activePaneId = panes[prevIndex].id;
            panes.forEach((p) => p.focused = false);
            panes[prevIndex].focused = true;
            await render();
          } else if (key >= "1" && key <= "7") { // Direct pane jump
            const idx = parseInt(key) - 1;
            if (idx < panes.length) {
              panes.forEach((p) => p.focused = false);
              panes[idx].focused = true;
              activePaneId = panes[idx].id;
              await render();
            }
          } else if (key === "v") { // Split vertical
            const activePane = panes.find((p) => p.id === activePaneId);
            if (activePane && panes.length < 4) { // Limit to 4 panes
              const newId = `pane-${panes.length}`;
              const halfWidth = Math.floor(activePane.width / 2);
              activePane.width = halfWidth;
              const newPane: Pane = {
                id: newId,
                view: views[panes.length % views.length],
                x: activePane.x + halfWidth,
                y: activePane.y,
                width: activePane.width,
                height: activePane.height,
                focused: false,
                maximized: false,
              };
              panes.push(newPane);
              addNotification("Pane split vertically", "info");
            }
            await render();
          } else if (key === "h") { // Split horizontal
            const activePane = panes.find((p) => p.id === activePaneId);
            if (activePane && panes.length < 4) {
              const newId = `pane-${panes.length}`;
              const halfHeight = Math.floor(activePane.height / 2);
              activePane.height = halfHeight;
              const newPane: Pane = {
                id: newId,
                view: views[panes.length % views.length],
                x: activePane.x,
                y: activePane.y + halfHeight,
                width: activePane.width,
                height: activePane.height,
                focused: false,
                maximized: false,
              };
              panes.push(newPane);
              addNotification("Pane split horizontally", "info");
            }
            await render();
          } else if (key === "c") { // Close pane
            if (panes.length > 1) {
              const index = panes.findIndex((p) => p.id === activePaneId);
              panes.splice(index, 1);
              activePaneId = panes[0].id;
              panes[0].focused = true;
              addNotification("Pane closed", "info");
            }
            await render();
          } else if (key === "z") { // Maximize/restore
            const activePane = panes.find((p) => p.id === activePaneId);
            if (activePane) {
              if (activePane.maximized) {
                if (activePane.previousBounds) {
                  activePane.x = activePane.previousBounds.x;
                  activePane.y = activePane.previousBounds.y;
                  activePane.width = activePane.previousBounds.width;
                  activePane.height = activePane.previousBounds.height;
                }
                activePane.maximized = false;
                addNotification("Pane restored", "info");
              } else {
                activePane.previousBounds = {
                  x: activePane.x,
                  y: activePane.y,
                  width: activePane.width,
                  height: activePane.height,
                };
                activePane.x = 0;
                activePane.y = 0;
                activePane.width = 80;
                activePane.height = 24;
                activePane.maximized = true;
                addNotification("Pane maximized", "info");
              }
            }
            await render();
          } else if (key === "\n") { // Enter
            console.log(`Selected pane: ${panes.find((p) => p.id === activePaneId)?.view.name}`);
            // TODO: Implement pane-specific actions
            await render();
          } else if (key === "s") { // Save layout
            await saveLayout();
            await render();
          } else if (key === "r") { // Restore layout
            await restoreLayout();
            await render();
          } else if (key === "d") { // Reset to default
            resetToDefault();
            await render();
          }
          // Ignore other keys
        }
      } else {
        // Non-raw fallback: read lines from stdin (Enter-terminated commands)
        const { readLines } = await import("https://deno.land/std@0.203.0/io/mod.ts");
        for await (const line of readLines(Deno.stdin)) {
          const cmd = line.trim().toLowerCase();
          if (!cmd) continue;

          // Handle help overlay
          if (prodState.showHelp) {
            if (cmd === "?" || cmd === "esc" || cmd === "escape") {
              prodState.showHelp = false;
              await render();
            }
            continue;
          }

          // Handle notification panel
          if (prodState.showNotifications) {
            if (cmd === "n" || cmd === "esc" || cmd === "escape") {
              prodState.showNotifications = false;
              await render();
            }
            continue;
          }

          if (cmd === "esc" || cmd === "exit" || cmd === "q") break;

          if (cmd === "?") {
            prodState.showHelp = true;
            await render();
            continue;
          }
          if (cmd === "n") {
            prodState.showNotifications = !prodState.showNotifications;
            await render();
            continue;
          }
          if (cmd === "tab") {
            const currentIndex = panes.findIndex((p) => p.id === activePaneId);
            const nextIndex = (currentIndex + 1) % panes.length;
            activePaneId = panes[nextIndex].id;
            panes.forEach((p) => p.focused = false);
            panes[nextIndex].focused = true;
            await render();
            continue;
          }
          if (cmd === "shift+tab" || cmd === "shift-tab") {
            const currentIndex = panes.findIndex((p) => p.id === activePaneId);
            const prevIndex = (currentIndex - 1 + panes.length) % panes.length;
            activePaneId = panes[prevIndex].id;
            panes.forEach((p) => p.focused = false);
            panes[prevIndex].focused = true;
            await render();
            continue;
          }
          if (cmd >= "1" && cmd <= "7") {
            const idx = parseInt(cmd) - 1;
            if (idx < panes.length) {
              panes.forEach((p) => p.focused = false);
              panes[idx].focused = true;
              activePaneId = panes[idx].id;
              await render();
            }
            continue;
          }
          if (cmd === "v") {
            const activePane = panes.find((p) => p.id === activePaneId);
            if (activePane && panes.length < 4) {
              const newId = `pane-${panes.length}`;
              const halfWidth = Math.floor(activePane.width / 2);
              activePane.width = halfWidth;
              const newPane: Pane = {
                id: newId,
                view: views[panes.length % views.length],
                x: activePane.x + halfWidth,
                y: activePane.y,
                width: activePane.width,
                height: activePane.height,
                focused: false,
                maximized: false,
              };
              panes.push(newPane);
              addNotification("Pane split vertically", "info");
            }
            await render();
            continue;
          }
          if (cmd === "h") {
            const activePane = panes.find((p) => p.id === activePaneId);
            if (activePane && panes.length < 4) {
              const newId = `pane-${panes.length}`;
              const halfHeight = Math.floor(activePane.height / 2);
              activePane.height = halfHeight;
              const newPane: Pane = {
                id: newId,
                view: views[panes.length % views.length],
                x: activePane.x,
                y: activePane.y + halfHeight,
                width: activePane.width,
                height: activePane.height,
                focused: false,
                maximized: false,
              };
              panes.push(newPane);
              addNotification("Pane split horizontally", "info");
            }
            await render();
            continue;
          }
          if (cmd === "c") {
            if (panes.length > 1) {
              const index = panes.findIndex((p) => p.id === activePaneId);
              panes.splice(index, 1);
              activePaneId = panes[0].id;
              panes[0].focused = true;
              addNotification("Pane closed", "info");
            }
            await render();
            continue;
          }
          if (cmd === "z") {
            const activePane = panes.find((p) => p.id === activePaneId);
            if (activePane) {
              if (activePane.maximized) {
                if (activePane.previousBounds) {
                  activePane.x = activePane.previousBounds.x;
                  activePane.y = activePane.previousBounds.y;
                  activePane.width = activePane.previousBounds.width;
                  activePane.height = activePane.previousBounds.height;
                }
                activePane.maximized = false;
                addNotification("Pane restored", "info");
              } else {
                activePane.previousBounds = {
                  x: activePane.x,
                  y: activePane.y,
                  width: activePane.width,
                  height: activePane.height,
                };
                activePane.x = 0;
                activePane.y = 0;
                activePane.width = 80;
                activePane.height = 24;
                activePane.maximized = true;
                addNotification("Pane maximized", "info");
              }
            }
            await render();
            continue;
          }
          if (cmd === "enter") {
            console.log(`Selected pane: ${panes.find((p) => p.id === activePaneId)?.view.name}`);
            await render();
            continue;
          }
          if (cmd === "s") {
            await saveLayout();
            await render();
            continue;
          }
          if (cmd === "r") {
            await restoreLayout();
            await render();
            continue;
          }
          if (cmd === "d") {
            resetToDefault();
            await render();
            continue;
          }
        }
      }
    } finally {
      if (rawEnabled) {
        tryDisableRawMode();
      }
    }
  }

  // Save layout on exit
  await saveLayout();

  console.log("Exiting dashboard.");
}

if (import.meta.main) {
  launchTuiDashboard();
}
