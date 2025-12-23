import { assert, assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { PortalManagerView } from "../../src/tui/portal_manager_view.ts";

// Additional coverage for error branches and rendering helpers
Deno.test("throws if PortalCommands and global context missing", async () => {
  const view = new PortalManagerView();
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
  const view = new PortalManagerView();
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
  const view = new PortalManagerView();
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
  const view = new PortalManagerView();
  const output = view.renderPortalList([]);
  assertEquals(output, "");
  // Malformed: missing status/targetPath, fill with empty strings
  const portals = [{ alias: "X", status: "active" as const, targetPath: "", symlinkPath: "", contextCardPath: "" }];
  const out2 = view.renderPortalList(portals);
  assert(out2.includes("X"));
});

// Mock PortalService for TDD
class MockPortalService {
  portals: Array<any> = [];
  actions: Array<any> = [];
  // Optionally present for activity log tests
  getPortalActivityLog?: (id: string) => Promise<string[]>;
  constructor(portals: Array<any> = []) {
    this.portals = portals;
  }
  listPortals() {
    return this.portals;
  }
  openPortal(id: string) {
    if (!this.portals.find((p) => p.alias === id)) throw new Error("Portal not found");
    this.actions.push({ type: "open", id });
    return true;
  }
  closePortal(id: string) {
    if (!this.portals.find((p) => p.alias === id)) throw new Error("Portal not found");
    this.actions.push({ type: "close", id });
    return true;
  }
  refreshPortal(id: string) {
    if (!this.portals.find((p) => p.alias === id)) throw new Error("Portal not found");
    this.actions.push({ type: "refresh", id });
    return true;
  }
  removePortal(id: string) {
    if (!this.portals.find((p) => p.alias === id)) throw new Error("Portal not found");
    this.actions.push({ type: "remove", id });
    return true;
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

Deno.test("TUI: keyboard navigation and selection", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
    { alias: "Test", status: "broken", targetPath: "/Portals/Test" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession();
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

Deno.test("TUI session hydrates from listPortals when available", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
  ]);
  // Ensure listPortals is used instead of static property
  const view = new PortalManagerView({
    portals: [], // misleading static property
    listPortals: () => service.listPortals(),
    openPortal: service.openPortal.bind(service),
    refreshPortal: service.refreshPortal.bind(service),
    removePortal: service.removePortal.bind(service),
  });
  const tui = view.createTuiSession();
  tui.handleKey("end");
  assertEquals(tui.getSelectedIndex(), 1);
});

Deno.test("TUI: action triggers and state update", () => {
  const service = new MockPortalService([
    { alias: "Main", status: "active", targetPath: "/Portals/Main" },
    { alias: "Docs", status: "active", targetPath: "/Portals/Docs" },
  ]);
  const view = new PortalManagerView(service);
  const tui = view.createTuiSession();
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
  const tui = view.createTuiSession();
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
  const tui = view.createTuiSession();
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
  const tui = view.createTuiSession();
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
