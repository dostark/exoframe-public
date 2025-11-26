import { assertEquals, assertRejects } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { PathResolver } from "../src/services/path_resolver.ts";
import { createMockConfig } from "./helpers/config.ts";

/**
 * Tests for Step 2.3: Path Security & Portal Resolver
 *
 * Success Criteria:
 * - Test 1: Resolve valid alias path → Returns absolute system path.
 * - Test 2: Path traversal attempt (@Portal/../../secret) → Throws SecurityError.
 * - Test 3: Accessing file outside allowed roots → Throws SecurityError.
 * - Test 4: Unknown alias (@Unknown/file.txt) → Throws error.
 * - Test 5: Root path itself is valid (@Portal/) → Returns portal root path.
 */

Deno.test("PathResolver: resolves valid alias path", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-" });
  try {
    const blueprintsDir = join(tempDir, "Blueprints");
    await Deno.mkdir(blueprintsDir);
    const testFile = join(blueprintsDir, "agent.md");
    await Deno.writeTextFile(testFile, "content");

    const config = createMockConfig(tempDir);

    const resolver = new PathResolver(config);
    const resolved = await resolver.resolve("@Blueprints/agent.md");

    assertEquals(resolved, testFile);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("PathResolver: throws on path traversal attempt", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-traversal-" });
  try {
    const blueprintsDir = join(tempDir, "Blueprints");
    await Deno.mkdir(blueprintsDir);
    const secretFile = join(tempDir, "secret.txt");
    await Deno.writeTextFile(secretFile, "secret");

    const config = createMockConfig(tempDir);

    const resolver = new PathResolver(config);

    await assertRejects(
      async () => {
        await resolver.resolve("@Blueprints/../secret.txt");
      },
      Error,
      "Access denied",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("PathResolver: throws on accessing file outside allowed roots", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-outside-" });
  try {
    const blueprintsDir = join(tempDir, "Blueprints");
    await Deno.mkdir(blueprintsDir);

    // Create a symlink pointing outside
    const secretFile = join(tempDir, "secret.txt");
    await Deno.writeTextFile(secretFile, "secret");
    const symlink = join(blueprintsDir, "link_to_secret");
    await Deno.symlink(secretFile, symlink, { type: "file" });

    // Deno.symlink requires allow-write/read, assuming test env has it
    // If symlinks are not supported on the OS, this test might need adjustment
    // This test covers the case where a symlink within an allowed root points outside.

    const config = createMockConfig(tempDir);

    const resolver = new PathResolver(config);

    // Try to resolve the symlink which points outside
    await assertRejects(
      async () => {
        await resolver.resolve("@Blueprints/link_to_secret");
      },
      Error,
      "Access denied",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("PathResolver: throws on unknown alias", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-unknown-" });
  try {
    const config = createMockConfig(tempDir);

    const resolver = new PathResolver(config);

    await assertRejects(
      async () => {
        await resolver.resolve("@Unknown/file.txt");
      },
      Error,
      "Unknown portal alias",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("PathResolver: root path itself is valid", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-root-" });
  try {
    const blueprintsDir = join(tempDir, "Blueprints");
    await Deno.mkdir(blueprintsDir);

    const config = createMockConfig(tempDir);

    const resolver = new PathResolver(config);
    const resolved = await resolver.resolve("@Blueprints/");

    // Should resolve to the directory itself (without trailing slash usually, depending on join)
    // Deno.realPath will return the canonical path
    const expected = await Deno.realPath(blueprintsDir);
    assertEquals(resolved, expected);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Additional Security Tests
// ============================================================================

Deno.test("PathResolver: rejects path without @ alias", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-no-alias-" });
  try {
    const config = createMockConfig(tempDir);
    const resolver = new PathResolver(config);

    await assertRejects(
      async () => {
        await resolver.resolve("Blueprints/agent.md");
      },
      Error,
      "Path must start with a portal alias",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("PathResolver: rejects absolute path attempt", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-absolute-" });
  try {
    const config = createMockConfig(tempDir);
    const resolver = new PathResolver(config);

    // Try to use an absolute path directly
    await assertRejects(
      async () => {
        await resolver.resolve("/etc/passwd");
      },
      Error,
      "Path must start with a portal alias",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("PathResolver: handles Windows-style path traversal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-windows-" });
  try {
    const blueprintsDir = join(tempDir, "Blueprints");
    await Deno.mkdir(blueprintsDir);
    const secretFile = join(tempDir, "secret.txt");
    await Deno.writeTextFile(secretFile, "secret");

    const config = createMockConfig(tempDir);
    const resolver = new PathResolver(config);

    // Try Windows-style path traversal
    // Note: On Unix, backslash is treated as filename character, not separator
    // So it will try to find a file literally named "..\\secret.txt"
    await assertRejects(
      async () => {
        await resolver.resolve("@Blueprints/..\\secret.txt");
      },
      Deno.errors.NotFound, // File doesn't exist with backslash in name
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("PathResolver: handles multiple path traversal attempts", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-multi-" });
  try {
    const blueprintsDir = join(tempDir, "Blueprints");
    await Deno.mkdir(blueprintsDir);
    const secretFile = join(tempDir, "secret.txt");
    await Deno.writeTextFile(secretFile, "secret");

    const config = createMockConfig(tempDir);
    const resolver = new PathResolver(config);

    // Try multiple ../ attempts - these resolve outside temp dir so file won't exist
    await assertRejects(
      async () => {
        await resolver.resolve("@Blueprints/../../../secret.txt");
      },
      Deno.errors.NotFound, // Path doesn't exist after multiple traversals
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("PathResolver: handles non-existent file in valid directory", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-nonexist-" });
  try {
    const blueprintsDir = join(tempDir, "Blueprints");
    await Deno.mkdir(blueprintsDir);

    const config = createMockConfig(tempDir);
    const resolver = new PathResolver(config);

    // Try to resolve a non-existent file
    await assertRejects(
      async () => {
        await resolver.resolve("@Blueprints/nonexistent.md");
      },
      Deno.errors.NotFound,
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("PathResolver: resolves nested directories", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-nested-" });
  try {
    const nestedDir = join(tempDir, "Knowledge", "deep", "nested");
    await Deno.mkdir(nestedDir, { recursive: true });
    const testFile = join(nestedDir, "file.md");
    await Deno.writeTextFile(testFile, "content");

    const config = createMockConfig(tempDir);
    const resolver = new PathResolver(config);

    const resolved = await resolver.resolve("@Knowledge/deep/nested/file.md");
    assertEquals(resolved, await Deno.realPath(testFile));
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("PathResolver: resolves all valid aliases", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-aliases-" });
  try {
    // Create all directories
    const inboxDir = join(tempDir, "Inbox");
    const knowledgeDir = join(tempDir, "Knowledge");
    const systemDir = join(tempDir, "System");
    const blueprintsDir = join(tempDir, "Blueprints");

    await Deno.mkdir(inboxDir);
    await Deno.mkdir(knowledgeDir);
    await Deno.mkdir(systemDir);
    await Deno.mkdir(blueprintsDir);

    // Create test files
    await Deno.writeTextFile(join(inboxDir, "inbox.md"), "inbox");
    await Deno.writeTextFile(join(knowledgeDir, "knowledge.md"), "knowledge");
    await Deno.writeTextFile(join(systemDir, "system.md"), "system");
    await Deno.writeTextFile(join(blueprintsDir, "blueprint.md"), "blueprint");

    const config = createMockConfig(tempDir);
    const resolver = new PathResolver(config);

    // Test all aliases
    const inboxResolved = await resolver.resolve("@Inbox/inbox.md");
    const knowledgeResolved = await resolver.resolve("@Knowledge/knowledge.md");
    const systemResolved = await resolver.resolve("@System/system.md");
    const blueprintsResolved = await resolver.resolve("@Blueprints/blueprint.md");

    assertEquals(inboxResolved, await Deno.realPath(join(inboxDir, "inbox.md")));
    assertEquals(knowledgeResolved, await Deno.realPath(join(knowledgeDir, "knowledge.md")));
    assertEquals(systemResolved, await Deno.realPath(join(systemDir, "system.md")));
    assertEquals(blueprintsResolved, await Deno.realPath(join(blueprintsDir, "blueprint.md")));
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("PathResolver: handles special characters in filenames", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-special-" });
  try {
    const blueprintsDir = join(tempDir, "Blueprints");
    await Deno.mkdir(blueprintsDir);
    const testFile = join(blueprintsDir, "file with spaces.md");
    await Deno.writeTextFile(testFile, "content");

    const config = createMockConfig(tempDir);
    const resolver = new PathResolver(config);

    const resolved = await resolver.resolve("@Blueprints/file with spaces.md");
    assertEquals(resolved, await Deno.realPath(testFile));
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("PathResolver: handles unicode in paths", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-unicode-" });
  try {
    const blueprintsDir = join(tempDir, "Blueprints");
    await Deno.mkdir(blueprintsDir);
    const testFile = join(blueprintsDir, "文件.md");
    await Deno.writeTextFile(testFile, "content");

    const config = createMockConfig(tempDir);
    const resolver = new PathResolver(config);

    const resolved = await resolver.resolve("@Blueprints/文件.md");
    assertEquals(resolved, await Deno.realPath(testFile));
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("PathResolver: rejects empty path after alias", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-empty-" });
  try {
    const config = createMockConfig(tempDir);
    const resolver = new PathResolver(config);

    // "@Blueprints" without trailing slash or path - will cause join to fail
    await assertRejects(
      async () => {
        await resolver.resolve("@Blueprints");
      },
      Deno.errors.NotFound,
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

// ============================================================================
// Activity Logging Tests
// ============================================================================

Deno.test("PathResolver: logs security violations to console when no DB", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "resolver-test-log-" });
  try {
    const config = createMockConfig(tempDir);
    // Create resolver without DB
    const resolver = new PathResolver(config);

    // Capture console.warn
    const originalWarn = console.warn;
    let warnCalled = false;
    let warnMessage = "";

    console.warn = (msg: string) => {
      warnCalled = true;
      warnMessage = msg;
    };

    try {
      await assertRejects(
        async () => {
          await resolver.resolve("no-alias-path");
        },
        Error,
        "Path must start with a portal alias",
      );

      // Verify console.warn was called
      assertEquals(warnCalled, true);
      assertEquals(warnMessage.includes("[SECURITY]"), true);
      assertEquals(warnMessage.includes("path.invalid_alias"), true);
    } finally {
      console.warn = originalWarn;
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
