/**
 * TUI Common (TuiSessionBase) Tests
 *
 * Part of Phase 13.2: Enhanced TuiSessionBase
 */

import { assertEquals, assertExists } from "jsr:@std/assert@^1.0.0";
import {
  calculateScrollOffset,
  clampScrollOffset,
  createRefreshConfig,
  createViewState,
  TuiSessionBase,
} from "../../src/tui/tui_common.ts";

// ===== Test Session Class =====

class TestSession extends TuiSessionBase {
  public refreshCount = 0;

  constructor(useColors = false) {
    super(useColors);
  }

  override getKeyBindings() {
    return [];
  }

  override getViewName(): string {
    return "Test View";
  }

  setupRefresh(): void {
    this.configureRefresh(() => {
      this.refreshCount++;
      return Promise.resolve();
    });
  }

  // Expose protected methods for testing
  public testStartLoading(msg: string): void {
    this.startLoading(msg);
  }

  public testStopLoading(): void {
    this.stopLoading();
  }

  public testAdvanceSpinner(): void {
    this.advanceSpinner();
  }

  public testPerformWithLoading<T>(fn: () => Promise<T>): Promise<T | null> {
    return this.performWithLoading(fn);
  }

  public testPerformAction(fn: () => Promise<unknown>): Promise<void> {
    return this.performAction(fn);
  }
}

// ===== View State Tests =====

Deno.test("createViewState: creates default state", () => {
  const state = createViewState();
  assertEquals(state.selectedIndex, 0);
  assertEquals(state.itemCount, 0);
  assertEquals(state.scrollOffset, 0);
  assertEquals(state.isLoading, false);
  assertEquals(state.needsRefresh, true);
  assertEquals(state.filterText, "");
  assertEquals(state.showHelp, false);
  assertEquals(state.activeDialog, null);
});

Deno.test("createViewState: accepts overrides", () => {
  const state = createViewState({
    selectedIndex: 5,
    itemCount: 10,
    filterText: "test",
  });
  assertEquals(state.selectedIndex, 5);
  assertEquals(state.itemCount, 10);
  assertEquals(state.filterText, "test");
  assertEquals(state.isLoading, false); // Default preserved
});

// ===== Refresh Config Tests =====

Deno.test("createRefreshConfig: creates config", () => {
  const config = createRefreshConfig(() => Promise.resolve(), 5000);

  assertEquals(config.autoRefreshInterval, 5000);
  assertEquals(config.enabled, true);
});

Deno.test("createRefreshConfig: disabled when interval is 0", () => {
  const config = createRefreshConfig(() => Promise.resolve(), 0);
  assertEquals(config.enabled, false);
});

// ===== TuiSessionBase Navigation Tests =====

Deno.test("TuiSessionBase: getSelectedIndex returns initial 0", () => {
  const session = new TestSession();
  assertEquals(session.getSelectedIndex(), 0);
});

Deno.test("TuiSessionBase: setSelectedIndex updates index", () => {
  const session = new TestSession();
  session.setSelectedIndex(5, 10);
  assertEquals(session.getSelectedIndex(), 5);
});

Deno.test("TuiSessionBase: setSelectedIndex clamps negative to 0", () => {
  const session = new TestSession();
  session.setSelectedIndex(-1, 10);
  assertEquals(session.getSelectedIndex(), 0);
});

Deno.test("TuiSessionBase: setSelectedIndex clamps over length to 0", () => {
  const session = new TestSession();
  session.setSelectedIndex(15, 10);
  assertEquals(session.getSelectedIndex(), 0);
});

Deno.test("TuiSessionBase: handleNavigationKey down", () => {
  const session = new TestSession();
  const handled = session.handleNavigationKey("down", 10);
  assertEquals(handled, true);
  assertEquals(session.getSelectedIndex(), 1);
});

Deno.test("TuiSessionBase: handleNavigationKey up", () => {
  const session = new TestSession();
  session.setSelectedIndex(5, 10);
  session.handleNavigationKey("up", 10);
  assertEquals(session.getSelectedIndex(), 4);
});

Deno.test("TuiSessionBase: handleNavigationKey home", () => {
  const session = new TestSession();
  session.setSelectedIndex(5, 10);
  session.handleNavigationKey("home", 10);
  assertEquals(session.getSelectedIndex(), 0);
});

Deno.test("TuiSessionBase: handleNavigationKey end", () => {
  const session = new TestSession();
  session.handleNavigationKey("end", 10);
  assertEquals(session.getSelectedIndex(), 9);
});

Deno.test("TuiSessionBase: handleNavigationKey returns false for unknown", () => {
  const session = new TestSession();
  const handled = session.handleNavigationKey("x", 10);
  assertEquals(handled, false);
});

Deno.test("TuiSessionBase: handleNavigationKey returns false for empty list", () => {
  const session = new TestSession();
  const handled = session.handleNavigationKey("down", 0);
  assertEquals(handled, false);
});

Deno.test("TuiSessionBase: clampSelection adjusts when over length", () => {
  const session = new TestSession();
  session.setSelectedIndex(5, 10);
  session.clampSelection(3);
  assertEquals(session.getSelectedIndex(), 2);
});

// ===== Status Tests =====

Deno.test("TuiSessionBase: getStatusMessage returns empty initially", () => {
  const session = new TestSession();
  assertEquals(session.getStatusMessage(), "");
});

Deno.test("TuiSessionBase: setStatus sets message", () => {
  const session = new TestSession();
  session.setStatus("Test message");
  assertEquals(session.getStatusMessage(), "Test message");
});

Deno.test("TuiSessionBase: clearStatus clears message", () => {
  const session = new TestSession();
  session.setStatus("Test message");
  session.clearStatus();
  assertEquals(session.getStatusMessage(), "");
});

// ===== Loading State Tests =====

Deno.test("TuiSessionBase: isSpinnerActive false initially", () => {
  const session = new TestSession();
  assertEquals(session.isSpinnerActive(), false);
});

Deno.test("TuiSessionBase: startLoading activates spinner", () => {
  const session = new TestSession();
  session.testStartLoading("Loading...");
  assertEquals(session.isSpinnerActive(), true);
});

Deno.test("TuiSessionBase: stopLoading deactivates spinner", () => {
  const session = new TestSession();
  session.testStartLoading("Loading...");
  session.testStopLoading();
  assertEquals(session.isSpinnerActive(), false);
});

Deno.test("TuiSessionBase: getSpinnerState returns state", () => {
  const session = new TestSession();
  const state = session.getSpinnerState();
  assertExists(state);
  assertEquals(state.active, false);
});

// ===== Theme Tests =====

Deno.test("TuiSessionBase: getTheme returns theme", () => {
  const session = new TestSession(true);
  const theme = session.getTheme();
  assertExists(theme);
  assertExists(theme.reset);
});

Deno.test("TuiSessionBase: updateColorMode changes theme", () => {
  const session = new TestSession(true);
  session.getTheme(); // Get initial theme

  session.updateColorMode(false);
  const noColorTheme = session.getTheme();

  // No-color theme has empty codes
  assertEquals(noColorTheme.reset, "");
});

// ===== View State Tests =====

Deno.test("TuiSessionBase: getViewState returns state", () => {
  const session = new TestSession();
  const state = session.getViewState();
  assertExists(state);
  assertEquals(state.selectedIndex, 0);
});

Deno.test("TuiSessionBase: toggleHelp toggles state", () => {
  const session = new TestSession();
  assertEquals(session.isHelpVisible(), false);
  session.toggleHelp();
  assertEquals(session.isHelpVisible(), true);
  session.toggleHelp();
  assertEquals(session.isHelpVisible(), false);
});

Deno.test("TuiSessionBase: setFilter/getFilter work", () => {
  const session = new TestSession();
  assertEquals(session.getFilter(), "");
  session.setFilter("test");
  assertEquals(session.getFilter(), "test");
});

// ===== Dialog Tests =====

Deno.test("TuiSessionBase: dialog methods work", () => {
  const session = new TestSession();
  assertEquals(session.hasDialogOpen(), false);
  assertEquals(session.getActiveDialogId(), null);

  session.setActiveDialogId("confirm");
  assertEquals(session.hasDialogOpen(), true);
  assertEquals(session.getActiveDialogId(), "confirm");

  session.setActiveDialogId(null);
  assertEquals(session.hasDialogOpen(), false);
});

// ===== Refresh Tests =====

Deno.test("TuiSessionBase: refresh calls onRefresh", async () => {
  const session = new TestSession();
  session.setupRefresh();
  assertEquals(session.refreshCount, 0);

  await session.refresh();
  assertEquals(session.refreshCount, 1);
});

Deno.test("TuiSessionBase: markNeedsRefresh sets flag", () => {
  const session = new TestSession();
  const state = session.getViewState();
  state.needsRefresh = false;

  session.markNeedsRefresh();
  assertEquals(session.getViewState().needsRefresh, true);
});

// ===== Action Tests =====

Deno.test("TuiSessionBase: performWithLoading returns result", async () => {
  const session = new TestSession();
  const result = await session.testPerformWithLoading(() => Promise.resolve("success"));
  assertEquals(result, "success");
});

Deno.test("TuiSessionBase: performWithLoading handles error", async () => {
  const session = new TestSession();
  const result = await session.testPerformWithLoading(() => {
    return Promise.reject(new Error("Test error"));
  });
  assertEquals(result, null);
});

Deno.test("TuiSessionBase: performAction clears status on success", async () => {
  const session = new TestSession();
  session.setStatus("Previous message");

  await session.testPerformAction(async () => {});
  assertEquals(session.getStatusMessage(), "");
});

Deno.test("TuiSessionBase: performAction sets error on failure", async () => {
  const session = new TestSession();
  await session.testPerformAction(() => {
    return Promise.reject(new Error("Test error"));
  });

  const msg = session.getStatusMessage();
  assertEquals(msg.includes("Test error"), true);
});

// ===== Lifecycle Tests =====

Deno.test("TuiSessionBase: getViewName returns name", () => {
  const session = new TestSession();
  assertEquals(session.getViewName(), "Test View");
});

Deno.test("TuiSessionBase: getKeyBindings returns array", () => {
  const session = new TestSession();
  const bindings = session.getKeyBindings();
  assertEquals(Array.isArray(bindings), true);
});

Deno.test("TuiSessionBase: dispose can be called", () => {
  const session = new TestSession();
  session.dispose(); // Should not throw
});

// ===== Scroll Utility Tests =====

Deno.test("calculateScrollOffset: returns 0 when items fit", () => {
  const offset = calculateScrollOffset(5, 0, 20, 10);
  assertEquals(offset, 0);
});

Deno.test("calculateScrollOffset: scrolls up when above visible", () => {
  const offset = calculateScrollOffset(2, 5, 10, 20);
  assertEquals(offset, 2);
});

Deno.test("calculateScrollOffset: scrolls down when below visible", () => {
  const offset = calculateScrollOffset(15, 0, 10, 20);
  assertEquals(offset, 6);
});

Deno.test("calculateScrollOffset: keeps visible items in view", () => {
  const offset = calculateScrollOffset(5, 3, 10, 20);
  assertEquals(offset, 3);
});

Deno.test("clampScrollOffset: clamps to 0", () => {
  const offset = clampScrollOffset(-5, 10, 20);
  assertEquals(offset, 0);
});

Deno.test("clampScrollOffset: clamps to max", () => {
  const offset = clampScrollOffset(15, 10, 20);
  assertEquals(offset, 10);
});

Deno.test("clampScrollOffset: keeps valid offset", () => {
  const offset = clampScrollOffset(5, 10, 20);
  assertEquals(offset, 5);
});
