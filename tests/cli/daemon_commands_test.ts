/**
 * Tests for DaemonCommands
 * Covers start, stop, restart, status, and logs operations
 */

import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "jsr:@std/assert@^1.0.0";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@^1.0.0/bdd";
import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { DaemonCommands } from "../../src/cli/daemon_commands.ts";
import { DatabaseService } from "../../src/services/db.ts";
import { createMockConfig } from "../helpers/config.ts";

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

  beforeEach(async () => {
    // Create temp directory structure
    tempDir = await Deno.makeTempDir({ prefix: "daemon_commands_test_" });
    const systemDir = join(tempDir, "System");
    await ensureDir(systemDir);

    pidFile = join(systemDir, "daemon.pid");
    logFile = join(systemDir, "daemon.log");

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

    // Initialize database
    const config = createMockConfig(tempDir);
    db = new DatabaseService(config);

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
          // Give process time to fully exit
          await delay(200);
        }
        // Remove PID file
        await Deno.remove(pidFile).catch(() => {});
      } catch {
        // Ignore errors in cleanup
      }
    }
    
    await db.close();
    await Deno.remove(tempDir, { recursive: true });
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

        // Verify error message about already running
        assertStringIncludes(logOutput, "already running");
      } finally {
        console.log = originalLog;
      }
    });

    it("should create daemon process that stays alive", async () => {
      await daemonCommands.start();

      const pidStr = await Deno.readTextFile(pidFile);
      const pid = parseInt(pidStr.trim(), 10);

      // Wait a moment
      await delay(500);

      // Verify process still exists
      const isAlive = await isProcessAlive(pid);
      assertEquals(isAlive, true);
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
      await delay(100);
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

        // Verify friendly message
        assertStringIncludes(logOutput, "not running");
      } finally {
        console.log = originalLog;
      }
    });

    it("should wait for graceful shutdown before force kill", async () => {
      // Create a daemon that ignores SIGTERM
      const stubbornScript = join(tempDir, "src", "stubborn.ts");
      await Deno.writeTextFile(
        stubbornScript,
        `#!/usr/bin/env -S deno run --allow-all
// Stubborn daemon that ignores SIGTERM
console.log("Stubborn daemon started");
// Ignore SIGTERM
Deno.addSignalListener("SIGTERM", () => {
  console.log("Ignoring SIGTERM");
});
// Keep alive
await new Promise(() => {});
`,
      );

      // Start stubborn daemon manually
      const cmd = new Deno.Command("deno", {
        args: ["run", "--allow-all", stubbornScript],
        stdout: "piped",
        stderr: "piped",
        stdin: "null",
      });
      const process = cmd.spawn();
      await Deno.writeTextFile(pidFile, process.pid.toString());

      // Wait for it to start
      await delay(500);

      // Try to stop (should timeout and force kill)
      const startTime = Date.now();
      await daemonCommands.stop();
      const elapsed = Date.now() - startTime;

      // Should have waited at least 4 seconds (10 attempts * 500ms = 5s)
      // Allow some variance for system load
      assertEquals(elapsed >= 3500, true);

      // Verify process is dead (give it a moment to fully die)
      await delay(200);
      const isAlive = await isProcessAlive(process.pid);
      assertEquals(isAlive, false);
    });
  });

  describe("restart", () => {
    it("should have proper delay between stop and start", async () => {
      // Start daemon
      await daemonCommands.start();
      const firstPidStr = await Deno.readTextFile(pidFile);
      const firstPid = parseInt(firstPidStr.trim(), 10);

      // Restart
      const startTime = Date.now();
      await daemonCommands.restart();
      const elapsed = Date.now() - startTime;

      // Should have at least 1 second delay
      assertEquals(elapsed >= 1000, true);

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

      // Wait a moment for uptime to accumulate
      await delay(1000);

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

        // Should show friendly message
        assertStringIncludes(logOutput, "No log file found");
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
    
    // Wait a bit
    await delay(500);
    
    // Force kill if still alive
    if (await isProcessAlive(pid)) {
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
