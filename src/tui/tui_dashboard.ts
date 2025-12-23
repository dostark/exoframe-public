// TUI Entrypoint for unified dashboard
// Launches PortalManagerView and integrates all TUI views

import { PortalManagerView } from "./portal_manager_view.ts";
import { PlanReviewerView } from "./plan_reviewer_view.ts";
import { MonitorView } from "./monitor_view.ts";
import { DaemonControlView } from "./daemon_control_view.ts";
import { MockDaemonService, MockLogService, MockPlanService, MockPortalService } from "./tui_dashboard_mocks.ts";
// import { denoTui } from "deno-tui"; // Uncomment and configure as needed

export function launchTuiDashboard(options: { testMode?: boolean } = {}) {
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
    };
  }
  // TODO: Integrate deno-tui and all views into a unified dashboard for production
  // Example: const tui = new denoTui(...);
  // views.forEach(v => tui.addView(v));
  // tui.run();
  throw new Error("TUI dashboard integration not yet implemented");
}

if (import.meta.main) {
  launchTuiDashboard();
}
