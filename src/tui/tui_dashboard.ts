// TUI Entrypoint for unified dashboard
// Launches PortalManagerView and integrates all TUI views

import { PortalManagerView } from "./portal_manager_view.ts";
import { PlanReviewerView } from "./plan_reviewer_view.ts";
import { MonitorView } from "./monitor_view.ts";
import { DaemonControlView } from "./daemon_control_view.ts";
import { AgentStatusView } from "./agent_status_view.ts";
import {
  MockAgentService,
  MockDaemonService,
  MockLogService,
  MockPlanService,
  MockPortalService,
} from "./tui_dashboard_mocks.ts";
// import { denoTui } from "deno-tui"; // Uncomment and configure as needed
import { Table } from "https://deno.land/x/cliffy@v0.25.7/mod.ts";

export interface Pane {
  id: string;
  view: any;
  x: number;
  y: number;
  width: number;
  height: number;
  focused: boolean;
}

export interface TuiDashboard {
  panes: Pane[];
  activePaneId: string;
  handleKey(key: string): number;
  renderStatusBar(): string;
  portalManager: {
    service: any;
    renderPortalList: (portals: any[]) => string;
  };
  notify(msg: string): void;
  theme: string;
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
  splitPane(direction: "vertical" | "horizontal"): void;
  closePane(paneId: string): void;
  resizePane(paneId: string, deltaWidth: number, deltaHeight: number): void;
  switchPane(paneId: string): void;
  saveLayout(): Promise<void>;
  restoreLayout(): Promise<void>;
  resetToDefault(): void;
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
  const views = [
    Object.assign(new PortalManagerView(portalService), { name: "PortalManagerView" }),
    Object.assign(new PlanReviewerView(planService), { name: "PlanReviewerView" }),
    Object.assign(new MonitorView(logService), { name: "MonitorView" }),
    Object.assign(new DaemonControlView(daemonService), { name: "DaemonControlView" }),
    Object.assign(new AgentStatusView(agentService), { name: "AgentStatusView" }),
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
  };
  const panes: Pane[] = [initialPane];
  let activePaneId = "main";

  if (options.testMode) {
    // Return a testable dashboard object with panes, keyboard nav, and rendering
    const portalView = views[0];
    return {
      panes,
      activePaneId,
      handleKey(key: string) {
        if (key === "tab") {
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
        }
        return panes.findIndex((p) => p.id === this.activePaneId);
      },
      renderStatusBar() {
        const activePane = panes.find((p) => p.id === this.activePaneId);
        return `Active Pane: ${activePane?.id} (${activePane?.view.name})`;
      },
      portalManager: {
        service: (portalView as any).service,
        renderPortalList: (portalView as any).renderPortalList.bind(portalView),
      },
      notify(_msg: string) {
        // No-op for test, can be overridden in test
      },
      theme: "light",
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
      async saveLayout() {
        // Mock save - in production this would write to file
        // For testing, we can override this method
        return Promise.resolve();
      },
      async restoreLayout() {
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
        });
        this.activePaneId = "main";
      },
    } as TuiDashboard;
  }
  // Production TUI integration using console-based rendering
  // TODO: Replace with full deno-tui integration when available

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
        })),
        activePaneId,
        version: "1.0",
      };
      await Deno.writeTextFile(layoutFile, JSON.stringify(layout, null, 2));
    } catch (error) {
      console.error("Failed to save layout:", error);
    }
  };

  const restoreLayout = async () => {
    try {
      const content = await Deno.readTextFile(layoutFile);
      const layout = JSON.parse(content);
      if (layout.version === "1.0" && layout.panes) {
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
          });
        }
        activePaneId = layout.activePaneId || panes[0]?.id || "main";
      }
    } catch (error) {
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
    });
    activePaneId = "main";
  };

  // Restore layout on startup
  await restoreLayout();

  console.clear();
  console.log("ExoFrame TUI Dashboard");
  console.log("======================");

  const portalView = views[0];

  const render = async () => {
    console.clear();
    console.log("ExoFrame TUI Dashboard");
    console.log("======================");
    console.log(`Active Pane: ${panes.find((p) => p.id === activePaneId)?.view.name} (${panes.length} panes)`);
    console.log("");

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
      console.log(`Viewing: ${activePane?.view.name}`);
      // TODO: Render other views
    }

    console.log("\nStatus: Ready");
    console.log("Navigation: Tab/Shift+Tab to switch panes, v/h to split, c to close pane, Esc to exit");
    console.log("Layout: s to save, r to restore, d to reset to default");
    console.log("Actions: Portal actions available via CLI (exoctl portal)");
  };

  await render();

  if (!options.nonInteractive) {
    // Interactive mode: handle keyboard input
    const decoder = new TextDecoder();
    for await (const chunk of Deno.stdin.readable) {
      const input = decoder.decode(chunk);
      const key = input.trim();

      if (key === "\x1b") { // Esc
        break;
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
          };
          panes.push(newPane);
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
          };
          panes.push(newPane);
        }
        await render();
      } else if (key === "c") { // Close pane
        if (panes.length > 1) {
          const index = panes.findIndex((p) => p.id === activePaneId);
          panes.splice(index, 1);
          activePaneId = panes[0].id;
          panes[0].focused = true;
        }
        await render();
      } else if (key === "\n") { // Enter
        console.log(`Selected pane: ${panes.find((p) => p.id === activePaneId)?.view.name}`);
        // TODO: Implement pane-specific actions
        await render();
      } else if (key === "s") { // Save layout
        await saveLayout();
        console.log("Layout saved.");
        await render();
      } else if (key === "r") { // Restore layout
        await restoreLayout();
        console.log("Layout restored.");
        await render();
      } else if (key === "d") { // Reset to default
        resetToDefault();
        console.log("Reset to default layout.");
        await render();
      }
      // Ignore other keys
    }
  }

  // Save layout on exit
  await saveLayout();

  console.log("Exiting dashboard.");
}

if (import.meta.main) {
  launchTuiDashboard();
}
