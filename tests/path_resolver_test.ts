import { assertEquals, assertRejects } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { PathResolver } from "../src/services/path_resolver.ts";
import type { Config } from "../src/config/schema.ts";

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

    const config: Config = {
      system: { root: tempDir, log_level: "info", version: "1.0.0" },
      paths: { inbox: "Inbox", knowledge: "Knowledge", system: "System", blueprints: "Blueprints" },
      watcher: { debounce_ms: 200, stability_check: true },
      agents: { default_model: "gpt-4o", timeout_sec: 60 },
    };

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

    const config: Config = {
      system: { root: tempDir, log_level: "info", version: "1.0.0" },
      paths: { inbox: "Inbox", knowledge: "Knowledge", system: "System", blueprints: "Blueprints" },
      watcher: { debounce_ms: 200, stability_check: true },
      agents: { default_model: "gpt-4o", timeout_sec: 60 },
    };

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

    const config: Config = {
      system: { root: tempDir, log_level: "info", version: "1.0.0" },
      paths: { inbox: "Inbox", knowledge: "Knowledge", system: "System", blueprints: "Blueprints" },
      watcher: { debounce_ms: 200, stability_check: true },
      agents: { default_model: "gpt-4o", timeout_sec: 60 },
    };

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
    const config: Config = {
      system: { root: tempDir, log_level: "info", version: "1.0.0" },
      paths: { inbox: "Inbox", knowledge: "Knowledge", system: "System", blueprints: "Blueprints" },
      watcher: { debounce_ms: 200, stability_check: true },
      agents: { default_model: "gpt-4o", timeout_sec: 60 },
    };

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

    const config: Config = {
      system: { root: tempDir, log_level: "info", version: "1.0.0" },
      paths: { inbox: "Inbox", knowledge: "Knowledge", system: "System", blueprints: "Blueprints" },
      watcher: { debounce_ms: 200, stability_check: true },
      agents: { default_model: "gpt-4o", timeout_sec: 60 },
    };

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
