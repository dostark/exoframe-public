// TUI Entrypoint for unified dashboard
// Launches PortalManagerView and integrates all TUI views

import { PortalManagerView } from "./portal_manager_view.ts";
import { PlanReviewerView } from "./plan_reviewer_view.ts";
import { MonitorView } from "./monitor_view.ts";
import { DaemonControlView } from "./daemon_control_view.ts";
import { MockDaemonService, MockLogService, MockPlanService, MockPortalService } from "./tui_dashboard_mocks.ts";
// import { denoTui } from "deno-tui"; // Uncomment and configure as needed
import { Table } from "https://deno.land/x/cliffy@v0.25.7/mod.ts";

export interface TuiDashboard {
  views: any[];
  focusIndex: number;
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
  };
}

export async function launchTuiDashboard(
  options: { testMode?: boolean; nonInteractive?: boolean } = {},
): Promise<TuiDashboard | undefined> {
  // Minimal idiomatic dashboard object for TDD
  const portalService = new MockPortalService();
  const planService = new MockPlanService();
  const logService = new MockLogService();
  const daemonService = new MockDaemonService();
  const views = [
    Object.assign(new PortalManagerView(portalService), { name: "PortalManagerView" }),
    Object.assign(new PlanReviewerView(planService), { name: "PlanReviewerView" }),
    Object.assign(new MonitorView(logService), { name: "MonitorView" }),
    Object.assign(new DaemonControlView(daemonService), { name: "DaemonControlView" }),
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
  if (options.testMode) {
    // Return a testable dashboard object with focus, keyboard nav, and rendering
    // Expose service and renderPortalList for PortalManagerView for test safety
    const portalView = views[0];
    return {
      views,
      focusIndex: 0,
      handleKey(key: string) {
        if (key === "tab") {
          this.focusIndex = (this.focusIndex + 1) % this.views.length;
        } else if (key === "shift+tab") {
          this.focusIndex = (this.focusIndex - 1 + this.views.length) % this.views.length;
        }
        return this.focusIndex;
      },
      renderStatusBar() {
        return `Focus: ${this.focusIndex} (${this.views[this.focusIndex].name})`;
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
      },
    } as TuiDashboard;
  }
  // Production TUI integration using console-based rendering
  // TODO: Replace with full deno-tui integration when available
  console.clear();
  console.log("ExoFrame TUI Dashboard");
  console.log("======================");

  const portalView = views[0];
  let focusIndex = 0;

  const render = async () => {
    console.clear();
    console.log("ExoFrame TUI Dashboard");
    console.log("======================");
    console.log(`Focus: ${views[focusIndex].name}`);
    console.log("");

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

    console.log("\nStatus: Ready");
    console.log("Navigation: Tab/Shift+Tab to switch views, Enter to select, Esc to exit");
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
        focusIndex = (focusIndex + 1) % views.length;
        await render();
      } else if (key === "\x1b[Z") { // Shift+Tab (reverse)
        focusIndex = (focusIndex - 1 + views.length) % views.length;
        await render();
      } else if (key === "\n") { // Enter
        console.log(`Selected view: ${views[focusIndex].name}`);
        // TODO: Implement view-specific actions
        await render();
      }
      // Ignore other keys
    }
  }

  console.log("Exiting dashboard.");
}

if (import.meta.main) {
  launchTuiDashboard();
}
