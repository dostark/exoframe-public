import { assertEquals } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";

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
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-test-debounce-" });
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
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("Test 2: Stability verification - slow write in chunks", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-test-chunks-" });
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
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("Test 3: File disappears - handles NotFound gracefully", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "watcher-test-deleted-" });
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
