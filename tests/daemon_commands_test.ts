/**
 * Tests for DaemonCommands - CLI commands for daemon lifecycle management
 */

import { assertEquals, assertRejects } from "jsr:@std/assert@^1.0.0";
import { DaemonCommands } from "../src/cli/daemon_commands.ts";
import type { CommandContext } from "../src/cli/base.ts";
import { initTestDbService } from "./helpers/db.ts";
import { createMockConfig } from "./helpers/config.ts";
import { join } from "jsr:@std/path@^1.0.8";

/**
 * Helper: Create mock CommandContext
 */
async function createMockContext(workspaceRoot: string): Promise<CommandContext> {
  const { db } = await initTestDbService();
  const config = createMockConfig(workspaceRoot);
  
  return {
    config,
    db,
  };
}

Deno.test("DaemonCommands: status() returns not running when PID file missing", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "System"), { recursive: true });
    const context = await createMockContext(tempDir);
    const commands = new DaemonCommands(context);
    
    const status = await commands.status();
    
    assertEquals(status.running, false);
    assertEquals(status.version, "1.0.0");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("DaemonCommands: status() returns not running when PID file contains invalid number", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "System"), { recursive: true });
    const pidFile = join(tempDir, "System", "daemon.pid");
    await Deno.writeTextFile(pidFile, "not-a-number");
    
    const context = await createMockContext(tempDir);
    const commands = new DaemonCommands(context);
    
    const status = await commands.status();
    
    assertEquals(status.running, false);
    assertEquals(status.pid, undefined);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("DaemonCommands: status() cleans up PID file for dead process", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "System"), { recursive: true });
    const pidFile = join(tempDir, "System", "daemon.pid");
    // Use a PID that definitely doesn't exist (999999)
    await Deno.writeTextFile(pidFile, "999999");
    
    const context = await createMockContext(tempDir);
    const commands = new DaemonCommands(context);
    
    const status = await commands.status();
    
    assertEquals(status.running, false);
    // PID file should be cleaned up
    const pidFileExists = await Deno.stat(pidFile).then(() => true).catch(() => false);
    assertEquals(pidFileExists, false);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("DaemonCommands: start() throws error when main script not found", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "System"), { recursive: true });
    const context = await createMockContext(tempDir);
    const commands = new DaemonCommands(context);
    
    await assertRejects(
      async () => await commands.start(),
      Error,
      "Daemon script not found",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("DaemonCommands: start() returns early when daemon already running", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "System"), { recursive: true });
    const pidFile = join(tempDir, "System", "daemon.pid");
    
    // Use current Deno process PID (which is definitely running)
    const currentPid = Deno.pid;
    await Deno.writeTextFile(pidFile, currentPid.toString());
    
    const context = await createMockContext(tempDir);
    const commands = new DaemonCommands(context);
    
    // Should return without error (early return)
    await commands.start();
    
    // PID file should still exist
    const pidContent = await Deno.readTextFile(pidFile);
    assertEquals(pidContent, currentPid.toString());
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("DaemonCommands: stop() returns early when daemon not running", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "System"), { recursive: true });
    const context = await createMockContext(tempDir);
    const commands = new DaemonCommands(context);
    
    // Should return without error (early return)
    await commands.stop();
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("DaemonCommands: logs() handles missing log file gracefully", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "System"), { recursive: true });
    const context = await createMockContext(tempDir);
    const commands = new DaemonCommands(context);
    
    // Should not throw when log file doesn't exist
    await commands.logs(10, false);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("DaemonCommands: status() handles process check exception", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "System"), { recursive: true });
    const pidFile = join(tempDir, "System", "daemon.pid");
    // Use a negative PID to potentially trigger exception in kill -0
    await Deno.writeTextFile(pidFile, "-1");
    
    const context = await createMockContext(tempDir);
    const commands = new DaemonCommands(context);
    
    const status = await commands.status();
    
    // Should handle exception and return not running
    assertEquals(status.running, false);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("DaemonCommands: status() returns uptime for running process", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "System"), { recursive: true });
    const pidFile = join(tempDir, "System", "daemon.pid");
    
    // Use current Deno process PID
    const currentPid = Deno.pid;
    await Deno.writeTextFile(pidFile, currentPid.toString());
    
    const context = await createMockContext(tempDir);
    const commands = new DaemonCommands(context);
    
    const status = await commands.status();
    
    assertEquals(status.running, true);
    assertEquals(status.pid, currentPid);
    // Uptime should be present (some value from ps command)
    assertEquals(typeof status.uptime, "string");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
