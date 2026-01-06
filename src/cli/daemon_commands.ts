/**
 * Daemon commands for controlling the ExoFrame daemon
 * Manages daemon lifecycle, status, and logging
 */

import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
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
    this.pidFile = join(this.config.system.root, this.config.paths.runtime, "daemon.pid");
  }

  /**
   * Start the ExoFrame daemon
   */
  async start(): Promise<void> {
    const status = await this.status();

    if (status.running) {
      this.logger.info("daemon.already_running", "daemon", { pid: status.pid });
      return;
    }

    this.logger.info("daemon.starting", "daemon");

    const workspaceRoot = this.config.system.root;
    const logFile = join(workspaceRoot, this.config.paths.runtime, "daemon.log");

    // Get the path to main.ts relative to workspace
    // In deployed workspace, we need to reference the installed version
    const mainScript = join(workspaceRoot, "src", "main.ts");

    // Check if main.ts exists
    if (!await exists(mainScript)) {
      throw new Error(
        `Daemon script not found: ${mainScript}\nEnsure ExoFrame is properly installed in this workspace`,
      );
    }

    // Ensure log file directory exists
    const exoDir = join(workspaceRoot, this.config.paths.runtime);
    await ensureDir(exoDir);

    // Start daemon process in background using shell for true detachment
    // This allows the CLI to exit while daemon continues running
    const cmd = new Deno.Command("bash", {
      args: [
        "-c",
        `nohup deno run --allow-all "${mainScript}" > "${logFile}" 2>&1 & echo $!`,
      ],
      stdout: "piped",
      stderr: "piped",
      stdin: "null",
      cwd: workspaceRoot,
    });

    const output = await cmd.output();
    const pidStr = new TextDecoder().decode(output.stdout).trim();
    const pid = parseInt(pidStr, 10);

    if (isNaN(pid) || output.code !== 0) {
      const err = new TextDecoder().decode(output.stderr);
      throw new Error(`Failed to start daemon: ${err}`);
    }

    // Write PID file
    await Deno.writeTextFile(this.pidFile, pid.toString());

    // Give process a moment to start
    await new Promise((resolve) => setTimeout(resolve, 500));

    const newStatus = await this.status();
    if (!newStatus.running) {
      await this.logDaemonActivity("daemon.start_failed", {
        error: "Daemon failed to start",
      });
      throw new Error("Daemon failed to start. Check logs for details.");
    }

    // Log successful start (writes to both console and Activity Journal)
    await this.logDaemonActivity("daemon.started", {
      pid: pid,
      log_file: logFile,
    });
  }

  /**
   * Stop the ExoFrame daemon
   */
  async stop(): Promise<void> {
    const status = await this.status();

    if (!status.running) {
      this.logger.info("daemon.not_running", "daemon");
      return;
    }

    this.logger.info("daemon.stopping", "daemon", { pid: status.pid });

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
        await Deno.remove(this.pidFile).catch(() => {});
        await this.logDaemonActivity("daemon.stopped", {
          pid: status.pid,
          method: "graceful",
        });
        return;
      }

      // Force kill if still running
      this.logger.warn("daemon.force_stopping", "daemon", { pid: status.pid });
      const forceKillCmd = new Deno.Command("kill", {
        args: ["-KILL", status.pid!.toString()],
        stdout: "piped",
        stderr: "piped",
      });

      await forceKillCmd.output();
      await Deno.remove(this.pidFile).catch(() => {});
      await this.logDaemonActivity("daemon.stopped", {
        pid: status.pid,
        method: "forced",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to stop daemon: ${message}`);
    }
  }

  /**
   * Restart the ExoFrame daemon
   */
  async restart(): Promise<void> {
    this.logger.info("daemon.restarting", "daemon");
    const beforeStatus = await this.status();
    await this.stop();
    // Brief pause to ensure port/resources are released
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    await this.start();
    const afterStatus = await this.status();
    await this.logDaemonActivity("daemon.restarted", {
      previous_pid: beforeStatus.pid,
      new_pid: afterStatus.pid,
    });
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
    const logFile = join(this.config.system.root, this.config.paths.runtime, "daemon.log");

    if (!await exists(logFile)) {
      this.logger.info("daemon.no_logs", logFile, { hint: "Daemon may not have been started yet" });
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

  /**
   * Log daemon activity to the activity journal using EventLogger
   */
  private async logDaemonActivity(actionType: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const actionLogger = await this.getActionLogger();
      actionLogger.info(actionType, "daemon", {
        ...payload,
        timestamp: new Date().toISOString(),
        via: "cli",
        command: this.getCommandLineString(),
      });
    } catch (error) {
      // Log errors but don't fail the operation
      console.error("Failed to log daemon activity:", error);
    }
  }
}
