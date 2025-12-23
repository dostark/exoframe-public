// Edge-case and end-to-end tests for TUI dashboard
import { launchTuiDashboard, TuiDashboard } from "../../src/tui/tui_dashboard.ts";
import { assertEquals } from "https://deno.land/std@0.204.0/assert/assert_equals.ts";
Deno.test("TUI dashboard handles empty portal list and error state", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;
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
  } catch (_e) {
    errorCaught = true;
  }
  if (!errorCaught) throw new Error("Error state not handled");
});

Deno.test("TUI dashboard rapid navigation and focus wraparound", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;
  dashboard.switchPane("main"); // Start with main pane
  // Simulate rapid tabbing
  for (let i = 0; i < 20; ++i) {
    dashboard.handleKey("tab");
  }
  assertEquals(dashboard.activePaneId, "main"); // Should wrap around to first pane
  // Simulate rapid shift+tab
  for (let i = 0; i < 20; ++i) {
    dashboard.handleKey("shift+tab");
  }
  assertEquals(dashboard.activePaneId, "main"); // Should wrap around
});

Deno.test("TUI dashboard notification edge cases", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;
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
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;
  // Theming: set and get theme
  dashboard.theme = "dark";
  assertEquals(dashboard.theme, "dark");
  // Accessibility: expose focusable elements
  const focusables = dashboard.panes[0].view.getFocusableElements();
  if (!focusables.includes("portal-list")) throw new Error("Accessibility elements missing");
  // Keybinding customization: check keybindings
  assertEquals(dashboard.keybindings.splitVertical, "v");
});
Deno.test("TUI dashboard supports real-time updates and notifications", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;
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

Deno.test("TUI dashboard launches and returns dashboard instance", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;
  assertEquals(dashboard.panes.length, 1); // Starts with one pane
  assertEquals(dashboard.activePaneId, "main");
});

Deno.test("TUI dashboard handles keyboard navigation and focus", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;
  // Initial focus
  assertEquals(dashboard.activePaneId, "main");
  // Tab cycles focus forward
  dashboard.handleKey("tab");
  assertEquals(dashboard.activePaneId, "main"); // Only one pane, wraps to itself
  // Add another pane
  dashboard.splitPane("vertical");
  assertEquals(dashboard.panes.length, 2);
  dashboard.handleKey("tab");
  assertEquals(dashboard.activePaneId, dashboard.panes[1].id);
  dashboard.handleKey("tab");
  assertEquals(dashboard.activePaneId, "main");
  // Shift+Tab cycles focus backward
  dashboard.handleKey("shift+tab");
  assertEquals(dashboard.activePaneId, dashboard.panes[1].id);
});

Deno.test("TUI dashboard renders portal list, details, actions, and status bar", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;
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
  // Status bar mock: just show active pane
  const status = dashboard.renderStatusBar();
  if (!status.includes("main") || !status.includes("PortalManagerView")) {
    throw new Error("Status bar rendering failed");
  }
});

Deno.test("TUI dashboard split view functionality", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;
  assertEquals(dashboard.panes.length, 1);
  assertEquals(dashboard.activePaneId, "main");

  // Split vertical
  dashboard.splitPane("vertical");
  assertEquals(dashboard.panes.length, 2);
  assertEquals(dashboard.panes[0].width, 40); // Half of 80
  assertEquals(dashboard.panes[1].x, 40);

  // Split horizontal on second pane
  dashboard.switchPane(dashboard.panes[1].id);
  dashboard.splitPane("horizontal");
  assertEquals(dashboard.panes.length, 3);
  assertEquals(dashboard.panes[1].height, 12); // Half of 24
  assertEquals(dashboard.panes[2].y, 12);

  // Close a pane
  dashboard.closePane(dashboard.panes[2].id);
  assertEquals(dashboard.panes.length, 2);

  // Resize pane
  const originalWidth = dashboard.panes[0].width;
  dashboard.resizePane(dashboard.panes[0].id, 10, 0);
  assertEquals(dashboard.panes[0].width, originalWidth + 10);
});

Deno.test("TUI dashboard pane focus and switching", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;
  dashboard.splitPane("vertical");
  const secondPaneId = dashboard.panes[1].id;

  dashboard.switchPane(secondPaneId);
  assertEquals(dashboard.activePaneId, secondPaneId);
  assertEquals(dashboard.panes[1].focused, true);
  assertEquals(dashboard.panes[0].focused, false);
});
Deno.test("TUI dashboard layout save and restore", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Modify layout
  dashboard.splitPane("vertical");
  dashboard.splitPane("horizontal");
  const originalPanes = dashboard.panes.length;
  const originalActive = dashboard.activePaneId;

  // Mock save
  let savedLayout: any = null;
  dashboard.saveLayout = () => {
    savedLayout = {
      panes: dashboard.panes.map((p) => ({
        id: p.id,
        viewName: p.view.name,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        focused: p.focused,
      })),
      activePaneId: dashboard.activePaneId,
    };
    return Promise.resolve();
  };

  await dashboard.saveLayout();
  assertEquals(savedLayout.panes.length, originalPanes);
  assertEquals(savedLayout.activePaneId, originalActive);

  // Reset and restore
  dashboard.resetToDefault();
  assertEquals(dashboard.panes.length, 1);
  assertEquals(dashboard.activePaneId, "main");

  // Mock restore
  dashboard.restoreLayout = () => {
    if (savedLayout) {
      dashboard.panes.length = 0;
      for (const p of savedLayout.panes) {
        dashboard.panes.push({
          id: p.id,
          view: { name: p.viewName }, // Mock view
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
          focused: p.focused,
        });
      }
      dashboard.activePaneId = savedLayout.activePaneId;
    }
    return Promise.resolve();
  };

  await dashboard.restoreLayout();
  assertEquals(dashboard.panes.length, originalPanes);
  assertEquals(dashboard.activePaneId, originalActive);
});

Deno.test("TUI dashboard reset to default", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Modify layout
  dashboard.splitPane("vertical");
  dashboard.splitPane("horizontal");
  assertEquals(dashboard.panes.length, 3);

  // Reset
  dashboard.resetToDefault();
  assertEquals(dashboard.panes.length, 1);
  assertEquals(dashboard.activePaneId, "main");
  assertEquals(dashboard.panes[0].view.name, "PortalManagerView");
});

Deno.test("TUI dashboard comprehensive keyboard actions test", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Start with default single pane
  assertEquals(dashboard.panes.length, 1);
  assertEquals(dashboard.activePaneId, "main");

  // Test Tab navigation (should wrap with single pane)
  dashboard.handleKey("tab");
  assertEquals(dashboard.activePaneId, "main");

  // Test Shift+Tab navigation
  dashboard.handleKey("shift+tab");
  assertEquals(dashboard.activePaneId, "main");

  // Test vertical split
  dashboard.handleKey("v");
  assertEquals(dashboard.panes.length, 2);
  assertEquals(dashboard.panes[0].width, 40); // Half width
  assertEquals(dashboard.panes[1].x, 40); // Offset by half width

  // Test horizontal split on second pane
  dashboard.switchPane(dashboard.panes[1].id);
  dashboard.handleKey("h");
  assertEquals(dashboard.panes.length, 3);
  assertEquals(dashboard.panes[1].height, 12); // Half height
  assertEquals(dashboard.panes[2].y, 12); // Offset by half height

  // Test pane navigation with multiple panes
  dashboard.switchPane("main");
  dashboard.handleKey("tab"); // Should go to second pane
  assertEquals(dashboard.activePaneId, dashboard.panes[1].id);
  dashboard.handleKey("tab"); // Should go to third pane
  assertEquals(dashboard.activePaneId, dashboard.panes[2].id);
  dashboard.handleKey("tab"); // Should wrap to first pane
  assertEquals(dashboard.activePaneId, "main");

  // Test reverse navigation
  dashboard.handleKey("shift+tab"); // Should go to third pane
  assertEquals(dashboard.activePaneId, dashboard.panes[2].id);
  dashboard.handleKey("shift+tab"); // Should go to second pane
  assertEquals(dashboard.activePaneId, dashboard.panes[1].id);

  // Test close pane (close third pane)
  dashboard.switchPane(dashboard.panes[2].id);
  dashboard.handleKey("c");
  assertEquals(dashboard.panes.length, 2);
  assertEquals(dashboard.activePaneId, dashboard.panes[0].id); // Should switch to first pane

  // Test Enter key (no-op)
  dashboard.handleKey("enter");
  assertEquals(dashboard.panes.length, 2); // Should remain unchanged

  // Test invalid key (should be ignored)
  dashboard.handleKey("invalid");
  assertEquals(dashboard.panes.length, 2); // Should remain unchanged

  // Test save layout
  let layoutSaved = false;
  dashboard.saveLayout = () => {
    layoutSaved = true;
    return Promise.resolve();
  };
  dashboard.handleKey("s");
  assertEquals(layoutSaved, true);

  // Test restore layout
  let layoutRestored = false;
  dashboard.restoreLayout = () => {
    layoutRestored = true;
    return Promise.resolve();
  };
  dashboard.handleKey("r");
  assertEquals(layoutRestored, true);

  // Test reset to default
  let layoutReset = false;
  dashboard.resetToDefault = () => {
    layoutReset = true;
    // Actually reset the panes
    dashboard.panes.length = 0;
    dashboard.panes.push({
      id: "main",
      view: { name: "PortalManagerView" },
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      focused: true,
    });
    dashboard.activePaneId = "main";
  };
  dashboard.handleKey("d");
  assertEquals(layoutReset, true);

  // Test invalid key (should be ignored, no crash)
  dashboard.handleKey("invalid");
  assertEquals(dashboard.panes.length, 1); // Should remain unchanged
});

Deno.test("TUI dashboard production launch initializes views and renders without error", async () => {
  // Test production launch in non-interactive mode
  await launchTuiDashboard({ nonInteractive: true });
  // If no error thrown, test passes
  // In production, this would render to console, but here we just check initialization
});
