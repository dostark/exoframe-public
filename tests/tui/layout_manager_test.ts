/**
 * Layout Manager Tests
 *
 * Part of Phase 13.11: Split View Enhancement
 *
 * Tests for:
 * - Layout presets
 * - Pane operations (split, close, resize, swap, maximize)
 * - Named layouts
 * - Layout serialization
 * - Layout dialogs
 */

import { assertEquals, assertThrows } from "https://deno.land/std@0.203.0/assert/mod.ts";
import {
  createLayoutManager,
  LAYOUT_PRESETS,
  type LayoutPane,
  MAX_PANES,
  MIN_PANE_HEIGHT,
  MIN_PANE_WIDTH,
  renderLayoutPresetPicker,
  renderPaneBorder,
  renderResizeIndicator,
} from "../../src/tui/utils/layout_manager.ts";
import {
  AVAILABLE_VIEWS,
  createLayoutPresetState,
  createNamedLayoutState,
  createResizeModeState,
  createViewPickerState,
  handleLayoutPresetKey,
  handleNamedLayoutKey,
  handleViewPickerKey,
  LAYOUT_PRESET_INFO,
  renderLayoutPresetDialog,
  renderNamedLayoutDialog,
  renderResizeModeIndicator,
  renderSwapIndicator,
  renderViewPickerDialog,
} from "../../src/tui/dialogs/layout_dialogs.ts";
import { getTheme } from "../../src/tui/utils/colors.ts";

const theme = getTheme(true);

// ===== Layout Manager Tests =====

Deno.test("LayoutManager: creates with default dimensions", () => {
  const manager = createLayoutManager();
  const size = manager.getTerminalSize();
  assertEquals(size.width, 80);
  assertEquals(size.height, 24);
});

Deno.test("LayoutManager: creates with custom dimensions", () => {
  const manager = createLayoutManager(120, 40);
  const size = manager.getTerminalSize();
  assertEquals(size.width, 120);
  assertEquals(size.height, 40);
});

Deno.test("LayoutManager: setTerminalSize updates dimensions", () => {
  const manager = createLayoutManager();
  manager.setTerminalSize(100, 30);
  const size = manager.getTerminalSize();
  assertEquals(size.width, 100);
  assertEquals(size.height, 30);
});

// ===== Preset Tests =====

Deno.test("LayoutManager: getPresets returns all presets", () => {
  const manager = createLayoutManager();
  const presets = manager.getPresets();
  assertEquals(presets.length, LAYOUT_PRESETS.length);
  assertEquals(presets.length, 6);
});

Deno.test("LayoutManager: getPresetById returns correct preset", () => {
  const manager = createLayoutManager();
  const single = manager.getPresetById("single");
  assertEquals(single?.name, "Single");

  const quad = manager.getPresetById("quad");
  assertEquals(quad?.name, "Quad");
});

Deno.test("LayoutManager: getPresetById returns undefined for unknown", () => {
  const manager = createLayoutManager();
  const unknown = manager.getPresetById("unknown");
  assertEquals(unknown, undefined);
});

Deno.test("LayoutManager: getPresetByShortcut returns correct preset", () => {
  const manager = createLayoutManager();
  const preset = manager.getPresetByShortcut("2");
  assertEquals(preset?.id, "side-by-side");
});

Deno.test("LayoutManager: applyPreset - single creates one pane", () => {
  const manager = createLayoutManager(80, 24);
  const panes = manager.applyPreset("single", ["PortalManagerView"]);

  assertEquals(panes.length, 1);
  assertEquals(panes[0].width, 80);
  assertEquals(panes[0].height, 24);
  assertEquals(panes[0].viewName, "PortalManagerView");
});

Deno.test("LayoutManager: applyPreset - side-by-side creates two panes", () => {
  const manager = createLayoutManager(80, 24);
  const panes = manager.applyPreset("side-by-side", ["PortalManagerView", "MonitorView"]);

  assertEquals(panes.length, 2);
  assertEquals(panes[0].x, 0);
  assertEquals(panes[0].width, 40);
  assertEquals(panes[1].x, 40);
  assertEquals(panes[1].width, 40);
});

Deno.test("LayoutManager: applyPreset - stacked creates two panes", () => {
  const manager = createLayoutManager(80, 24);
  const panes = manager.applyPreset("stacked", ["PortalManagerView", "MonitorView"]);

  assertEquals(panes.length, 2);
  assertEquals(panes[0].y, 0);
  assertEquals(panes[0].height, 12);
  assertEquals(panes[1].y, 12);
  assertEquals(panes[1].height, 12);
});

Deno.test("LayoutManager: applyPreset - quad creates four panes", () => {
  const manager = createLayoutManager(80, 24);
  const panes = manager.applyPreset("quad", [
    "PortalManagerView",
    "PlanReviewerView",
    "MonitorView",
    "DaemonControlView",
  ]);

  assertEquals(panes.length, 4);
  // Top-left
  assertEquals(panes[0].x, 0);
  assertEquals(panes[0].y, 0);
  // Top-right
  assertEquals(panes[1].x, 40);
  assertEquals(panes[1].y, 0);
  // Bottom-left
  assertEquals(panes[2].x, 0);
  assertEquals(panes[2].y, 12);
  // Bottom-right
  assertEquals(panes[3].x, 40);
  assertEquals(panes[3].y, 12);
});

Deno.test("LayoutManager: applyPreset throws for unknown preset", () => {
  const manager = createLayoutManager();
  assertThrows(
    () => manager.applyPreset("unknown", []),
    Error,
    "Unknown layout preset",
  );
});

// ===== Split Pane Tests =====

Deno.test("LayoutManager: splitPane - vertical split", () => {
  const manager = createLayoutManager(80, 24);
  const panes: LayoutPane[] = [{
    id: "main",
    viewName: "PortalManagerView",
    x: 0,
    y: 0,
    width: 80,
    height: 24,
    focused: true,
  }];

  const result = manager.splitPane(panes, "main", "vertical", "MonitorView");

  assertEquals(result.length, 2);
  assertEquals(panes[0].width, 40);
  assertEquals(result[1].x, 40);
  assertEquals(result[1].width, 40);
  assertEquals(result[1].viewName, "MonitorView");
});

Deno.test("LayoutManager: splitPane - horizontal split", () => {
  const manager = createLayoutManager(80, 24);
  const panes: LayoutPane[] = [{
    id: "main",
    viewName: "PortalManagerView",
    x: 0,
    y: 0,
    width: 80,
    height: 24,
    focused: true,
  }];

  const result = manager.splitPane(panes, "main", "horizontal", "MonitorView");

  assertEquals(result.length, 2);
  assertEquals(panes[0].height, 12);
  assertEquals(result[1].y, 12);
  assertEquals(result[1].height, 12);
});

Deno.test("LayoutManager: splitPane throws when max panes reached", () => {
  const manager = createLayoutManager();
  const panes: LayoutPane[] = [];
  for (let i = 0; i < MAX_PANES; i++) {
    panes.push({
      id: `pane-${i}`,
      viewName: "PortalManagerView",
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      focused: i === 0,
    });
  }

  assertThrows(
    () => manager.splitPane(panes, "pane-0", "vertical", "MonitorView"),
    Error,
    "Maximum panes",
  );
});

Deno.test("LayoutManager: splitPane throws for pane too narrow", () => {
  const manager = createLayoutManager();
  const panes: LayoutPane[] = [{
    id: "main",
    viewName: "PortalManagerView",
    x: 0,
    y: 0,
    width: MIN_PANE_WIDTH,
    height: 24,
    focused: true,
  }];

  assertThrows(
    () => manager.splitPane(panes, "main", "vertical", "MonitorView"),
    Error,
    "too narrow",
  );
});

Deno.test("LayoutManager: splitPane throws for pane too short", () => {
  const manager = createLayoutManager();
  const panes: LayoutPane[] = [{
    id: "main",
    viewName: "PortalManagerView",
    x: 0,
    y: 0,
    width: 80,
    height: MIN_PANE_HEIGHT,
    focused: true,
  }];

  assertThrows(
    () => manager.splitPane(panes, "main", "horizontal", "MonitorView"),
    Error,
    "too short",
  );
});

// ===== Close Pane Tests =====

Deno.test("LayoutManager: closePane removes pane and expands adjacent", () => {
  const manager = createLayoutManager(80, 24);
  const panes: LayoutPane[] = [
    { id: "left", viewName: "PortalManagerView", x: 0, y: 0, width: 40, height: 24, focused: true },
    { id: "right", viewName: "MonitorView", x: 40, y: 0, width: 40, height: 24, focused: false },
  ];

  const result = manager.closePane(panes, "right");

  assertEquals(result.length, 1);
  assertEquals(result[0].id, "left");
  assertEquals(result[0].width, 80);
});

Deno.test("LayoutManager: closePane throws for last pane", () => {
  const manager = createLayoutManager();
  const panes: LayoutPane[] = [{
    id: "main",
    viewName: "PortalManagerView",
    x: 0,
    y: 0,
    width: 80,
    height: 24,
    focused: true,
  }];

  assertThrows(
    () => manager.closePane(panes, "main"),
    Error,
    "Cannot close the last pane",
  );
});

Deno.test("LayoutManager: closePane throws for unknown pane", () => {
  const manager = createLayoutManager();
  const panes: LayoutPane[] = [
    { id: "main", viewName: "PortalManagerView", x: 0, y: 0, width: 40, height: 24, focused: true },
    { id: "other", viewName: "MonitorView", x: 40, y: 0, width: 40, height: 24, focused: false },
  ];

  assertThrows(
    () => manager.closePane(panes, "unknown"),
    Error,
    "Pane not found",
  );
});

// ===== Swap Panes Tests =====

Deno.test("LayoutManager: swapPanes swaps view names", () => {
  const manager = createLayoutManager();
  const panes: LayoutPane[] = [
    { id: "left", viewName: "PortalManagerView", x: 0, y: 0, width: 40, height: 24, focused: true },
    { id: "right", viewName: "MonitorView", x: 40, y: 0, width: 40, height: 24, focused: false },
  ];

  manager.swapPanes(panes, "left", "right");

  assertEquals(panes[0].viewName, "MonitorView");
  assertEquals(panes[1].viewName, "PortalManagerView");
});

Deno.test("LayoutManager: swapPanes throws for unknown pane", () => {
  const manager = createLayoutManager();
  const panes: LayoutPane[] = [
    { id: "left", viewName: "PortalManagerView", x: 0, y: 0, width: 40, height: 24, focused: true },
  ];

  assertThrows(
    () => manager.swapPanes(panes, "left", "unknown"),
    Error,
    "not found",
  );
});

// ===== Maximize Pane Tests =====

Deno.test("LayoutManager: maximizePane maximizes pane", () => {
  const manager = createLayoutManager(80, 24);
  const panes: LayoutPane[] = [
    { id: "left", viewName: "PortalManagerView", x: 0, y: 0, width: 40, height: 24, focused: true },
  ];

  manager.maximizePane(panes, "left");

  assertEquals(panes[0].maximized, true);
  assertEquals(panes[0].width, 80);
  assertEquals(panes[0].height, 24);
  assertEquals(panes[0].previousBounds?.width, 40);
});

Deno.test("LayoutManager: maximizePane restores pane", () => {
  const manager = createLayoutManager(80, 24);
  const panes: LayoutPane[] = [
    {
      id: "left",
      viewName: "PortalManagerView",
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      focused: true,
      maximized: true,
      previousBounds: { x: 0, y: 0, width: 40, height: 24 },
    },
  ];

  manager.maximizePane(panes, "left");

  assertEquals(panes[0].maximized, false);
  assertEquals(panes[0].width, 40);
  assertEquals(panes[0].previousBounds, undefined);
});

// ===== Resize Pane Tests =====

Deno.test("LayoutManager: resizePane - shrink left", () => {
  const manager = createLayoutManager(80, 24);
  const panes: LayoutPane[] = [
    { id: "left", viewName: "PortalManagerView", x: 0, y: 0, width: 40, height: 24, focused: true },
    { id: "right", viewName: "MonitorView", x: 40, y: 0, width: 40, height: 24, focused: false },
  ];

  // Shrinking left shrinks the pane's own width (no adjacent pane to the left to expand)
  manager.resizePane(panes, "left", "left", 5);

  // Left pane shrinks, but there's no pane to the left to expand
  // The right pane should expand to fill
  assertEquals(panes[0].width, 35);
  // When shrinking left, the adjacent pane (right) expands leftward
});

Deno.test("LayoutManager: resizePane - grow right", () => {
  const manager = createLayoutManager(80, 24);
  const panes: LayoutPane[] = [
    { id: "left", viewName: "PortalManagerView", x: 0, y: 0, width: 40, height: 24, focused: true },
    { id: "right", viewName: "MonitorView", x: 40, y: 0, width: 40, height: 24, focused: false },
  ];

  manager.resizePane(panes, "left", "right", 5);

  assertEquals(panes[0].width, 45);
  assertEquals(panes[1].x, 45);
  assertEquals(panes[1].width, 35);
});

// ===== Named Layouts Tests =====

Deno.test("LayoutManager: saveNamedLayout saves layout", () => {
  const manager = createLayoutManager();
  const panes: LayoutPane[] = [{
    id: "main",
    viewName: "PortalManagerView",
    x: 0,
    y: 0,
    width: 80,
    height: 24,
    focused: true,
  }];

  const layout = manager.saveNamedLayout("test-layout", panes, "main");

  assertEquals(layout.name, "test-layout");
  assertEquals(layout.panes.length, 1);
});

Deno.test("LayoutManager: loadNamedLayout loads saved layout", () => {
  const manager = createLayoutManager();
  const panes: LayoutPane[] = [{
    id: "main",
    viewName: "PortalManagerView",
    x: 0,
    y: 0,
    width: 80,
    height: 24,
    focused: true,
  }];

  manager.saveNamedLayout("test-layout", panes, "main");
  const loaded = manager.loadNamedLayout("test-layout");

  assertEquals(loaded?.name, "test-layout");
});

Deno.test("LayoutManager: loadNamedLayout returns undefined for unknown", () => {
  const manager = createLayoutManager();
  const loaded = manager.loadNamedLayout("unknown");
  assertEquals(loaded, undefined);
});

Deno.test("LayoutManager: deleteNamedLayout removes layout", () => {
  const manager = createLayoutManager();
  const panes: LayoutPane[] = [{
    id: "main",
    viewName: "PortalManagerView",
    x: 0,
    y: 0,
    width: 80,
    height: 24,
    focused: true,
  }];

  manager.saveNamedLayout("test-layout", panes, "main");
  const deleted = manager.deleteNamedLayout("test-layout");
  const loaded = manager.loadNamedLayout("test-layout");

  assertEquals(deleted, true);
  assertEquals(loaded, undefined);
});

Deno.test("LayoutManager: listNamedLayouts returns layout names", () => {
  const manager = createLayoutManager();
  const panes: LayoutPane[] = [{
    id: "main",
    viewName: "PortalManagerView",
    x: 0,
    y: 0,
    width: 80,
    height: 24,
    focused: true,
  }];

  manager.saveNamedLayout("layout-1", panes, "main");
  manager.saveNamedLayout("layout-2", panes, "main");

  const names = manager.listNamedLayouts();
  assertEquals(names.length, 2);
  assertEquals(names.includes("layout-1"), true);
  assertEquals(names.includes("layout-2"), true);
});

// ===== Serialization Tests =====

Deno.test("LayoutManager: serializeLayout creates JSON", () => {
  const manager = createLayoutManager();
  const panes: LayoutPane[] = [{
    id: "main",
    viewName: "PortalManagerView",
    x: 0,
    y: 0,
    width: 80,
    height: 24,
    focused: true,
  }];

  const json = manager.serializeLayout(panes, "main");
  const parsed = JSON.parse(json);

  assertEquals(parsed.activePaneId, "main");
  assertEquals(parsed.panes.length, 1);
});

Deno.test("LayoutManager: deserializeLayout parses valid JSON", () => {
  const manager = createLayoutManager();
  const json = JSON.stringify({
    name: "test",
    panes: [{
      id: "main",
      viewName: "PortalManagerView",
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      focused: true,
    }],
    activePaneId: "main",
    version: "1.2",
  });

  const layout = manager.deserializeLayout(json);

  assertEquals(layout?.name, "test");
  assertEquals(layout?.panes.length, 1);
});

Deno.test("LayoutManager: deserializeLayout returns null for invalid JSON", () => {
  const manager = createLayoutManager();
  const layout = manager.deserializeLayout("invalid json");
  assertEquals(layout, null);
});

Deno.test("LayoutManager: validateLayout validates correct layout", () => {
  const manager = createLayoutManager();
  const layout = {
    name: "test",
    panes: [{
      id: "main",
      viewName: "PortalManagerView",
      x: 0,
      y: 0,
      width: 80,
      height: 24,
    }],
    activePaneId: "main",
    version: "1.2",
  };

  assertEquals(manager.validateLayout(layout), true);
});

Deno.test("LayoutManager: validateLayout rejects invalid layout", () => {
  const manager = createLayoutManager();

  assertEquals(manager.validateLayout(null), false);
  assertEquals(manager.validateLayout({}), false);
  assertEquals(manager.validateLayout({ name: "test" }), false);
});

// ===== Rendering Tests =====

Deno.test("renderLayoutPresetPicker: renders preset list", () => {
  const presets = LAYOUT_PRESETS;
  const lines = renderLayoutPresetPicker(presets, 0, theme);

  assertEquals(lines.length > 0, true);
  assertEquals(lines.some((l) => l.includes("Layout Presets")), true);
  assertEquals(lines.some((l) => l.includes("Single")), true);
});

Deno.test("renderPaneBorder: renders focused pane", () => {
  const pane: LayoutPane = {
    id: "main",
    viewName: "PortalManagerView",
    x: 0,
    y: 0,
    width: 80,
    height: 24,
    focused: true,
  };

  const result = renderPaneBorder(pane, theme);
  assertEquals(result.includes("●"), true);
  assertEquals(result.includes("PortalManager"), true);
});

Deno.test("renderPaneBorder: renders maximized pane", () => {
  const pane: LayoutPane = {
    id: "main",
    viewName: "PortalManagerView",
    x: 0,
    y: 0,
    width: 80,
    height: 24,
    focused: true,
    maximized: true,
  };

  const result = renderPaneBorder(pane, theme);
  assertEquals(result.includes("[MAX]"), true);
});

Deno.test("renderResizeIndicator: renders direction arrows", () => {
  assertEquals(renderResizeIndicator("left", theme).includes("◀"), true);
  assertEquals(renderResizeIndicator("right", theme).includes("▶"), true);
  assertEquals(renderResizeIndicator("up", theme).includes("▲"), true);
  assertEquals(renderResizeIndicator("down", theme).includes("▼"), true);
});

// ===== View Picker Dialog Tests =====

Deno.test("createViewPickerState: creates initial state", () => {
  const state = createViewPickerState();
  assertEquals(state.isOpen, false);
  assertEquals(state.selectedIndex, 0);
  assertEquals(state.purpose, "split");
});

Deno.test("AVAILABLE_VIEWS: contains all views", () => {
  assertEquals(AVAILABLE_VIEWS.length, 7);
  assertEquals(AVAILABLE_VIEWS[0].name, "PortalManagerView");
});

Deno.test("renderViewPickerDialog: renders nothing when closed", () => {
  const state = createViewPickerState();
  const lines = renderViewPickerDialog(state, theme);
  assertEquals(lines.length, 0);
});

Deno.test("renderViewPickerDialog: renders dialog when open", () => {
  const state = { ...createViewPickerState(), isOpen: true };
  const lines = renderViewPickerDialog(state, theme);

  assertEquals(lines.length > 0, true);
  assertEquals(lines.some((l) => l.includes("Select View")), true);
});

Deno.test("handleViewPickerKey: navigates up/down", () => {
  const state = { ...createViewPickerState(), isOpen: true, selectedIndex: 0 };

  const result1 = handleViewPickerKey(state, "down");
  assertEquals(result1.state.selectedIndex, 1);

  const result2 = handleViewPickerKey(result1.state, "up");
  assertEquals(result2.state.selectedIndex, 0);
});

Deno.test("handleViewPickerKey: selects on enter", () => {
  const state = { ...createViewPickerState(), isOpen: true, selectedIndex: 2 };

  const result = handleViewPickerKey(state, "enter");
  assertEquals(result.closed, true);
  assertEquals(result.selectedView, "MonitorView");
});

Deno.test("handleViewPickerKey: closes on escape", () => {
  const state = { ...createViewPickerState(), isOpen: true };

  const result = handleViewPickerKey(state, "escape");
  assertEquals(result.closed, true);
  assertEquals(result.state.isOpen, false);
});

Deno.test("handleViewPickerKey: number key selects view", () => {
  const state = { ...createViewPickerState(), isOpen: true };

  const result = handleViewPickerKey(state, "3");
  assertEquals(result.closed, true);
  assertEquals(result.selectedView, "MonitorView");
});

// ===== Layout Preset Dialog Tests =====

Deno.test("createLayoutPresetState: creates initial state", () => {
  const state = createLayoutPresetState();
  assertEquals(state.isOpen, false);
  assertEquals(state.selectedIndex, 0);
});

Deno.test("LAYOUT_PRESET_INFO: contains all presets", () => {
  assertEquals(LAYOUT_PRESET_INFO.length, 6);
});

Deno.test("renderLayoutPresetDialog: renders dialog when open", () => {
  const state = { ...createLayoutPresetState(), isOpen: true };
  const lines = renderLayoutPresetDialog(state, theme);

  assertEquals(lines.length > 0, true);
  assertEquals(lines.some((l) => l.includes("Layout Presets")), true);
});

Deno.test("handleLayoutPresetKey: selects preset on enter", () => {
  const state = { ...createLayoutPresetState(), isOpen: true, selectedIndex: 1 };

  const result = handleLayoutPresetKey(state, "enter");
  assertEquals(result.closed, true);
  assertEquals(result.selectedPreset, "side-by-side");
});

// ===== Named Layout Dialog Tests =====

Deno.test("createNamedLayoutState: creates initial state", () => {
  const state = createNamedLayoutState();
  assertEquals(state.isOpen, false);
  assertEquals(state.mode, "save");
  assertEquals(state.inputName, "");
});

Deno.test("renderNamedLayoutDialog: renders save mode", () => {
  const state = { ...createNamedLayoutState(), isOpen: true, mode: "save" as const };
  const lines = renderNamedLayoutDialog(state, theme);

  assertEquals(lines.some((l) => l.includes("Save Layout")), true);
});

Deno.test("renderNamedLayoutDialog: renders load mode with layouts", () => {
  const state = {
    ...createNamedLayoutState(),
    isOpen: true,
    mode: "load" as const,
    layouts: ["layout-1", "layout-2"],
  };
  const lines = renderNamedLayoutDialog(state, theme);

  assertEquals(lines.some((l) => l.includes("Load Layout")), true);
  assertEquals(lines.some((l) => l.includes("layout-1")), true);
});

Deno.test("handleNamedLayoutKey: activates input on enter in save mode", () => {
  const state = { ...createNamedLayoutState(), isOpen: true, mode: "save" as const };

  const result = handleNamedLayoutKey(state, "enter");
  assertEquals(result.state.inputActive, true);
});

Deno.test("handleNamedLayoutKey: accepts text input", () => {
  const state = {
    ...createNamedLayoutState(),
    isOpen: true,
    mode: "save" as const,
    inputActive: true,
    inputName: "my",
  };

  const result = handleNamedLayoutKey(state, "l");
  assertEquals(result.state.inputName, "myl");
});

Deno.test("handleNamedLayoutKey: handles backspace", () => {
  const state = {
    ...createNamedLayoutState(),
    isOpen: true,
    mode: "save" as const,
    inputActive: true,
    inputName: "myl",
  };

  const result = handleNamedLayoutKey(state, "backspace");
  assertEquals(result.state.inputName, "my");
});

Deno.test("handleNamedLayoutKey: saves on enter with name", () => {
  const state = {
    ...createNamedLayoutState(),
    isOpen: true,
    mode: "save" as const,
    inputActive: true,
    inputName: "my-layout",
  };

  const result = handleNamedLayoutKey(state, "enter");
  assertEquals(result.action, "save");
  assertEquals(result.layoutName, "my-layout");
  assertEquals(result.closed, true);
});

// ===== Utility Rendering Tests =====

Deno.test("renderSwapIndicator: renders swap mode", () => {
  const result = renderSwapIndicator("pane-1", null, theme);
  assertEquals(result.includes("Swapping from"), true);
});

Deno.test("renderSwapIndicator: renders swap with target", () => {
  const result = renderSwapIndicator("pane-1", "pane-2", theme);
  assertEquals(result.includes("⇄"), true);
});

Deno.test("createResizeModeState: creates initial state", () => {
  const state = createResizeModeState();
  assertEquals(state.isActive, false);
  assertEquals(state.paneId, null);
});

Deno.test("renderResizeModeIndicator: renders nothing when inactive", () => {
  const state = createResizeModeState();
  const result = renderResizeModeIndicator(state, theme);
  assertEquals(result, "");
});

Deno.test("renderResizeModeIndicator: renders when active", () => {
  const state = { isActive: true, paneId: "main" };
  const result = renderResizeModeIndicator(state, theme);
  assertEquals(result.includes("RESIZE MODE"), true);
});

// ===== Normalization Tests =====

Deno.test("LayoutManager: normalizeLayout constrains panes", () => {
  const manager = createLayoutManager(80, 24);
  const panes: LayoutPane[] = [{
    id: "main",
    viewName: "PortalManagerView",
    x: -10,
    y: -5,
    width: 200,
    height: 100,
    focused: true,
  }];

  const normalized = manager.normalizeLayout(panes);

  assertEquals(normalized[0].x, 0);
  assertEquals(normalized[0].y, 0);
  // Width is clamped: max(MIN_PANE_WIDTH, min(200, 80 - 0)) = max(20, 80) = 80
  assertEquals(normalized[0].width, 80);
  // Height is clamped: max(MIN_PANE_HEIGHT, min(100, 24 - 0)) = max(5, 24) = 24
  assertEquals(normalized[0].height, 24);
});
