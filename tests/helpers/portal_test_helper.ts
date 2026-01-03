/**
 * Test Helper for PortalCommands tests
 * Provides utilities for config-based portal tests
 */

import { join } from "@std/path";
import { PortalCommands } from "../../src/cli/portal_commands.ts";
import { initTestDbService } from "./db.ts";
import { createTestConfigService } from "./config.ts";
import type { ConfigService } from "../../src/config/service.ts";
import type { DatabaseService } from "../../src/services/db.ts";

/**
 * Helper class for config-based portal tests
 */
export class PortalConfigTestHelper {
  constructor(
    public tempRoot: string,
    public targetDir: string,
    public commands: PortalCommands,
    public configService: ConfigService,
    public db: DatabaseService,
    private dbCleanup: () => Promise<void>,
  ) {}

  /**
   * Create a new portal config test context
   */
  static async create(prefix: string): Promise<PortalConfigTestHelper> {
    const tempRoot = await Deno.makeTempDir({ prefix: `portal-test-${prefix}-` });
    const targetDir = await Deno.makeTempDir({ prefix: "portal-target-" });
    const { db, cleanup: dbCleanup } = await initTestDbService();

    const configService = await createTestConfigService(tempRoot);
    const config = configService.get();

    // Create portal symlink directory (Portals/) for mounted projects
    // and portal context store (Memory/Portals/) for portal context cards (Markdown)
    await Deno.mkdir(join(tempRoot, "Portals"), { recursive: true });
    await Deno.mkdir(join(tempRoot, "Memory", "Portals"), { recursive: true });

    const commands = new PortalCommands({ config, db, configService });

    return new PortalConfigTestHelper(
      tempRoot,
      targetDir,
      commands,
      configService,
      db,
      dbCleanup,
    );
  }

  /**
   * Create an additional target directory (for tests needing multiple targets)
   */
  async createAdditionalTarget(): Promise<string> {
    return await Deno.makeTempDir({ prefix: "portal-target-" });
  }

  /**
   * Add a portal
   */
  async addPortal(alias: string, targetPath?: string): Promise<void> {
    await this.commands.add(targetPath || this.targetDir, alias);
  }

  /**
   * Remove a portal
   */
  async removePortal(alias: string): Promise<void> {
    await this.commands.remove(alias);
  }

  /**
   * List all portals
   */
  async listPortals() {
    return await this.commands.list();
  }

  /**
   * Verify portal(s)
   */
  async verifyPortal(alias?: string) {
    return await this.commands.verify(alias);
  }

  /**
   * Get portal symlink path
   */
  getSymlinkPath(alias: string): string {
    return join(this.tempRoot, "Portals", alias);
  }

  /**
   * Get portal context card path
   */
  getCardPath(alias: string): string {
    return join(this.tempRoot, "Memory", "Portals", `${alias}.md`);
  }

  /**
   * Get fresh commands instance with updated config
   */
  getRefreshedCommands(): PortalCommands {
    const config = this.configService.get();
    return new PortalCommands({ config, db: this.db, configService: this.configService });
  }

  /**
   * Cleanup all resources
   */
  async cleanup(additionalDirs: string[] = []): Promise<void> {
    await this.dbCleanup();
    await Deno.remove(this.tempRoot, { recursive: true }).catch(() => {});
    await Deno.remove(this.targetDir, { recursive: true }).catch(() => {});

    for (const dir of additionalDirs) {
      await Deno.remove(dir, { recursive: true }).catch(() => {});
    }
  }
}

/**
 * Factory function to create portal config test context
 */
export async function createPortalConfigTestContext(
  prefix: string,
): Promise<{ helper: PortalConfigTestHelper; cleanup: (additionalDirs?: string[]) => Promise<void> }> {
  const helper = await PortalConfigTestHelper.create(prefix);
  return {
    helper,
    cleanup: (additionalDirs?: string[]) => helper.cleanup(additionalDirs),
  };
}
