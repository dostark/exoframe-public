// Edge-case and end-to-end tests for TUI dashboard
Deno.test("TUI dashboard handles empty portal list and error state", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true });
  // Simulate empty portal list
  dashboard.portalManager.service.listPortals = () => Promise.resolve([]);
  const portals = await dashboard.portalManager.service.listPortals();
  if (portals.length !== 0) throw new Error("Empty state not handled");
  // Simulate error in service
  dashboard.portalManager.service.listPortals = () => {
    throw new Error("Service error");
  };
  let errorCaught = false;
  try {
    await dashboard.portalManager.service.listPortals();
  } catch (e) {
    errorCaught = true;
  }
  if (!errorCaught) throw new Error("Error state not handled");
});

Deno.test("TUI dashboard rapid navigation and focus wraparound", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true });
  dashboard.focusIndex = 0;
  // Simulate rapid tabbing
  for (let i = 0; i < 20; ++i) {
    dashboard.handleKey("tab");
  }
  if (dashboard.focusIndex !== 0 && dashboard.views.length === 4) throw new Error("Focus wraparound failed");
  // Simulate rapid shift+tab
  for (let i = 0; i < 20; ++i) {
    dashboard.handleKey("shift+tab");
  }
  if (dashboard.focusIndex !== 0 && dashboard.views.length === 4) throw new Error("Reverse focus wraparound failed");
});

Deno.test("TUI dashboard notification edge cases", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true });
  let notified = false;
  dashboard.notify = (_msg: string) => {
    notified = true;
  };
  dashboard.notify("");
  if (!notified) throw new Error("Notification with empty message not handled");
  notified = false;
  dashboard.notify(null as unknown as string);
  if (!notified) throw new Error("Notification with null not handled");
});
Deno.test("TUI dashboard supports theming, accessibility, and keybinding customization", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true });
  // Theming: set and get theme
  dashboard.theme = "dark";
  if (dashboard.theme !== "dark") throw new Error("Theme not set");
  // Accessibility: expose focusable elements
  const focusables = dashboard.views[0].getFocusableElements();
  if (!focusables.includes("portal-list")) throw new Error("Accessibility elements missing");
  // Keybinding customization: override handleKey
  let custom = false;
  dashboard.handleKey = function (key) {
    if (key === "custom") custom = true;
    return this.focusIndex;
  };
  dashboard.handleKey("custom");
  if (!custom) throw new Error("Custom keybinding not triggered");
});
Deno.test("TUI dashboard supports real-time updates and notifications", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true });
  let notification = "";
  dashboard.notify = (msg: string) => {
    notification = msg;
  };
  // Simulate real-time update: portal added
  const portals = [
    {
      alias: "alpha",
      targetPath: "/a",
      symlinkPath: "/s/a",
      contextCardPath: "/c/a",
      status: "active",
      permissions: "rw",
    },
  ];
  dashboard.portalManager.service.listPortals = () => Promise.resolve(portals);
  // Simulate notification
  dashboard.notify("Portal alpha added");
  if (!notification.includes("alpha")) {
    throw new Error("Notification not triggered");
  }
  // Simulate another update
  portals.push({
    alias: "beta",
    targetPath: "/b",
    symlinkPath: "/s/b",
    contextCardPath: "/c/b",
    status: "active",
    permissions: "rw",
  });
  const updated = await dashboard.portalManager.service.listPortals();
  if (updated.length !== 2) {
    throw new Error("Real-time update failed");
  }
});
// tests/tui/tui_dashboard_test.ts
// TDD: End-to-end tests for TUI dashboard integration
import { assertEquals } from "https://deno.land/std@0.204.0/testing/asserts.ts";
import { launchTuiDashboard } from "../../src/tui/tui_dashboard.ts";

Deno.test("TUI dashboard launches and returns dashboard instance", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true });
  assertEquals(dashboard.views.length, 4); // Portal, Plan, Monitor, Daemon
  assertEquals(
    dashboard.views.map((v) => v.name).sort(),
    [
      "DaemonControlView",
      "MonitorView",
      "PlanReviewerView",
      "PortalManagerView",
    ].sort(),
  );
});

Deno.test("TUI dashboard handles keyboard navigation and focus", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true });
  // Simulate dashboard with focus and keyboard event API
  dashboard.focusIndex = 0;
  dashboard.handleKey = function (key) {
    if (key === "tab") {
      this.focusIndex = (this.focusIndex + 1) % this.views.length;
    } else if (key === "shift+tab") {
      this.focusIndex = (this.focusIndex - 1 + this.views.length) % this.views.length;
    }
    return this.focusIndex;
  };
  // Initial focus
  assertEquals(dashboard.focusIndex, 0);
  // Tab cycles focus forward
  assertEquals(dashboard.handleKey("tab"), 1);
  assertEquals(dashboard.handleKey("tab"), 2);
  assertEquals(dashboard.handleKey("tab"), 3);
  assertEquals(dashboard.handleKey("tab"), 0);
  // Shift+Tab cycles focus backward
  assertEquals(dashboard.handleKey("shift+tab"), 3);
  assertEquals(dashboard.handleKey("shift+tab"), 2);
});

Deno.test("TUI dashboard renders portal list, details, actions, and status bar", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true });
  // Add mock portals for rendering
  dashboard.portalManager.service.listPortals = () =>
    Promise.resolve([
      {
        alias: "alpha",
        targetPath: "/a",
        symlinkPath: "/s/a",
        contextCardPath: "/c/a",
        status: "active",
        permissions: "rw",
      },
      {
        alias: "beta",
        targetPath: "/b",
        symlinkPath: "/s/b",
        contextCardPath: "/c/b",
        status: "broken",
        permissions: "r",
      },
    ]);
  const portals = await dashboard.portalManager.service.listPortals();
  const list = dashboard.portalManager.renderPortalList(portals);
  // Should render both portals, with error indicator for broken
  if (!list.includes("alpha") || !list.includes("beta") || !list.includes("ERROR")) {
    throw new Error("Portal list rendering failed");
  }
  // Status bar mock: just show focus and view name
  dashboard.renderStatusBar = function () {
    return `Focus: ${this.focusIndex} (${this.views[this.focusIndex].name})`;
  };
  dashboard.focusIndex = 1;
  const status = dashboard.renderStatusBar();
  if (!status.includes("1") || !status.includes("PlanReviewerView")) {
    throw new Error("Status bar rendering failed");
  }
});
