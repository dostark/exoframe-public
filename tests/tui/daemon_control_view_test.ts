/**
 * Daemon Control View Tests
 *
 * Phase 13.8: Enhanced Daemon Control View tests
 */

import { assert, assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import {
  CLIDaemonService,
  DAEMON_KEY_BINDINGS,
  DAEMON_STATUS_COLORS,
  DAEMON_STATUS_ICONS,
  DaemonControlView,
  DaemonService,
  DaemonViewState,
  MinimalDaemonServiceMock,
} from "../../src/tui/daemon_control_view.ts";

// ===== Mock CLI Daemon Service for testing (no real process spawn) =====

class MockCLIDaemonService implements DaemonService {
  state = "stopped";
  logs: string[] = [];
  errors: string[] = [];

  start() {
    this.state = "running";
    return Promise.resolve();
  }
  stop() {
    this.state = "stopped";
    return Promise.resolve();
  }
  restart() {
    this.state = "running";
    return Promise.resolve();
  }
  getStatus() {
    return Promise.resolve(this.state);
  }
  getLogs() {
    return Promise.resolve(this.logs);
  }
  getErrors() {
    return Promise.resolve(this.errors);
  }
}

// ===== Existing Tests (Updated) =====

Deno.test("DaemonControlView: shows daemon status and logs", async () => {
  const service = new MockCLIDaemonService();
  service.state = "running";
  service.logs = ["Started", "No errors"];
  const view = new DaemonControlView(service);
  assertEquals(await view.getStatus(), "running");
  assertEquals((await view.getLogs()).length, 2);
});

Deno.test("DaemonControlView: can start, stop, and restart daemon", async () => {
  const service = new MockCLIDaemonService();
  const view = new DaemonControlView(service);
  await view.start();
  assertEquals(await service.getStatus(), "running");
  await view.stop();
  assertEquals(await service.getStatus(), "stopped");
  await view.restart();
  assertEquals(await service.getStatus(), "running");
});

Deno.test("DaemonControlView: displays errors and handles error state", async () => {
  const service = new MockCLIDaemonService();
  service.errors = ["Crash detected", "Permission denied"];
  const view = new DaemonControlView(service);
  assertEquals((await view.getErrors()).length, 2);
  assert((await view.getErrors())[0].includes("Crash"));
});

Deno.test("DaemonControlView: handles rapid state changes and recovers", async () => {
  const service = new MockCLIDaemonService();
  const view = new DaemonControlView(service);
  await view.start();
  await view.stop();
  await view.start();
  assertEquals(await service.getStatus(), "running");
});

Deno.test("CLIDaemonService: start, stop, restart, getStatus, getLogs, getErrors", async () => {
  const service = new CLIDaemonService();
  // These will actually run CLI commands; in CI, may need to mock Deno.Command
  await service.start();
  await service.stop();
  await service.restart();
  const status = await service.getStatus();
  const logs = await service.getLogs();
  const errors = await service.getErrors();
  // Just check types and basic expectations
  assert(typeof status === "string");
  assert(Array.isArray(logs));
  assert(Array.isArray(errors));
});

// ===== Phase 13.8: DaemonViewState Tests =====

Deno.test("DaemonViewState: interface has all required properties", () => {
  // TypeScript compile-time check via usage
  const state: DaemonViewState = {
    status: "unknown",
    showHelp: false,
    showLogs: false,
    showConfig: false,
    logContent: [],
    errorContent: [],
    activeDialog: null,
    lastStatusCheck: null,
    autoRefresh: false,
    autoRefreshInterval: 5000,
  };
  assertEquals(state.status, "unknown");
});

// ===== Phase 13.8: Icon Tests =====

Deno.test("DAEMON_STATUS_ICONS: has all status types", () => {
  const requiredKeys = ["running", "stopped", "error", "unknown"];
  for (const key of requiredKeys) {
    if (!DAEMON_STATUS_ICONS[key]) {
      throw new Error(`Missing status icon for: ${key}`);
    }
  }
});

Deno.test("DAEMON_STATUS_COLORS: has all status types", () => {
  const requiredKeys = ["running", "stopped", "error", "unknown"];
  for (const key of requiredKeys) {
    if (!DAEMON_STATUS_COLORS[key]) {
      throw new Error(`Missing color for: ${key}`);
    }
  }
});

// ===== Phase 13.8: Key Bindings Tests =====

Deno.test("DAEMON_KEY_BINDINGS: has all expected bindings", () => {
  const requiredActions = [
    "start",
    "stop",
    "restart",
    "view-logs",
    "view-config",
    "refresh",
    "help",
  ];
  const bindingActions = DAEMON_KEY_BINDINGS.map((b) => b.action);
  for (const action of requiredActions) {
    if (!bindingActions.includes(action)) {
      throw new Error(`Missing key binding for action: ${action}`);
    }
  }
});

Deno.test("DAEMON_KEY_BINDINGS: each has key, action, description, category", () => {
  for (const binding of DAEMON_KEY_BINDINGS) {
    if (!binding.key || !binding.action || !binding.description || !binding.category) {
      throw new Error(`Incomplete key binding: ${JSON.stringify(binding)}`);
    }
  }
});

// ===== Phase 13.8: TUI Session Tests =====

Deno.test("DaemonControlTuiSession: initializes correctly", async () => {
  const service = new MinimalDaemonServiceMock();
  service.setStatus("running");
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);

  await session.initialize();

  assertEquals(session.getDaemonStatus(), "running");
});

Deno.test("DaemonControlTuiSession: help screen toggle", async () => {
  const service = new MinimalDaemonServiceMock();
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  assert(!session.isHelpVisible());

  session.toggleHelp();
  assert(session.isHelpVisible());

  session.toggleHelp();
  assert(!session.isHelpVisible());
});

Deno.test("DaemonControlTuiSession: getHelpSections returns sections", () => {
  const service = new MinimalDaemonServiceMock();
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);

  const sections = session.getHelpSections();
  assert(sections.length >= 3);

  for (const section of sections) {
    if (!section.title || !section.items || section.items.length === 0) {
      throw new Error(`Invalid help section: ${JSON.stringify(section)}`);
    }
  }
});

Deno.test("DaemonControlTuiSession: renderStatusPanel returns lines", async () => {
  const service = new MinimalDaemonServiceMock();
  service.setStatus("running");
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  const lines = session.renderStatusPanel();
  assert(Array.isArray(lines));
  assert(lines.length > 5);
  assert(lines.some((line) => line.includes("STATUS")));
});

Deno.test("DaemonControlTuiSession: renderLogs returns lines", async () => {
  const service = new MinimalDaemonServiceMock();
  service.setLogs(["Log line 1", "Log line 2"]);
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  await session.showLogs();
  const lines = session.renderLogs();
  assert(Array.isArray(lines));
  assert(lines.length > 3);
});

Deno.test("DaemonControlTuiSession: renderConfig returns lines", () => {
  const service = new MinimalDaemonServiceMock();
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);

  session.showConfig();
  const lines = session.renderConfig();
  assert(Array.isArray(lines));
  assert(lines.length > 3);
});

Deno.test("DaemonControlTuiSession: renderHelp returns lines", () => {
  const service = new MinimalDaemonServiceMock();
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);

  const lines = session.renderHelp();
  assert(Array.isArray(lines));
  assert(lines.length > 0);
});

Deno.test("DaemonControlTuiSession: logs view show/hide", async () => {
  const service = new MinimalDaemonServiceMock();
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  assert(!session.isLogsVisible());

  await session.showLogs();
  assert(session.isLogsVisible());

  session.hideLogs();
  assert(!session.isLogsVisible());
});

Deno.test("DaemonControlTuiSession: config view show/hide", async () => {
  const service = new MinimalDaemonServiceMock();
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  assert(!session.isConfigVisible());

  session.showConfig();
  assert(session.isConfigVisible());

  session.hideConfig();
  assert(!session.isConfigVisible());
});

Deno.test("DaemonControlTuiSession: auto-refresh toggle", async () => {
  const service = new MinimalDaemonServiceMock();
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  assert(!session.isAutoRefreshEnabled());

  session.toggleAutoRefresh();
  assert(session.isAutoRefreshEnabled());

  session.toggleAutoRefresh();
  assert(!session.isAutoRefreshEnabled());

  session.dispose();
});

Deno.test("DaemonControlTuiSession: confirm dialogs for start", async () => {
  const service = new MinimalDaemonServiceMock();
  service.setStatus("stopped");
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  session.showStartConfirm();
  assert(session.hasActiveDialog());
});

Deno.test("DaemonControlTuiSession: confirm dialogs for stop", async () => {
  const service = new MinimalDaemonServiceMock();
  service.setStatus("running");
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  session.showStopConfirm();
  assert(session.hasActiveDialog());
});

Deno.test("DaemonControlTuiSession: confirm dialogs for restart", async () => {
  const service = new MinimalDaemonServiceMock();
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  session.showRestartConfirm();
  assert(session.hasActiveDialog());
});

Deno.test("DaemonControlTuiSession: getFocusableElements", async () => {
  const service = new MinimalDaemonServiceMock();
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  const elements = session.getFocusableElements();
  assert(Array.isArray(elements));
  assert(elements.length >= 4);
});

Deno.test("DaemonControlTuiSession: handleKey help toggle", async () => {
  const service = new MinimalDaemonServiceMock();
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  await session.handleKey("?");
  assert(session.isHelpVisible());

  await session.handleKey("escape");
  assert(!session.isHelpVisible());
});

Deno.test("DaemonControlTuiSession: handleKey logs", async () => {
  const service = new MinimalDaemonServiceMock();
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  await session.handleKey("l");
  assert(session.isLogsVisible());

  await session.handleKey("q");
  assert(!session.isLogsVisible());
});

Deno.test("DaemonControlTuiSession: handleKey config", async () => {
  const service = new MinimalDaemonServiceMock();
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);
  await session.initialize();

  await session.handleKey("c");
  assert(session.isConfigVisible());

  await session.handleKey("escape");
  assert(!session.isConfigVisible());
});

Deno.test("DaemonControlTuiSession: getViewName", () => {
  const service = new MinimalDaemonServiceMock();
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);

  assertEquals(session.getViewName(), "Daemon Control");
});

Deno.test("DaemonControlTuiSession: getKeyBindings", () => {
  const service = new MinimalDaemonServiceMock();
  const view = new DaemonControlView(service);
  const session = view.createTuiSession(false);

  const bindings = session.getKeyBindings();
  assertEquals(bindings, DAEMON_KEY_BINDINGS);
});

Deno.test("MinimalDaemonServiceMock: works correctly", async () => {
  const mock = new MinimalDaemonServiceMock();

  assertEquals(await mock.getStatus(), "stopped");

  await mock.start();
  assertEquals(await mock.getStatus(), "running");

  await mock.stop();
  assertEquals(await mock.getStatus(), "stopped");

  const logs = await mock.getLogs();
  assert(Array.isArray(logs));
  assert(logs.length >= 2); // start and stop logs

  mock.setErrors(["Test error"]);
  const errors = await mock.getErrors();
  assertEquals(errors.length, 1);
});
