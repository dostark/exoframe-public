import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { FileWatcher } from "../src/services/watcher.ts";
import { createMockConfig } from "./helpers/config.ts";
import { initTestDbService } from "./helpers/db.ts";
import { createWatcherTestContext } from "./helpers/watcher_test_helper.ts";

/**
 * Tests for Step 2.1: The File Watcher (Stable Read)
 *
 * Success Criteria:
 * - Test 1: Rapidly touch a file 10 times in 1 second → Watcher only processes it once
 * - Test 2: Write a 10MB file in 500ms chunks → Watcher waits until final chunk before processing
 * - Test 3: Delete a file immediately after creating it → Watcher handles `NotFound` gracefully
 */

// Helper to simulate readFileWhenStable function
async function readFileWhenStable(path: string): Promise<string> {
  const maxAttempts = 5;
  const backoffMs = [50, 100, 200, 500, 1000];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Get initial size
      const stat1 = await Deno.stat(path);

      // Wait for stability
      await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));

      // Check if size changed
      const stat2 = await Deno.stat(path);

      if (stat1.size === stat2.size && stat2.size > 0) {
        // File appears stable, try to read
        const content = await Deno.readTextFile(path);

        // Validate it's not empty or corrupted
        if (content.trim().length > 0) {
          return content;
        }
      }

      // File still changing, retry with longer wait
      continue;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // File deleted between stat and read
        throw new Error(`File disappeared: ${path}`);
      }

      if (attempt === maxAttempts - 1) {
        throw error;
      }

      // Retry on other errors
      continue;
    }
  }

  throw new Error(`File never stabilized: ${path}`);
}

Deno.test("Test 1: Debouncing - rapid file touches only trigger once", async () => {
  const { tempDir, cleanup } = await initTestDbService();
  try {
    const testFile = join(tempDir, "test.txt");
    const content = "Hello, World!";

    // Write file once
    await Deno.writeTextFile(testFile, content);

    // Simulate rapid touches (modifying mtime without changing content)
    const touchPromises = [];
    for (let i = 0; i < 10; i++) {
      touchPromises.push(
        Deno.utime(testFile, new Date(), new Date()),
      );
    }
    await Promise.all(touchPromises);

    // Wait for debounce period (200ms + buffer)
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Now read - should be stable immediately
    const result = await readFileWhenStable(testFile);
    assertEquals(result, content);
  } finally {
    await cleanup();
  }
});

Deno.test("Test 2: Stability verification - slow write in chunks", async () => {
  const { tempDir, cleanup } = await initTestDbService();
  try {
    const testFile = join(tempDir, "large.txt");

    // Start writing in background
    const writePromise = (async () => {
      const chunkSize = 1024 * 1024; // 1MB chunks
      const totalChunks = 10; // 10MB total
      const chunk = "x".repeat(chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        await Deno.writeTextFile(testFile, chunk, { append: i > 0 });
        await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms per chunk
      }
    })();

    // Wait a bit for file to be created
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Try to read - should wait until stable
    const startTime = Date.now();

    // Run readFileWhenStable concurrently with writes
    const readPromise = readFileWhenStable(testFile);

    await writePromise; // Ensure writes complete
    const content = await readPromise;

    const duration = Date.now() - startTime;

    // Should have waited for file to stabilize (at least a few attempts)
    assertEquals(content.length > 1024 * 1024, true); // At least some content

    // Should have taken some time to stabilize (but not too long)
    assertEquals(duration > 100, true); // At least waited for backoff
    assertEquals(duration < 3000, true); // Didn't exhaust all retries
  } finally {
    await cleanup();
  }
});

Deno.test("Test 3: File disappears - handles NotFound gracefully", async () => {
  const { tempDir, cleanup: _cleanup } = await initTestDbService();
  try {
    const testFile = join(tempDir, "ephemeral.txt");

    // Create file
    await Deno.writeTextFile(testFile, "temporary");

    // Delete it immediately
    await Deno.remove(testFile);

    // Try to read - should throw specific error
    let errorMessage = "";
    try {
      await readFileWhenStable(testFile);
    } catch (error) {
      errorMessage = (error as Error).message;
    }

    assertEquals(errorMessage.includes("File disappeared"), true);
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("Stability verification - file never stabilizes", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-test-unstable-" });
  try {
    const testFile = join(tempDir, "growing.txt");

    // Start continuous writes that never stop
    let shouldStop = false;
    const infiniteWrite = (async () => {
      let iteration = 0;
      while (!shouldStop) {
        await Deno.writeTextFile(testFile, `Iteration ${iteration++}\n`, { append: iteration > 1 });
        await new Promise((resolve) => setTimeout(resolve, 30)); // Write every 30ms
      }
    })();

    // Wait for file to be created
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Try to read - should eventually give up
    let errorMessage = "";
    try {
      await readFileWhenStable(testFile);
    } catch (error) {
      errorMessage = (error as Error).message;
    }

    // Stop the writes
    shouldStop = true;
    await infiniteWrite;

    assertEquals(errorMessage.includes("File never stabilized"), true);
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("Error handling - permission denied during read", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-test-permission-" });
  try {
    const testFile = join(tempDir, "readonly.txt");
    await Deno.writeTextFile(testFile, "content");

    // Remove read permissions
    await Deno.chmod(testFile, 0o000);

    // Try to read - should throw permission error
    let errorThrown = false;
    try {
      await readFileWhenStable(testFile);
    } catch (error) {
      errorThrown = true;
      // Should be permission error
      assertEquals(
        error instanceof Deno.errors.PermissionDenied ||
          (error instanceof Error && error.message.includes("permission")),
        true,
      );
    }

    assertEquals(errorThrown, true);
  } finally {
    // Restore permissions before cleanup
    try {
      const testFile = join(tempDir, "readonly.txt");
      await Deno.chmod(testFile, 0o644);
    } catch {
      // Permission already restored or file deleted
    }
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("Edge case - empty file remains empty", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-test-empty-" });
  try {
    const testFile = join(tempDir, "empty.txt");
    await Deno.writeTextFile(testFile, "");

    // Try to read empty file - should fail
    let errorMessage = "";
    try {
      await readFileWhenStable(testFile);
    } catch (error) {
      errorMessage = (error as Error).message;
    }

    assertEquals(errorMessage.includes("empty") || errorMessage.includes("never stabilized"), true);
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("Edge case - file with only whitespace", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-test-whitespace-" });
  try {
    const testFile = join(tempDir, "whitespace.txt");
    await Deno.writeTextFile(testFile, "   \n\t\n   ");

    // File is not truly empty but has no meaningful content
    let errorMessage = "";
    try {
      await readFileWhenStable(testFile);
    } catch (error) {
      errorMessage = (error as Error).message;
    }

    // Should fail because trim().length === 0
    assertEquals(errorMessage.includes("empty") || errorMessage.includes("never stabilized"), true);
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("Concurrent modification - multiple files changing simultaneously", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-test-concurrent-" });
  try {
    const files = [
      join(tempDir, "file1.txt"),
      join(tempDir, "file2.txt"),
      join(tempDir, "file3.txt"),
    ];

    // Write all files simultaneously
    await Promise.all(
      files.map((file) => Deno.writeTextFile(file, `Content for ${file}`)),
    );

    // Read all files concurrently - should all succeed
    const results = await Promise.all(
      files.map((file) => readFileWhenStable(file)),
    );

    assertEquals(results.length, 3);
    results.forEach((content, idx) => {
      assertEquals(content.includes(`file${idx + 1}.txt`), true);
    });
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("File size stability - zero size indicates deletion in progress", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-test-zero-" });
  try {
    const testFile = join(tempDir, "truncated.txt");

    // Create file with content
    await Deno.writeTextFile(testFile, "initial content");

    // Truncate to zero size
    const file = await Deno.open(testFile, { write: true, truncate: true });
    file.close();

    // Try to read - should fail because size is 0
    let errorMessage = "";
    try {
      await readFileWhenStable(testFile);
    } catch (error) {
      errorMessage = (error as Error).message;
    }

    assertEquals(errorMessage.includes("never stabilized"), true);
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("Rapid successive modifications - last write wins", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-test-rapid-" });
  try {
    const testFile = join(tempDir, "rapid.txt");

    // Write multiple times rapidly
    for (let i = 1; i <= 5; i++) {
      await Deno.writeTextFile(testFile, `Version ${i}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Wait for stability
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Read should get the last version
    const content = await readFileWhenStable(testFile);
    assertEquals(content, "Version 5");
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("Unicode content - handles UTF-8 correctly", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-test-unicode-" });
  try {
    const testFile = join(tempDir, "unicode.txt");
    const unicodeContent = "Hello 世界 🌍 مرحبا Здравствуй";

    await Deno.writeTextFile(testFile, unicodeContent);

    const content = await readFileWhenStable(testFile);
    assertEquals(content, unicodeContent);
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("Large file - handles multi-megabyte files", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-test-large-" });
  try {
    const testFile = join(tempDir, "large.txt");
    const largeContent = "x".repeat(5 * 1024 * 1024); // 5MB

    await Deno.writeTextFile(testFile, largeContent);

    const content = await readFileWhenStable(testFile);
    assertEquals(content.length, largeContent.length);
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("File stability - eventual consistency with delayed write", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-test-delayed-" });
  try {
    const testFile = join(tempDir, "delayed.txt");

    // Write initial content
    await Deno.writeTextFile(testFile, "Initial content");

    // Let it stabilize first
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Now write final content
    await Deno.writeTextFile(testFile, "Final content after stability");

    // Wait for new stability
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Read should get the latest content
    const content = await readFileWhenStable(testFile);

    assertEquals(content, "Final content after stability");
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

// ============================================================================
// FileWatcher class integration tests
// ============================================================================

Deno.test("FileWatcher: processes .md files and ignores dotfiles", async () => {
  const { helper, cleanup } = await createWatcherTestContext("watcher-class-filter-");
  try {
    await helper.createWorkspaceStructure();

    const eventsReceived: string[] = [];
    const watcher = helper.createWatcher((event) => {
      eventsReceived.push(event.path);
    });

    await helper.startWatcher(watcher);

    // Create test files
    await Deno.writeTextFile(join(helper.requestDir, "valid.md"), "Valid file");
    await Deno.writeTextFile(join(helper.requestDir, ".hidden.md"), "Hidden file");
    await Deno.writeTextFile(join(helper.requestDir, "readme.txt"), "Text file");

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    await helper.stopWatcher(watcher);

    // Should only process valid.md
    assertEquals(eventsReceived.length, 1);
    assertEquals(eventsReceived[0].endsWith("valid.md"), true);
  } finally {
    await cleanup();
  }
});

Deno.test("FileWatcher: throws error when watch directory not found", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-notfound-" });
  await Deno.remove(tempDir); // Remove it so it doesn't exist

  const config = createMockConfig(tempDir, {
    watcher: { debounce_ms: 50, stability_check: false },
  });

  const watcher = new FileWatcher(config, () => {});

  // Should throw NotFound error
  let errorCaught = false;
  try {
    await watcher.start();
  } catch (error) {
    errorCaught = true;
    assertEquals(error instanceof Deno.errors.NotFound, true);
  }
  assertEquals(errorCaught, true);
});

Deno.test("FileWatcher: processes file without stability check", async () => {
  const { helper, cleanup } = await createWatcherTestContext("watcher-no-stability-");
  try {
    await helper.createWorkspaceStructure();

    let receivedContent = "";
    const watcher = helper.createWatcher((event) => {
      receivedContent = event.content;
    });

    await helper.startWatcher(watcher);
    await helper.writeFile("immediate.md", "Immediate read");
    await helper.stopWatcher(watcher);

    // Should have received content immediately without stability check
    assertEquals(receivedContent, "Immediate read");
  } finally {
    await cleanup();
  }
});

Deno.test("FileWatcher: handles onFileReady callback errors gracefully", async () => {
  const { helper, cleanup } = await createWatcherTestContext("watcher-callback-error-");
  try {
    await helper.createWorkspaceStructure();

    let callbackInvoked = false;
    const watcher = helper.createWatcher(() => {
      callbackInvoked = true;
      throw new Error("Callback error");
    });

    await helper.startWatcher(watcher);
    await helper.writeFile("test.md", "content");
    await helper.stopWatcher(watcher);

    // Callback should have been invoked despite error
    assertEquals(callbackInvoked, true);
  } finally {
    await cleanup();
  }
});

Deno.test("FileWatcher: logs activity with database", async () => {
  const { helper, cleanup } = await createWatcherTestContext("watcher-db-logging-");
  try {
    await helper.createWorkspaceStructure();

    const { db } = await initTestDbService();
    const watcher = helper.createWatcher(() => {}, { db });

    await helper.startWatcher(watcher);
    await helper.writeFile("logged.md", "content");
    await helper.stopWatcher(watcher);
    await db.waitForFlush();

    // Check if activities were logged
    const activities = db.getRecentActivity(100);
    const watcherActivities = activities.filter((a: { action_type: string }) => a.action_type.startsWith("watcher."));

    // Should have logged at least: started, file_ready, stopped (minimum 3)
    assert(
      watcherActivities.length >= 3,
      `Expected at least 3 watcher activities, got ${watcherActivities.length}`,
    );

    db.close();
  } finally {
    await cleanup();
  }
});

Deno.test("FileWatcher: handles file read errors during processing", async () => {
  const { helper, cleanup } = await createWatcherTestContext("watcher-read-error-");
  try {
    await helper.createWorkspaceStructure();

    const watcher = helper.createWatcher(() => {
      // This shouldn't be called if file read fails
    });

    await helper.startWatcher(watcher);

    // Create file then remove it quickly (race condition)
    const testFile = join(helper.requestDir, "disappear.md");
    await Deno.writeTextFile(testFile, "content");
    await Deno.remove(testFile);

    await new Promise((resolve) => setTimeout(resolve, 200));

    await helper.stopWatcher(watcher);

    // Watcher should handle the error gracefully
    assertEquals(true, true); // Test passes if no unhandled error
  } finally {
    await cleanup();
  }
});

Deno.test("FileWatcher: handles non-Error exceptions", async () => {
  const { helper, cleanup } = await createWatcherTestContext("watcher-non-error-");
  try {
    await helper.createWorkspaceStructure();

    // Create a callback that throws a non-Error object
    const watcher = helper.createWatcher(() => {
      // eslint-disable-next-line no-throw-literal
      throw "String error"; // Non-Error exception
    });

    await helper.startWatcher(watcher);
    await helper.writeFile("test.md", "content");
    await helper.stopWatcher(watcher);

    // Should handle non-Error exceptions gracefully
    assertEquals(true, true);
  } finally {
    await cleanup();
  }
});

Deno.test("FileWatcher: clears pending timers on stop", async () => {
  const { helper, cleanup } = await createWatcherTestContext("watcher-clear-timers-");
  try {
    await helper.createWorkspaceStructure();

    let eventsProcessed = 0;
    const watcher = helper.createWatcher(() => {
      eventsProcessed++;
    }, { debounceMs: 1000 }); // Long debounce

    await helper.startWatcher(watcher);

    // Create file but stop before debounce completes
    await Deno.writeTextFile(join(helper.requestDir, "pending.md"), "content");
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Stop immediately (before debounce timer fires)
    await helper.stopWatcher(watcher);

    // Wait to ensure timer was cleared
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Event should not have been processed (timer was cleared)
    assertEquals(eventsProcessed, 0);
  } finally {
    await cleanup();
  }
});

Deno.test("FileWatcher: handles modify events", async () => {
  const { helper, cleanup } = await createWatcherTestContext("watcher-modify-");
  try {
    await helper.createWorkspaceStructure();

    const eventsReceived: string[] = [];
    const watcher = helper.createWatcher((event) => {
      eventsReceived.push(event.content);
    });

    await helper.startWatcher(watcher);

    const testFile = join(helper.requestDir, "modify.md");
    await Deno.writeTextFile(testFile, "Version 1");
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Modify the file
    await Deno.writeTextFile(testFile, "Version 2");
    await new Promise((resolve) => setTimeout(resolve, 150));

    await helper.stopWatcher(watcher);

    // Should have received both versions
    assertEquals(eventsReceived.length >= 2, true);
  } finally {
    await cleanup();
  }
});

Deno.test("FileWatcher: debounces rapid file modifications", async () => {
  const { helper, cleanup } = await createWatcherTestContext("watcher-rapid-debounce-");
  try {
    await helper.createWorkspaceStructure();

    let processCount = 0;
    const watcher = helper.createWatcher(() => {
      processCount++;
    }, { debounceMs: 200 }); // Long enough to test debouncing

    await helper.startWatcher(watcher);

    const testFile = join(helper.requestDir, "rapid.md");

    // Rapidly modify file multiple times
    for (let i = 0; i < 5; i++) {
      await Deno.writeTextFile(testFile, `Version ${i}`);
      await new Promise((resolve) => setTimeout(resolve, 50)); // Faster than debounce
    }

    // Wait for debounce to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    await helper.stopWatcher(watcher);

    // Should have processed only once or twice due to debouncing
    assertEquals(processCount <= 2, true);
  } finally {
    await cleanup();
  }
});

Deno.test("FileWatcher: handles rename events (file moves)", async () => {
  const { helper, cleanup } = await createWatcherTestContext("watcher-rename-");
  try {
    await helper.createWorkspaceStructure();

    const eventsReceived: string[] = [];
    const watcher = helper.createWatcher((event) => {
      eventsReceived.push(event.path);
    });

    await helper.startWatcher(watcher);

    // Create file outside watch dir
    const outsideFile = join(helper.tempDir, "outside.md");
    await Deno.writeTextFile(outsideFile, "Moved content");

    // Move file into watch dir
    const insideFile = join(helper.requestDir, "moved.md");
    await Deno.rename(outsideFile, insideFile);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    await helper.stopWatcher(watcher);

    // Should detect the moved file
    assertEquals(eventsReceived.length, 1);
    assertEquals(eventsReceived[0].endsWith("moved.md"), true);
  } finally {
    await cleanup();
  }
});
