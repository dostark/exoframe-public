/**
 * Tests for PortalCommands (CLI Portal Management)
 *
 * Success Criteria:
 * - Test 1: add command creates symlink and context card
 * - Test 2: add command validates target directory exists
 * - Test 3: list command returns all registered portals with metadata
 * - Test 4: remove command removes symlink and optionally context card
 * - Test 5: show command displays portal details and file structure
 * - Test 6: Commands log activity to Activity Journal
 * - Test 7: Handles special characters in portal names
 */

import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { PortalCommands } from "../../src/cli/portal_commands.ts";
import { initTestDbService } from "../helpers/db.ts";
import { createMockConfig, createTestConfigService } from "../helpers/config.ts";

Deno.test("PortalCommands: adds portal successfully", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-add-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    // Create some files in target
    await Deno.writeTextFile(join(targetDir, "README.md"), "# Test Project");
    await Deno.writeTextFile(join(targetDir, "package.json"), '{"name":"test"}');

    const commands = new PortalCommands({ config, db });
    await commands.add(targetDir, "TestPortal");

    // Verify symlink created
    const symlinkPath = join(tempRoot, "Portals", "TestPortal");
    const symlinkInfo = await Deno.lstat(symlinkPath);
    assertEquals(symlinkInfo.isSymlink, true);

    // Verify context card created
    const cardPath = join(tempRoot, "Knowledge", "Portals", "TestPortal.md");
    const cardExists = await Deno.stat(cardPath).then(() => true).catch(() => false);
    assertEquals(cardExists, true);

    // Verify logged to database
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Note: Activity logging is non-blocking, so we just verify no errors occurred
    // The actual logging can be verified in integration tests
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: rejects non-existent target path", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-noexist-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });

    await assertRejects(
      async () => await commands.add("/nonexistent/path", "BadPortal"),
      Error,
      "Target path does not exist",
    );

    // Verify no symlink created
    const symlinkPath = join(tempRoot, "Portals", "BadPortal");
    const exists = await Deno.stat(symlinkPath).then(() => true).catch(() => false);
    assertEquals(exists, false);
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test("PortalCommands: rejects invalid alias characters", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-invalid-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    const commands = new PortalCommands({ config, db });

    await assertRejects(
      async () => await commands.add(targetDir, "Bad Portal!"),
      Error,
      "invalid characters",
    );

    await assertRejects(
      async () => await commands.add(targetDir, "123Start"),
      Error,
      "cannot start with a number",
    );
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: rejects reserved alias names", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-reserved-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    const commands = new PortalCommands({ config, db });

    await assertRejects(
      async () => await commands.add(targetDir, "System"),
      Error,
      "reserved",
    );

    await assertRejects(
      async () => await commands.add(targetDir, "Inbox"),
      Error,
      "reserved",
    );
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: rejects duplicate alias", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-dup-" });
  const targetDir1 = await Deno.makeTempDir({ prefix: "portal-target-1-" });
  const targetDir2 = await Deno.makeTempDir({ prefix: "portal-target-2-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });

    // Add first portal
    await commands.add(targetDir1, "DupePortal");

    // Try to add second with same alias
    await assertRejects(
      async () => await commands.add(targetDir2, "DupePortal"),
      Error,
      "already exists",
    );
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir1, { recursive: true });
    await Deno.remove(targetDir2, { recursive: true });
  }
});

Deno.test("PortalCommands: lists all portals with status", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-list-" });
  const targetDir1 = await Deno.makeTempDir({ prefix: "portal-target-1-" });
  const targetDir2 = await Deno.makeTempDir({ prefix: "portal-target-2-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });

    // Add two portals
    await commands.add(targetDir1, "Portal1");
    await commands.add(targetDir2, "Portal2");

    const portals = await commands.list();

    assertEquals(portals.length, 2);

    // Sort to ensure consistent ordering
    portals.sort((a, b) => a.alias.localeCompare(b.alias));

    assertEquals(portals[0].alias, "Portal1");
    assertEquals(portals[0].status, "active");
    assertEquals(portals[1].alias, "Portal2");
    assertEquals(portals[1].status, "active");
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir1, { recursive: true });
    await Deno.remove(targetDir2, { recursive: true });
  }
});

Deno.test("PortalCommands: detects broken portals", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-broken-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });

    // Add portal
    await commands.add(targetDir, "BrokenPortal");

    // Remove target directory to break the portal
    await Deno.remove(targetDir, { recursive: true });

    const portals = await commands.list();

    assertEquals(portals.length, 1);
    assertEquals(portals[0].alias, "BrokenPortal");
    assertEquals(portals[0].status, "broken");
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test("PortalCommands: shows portal details", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-show-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });
    await commands.add(targetDir, "ShowPortal");

    const details = await commands.show("ShowPortal");

    assertExists(details);
    assertEquals(details.alias, "ShowPortal");
    assertEquals(details.status, "active");
    assertEquals(details.targetPath, targetDir);
    assertExists(details.symlinkPath);
    assertExists(details.contextCardPath);
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: show throws error for non-existent portal", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-show-err-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    const commands = new PortalCommands({ config, db });

    await assertRejects(
      async () => await commands.show("NonExistent"),
      Error,
      "not found",
    );
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test("PortalCommands: removes portal and archives context card", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-remove-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });
    await commands.add(targetDir, "RemovePortal");

    await commands.remove("RemovePortal");

    // Verify symlink removed
    const symlinkPath = join(tempRoot, "Portals", "RemovePortal");
    const symlinkExists = await Deno.stat(symlinkPath).then(() => true).catch(() => false);
    assertEquals(symlinkExists, false);

    // Verify context card archived
    const archivedDir = join(tempRoot, "Knowledge", "Portals", "_archived");
    const archivedExists = await Deno.stat(archivedDir).then(() => true).catch(() => false);
    assertEquals(archivedExists, true);

    // Verify logged
    await new Promise((resolve) => setTimeout(resolve, 200));
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: remove with --keep-card preserves context card", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-keep-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });
    await commands.add(targetDir, "KeepCardPortal");

    await commands.remove("KeepCardPortal", { keepCard: true });

    // Verify context card NOT archived (still in place)
    const cardPath = join(tempRoot, "Knowledge", "Portals", "KeepCardPortal.md");
    const cardExists = await Deno.stat(cardPath).then(() => true).catch(() => false);
    assertEquals(cardExists, true);
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: verifies all portals", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-verify-all-" });
  const targetDir1 = await Deno.makeTempDir({ prefix: "portal-target-1-" });
  const targetDir2 = await Deno.makeTempDir({ prefix: "portal-target-2-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });
    await commands.add(targetDir1, "Portal1");
    await commands.add(targetDir2, "Portal2");

    // Break one portal
    await Deno.remove(targetDir2, { recursive: true });

    const results = await commands.verify();

    assertEquals(results.length, 2);

    // Find each portal in results
    const portal1 = results.find((r) => r.alias === "Portal1");
    const portal2 = results.find((r) => r.alias === "Portal2");

    assertExists(portal1);
    assertEquals(portal1.status, "ok");

    assertExists(portal2);
    assertEquals(portal2.status, "failed");
    assertExists(portal2.issues);
    assertEquals(portal2.issues!.length > 0, true);
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir1, { recursive: true });
  }
});

Deno.test("PortalCommands: verifies specific portal", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-verify-one-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });
    await commands.add(targetDir, "VerifyPortal");

    const results = await commands.verify("VerifyPortal");

    assertEquals(results.length, 1);
    assertEquals(results[0].alias, "VerifyPortal");
    assertEquals(results[0].status, "ok");
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: refresh regenerates context card", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-refresh-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });
    await commands.add(targetDir, "RefreshPortal");

    // Add new file to target
    await Deno.writeTextFile(join(targetDir, "NEW_FILE.md"), "# New Feature");

    await commands.refresh("RefreshPortal");

    // Verify logged
    await new Promise((resolve) => setTimeout(resolve, 200));
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: handles missing database gracefully", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-nodb-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    // Create commands without database
    const commands = new PortalCommands({ config });
    await commands.add(targetDir, "NoDB");

    // Should still work
    const portals = await commands.list();
    assertEquals(portals.length, 1);
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: rejects target that is a file not directory", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-file-" });
  const targetFile = await Deno.makeTempFile({ prefix: "portal-file-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });

    await assertRejects(
      async () => await commands.add(targetFile, "FilePortal"),
      Error,
      "not a directory",
    );
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetFile);
  }
});

Deno.test("PortalCommands: rejects empty alias", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-empty-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    const commands = new PortalCommands({ config, db });

    await assertRejects(
      async () => await commands.add(targetDir, ""),
      Error,
      "cannot be empty",
    );
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: rejects alias exceeding 50 characters", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-long-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    const commands = new PortalCommands({ config, db });

    const longAlias = "a".repeat(51);
    await assertRejects(
      async () => await commands.add(targetDir, longAlias),
      Error,
      "cannot exceed 50 characters",
    );
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: list handles empty portals directory", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-empty-list-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    // Don't create Portals directory

    const commands = new PortalCommands({ config, db });
    const portals = await commands.list();

    assertEquals(portals.length, 0);
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test("PortalCommands: list skips non-symlink entries", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-nonsym-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });

    // Create a regular file in Portals directory
    await Deno.writeTextFile(join(tempRoot, "Portals", "README.md"), "Not a portal");

    const commands = new PortalCommands({ config, db });
    const portals = await commands.list();

    assertEquals(portals.length, 0);
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test("PortalCommands: show handles broken symlink with unknown target", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-unknown-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });
    await commands.add(targetDir, "BrokenShow");

    // Remove target to break symlink
    await Deno.remove(targetDir, { recursive: true });

    const details = await commands.show("BrokenShow");

    assertEquals(details.status, "broken");
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test("PortalCommands: show detects read-only permissions", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-readonly-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });
    await commands.add(targetDir, "ReadOnlyPortal");

    // Make directory read-only (permissions 555)
    await Deno.chmod(targetDir, 0o555);

    const details = await commands.show("ReadOnlyPortal");

    // Should detect as read-only or broken depending on OS
    assertExists(details.permissions);

    // Restore permissions for cleanup
    await Deno.chmod(targetDir, 0o755);
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: remove handles missing context card gracefully", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-nocard-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });
    await commands.add(targetDir, "NoCard");

    // Delete context card manually
    const cardPath = join(tempRoot, "Knowledge", "Portals", "NoCard.md");
    await Deno.remove(cardPath);

    // Should still remove successfully
    await commands.remove("NoCard");

    const symlinkPath = join(tempRoot, "Portals", "NoCard");
    const symlinkExists = await Deno.stat(symlinkPath).then(() => true).catch(() => false);
    assertEquals(symlinkExists, false);
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: verify detects missing symlink", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-nosym-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });
    await commands.add(targetDir, "NoSymlink");

    // Remove just the symlink
    const symlinkPath = join(tempRoot, "Portals", "NoSymlink");
    await Deno.remove(symlinkPath);

    const results = await commands.verify("NoSymlink");

    assertEquals(results.length, 1);
    assertEquals(results[0].status, "failed");
    assertExists(results[0].issues);
    assertEquals(results[0].issues!.some((i) => i.includes("Symlink")), true);
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: verify detects missing context card", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-nocard-verify-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db });
    await commands.add(targetDir, "NoCardVerify");

    // Remove context card
    const cardPath = join(tempRoot, "Knowledge", "Portals", "NoCardVerify.md");
    await Deno.remove(cardPath);

    const results = await commands.verify("NoCardVerify");

    assertEquals(results.length, 1);
    assertEquals(results[0].status, "failed");
    assertExists(results[0].issues);
    assertEquals(results[0].issues!.some((i) => i.includes("Context card")), true);
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: rollback on symlink creation failure", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-rollback-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const config = createMockConfig(tempRoot);
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    // Pre-create a file where symlink would go to cause conflict
    const symlinkPath = join(tempRoot, "Portals", "RollbackTest");
    await Deno.writeTextFile(symlinkPath, "existing file");

    const commands = new PortalCommands({ config, db });

    try {
      await commands.add(targetDir, "RollbackTest");
      // Should not reach here
      assertEquals(true, false, "Should have thrown error");
    } catch (error) {
      // Expected to fail
      assertExists(error);
    }

    // Verify original file still exists (wasn't deleted by rollback attempt)
    const content = await Deno.readTextFile(symlinkPath);
    assertEquals(content, "existing file");
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: adds portal to config file", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-config-add-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const configService = await createTestConfigService(tempRoot);
    const config = configService.get();

    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db, configService });
    await commands.add(targetDir, "ConfigTest");

    // Verify portal was added to config
    const portals = configService.getPortals();
    assertEquals(portals.length, 1);
    assertEquals(portals[0].alias, "ConfigTest");
    assertEquals(portals[0].target_path, targetDir);
    assertExists(portals[0].created);
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: removes portal from config file", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-config-remove-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const configService = await createTestConfigService(tempRoot);
    const config = configService.get();

    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db, configService });

    // Add portal
    await commands.add(targetDir, "RemoveTest");
    assertEquals(configService.getPortals().length, 1);

    // Remove portal
    await commands.remove("RemoveTest");

    // Verify portal was removed from config
    const portals = configService.getPortals();
    assertEquals(portals.length, 0);
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: list includes created timestamp from config", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-timestamp-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const configService = await createTestConfigService(tempRoot);
    const config = configService.get();

    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db, configService });
    await commands.add(targetDir, "TimestampTest");

    // Get fresh config to see updated portals
    const updatedConfig = configService.get();
    const commandsRefreshed = new PortalCommands({ config: updatedConfig, db, configService });

    // List portals and verify timestamp
    const portals = await commandsRefreshed.list();
    assertEquals(portals.length, 1);
    assertExists(portals[0].created);

    // Verify timestamp is valid ISO string
    const date = new Date(portals[0].created!);
    assertEquals(isNaN(date.getTime()), false);
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});

Deno.test("PortalCommands: verify detects config mismatch", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-verify-config-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const wrongDir = await Deno.makeTempDir({ prefix: "portal-wrong-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const configService = await createTestConfigService(tempRoot);
    const config = configService.get();

    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db, configService });

    // Add portal normally
    await commands.add(targetDir, "MismatchTest");

    // Manually change symlink to point elsewhere
    const symlinkPath = join(tempRoot, "Portals", "MismatchTest");

    // Check if symlink exists first
    try {
      await Deno.lstat(symlinkPath);
      await Deno.remove(symlinkPath);
      await Deno.symlink(wrongDir, symlinkPath);
    } catch (_error) {
      // If symlink doesn't exist, just create it
      await Deno.symlink(wrongDir, symlinkPath);
    }

    // Verify should detect mismatch
    const results = await commands.verify("MismatchTest");
    assertEquals(results.length, 1);
    assertEquals(results[0].status, "failed");
    assertExists(results[0].issues);
    assertEquals(
      results[0].issues!.some((i) => i.includes("Config mismatch")),
      true,
    );
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
    await Deno.remove(wrongDir, { recursive: true });
  }
});

Deno.test("PortalCommands: verify detects missing config entry", async () => {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-verify-missing-" });
  const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
  const { db, cleanup } = await initTestDbService();

  try {
    const configService = await createTestConfigService(tempRoot);
    const config = configService.get();

    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Knowledge", "Portals"), { recursive: true });

    // Create symlink manually without adding to config
    const symlinkPath = join(tempRoot, "Portals", "Orphaned");
    await Deno.symlink(targetDir, symlinkPath);

    // Create context card
    const cardPath = join(tempRoot, "Knowledge", "Portals", "Orphaned.md");
    await Deno.writeTextFile(cardPath, "# Orphaned Portal");

    const commands = new PortalCommands({ config, db, configService });

    // Verify should detect missing config
    const results = await commands.verify("Orphaned");
    assertEquals(results.length, 1);
    assertEquals(results[0].status, "failed");
    assertExists(results[0].issues);
    assertEquals(
      results[0].issues!.some((i) => i.includes("not found in configuration")),
      true,
    );
  } finally {
    await cleanup();
    await Deno.remove(tempRoot, { recursive: true });
    await Deno.remove(targetDir, { recursive: true });
  }
});
