/**
 * Service for controlling the ExoFrame daemon via CLI commands.
 * All subprocesses are properly closed and script paths are resolved robustly.
 */
/**
 * Service interface for controlling the ExoFrame daemon.
 */
export interface DaemonService {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  getStatus(): Promise<string>;
  getLogs(): Promise<string[]>;
  getErrors(): Promise<string[]>;
}

/**
 * CLI-backed implementation of DaemonService.
 */
export class CLIDaemonService implements DaemonService {
  #cliScript = new URL("../../src/cli/exoctl.ts", import.meta.url).pathname;

  async start(): Promise<void> {
    await this.#runDaemonCmd(["start"]);
  }
  async stop(): Promise<void> {
    await this.#runDaemonCmd(["stop"]);
  }
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }
  async getStatus(): Promise<string> {
    const cmd = new Deno.Command("deno", {
      args: ["run", "--allow-all", this.#cliScript, "daemon", "status"],
      stdout: "piped",
      stderr: "null",
    });
    const { stdout } = await cmd.output();
    return new TextDecoder().decode(stdout).trim();
  }
  getLogs(): Promise<string[]> {
    // TODO: Implement real log fetching from CLI or file
    return Promise.resolve(["Daemon started", "No errors detected"]);
  }
  getErrors(): Promise<string[]> {
    // TODO: Implement real error fetching from CLI or file
    return Promise.resolve([]);
  }
  async #runDaemonCmd(args: string[]): Promise<void> {
    const cmd = new Deno.Command("deno", {
      args: ["run", "--allow-all", this.#cliScript, "daemon", ...args],
      stdout: "null",
      stderr: "null",
    });
    await cmd.output();
  }
}

/**
 * DaemonControlView: pure view/controller, delegates to injected service.
 * Accepts any service matching the DaemonService interface.
 */
/**
 * View/controller for daemon control. Delegates to injected DaemonService.
 */
export class DaemonControlView {
  constructor(public readonly service: DaemonService) {}

  /** Get daemon status. */
  getStatus(): Promise<string> {
    return this.service.getStatus();
  }
  /** Get daemon logs. */
  getLogs(): Promise<string[]> {
    return this.service.getLogs();
  }
  /** Get daemon errors. */
  getErrors(): Promise<string[]> {
    return this.service.getErrors();
  }
  /** Start the daemon. */
  start(): Promise<void> {
    return this.service.start();
  }
  /** Stop the daemon. */
  stop(): Promise<void> {
    return this.service.stop();
  }
  /** Restart the daemon. */
  restart(): Promise<void> {
    return this.service.restart();
  }
}
