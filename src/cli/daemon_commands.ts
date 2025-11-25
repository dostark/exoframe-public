/**
 * Daemon commands for controlling the ExoFrame daemon
 * Manages daemon lifecycle, status, and logging
 */

import { join } from "@std/path";
import { exists } from "@std/fs";
import { BaseCommand, type CommandContext } from "./base.ts";

export interface DaemonStatus {
  running: boolean;
  pid?: number;
  uptime?: string;
  version: string;
}

/**
 * Commands for daemon control
 */
export class DaemonCommands extends BaseCommand {
  private pidFile: string;

  constructor(context: CommandContext) {
    super(context);
    this.pidFile = join(this.config.system.root, "System", "daemon.pid");
  }

  /**
   * Start the ExoFrame daemon
   */
  async start(): Promise<void> {
    const status = await this.status();

    if (status.running) {
      console.log(`Daemon is already running (PID: ${status.pid})`);
      return;
    }

    console.log("Starting ExoFrame daemon...");

    const workspaceRoot = this.config.system.root;
    const logFile = join(workspaceRoot, "System", "daemon.log");

    // Get the path to main.ts relative to workspace
    // In deployed workspace, we need to reference the installed version
    const mainScript = join(workspaceRoot, "src", "main.ts");

    // Check if main.ts exists
    if (!await exists(mainScript)) {
      throw new Error(
        `Daemon script not found: ${mainScript}\nEnsure ExoFrame is properly installed in this workspace`,
      );
    }

    // Start daemon process in background
    const cmd = new Deno.Command("deno", {
      args: [
        "run",
        "--allow-all",
        mainScript,
      ],
      stdout: "piped",
      stderr: "piped",
      stdin: "null",
    });

    const process = cmd.spawn();

    // Write PID file
    await Deno.writeTextFile(this.pidFile, process.pid.toString());

    // Detach process (it will continue running after CLI exits)
    // In Deno, we can't truly detach, so we just return and let it run
    console.log(`✓ Daemon started (PID: ${process.pid})`);
    console.log(`  Logs: ${logFile}`);
    console.log(`  Run 'exoctl daemon status' to check health`);

    // Wait for process to stabilize
    await this.waitForProcessState(process.pid, true, 1000);

    const newStatus = await this.status();
    if (!newStatus.running) {
      throw new Error("Daemon failed to start. Check logs for details.");
    }
  }

  /**
   * Stop the ExoFrame daemon
   */
  async stop(): Promise<void> {
    const status = await this.status();

    if (!status.running) {
      console.log("Daemon is not running");
      return;
    }

    console.log(`Stopping daemon (PID: ${status.pid})...`);

    try {
      // Send SIGTERM
      const killCmd = new Deno.Command("kill", {
        args: ["-TERM", status.pid!.toString()],
        stdout: "piped",
        stderr: "piped",
      });

      await killCmd.output();

      // Wait for process to exit (up to 5 seconds)
      const stopped = await this.waitForProcessState(status.pid!, false, 5000);
      if (stopped) {
        console.log("✓ Daemon stopped");
        await Deno.remove(this.pidFile).catch(() => {});
        return;
      }

      // Force kill if still running
      console.log("Daemon did not stop gracefully, forcing...");
      const forceKillCmd = new Deno.Command("kill", {
        args: ["-KILL", status.pid!.toString()],
        stdout: "piped",
        stderr: "piped",
      });

      await forceKillCmd.output();
      await Deno.remove(this.pidFile).catch(() => {});
      console.log("✓ Daemon stopped (forced)");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to stop daemon: ${message}`);
    }
  }

  /**
   * Restart the ExoFrame daemon
   */
  async restart(): Promise<void> {
    console.log("Restarting daemon...");
    await this.stop();
    // Brief pause to ensure port/resources are released
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    await this.start();
  }

  /**
   * Get daemon status
   * @returns Status information
   */
  async status(): Promise<DaemonStatus> {
    const version = "1.0.0"; // TODO: Load from package.json or version file

    // Check if PID file exists
    if (!await exists(this.pidFile)) {
      return { running: false, version };
    }

    // Read PID
    const pidStr = await Deno.readTextFile(this.pidFile);
    const pid = parseInt(pidStr.trim(), 10);

    if (isNaN(pid)) {
      return { running: false, version };
    }

    // Check if process is running
    try {
      const checkCmd = new Deno.Command("kill", {
        args: ["-0", pid.toString()],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await checkCmd.output();

      if (!result.success) {
        // Process not running, clean up PID file
        await Deno.remove(this.pidFile).catch(() => {});
        return { running: false, version };
      }

      // Get process uptime
      const psCmd = new Deno.Command("ps", {
        args: ["-p", pid.toString(), "-o", "etime="],
        stdout: "piped",
        stderr: "piped",
      });

      const psResult = await psCmd.output();
      const uptime = new TextDecoder().decode(psResult.stdout).trim();

      return {
        running: true,
        pid,
        uptime,
        version,
      };
    } catch {
      return { running: false, version };
    }
  }

  /**
   * Show daemon logs
   * @param lines Number of lines to show (default: 50)
   * @param follow Follow log output (tail -f)
   */
  async logs(lines: number = 50, follow: boolean = false): Promise<void> {
    const logFile = join(this.config.system.root, "System", "daemon.log");

    if (!await exists(logFile)) {
      console.log("No log file found. Daemon may not have been started yet.");
      return;
    }

    const args = ["-n", lines.toString()];
    if (follow) {
      args.push("-f");
    }
    args.push(logFile);

    const cmd = new Deno.Command("tail", {
      args,
      stdout: "inherit",
      stderr: "inherit",
    });

    const process = cmd.spawn();
    await process.status;
  }

  /**
   * Wait for a process to reach a desired state (running or stopped)
   * @param pid Process ID to check
   * @param shouldBeRunning Expected state (true = running, false = stopped)
   * @param timeoutMs Maximum time to wait in milliseconds
   * @returns true if desired state reached, false if timeout
   */
  private async waitForProcessState(
    pid: number,
    shouldBeRunning: boolean,
    timeoutMs: number,
  ): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 50; // Check every 50ms

    while (Date.now() - startTime < timeoutMs) {
      const isRunning = await this.isProcessRunning(pid);
      if (isRunning === shouldBeRunning) {
        return true;
      }
      // Use queueMicrotask for first check, then small intervals
      if (Date.now() - startTime < checkInterval) {
        await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      } else {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }
    }
    return false;
  }

  /**
   * Check if a process is running
   */
  private async isProcessRunning(pid: number): Promise<boolean> {
    try {
      const cmd = new Deno.Command("kill", {
        args: ["-0", pid.toString()],
        stdout: "piped",
        stderr: "piped",
      });
      const result = await cmd.output();
      return result.success;
    } catch {
      return false;
    }
  }
}
