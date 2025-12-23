import { assert, assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { CLIDaemonService, DaemonControlView } from "../../src/tui/daemon_control_view.ts";

// Mock CLI Daemon Service for testing (no real process spawn)
class MockCLIDaemonService {
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
