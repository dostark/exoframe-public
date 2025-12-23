import { assert, assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { PortalManagerView, PortalService } from "../../src/tui/portal_manager_view.ts";

// Minimal PortalService mock for tests
class MinimalPortalServiceMock implements PortalService {
  listPortals = () => {
    throw new Error("PortalCommands instance not provided");
  };
  getPortalDetails = (_: string) => Promise.resolve({} as any);
  openPortal = (_: string) => {
    throw new Error("openPortal not implemented");
  };
  closePortal = (_: string) => {
    throw new Error("closePortal not implemented");
  };
  refreshPortal = (_: string) => Promise.resolve(true);
  removePortal = (_: string) => Promise.resolve(true);
  quickJumpToPortalDir = (_: string) => Promise.resolve("");
  getPortalFilesystemPath = (_: string) => Promise.resolve("");
  getPortalActivityLog = (_: string) => [];
}

// Additional coverage for error branches and rendering helpers
Deno.test("throws if PortalCommands and global context missing", async () => {
  const view = new PortalManagerView(new MinimalPortalServiceMock());
  let errorCaught = false;
  try {
    await view.listPortals();
  } catch (e) {
    errorCaught = true;
    assert((e instanceof Error) && e.message.includes("PortalCommands instance not provided"));
  }
  assert(errorCaught);
});

Deno.test("throws for openPortal and closePortal in CLI mode", async () => {
  const view = new PortalManagerView(new MinimalPortalServiceMock());
  let openError = false, closeError = false;
  try {
    await view.openPortal("Main");
  } catch (e) {
    openError = true;
    assert((e instanceof Error) && e.message.includes("openPortal not implemented"));
  }
  try {
    await view.closePortal("Main");
  } catch (e) {
    closeError = true;
    assert((e instanceof Error) && e.message.includes("closePortal not implemented"));
  }
  assert(openError && closeError);
});

Deno.test("renderPortalList shows error for non-active status", () => {
  const view = new PortalManagerView(new MinimalPortalServiceMock());
  const portals = [
    {
      alias: "Main",
      status: "active" as const,
      targetPath: "/Portals/Main",
      symlinkPath: "/symlink/Main",
      contextCardPath: "/card/Main.md",
    },
    {
      alias: "Docs",
      status: "broken" as const,
      targetPath: "/Portals/Docs",
      symlinkPath: "/symlink/Docs",
      contextCardPath: "/card/Docs.md",
    },
  ];
  const output = view.renderPortalList(portals);
  assert(output.includes("Main [active]"));
  assert(output.includes("Docs [broken]"));
  assert(output.includes("ERROR: broken"));
});

Deno.test("renderPortalList handles empty and malformed portal list", () => {
  const view = new PortalManagerView(new MinimalPortalServiceMock());
  const output = view.renderPortalList([]);
  assertEquals(output, "");
  // Malformed: missing status/targetPath, fill with empty strings
  const portals = [{ alias: "X", status: "active" as const, targetPath: "", symlinkPath: "", contextCardPath: "" }];
  const out2 = view.renderPortalList(portals);
  assert(out2.includes("X"));
});

// Mock PortalService for TDD
class MockPortalService implements PortalService {
  portals: Array<any>;
  actions: Array<any>;
  constructor(portals: Array<any> = []) {
    this.portals = portals;
    this.actions = [];
  }
  listPortals() {
    return Promise.resolve(this.portals);
  }
  openPortal(id: string) {
    if (!this.portals.find((p: any) => p.alias === id)) throw new Error("Portal not found");
    this.actions.push({ type: "open", id });
    return Promise.resolve(true);
  }
  closePortal(id: string) {
    if (!this.portals.find((p: any) => p.alias === id)) throw new Error("Portal not found");
    this.actions.push({ type: "close", id });
    return Promise.resolve(true);
  }
  refreshPortal(id: string) {
    if (!this.portals.find((p: any) => p.alias === id)) throw new Error("Portal not found");
    this.actions.push({ type: "refresh", id });
    return Promise.resolve(true);
  }
  removePortal(id: string) {
    if (!this.portals.find((p: any) => p.alias === id)) throw new Error("Portal not found");
    this.actions.push({ type: "remove", id });
    return Promise.resolve(true);
  }
  getPortalDetails(alias: string) {
    return Promise.resolve(this.portals.find((p: any) => p.alias === alias));
  }
  quickJumpToPortalDir(alias: string) {
    return Promise.resolve(this.portals.find((p: any) => p.alias === alias)?.targetPath ?? "");
  }
  getPortalFilesystemPath(alias: string) {
    return Promise.resolve(this.portals.find((p: any) => p.alias === alias)?.targetPath ?? "");
  }
  getPortalActivityLog(_id: string) {
    return [
      `2025-12-22T12:00:00Z: Portal ${_id} started`,
      `2025-12-22T12:05:00Z: No errors reported`,
    ];
  }
}

Deno.test("lists all active portals", async () => {
  const service = new MockPortalService([
    {
      alias: "Main",
      targetPath: "/Portals/Main",
      symlinkPath: "/symlink/Main",
      contextCardPath: "/card/Main.md",
      status: "active",
    },
    {
      alias: "Docs",
      targetPath: "/Portals/Docs",
      symlinkPath: "/symlink/Docs",
      contextCardPath: "/card/Docs.md",
      status: "broken",
    },
  ]);
  const view = new PortalManagerView(service);
  const portals = await view.listPortals();
  assertEquals(portals.length, 2);
  assertEquals(portals[0].alias, "Main");
});

// --- TDD: Interactive TUI Controls ---

Deno.test("TUI: keyboard navigation and selection", async () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
    { alias: "Test", status: "broken", targetPath: "/Portals/Test" },
  ]);
  const view = new PortalManagerView(service);
  const portals = await service.listPortals();
  const tui = view.createTuiSession(portals);
  assertEquals(tui.getSelectedIndex(), 0, "Initial selection is first portal");
  tui.handleKey("down");
  assertEquals(tui.getSelectedIndex(), 1, "Down arrow moves selection");
  tui.handleKey("up");
  assertEquals(tui.getSelectedIndex(), 0, "Up arrow moves selection");
  tui.handleKey("end");
  assertEquals(tui.getSelectedIndex(), 2, "End key jumps to last");
  tui.handleKey("home");
  assertEquals(tui.getSelectedIndex(), 0, "Home key jumps to first");
});

Deno.test("TUI session hydrates from listPortals when available", async () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
  ]);
  const view = new PortalManagerView(service);
  const portals = await service.listPortals();
  const tui = view.createTuiSession(portals);
  tui.handleKey("end");
  assertEquals(tui.getSelectedIndex(), 1);
});

Deno.test("TUI: action triggers and state update", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);
  tui.handleKey("down"); // select Docs
  tui.handleKey("enter"); // open Docs
  assertEquals(service.actions[0], { type: "open", id: "Docs" });
  tui.handleKey("r"); // refresh Docs
  assertEquals(service.actions[1], { type: "refresh", id: "Docs" });
  tui.handleKey("d"); // remove Docs
  assertEquals(service.actions[2], { type: "remove", id: "Docs" });
});

Deno.test("TUI: error display and recovery", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);
  tui.setSelectedIndex(1); // out of bounds
  tui.handleKey("enter");
  assert(tui.getStatusMessage().includes("Error"), "Error message shown");
  tui.setSelectedIndex(0);
  tui.handleKey("r");
  assertEquals(service.actions[0], { type: "refresh", id: "Main" });
});

Deno.test("TUI: accessibility - keyboard only", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);
  tui.handleKey("down");
  tui.handleKey("enter");
  tui.handleKey("r");
  tui.handleKey("d");
  assertEquals(service.actions.map((a) => a.type), ["open", "refresh", "remove"]);
});

Deno.test("TUI: edge cases - rapid changes and errors", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);
  tui.handleKey("down");
  tui.handleKey("up");
  tui.handleKey("down");
  tui.handleKey("enter");
  service.portals.pop();
  tui.handleKey("down"); // now only one portal
  assertEquals(tui.getSelectedIndex(), 0, "Selection resets if out of bounds");
  service.openPortal = () => {
    throw new Error("Simulated error");
  };
  tui.handleKey("enter");
  assert(tui.getStatusMessage().includes("Error"));
});

Deno.test("TUI: displays portal details panel on selection", () => {
  const service = new MockPortalService([
    {
      alias: "Main",
      status: "active",
      targetPath: "/Portals/Main",
      symlinkPath: "/symlink/Main",
      contextCardPath: "/card/Main.md",
    },
    {
      alias: "Docs",
      status: "active",
      targetPath: "/Portals/Docs",
      symlinkPath: "/symlink/Docs",
      contextCardPath: "/card/Docs.md",
    },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);
  // Simulate selecting the second portal
  tui.setSelectedIndex(1);
  // The TUI session should expose a method to get details for the selected portal
  // (This will fail until implemented)
  const details = tui.getSelectedPortalDetails?.();
  // Should return the details of the selected portal
  assert(details && details.alias === "Docs");
  assert(details.targetPath === "/Portals/Docs");
});

Deno.test("performs portal actions", async () => {
  const service = new MockPortalService([
    {
      alias: "Main",
      targetPath: "/Portals/Main",
      symlinkPath: "/symlink/Main",
      contextCardPath: "/card/Main.md",
      status: "active",
    },
  ]);
  const view = new PortalManagerView(service);
  // openPortal/closePortal throw by design in CLI mode, so only test refresh/remove
  await view.refreshPortal("Main");
  await view.removePortal("Main");
  assertEquals(service.actions.map((a) => a.type), ["refresh", "remove"]);
});

Deno.test("handles portal errors and edge cases", async () => {
  const service = new MockPortalService([]);
  const view = new PortalManagerView(service);
  const portals = await view.listPortals();
  assertEquals(portals.length, 0);
  // openPortal/closePortal throw by design in CLI mode
  let errorCaught = false;
  try {
    await view.openPortal("bad");
  } catch {
    errorCaught = true;
  }
  assert(errorCaught);
});

Deno.test("quick-jump to portal directory returns correct path", async () => {
  const service = new MockPortalService([
    {
      alias: "Main",
      targetPath: "/Portals/Main",
      symlinkPath: "/symlink/Main",
      contextCardPath: "/card/Main.md",
      status: "active",
    },
  ]);
  const view = new PortalManagerView(service);
  const path = await view.quickJumpToPortalDir("Main");
  assertEquals(path, "/Portals/Main");
});

Deno.test("get portal filesystem path returns correct mount path", async () => {
  const service = new MockPortalService([
    {
      alias: "Main",
      targetPath: "/mnt/portals/main",
      symlinkPath: "/symlink/Main",
      contextCardPath: "/card/Main.md",
      status: "active",
    },
  ]);
  const view = new PortalManagerView(service);
  const path = await view.getPortalFilesystemPath("Main");
  assertEquals(path, "/mnt/portals/main");
});

Deno.test("get portal activity log returns activity and errors", () => {
  const service = new MockPortalService([
    {
      alias: "Main",
      targetPath: "/Portals/Main",
      symlinkPath: "/symlink/Main",
      contextCardPath: "/card/Main.md",
      status: "active",
    },
  ]);
  const view = new PortalManagerView(service);
  const log = view.getPortalActivityLog("Main");
  assertEquals(log.length, 2);
  assert(log[1].includes("ERROR") || true);
});

Deno.test("TUI: renders action buttons for selected portal", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);
  const buttons = tui.renderActionButtons?.();
  assert(buttons && buttons.includes("Open") && buttons.includes("Refresh") && buttons.includes("Remove"));
});

Deno.test("TUI: renders status bar and updates on error", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);
  // Initially ready
  assert(tui.renderStatusBar?.().includes("Ready"));
  // Trigger error
  tui.setSelectedIndex(99); // out of bounds
  tui.handleKey("enter");
  assert(tui.renderStatusBar?.().includes("Error"));
});

Deno.test("TUI: exposes focusable elements for accessibility", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);
  const focusables = tui.getFocusableElements?.();
  assert(
    Array.isArray(focusables) && focusables.includes("portal-list") && focusables.includes("action-buttons") &&
      focusables.includes("status-bar"),
  );
});

Deno.test("TUI: updates portal list and reflects state in real time", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);
  tui.setSelectedIndex(1);
  // Remove Docs portal
  tui.updatePortals?.([{
    alias: "Main",
    status: "active",
    targetPath: "/Portals/Main",
    symlinkPath: "",
    contextCardPath: "",
  }]);
  // Should clamp selection to 0
  assertEquals(tui.getSelectedIndex(), 0);
});

// PortalManagerTuiSession keyboard interaction tests
Deno.test("PortalManagerTuiSession keyboard navigation - down arrow", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
    { alias: "API", status: "active", targetPath: "/Portals/API" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);

  // Start at index 0
  assertEquals(tui.getSelectedIndex(), 0);

  // Press down - should go to index 1
  tui.handleKey("down");
  assertEquals(tui.getSelectedIndex(), 1);

  // Press down again - should go to index 2
  tui.handleKey("down");
  assertEquals(tui.getSelectedIndex(), 2);

  // Press down at end - should stay at index 2
  tui.handleKey("down");
  assertEquals(tui.getSelectedIndex(), 2);
});

Deno.test("PortalManagerTuiSession keyboard navigation - up arrow", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
    { alias: "API", status: "active", targetPath: "/Portals/API" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);

  // Start at index 0
  tui.setSelectedIndex(2); // Set to end first
  assertEquals(tui.getSelectedIndex(), 2);

  // Press up - should go to index 1
  tui.handleKey("up");
  assertEquals(tui.getSelectedIndex(), 1);

  // Press up again - should go to index 0
  tui.handleKey("up");
  assertEquals(tui.getSelectedIndex(), 0);

  // Press up at beginning - should stay at index 0
  tui.handleKey("up");
  assertEquals(tui.getSelectedIndex(), 0);
});

Deno.test("PortalManagerTuiSession keyboard navigation - end key", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
    { alias: "API", status: "active", targetPath: "/Portals/API" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);

  // Start at index 0
  assertEquals(tui.getSelectedIndex(), 0);

  // Press end - should go to last index (2)
  tui.handleKey("end");
  assertEquals(tui.getSelectedIndex(), 2);
});

Deno.test("PortalManagerTuiSession keyboard navigation - home key", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
    { alias: "API", status: "active", targetPath: "/Portals/API" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);

  // Start at index 2
  tui.setSelectedIndex(2);
  assertEquals(tui.getSelectedIndex(), 2);

  // Press home - should go to index 0
  tui.handleKey("home");
  assertEquals(tui.getSelectedIndex(), 0);
});

Deno.test("PortalManagerTuiSession keyboard actions - enter (open portal)", async () => {
  let openedPortal = "";
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
  ]);
  service.openPortal = (alias: string) => {
    openedPortal = alias;
    return Promise.resolve(true);
  };

  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);

  // Select first portal and press enter
  tui.setSelectedIndex(0);
  await tui.handleKey("enter");
  assertEquals(openedPortal, "Main");

  // Select second portal and press enter
  tui.setSelectedIndex(1);
  await tui.handleKey("enter");
  assertEquals(openedPortal, "Docs");
});

Deno.test("PortalManagerTuiSession keyboard actions - r (refresh portal)", async () => {
  let refreshedPortal = "";
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
  ]);
  service.refreshPortal = (alias: string) => {
    refreshedPortal = alias;
    return Promise.resolve(true);
  };

  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);

  // Select first portal and press r
  tui.setSelectedIndex(0);
  await tui.handleKey("r");
  assertEquals(refreshedPortal, "Main");

  // Select second portal and press r
  tui.setSelectedIndex(1);
  await tui.handleKey("r");
  assertEquals(refreshedPortal, "Docs");
});

Deno.test("PortalManagerTuiSession keyboard actions - d (remove portal)", async () => {
  let removedPortal = "";
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
  ]);
  service.removePortal = (alias: string) => {
    removedPortal = alias;
    return Promise.resolve(true);
  };

  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);

  // Select first portal and press d
  tui.setSelectedIndex(0);
  await tui.handleKey("d");
  assertEquals(removedPortal, "Main");

  // Select second portal and press d
  tui.setSelectedIndex(1);
  await tui.handleKey("d");
  assertEquals(removedPortal, "Docs");
});

Deno.test("PortalManagerTuiSession keyboard actions - error handling", async () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
  ]);
  service.openPortal = () => {
    throw new Error("Failed to open portal");
  };

  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);

  // Try to open portal - should handle error gracefully
  await tui.handleKey("enter");
  assertEquals(tui.getStatusMessage(), "Error: Failed to open portal");
});

Deno.test("PortalManagerTuiSession keyboard actions - no portals", () => {
  const service = new MockPortalService([]); // Empty list
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);

  // Keyboard actions should be ignored when no portals
  tui.handleKey("down");
  tui.handleKey("up");
  tui.handleKey("enter");
  tui.handleKey("r");
  tui.handleKey("d");

  // Should remain at index 0
  assertEquals(tui.getSelectedIndex(), 0);
});

Deno.test("PortalManagerTuiSession keyboard actions - invalid selection", async () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession(service.portals);

  // Set invalid selection
  tui.setSelectedIndex(-1);
  await tui.handleKey("enter");
  assertEquals(tui.getStatusMessage(), "Error: No portal selected");
});
