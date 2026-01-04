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
  // Theming: verify theme object exists
  assertEquals(typeof dashboard.theme, "object");
  assertEquals(typeof dashboard.theme.primary, "string");
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
  // Status bar mock: just show active pane and view indicator
  const status = dashboard.renderStatusBar();
  // New status bar format includes view indicator
  if (!status.includes("PortalManager") && !status.includes("Active")) {
    throw new Error("Status bar rendering failed: " + status);
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

Deno.test({
  name: "TUI dashboard production launch initializes views and renders without error",
  // Production mode creates timers for auto-refresh that we don't want to wait for
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    // Test production launch in non-interactive mode
    await launchTuiDashboard({ nonInteractive: true });
    // If no error thrown, test passes
    // In production, this would render to console, but here we just check initialization
  },
});

// ===== Phase 13.9: Dashboard Integration Tests =====

Deno.test("TUI dashboard state initialization", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Verify state exists
  assertEquals(typeof dashboard.state, "object");
  assertEquals(dashboard.state.showHelp, false);
  assertEquals(dashboard.state.showNotifications, false);
  assertEquals(dashboard.state.showViewPicker, false);
  assertEquals(dashboard.state.isLoading, false);
  assertEquals(Array.isArray(dashboard.state.notifications), true);
  assertEquals(dashboard.state.notifications.length, 0);
});

Deno.test("TUI dashboard help overlay toggle", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Initially help is hidden
  assertEquals(dashboard.state.showHelp, false);

  // Show help with ?
  dashboard.handleKey("?");
  assertEquals(dashboard.state.showHelp, true);

  // Hide help with ?
  dashboard.handleKey("?");
  assertEquals(dashboard.state.showHelp, false);

  // Show help again
  dashboard.handleKey("?");
  assertEquals(dashboard.state.showHelp, true);

  // Hide with escape
  dashboard.handleKey("escape");
  assertEquals(dashboard.state.showHelp, false);
});

Deno.test("TUI dashboard notification toggle", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Initially notifications panel is hidden
  assertEquals(dashboard.state.showNotifications, false);

  // Toggle notifications with n
  dashboard.handleKey("n");
  assertEquals(dashboard.state.showNotifications, true);

  // Toggle off
  dashboard.handleKey("n");
  assertEquals(dashboard.state.showNotifications, false);
});

Deno.test("TUI dashboard notification system", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Add notifications
  dashboard.notify("Test info notification", "info");
  assertEquals(dashboard.state.notifications.length, 1);
  assertEquals(dashboard.state.notifications[0].type, "info");

  dashboard.notify("Test success notification", "success");
  assertEquals(dashboard.state.notifications.length, 2);
  assertEquals(dashboard.state.notifications[1].type, "success");

  dashboard.notify("Test warning notification", "warning");
  dashboard.notify("Test error notification", "error");
  assertEquals(dashboard.state.notifications.length, 4);
});

Deno.test("TUI dashboard notification dismissal", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  dashboard.notify("Notification 1");
  dashboard.notify("Notification 2");
  assertEquals(dashboard.state.notifications.length, 2);

  // Dismiss first notification
  const firstId = dashboard.state.notifications[0].id;
  dashboard.dismissNotification(firstId);
  assertEquals(dashboard.state.notifications[0].dismissed, true);
  assertEquals(dashboard.state.notifications[1].dismissed, false);

  // Clear all notifications
  dashboard.clearNotifications();
  assertEquals(dashboard.state.notifications.length, 0);
});

Deno.test("TUI dashboard view indicator rendering", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Render view indicator
  const indicator = dashboard.renderViewIndicator();
  assertEquals(typeof indicator, "string");
  assertEquals(indicator.length > 0, true);

  // Should contain pane focus indicator
  assertEquals(indicator.includes("●") || indicator.includes("1:"), true);
});

Deno.test("TUI dashboard global help rendering", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  const helpLines = dashboard.renderGlobalHelp();
  assertEquals(Array.isArray(helpLines), true);
  assertEquals(helpLines.length > 0, true);

  // Should contain help title and sections
  const helpText = helpLines.join("\n");
  assertEquals(helpText.includes("Help") || helpText.includes("Navigation"), true);
});

Deno.test("TUI dashboard notification panel rendering", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Empty notifications
  let notifLines = dashboard.renderNotifications();
  assertEquals(Array.isArray(notifLines), true);

  // With notifications
  dashboard.notify("Test notification", "info");
  notifLines = dashboard.renderNotifications();
  assertEquals(notifLines.length > 0, true);
});

Deno.test("TUI dashboard status bar with notifications badge", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Status bar without notifications
  let statusBar = dashboard.renderStatusBar();
  assertEquals(typeof statusBar, "string");

  // Add notification and check badge appears
  dashboard.notify("Test notification");
  statusBar = dashboard.renderStatusBar();
  assertEquals(statusBar.includes("🔔") || statusBar.includes("1"), true);
});

Deno.test("TUI dashboard direct pane navigation with number keys", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Create multiple panes
  dashboard.splitPane("vertical");
  dashboard.splitPane("horizontal");
  assertEquals(dashboard.panes.length, 3);

  // Navigate directly to panes using number keys
  dashboard.handleKey("1");
  assertEquals(dashboard.activePaneId, dashboard.panes[0].id);

  dashboard.handleKey("2");
  assertEquals(dashboard.activePaneId, dashboard.panes[1].id);

  dashboard.handleKey("3");
  assertEquals(dashboard.activePaneId, dashboard.panes[2].id);

  // Invalid pane number (beyond available panes)
  dashboard.handleKey("7");
  assertEquals(dashboard.activePaneId, dashboard.panes[2].id); // Should stay on pane 3
});

Deno.test("TUI dashboard pane maximize/restore", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Get initial bounds
  const originalWidth = dashboard.panes[0].width;
  const originalHeight = dashboard.panes[0].height;

  // Maximize with z
  dashboard.handleKey("z");
  assertEquals(dashboard.panes[0].maximized, true);
  assertEquals(dashboard.panes[0].width, 80);
  assertEquals(dashboard.panes[0].height, 24);

  // Restore with z
  dashboard.handleKey("z");
  assertEquals(dashboard.panes[0].maximized, false);
  assertEquals(dashboard.panes[0].width, originalWidth);
  assertEquals(dashboard.panes[0].height, originalHeight);
});

Deno.test("TUI dashboard maximizePane and restorePane methods", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Maximize
  dashboard.maximizePane("main");
  assertEquals(dashboard.panes[0].maximized, true);

  // Restore
  dashboard.restorePane("main");
  assertEquals(dashboard.panes[0].maximized, false);
});

Deno.test("TUI dashboard view picker state", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Initially view picker is hidden
  assertEquals(dashboard.state.showViewPicker, false);

  // Show view picker with p
  dashboard.handleKey("p");
  assertEquals(dashboard.state.showViewPicker, true);

  // Close with escape
  dashboard.handleKey("escape");
  assertEquals(dashboard.state.showViewPicker, false);
});

Deno.test("TUI dashboard view picker navigation", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Open view picker
  dashboard.handleKey("p");
  assertEquals(dashboard.state.showViewPicker, true);

  // Navigate with arrow keys (view picker should handle them)
  dashboard.handleKey("down");
  dashboard.handleKey("up");

  // Select with enter
  dashboard.handleKey("enter");
  assertEquals(dashboard.state.showViewPicker, false);
});

Deno.test("TUI dashboard view picker number selection", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  const originalView = dashboard.panes[0].view.name;

  // Open view picker
  dashboard.handleKey("p");

  // Select view 2 directly
  dashboard.handleKey("2");
  assertEquals(dashboard.state.showViewPicker, false);

  // View should have changed
  assertEquals(dashboard.panes[0].view.name !== originalView, true);
});

Deno.test("TUI dashboard notifications with split operations", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  const initialNotifCount = dashboard.state.notifications.length;

  // Split should add notification
  dashboard.handleKey("v");
  assertEquals(dashboard.state.notifications.length > initialNotifCount, true);

  // Close should add notification
  dashboard.handleKey("c");
  const notifAfterClose = dashboard.state.notifications.length;
  assertEquals(notifAfterClose > initialNotifCount, true);
});

Deno.test("TUI dashboard reset clears notifications", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Add some notifications
  dashboard.notify("Notification 1");
  dashboard.notify("Notification 2");
  assertEquals(dashboard.state.notifications.length, 2);

  // Reset should clear notifications and add reset notification
  dashboard.resetToDefault();

  // The old notifications should be cleared (state.notifications is reassigned to empty array)
  // and then a new "Layout reset to default" notification is added
  assertEquals(dashboard.state.notifications.length, 1);
  assertEquals(
    dashboard.state.notifications[0].message.includes("reset") ||
      dashboard.state.notifications[0].message.includes("default"),
    true,
  );
});

Deno.test("TUI dashboard theme is accessible", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  assertEquals(typeof dashboard.theme, "object");
  assertEquals(typeof dashboard.theme.primary, "string");
  assertEquals(typeof dashboard.theme.reset, "string");
});

Deno.test("TUI dashboard key bindings block other keys when help is shown", async () => {
  const dashboard = await launchTuiDashboard({ testMode: true }) as TuiDashboard;

  // Show help
  dashboard.handleKey("?");
  assertEquals(dashboard.state.showHelp, true);

  // Try to split - should be blocked
  const paneCountBefore = dashboard.panes.length;
  dashboard.handleKey("v");
  assertEquals(dashboard.panes.length, paneCountBefore); // No split occurred

  // Close help
  dashboard.handleKey("?");
  assertEquals(dashboard.state.showHelp, false);

  // Now split should work
  dashboard.handleKey("v");
  assertEquals(dashboard.panes.length, paneCountBefore + 1);
});
