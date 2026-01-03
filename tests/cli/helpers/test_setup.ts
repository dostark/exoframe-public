/**
 * CLI Test Helper Utilities
 */

import { join } from "@std/path";
import { PortalCommands } from "../../../src/cli/portal_commands.ts";
import { initTestDbService } from "../../helpers/db.ts";
import { createMockConfig } from "../../helpers/config.ts";

/**
 * Creates a complete portal test environment with all necessary directories
 */
export async function initPortalTest(options?: {
  createTarget?: boolean;
  targetFiles?: Record<string, string>;
}) {
  const tempRoot = await Deno.makeTempDir({ prefix: "portal-test-" });
  const targetDir = options?.createTarget !== false ? await Deno.makeTempDir({ prefix: "portal-target-" }) : "";

  const { db, cleanup: dbCleanup } = await initTestDbService();

  // Create required directories
  await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
  await Deno.mkdir(join(tempRoot, "Memory", "Projects"), { recursive: true });

  // Create target directory files if specified
  if (targetDir && options?.targetFiles) {
    for (const [filePath, content] of Object.entries(options.targetFiles)) {
      const fullPath = join(targetDir, filePath);
      await Deno.mkdir(join(fullPath, ".."), { recursive: true });
      await Deno.writeTextFile(fullPath, content);
    }
  }

  const config = createMockConfig(tempRoot);
  const commands = new PortalCommands({ config, db });

  const cleanup = async () => {
    await dbCleanup();
    await Deno.remove(tempRoot, { recursive: true }).catch(() => {});
    if (targetDir) {
      await Deno.remove(targetDir, { recursive: true }).catch(() => {});
    }
  };

  return {
    tempRoot,
    targetDir,
    config,
    db,
    commands,
    cleanup,
  };
}

/**
 * Creates a portal with symlink and context card
 */
export async function createTestPortal(
  commands: PortalCommands,
  targetDir: string,
  alias: string,
) {
  await commands.add(targetDir, alias);
  // Wait for async operations to complete
  await new Promise((resolve) => setTimeout(resolve, 50));
}

/**
 * Verifies a portal's symlink exists
 */
export async function verifySymlink(tempRoot: string, alias: string): Promise<boolean> {
  const symlinkPath = join(tempRoot, "Portals", alias);
  try {
    const info = await Deno.lstat(symlinkPath);
    return info.isSymlink;
  } catch {
    return false;
  }
}

/**
 * Verifies a portal's context card exists
 */
export async function verifyContextCard(tempRoot: string, alias: string): Promise<boolean> {
  const cardPath = join(tempRoot, "Memory", "Projects", alias, "portal.md");
  try {
    await Deno.stat(cardPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the path to a portal's symlink
 */
export function getPortalSymlinkPath(tempRoot: string, alias: string): string {
  return join(tempRoot, "Portals", alias);
}

/**
 * Gets the path to a portal's context card
 */
export function getPortalCardPath(tempRoot: string, alias: string): string {
  return join(tempRoot, "Memory", "Projects", alias, "portal.md");
}

/**
 * Creates a unified CLI test context for tests.
 * Delegates to `initTestDbService()` and optionally creates extra directories.
 */
export async function createCliTestContext(options?: { createDirs?: string[] }) {
  const { db, tempDir, config, cleanup } = await initTestDbService();

  if (options?.createDirs) {
    for (const dir of options.createDirs) {
      await Deno.mkdir(join(tempDir, dir), { recursive: true });
    }
  }

  return { db, tempDir, config, cleanup };
}
