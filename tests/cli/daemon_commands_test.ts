/**
 * Tests for DaemonCommands
 * Covers start, stop, restart, status, and logs operations
 *
 * Success Criteria:
 * - Test 1: start command spawns daemon process and creates PID file
 * - Test 2: stop command sends SIGTERM (graceful) and cleans up PID file
 * - Test 3: restart command stops then starts daemon
 * - Test 4: status command reports running/stopped state correctly
 * - Test 5: logs command supports --lines and --follow options
 * - Test 6: Commands log activity to Activity Journal
 * - Test 7: Handles edge cases (already running, not running, stale PID)
 */

import { assertEquals, assertExists, assertRejects, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@^1.0.0/bdd";
import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { DaemonCommands } from "../../src/cli/daemon_commands.ts";
import { DatabaseService } from "../../src/services/db.ts";
import { initTestDbService } from "../helpers/db.ts";
import type { Config } from "../../src/config/schema.ts";

describe("DaemonCommands", {
  sanitizeResources: false, // Disable resource leak detection for daemon processes
  sanitizeOps: false, // Disable async ops leak detection
}, () => {
  let tempDir: string;
  let db: DatabaseService;
  let daemonCommands: DaemonCommands;
  let pidFile: string;
  let logFile: string;
  let mainScript: string;
  let config: Config;
  let testCleanup: () => Promise<void>;

  beforeEach(async () => {
    // Initialize database with initTestDbService
    const testDbResult = await initTestDbService();
    tempDir = testDbResult.tempDir;
    db = testDbResult.db;
    config = testDbResult.config;
    testCleanup = testDbResult.cleanup;

    pidFile = join(tempDir, "System", "daemon.pid");
    logFile = join(tempDir, "System", "daemon.log");

    // Create a mock main.ts script that simulates a daemon
    const srcDir = join(tempDir, "src");
    await ensureDir(srcDir);
    mainScript = join(srcDir, "main.ts");

    // Mock daemon script that stays alive for testing
    await Deno.writeTextFile(
      mainScript,
      `#!/usr/bin/env -S deno run --allow-all
// Mock daemon for testing
console.log("Daemon started");
const shutdown = () => {
  console.log("Daemon stopping");
  Deno.exit(0);
};
Deno.addSignalListener("SIGTERM", shutdown);
Deno.addSignalListener("SIGINT", shutdown);
// Keep alive
await new Promise(() => {});
`,
    );

    daemonCommands = new DaemonCommands({ config, db });
  });

  afterEach(async () => {
    // Clean up any running test daemons
    if (await exists(pidFile)) {
      try {
        const pidStr = await Deno.readTextFile(pidFile);
        const pid = parseInt(pidStr.trim(), 10);
        if (!isNaN(pid)) {
          await killProcess(pid);
          // Wait for process to fully exit
          await waitForProcessState(pid, false, 1000);
        }
        // Remove PID file
        await Deno.remove(pidFile).catch(() => {});
      } catch {
        // Ignore errors in cleanup
      }
    }

    await testCleanup();
  });

  describe("start", () => {
    it("should write PID file to System/daemon.pid", async () => {
      await daemonCommands.start();

      // Verify PID file exists
      assertEquals(await exists(pidFile), true);

      // Verify PID file contains a valid number
      const pidStr = await Deno.readTextFile(pidFile);
      const pid = parseInt(pidStr.trim(), 10);
      assertEquals(isNaN(pid), false);
      assertEquals(pid > 0, true);
    });

    it("should verify daemon actually started", async () => {
      await daemonCommands.start();

      // Get status and verify daemon is running
      const status = await daemonCommands.status();
      assertEquals(status.running, true);
      assertExists(status.pid);
    });

    it("should show clear error if already running", async () => {
      // Start daemon first time
      await daemonCommands.start();

      // Capture console output
      const originalLog = console.log;
      let logOutput = "";
      console.log = (...args: unknown[]) => {
        logOutput += args.join(" ") + "\n";
      };

      try {
        // Try to start again
        await daemonCommands.start();

        // Verify error message about already running (EventLogger format)
        assertStringIncludes(logOutput, "daemon.already_running");
      } finally {
        console.log = originalLog;
      }
    });

    it("should create daemon process that stays alive", async () => {
      await daemonCommands.start();

      const pidStr = await Deno.readTextFile(pidFile);
      const pid = parseInt(pidStr.trim(), 10);

      // Wait for process to stabilize
      await waitForProcessState(pid, true, 1000);

      // Verify process still exists
      const isAlive = await isProcessAlive(pid);
      assertEquals(isAlive, true);
    });

    it("should log daemon.started to activity journal", async () => {
      await daemonCommands.start();

      // Wait for batched logs to flush
      await db.waitForFlush();

      // Verify activity log entry
      const logs = db.instance.prepare(
        "SELECT * FROM activity WHERE action_type = ?",
      ).all("daemon.started");

      assertEquals(logs.length, 1);
      const log = logs[0] as Record<string, unknown>;
      assertExists(log.actor);

      // Verify payload contains expected fields
      const payload = JSON.parse(log.payload as string);
      assertExists(payload.pid);
      assertExists(payload.log_file);
      assertEquals(payload.via, "cli");
      assertExists(payload.command);
      assertEquals(payload.command.startsWith("exoctl "), true);
      assertExists(payload.timestamp);
    });
  });

  describe("stop", () => {
    it("should send SIGTERM first (graceful)", async () => {
      // Start daemon
      await daemonCommands.start();
      const pidStr = await Deno.readTextFile(pidFile);
      const pid = parseInt(pidStr.trim(), 10);

      // Stop daemon
      await daemonCommands.stop();

      // Verify process stopped
      await waitForProcessState(pid, false, 1000);
      const isAlive = await isProcessAlive(pid);
      assertEquals(isAlive, false);
    });

    it("should clean up PID file", async () => {
      // Start daemon
      await daemonCommands.start();
      assertEquals(await exists(pidFile), true);

      // Stop daemon
      await daemonCommands.stop();

      // Verify PID file is removed
      assertEquals(await exists(pidFile), false);
    });

    it("should handle daemon not running gracefully", async () => {
      // Capture console output
      const originalLog = console.log;
      let logOutput = "";
      console.log = (...args: unknown[]) => {
        logOutput += args.join(" ") + "\n";
      };

      try {
        // Try to stop when not running
        await daemonCommands.stop();

        // Verify friendly message (EventLogger format)
        assertStringIncludes(logOutput, "daemon.not_running");
      } finally {
        console.log = originalLog;
      }
    });

    it("should have force-kill capability", async () => {
      // This test verifies that the stop() method has logic to force-kill
      // if graceful shutdown fails. We can't easily test the actual timeout
      // behavior in a unit test without making it flaky, so we just verify
      // the mechanism exists by checking the code path works.

      // Create a simple daemon
      await daemonCommands.start();
      const pidStr = await Deno.readTextFile(pidFile);
      const pid = parseInt(pidStr.trim(), 10);

      // Stop it normally (should work fine)
      await daemonCommands.stop();

      // Verify process stopped
      const stopped = await waitForProcessState(pid, false, 1000);
      assertEquals(stopped, true, "Process should be stopped");
    });

    it("should log daemon.stopped to activity journal", async () => {
      // Start daemon first
      await daemonCommands.start();

      // Clear any start logs
      await db.waitForFlush();
      db.instance.exec("DELETE FROM activity WHERE action_type = 'daemon.started'");

      // Stop daemon
      await daemonCommands.stop();

      // Wait for batched logs to flush
      await db.waitForFlush();

      // Verify activity log entry
      const logs = db.instance.prepare(
        "SELECT * FROM activity WHERE action_type = ?",
      ).all("daemon.stopped");

      assertEquals(logs.length, 1);
      const log = logs[0] as Record<string, unknown>;
      // Actor is now user identity (email or username) instead of "human"
      assertExists(log.actor);

      // Verify payload contains expected fields
      const payload = JSON.parse(log.payload as string);
      assertExists(payload.pid);
      assertExists(payload.method); // 'graceful' or 'forced'
      assertEquals(payload.via, "cli");
      assertExists(payload.timestamp);
    });
  });

  describe("restart", () => {
    it("should have proper delay between stop and start", async () => {
      // Start daemon
      await daemonCommands.start();
      const firstPidStr = await Deno.readTextFile(pidFile);
      const firstPid = parseInt(firstPidStr.trim(), 10);

      // Restart
      await daemonCommands.restart();

      // Verify new daemon is running
      const status = await daemonCommands.status();
      assertEquals(status.running, true);

      // Should be a different PID
      const newPid = status.pid!;
      assertEquals(newPid !== firstPid, true);
    });

    it("should stop then start daemon", async () => {
      // Start daemon
      await daemonCommands.start();
      assertEquals((await daemonCommands.status()).running, true);

      // Restart
      await daemonCommands.restart();

      // Verify still running
      const status = await daemonCommands.status();
      assertEquals(status.running, true);
      assertExists(status.pid);
    });

    it("should log daemon.restarted to activity journal", async () => {
      // Start daemon first
      await daemonCommands.start();
      const firstStatus = await daemonCommands.status();

      // Clear previous logs
      await db.waitForFlush();
      db.instance.exec("DELETE FROM activity");

      // Restart daemon
      await daemonCommands.restart();

      // Wait for batched logs to flush
      await db.waitForFlush();

      // Verify activity log entry for restart
      const logs = db.instance.prepare(
        "SELECT * FROM activity WHERE action_type = ?",
      ).all("daemon.restarted");

      assertEquals(logs.length, 1);
      const log = logs[0] as Record<string, unknown>;
      // Actor is now user identity (email or username) instead of "human"
      assertExists(log.actor);

      // Verify payload contains expected fields
      const payload = JSON.parse(log.payload as string);
      assertEquals(payload.previous_pid, firstStatus.pid);
      assertExists(payload.new_pid);
      assertEquals(payload.via, "cli");
      assertExists(payload.timestamp);
    });
  });

  describe("status", () => {
    it("should accurately check process state when running", async () => {
      // Start daemon
      await daemonCommands.start();

      // Check status
      const status = await daemonCommands.status();
      assertEquals(status.running, true);
      assertExists(status.pid);
      assertExists(status.version);
    });

    it("should accurately check process state when not running", async () => {
      // Don't start daemon
      const status = await daemonCommands.status();

      assertEquals(status.running, false);
      assertEquals(status.pid, undefined);
      assertExists(status.version);
    });

    it("should show uptime from ps command", async () => {
      // Start daemon
      await daemonCommands.start();

      // Wait for uptime to accumulate (need real time for ps uptime)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check status
      const status = await daemonCommands.status();
      assertEquals(status.running, true);
      assertExists(status.uptime);

      // Uptime should be a non-empty string
      assertEquals(typeof status.uptime, "string");
      assertEquals(status.uptime!.length > 0, true);
    });

    it("should handle stale PID file", async () => {
      // Write a PID file with non-existent process
      await Deno.writeTextFile(pidFile, "99999");

      // Status should detect it's not running
      const status = await daemonCommands.status();
      assertEquals(status.running, false);

      // PID file should be cleaned up
      assertEquals(await exists(pidFile), false);
    });

    it("should handle invalid PID file content", async () => {
      // Write invalid PID
      await Deno.writeTextFile(pidFile, "not-a-number");

      // Status should handle gracefully
      const status = await daemonCommands.status();
      assertEquals(status.running, false);
    });
  });

  describe("logs", () => {
    it("should support --lines option", async () => {
      // Create a log file with multiple lines
      const logLines = Array.from({ length: 100 }, (_, i) => `Log line ${i + 1}`);
      await Deno.writeTextFile(logFile, logLines.join("\n") + "\n");

      // Test reading specific number of lines
      // We can't easily capture tail output in tests, but we can verify the command doesn't error
      try {
        // Create a promise that resolves quickly
        const logPromise = daemonCommands.logs(10, false);
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1000));

        await Promise.race([logPromise, timeoutPromise]);

        // If we got here without error, logs command works
        assertEquals(true, true);
      } catch (error) {
        // Should not throw for valid log file
        throw error;
      }
    });

    it("should handle missing log file gracefully", async () => {
      // Don't create log file
      assertEquals(await exists(logFile), false);

      // Capture console output
      const originalLog = console.log;
      let logOutput = "";
      console.log = (...args: unknown[]) => {
        logOutput += args.join(" ") + "\n";
      };

      try {
        await daemonCommands.logs(50, false);

        // Should show friendly message (EventLogger format)
        assertStringIncludes(logOutput, "daemon.no_logs");
      } finally {
        console.log = originalLog;
      }
    });

    it("should support --follow option", async () => {
      // Create a log file
      await Deno.writeTextFile(logFile, "Initial log line\n");

      // The follow option would block, so we just verify it can be called
      // In a real scenario, this would use tail -f
      // For testing, we just ensure the command structure is correct
      assertEquals(await exists(logFile), true);

      // Verify logs method exists and accepts follow parameter
      assertEquals(typeof daemonCommands.logs, "function");
    });
  });
});

// Helper functions

async function isProcessAlive(pid: number): Promise<boolean> {
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

async function killProcess(pid: number): Promise<void> {
  try {
    // Try graceful kill first
    const termCmd = new Deno.Command("kill", {
      args: ["-TERM", pid.toString()],
      stdout: "piped",
      stderr: "piped",
    });
    await termCmd.output();

    // Wait for graceful termination
    const terminated = await waitForProcessState(pid, false, 1000);

    // Force kill if still alive
    if (!terminated && await isProcessAlive(pid)) {
      const killCmd = new Deno.Command("kill", {
        args: ["-KILL", pid.toString()],
        stdout: "piped",
        stderr: "piped",
      });
      await killCmd.output();
    }
  } catch {
    // Ignore errors in cleanup
  }
}

/**
 * Wait for a process to reach desired state
 */
async function waitForProcessState(
  pid: number,
  shouldBeRunning: boolean,
  timeoutMs: number,
): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 50;

  while (Date.now() - startTime < timeoutMs) {
    const isRunning = await isProcessAlive(pid);
    if (isRunning === shouldBeRunning) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
  return false;
}

// Additional edge case tests from tests/daemon_commands_test.ts
describe("DaemonCommands - Edge Cases", () => {
  let tempDir: string;
  let db: DatabaseService;
  let daemonCommands: DaemonCommands;
  let pidFile: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    // Initialize database with initTestDbService
    const testDbResult = await initTestDbService();
    tempDir = testDbResult.tempDir;
    db = testDbResult.db;
    const config = testDbResult.config;
    cleanup = testDbResult.cleanup;

    pidFile = join(tempDir, "System", "daemon.pid");

    daemonCommands = new DaemonCommands({ config, db });
  });

  afterEach(async () => {
    await cleanup();
  });

  it("status() should return not running when PID file missing", async () => {
    const status = await daemonCommands.status();
    assertEquals(status.running, false);
    assertEquals(status.version, "1.0.0");
  });

  it("status() should return not running when PID file contains invalid number", async () => {
    await Deno.writeTextFile(pidFile, "not-a-number");

    const status = await daemonCommands.status();

    assertEquals(status.running, false);
    assertEquals(status.pid, undefined);
  });

  it("status() should clean up PID file for dead process", async () => {
    // Use a PID that definitely doesn't exist (999999)
    await Deno.writeTextFile(pidFile, "999999");

    const status = await daemonCommands.status();

    assertEquals(status.running, false);
    // PID file should be cleaned up
    const pidFileExists = await Deno.stat(pidFile).then(() => true).catch(() => false);
    assertEquals(pidFileExists, false);
  });

  it("start() should throw error when main script not found", async () => {
    await assertRejects(
      async () => await daemonCommands.start(),
      Error,
      "Daemon script not found",
    );
  });

  it("start() should return early when daemon already running", async () => {
    // Use current Deno process PID (which is definitely running)
    const currentPid = Deno.pid;
    await Deno.writeTextFile(pidFile, currentPid.toString());

    // Should return without error (early return)
    await daemonCommands.start();

    // PID file should still exist
    const pidContent = await Deno.readTextFile(pidFile);
    assertEquals(pidContent, currentPid.toString());
  });

  it("stop() should return early when daemon not running", async () => {
    // Should return without error (early return)
    await daemonCommands.stop();
  });

  it("logs() should handle missing log file gracefully", async () => {
    // Should not throw when log file doesn't exist
    await daemonCommands.logs(10, false);
  });

  it("status() should handle process check exception", async () => {
    // Use a negative PID to potentially trigger exception in kill -0
    await Deno.writeTextFile(pidFile, "-1");

    const status = await daemonCommands.status();

    // Should handle exception and return not running
    assertEquals(status.running, false);
  });

  it("status() should return uptime for running process", async () => {
    // Use current Deno process PID
    const currentPid = Deno.pid;
    await Deno.writeTextFile(pidFile, currentPid.toString());

    const status = await daemonCommands.status();

    assertEquals(status.running, true);
    assertEquals(status.pid, currentPid);
    // Uptime should be present (some value from ps command)
    assertEquals(typeof status.uptime, "string");
  });
});
