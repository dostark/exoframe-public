import { join, resolve } from "@std/path";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "../services/db.ts";
import { ConfigService } from "../config/service.ts";
import { ContextCardGenerator } from "../services/context_card_generator.ts";
import { EventLogger } from "../services/event_logger.ts";

export interface PortalInfo {
  alias: string;
  targetPath: string;
  symlinkPath: string;
  contextCardPath: string;
  status: "active" | "broken";
  created?: string;
  lastVerified?: string;
}

export interface PortalDetails extends PortalInfo {
  permissions?: string;
}

export interface VerificationResult {
  alias: string;
  status: "ok" | "failed";
  issues?: string[];
}

interface PortalCommandsContext {
  config: Config;
  db?: DatabaseService;
  configService?: ConfigService;
}

export class PortalCommands {
  private config: Config;
  private db?: DatabaseService;
  private configService?: ConfigService;
  private portalsDir: string;
  private contextCardGenerator: ContextCardGenerator;
  private reservedNames = ["System", "Inbox", "Knowledge", "Blueprints", "Active", "Archive", "Portals"];

  constructor(context: PortalCommandsContext) {
    this.config = context.config;
    this.db = context.db;
    this.configService = context.configService;
    this.portalsDir = join(this.config.system.root, "Portals");
    this.contextCardGenerator = new ContextCardGenerator(this.config, this.db);
  }

  /**
   * Add a new portal
   */
  async add(targetPath: string, alias: string): Promise<void> {
    // Validate alias
    this.validateAlias(alias);

    // Resolve target path to absolute
    const absoluteTarget = resolve(targetPath);

    // Check target exists
    try {
      const stat = await Deno.stat(absoluteTarget);
      if (!stat.isDirectory) {
        throw new Error(`Target path is not a directory: ${absoluteTarget}`);
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Target path does not exist: ${absoluteTarget}`);
      }
      throw error;
    }

    // Check for duplicate alias
    const symlinkPath = join(this.portalsDir, alias);
    try {
      await Deno.lstat(symlinkPath);
      throw new Error(`Portal '${alias}' already exists`);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }

    // Ensure portals directory exists
    await Deno.mkdir(this.portalsDir, { recursive: true });

    try {
      // Create symlink
      await Deno.symlink(absoluteTarget, symlinkPath);

      // Generate context card
      await this.contextCardGenerator.generate({
        alias,
        path: absoluteTarget,
        techStack: [],
      });

      // Update config file
      if (this.configService) {
        await this.configService.addPortal(alias, absoluteTarget);
      }

      // Log to activity journal (also outputs to console)
      await this.logActivity("portal.added", {
        alias,
        target: absoluteTarget,
        symlink: `Portals/${alias}`,
        context_card: "generated",
        hint: "Restart daemon to apply changes: exoctl daemon restart",
      });
    } catch (error) {
      // Rollback on failure
      try {
        await Deno.remove(symlinkPath);
      } catch {
        // Ignore cleanup errors
      }

      // Try to rollback config if it was added
      if (this.configService) {
        try {
          await this.configService.removePortal(alias);
        } catch {
          // Ignore config rollback errors
        }
      }

      throw error;
    }
  }

  /**
   * List all portals with their status
   */
  async list(): Promise<PortalInfo[]> {
    const portals: PortalInfo[] = [];

    try {
      for await (const entry of Deno.readDir(this.portalsDir)) {
        if (!entry.isSymlink) continue;

        const symlinkPath = join(this.portalsDir, entry.name);
        const contextCardPath = join(
          this.config.system.root,
          this.config.paths.knowledge,
          "Portals",
          `${entry.name}.md`,
        );

        let targetPath: string;
        let status: "active" | "broken";

        try {
          targetPath = await Deno.readLink(symlinkPath);
          // Check if target still exists
          await Deno.stat(targetPath);
          status = "active";
        } catch {
          targetPath = "(unknown)";
          status = "broken";
        }

        // Get created timestamp from config
        const configPortal = this.configService?.getPortal(entry.name);

        portals.push({
          alias: entry.name,
          targetPath,
          symlinkPath,
          contextCardPath,
          status,
          created: configPortal?.created,
        });
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
      // Portals directory doesn't exist yet - return empty array
    }

    return portals;
  }

  /**
   * Show detailed information about a specific portal
   */
  async show(alias: string): Promise<PortalDetails> {
    const symlinkPath = join(this.portalsDir, alias);
    const contextCardPath = join(
      this.config.system.root,
      this.config.paths.knowledge,
      "Portals",
      `${alias}.md`,
    );

    let targetPath: string;
    let status: "active" | "broken";
    let permissions: string | undefined;

    try {
      await Deno.lstat(symlinkPath);
    } catch {
      throw new Error(`Portal '${alias}' not found`);
    }

    try {
      targetPath = await Deno.readLink(symlinkPath);
      const stat = await Deno.stat(targetPath);
      status = stat.isDirectory ? "active" : "broken";

      // Try to determine permissions
      try {
        for await (const _ of Deno.readDir(targetPath)) {
          break; // Just check if we can read
        }
        permissions = "Read/Write";
      } catch {
        permissions = "Read Only";
      }
    } catch {
      targetPath = await Deno.readLink(symlinkPath).catch(() => "(unknown)");
      status = "broken";
    }

    // Get created timestamp from config
    const configPortal = this.configService?.getPortal(alias);

    return {
      alias,
      targetPath,
      symlinkPath,
      contextCardPath,
      status,
      permissions,
      created: configPortal?.created,
    };
  }

  /**
   * Remove a portal
   */
  async remove(alias: string, options?: { keepCard?: boolean }): Promise<void> {
    const symlinkPath = join(this.portalsDir, alias);
    const contextCardPath = join(
      this.config.system.root,
      this.config.paths.knowledge,
      "Portals",
      `${alias}.md`,
    );

    // Check portal exists
    try {
      await Deno.lstat(symlinkPath);
    } catch {
      throw new Error(`Portal '${alias}' not found`);
    }

    // Remove symlink
    await Deno.remove(symlinkPath);

    // Remove from config
    if (this.configService) {
      await this.configService.removePortal(alias);
    }

    // Archive context card (unless keepCard is true)
    if (!options?.keepCard) {
      const archivedDir = join(
        this.config.system.root,
        this.config.paths.knowledge,
        "Portals",
        "_archived",
      );
      await Deno.mkdir(archivedDir, { recursive: true });

      const timestamp = new Date().toISOString().split("T")[0].replace(/-/g, "");
      const archivedPath = join(archivedDir, `${alias}_${timestamp}.md`);

      try {
        await Deno.rename(contextCardPath, archivedPath);
      } catch (error) {
        // If card doesn't exist, that's okay
        if (!(error instanceof Deno.errors.NotFound)) {
          throw error;
        }
      }
    }

    // Log to activity journal (also outputs to console)
    await this.logActivity("portal.removed", {
      alias,
      context_card: options?.keepCard ? "kept" : "archived",
      hint: "Restart daemon to apply changes: exoctl daemon restart",
    });
  }

  /**
   * Verify portal integrity
   */
  async verify(alias?: string): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];
    const portalsToVerify = alias ? [alias] : (await this.list()).map((p) => p.alias);

    for (const portalAlias of portalsToVerify) {
      const issues: string[] = [];
      const symlinkPath = join(this.portalsDir, portalAlias);
      const contextCardPath = join(
        this.config.system.root,
        this.config.paths.knowledge,
        "Portals",
        `${portalAlias}.md`,
      );

      // Check symlink exists
      try {
        await Deno.lstat(symlinkPath);
      } catch {
        issues.push("Symlink does not exist");
      }

      // Check target exists
      let targetPath: string | null = null;
      try {
        targetPath = await Deno.readLink(symlinkPath);
        await Deno.stat(targetPath);
      } catch {
        issues.push("Target directory not found");
      }

      // Check context card exists
      try {
        await Deno.stat(contextCardPath);
      } catch {
        issues.push("Context card missing");
      }

      // Check target is readable
      if (targetPath) {
        try {
          for await (const _ of Deno.readDir(targetPath)) {
            break; // Just check if we can read
          }
        } catch {
          issues.push("Target directory not readable");
        }
      }

      // Check config consistency
      if (this.configService) {
        const configPortal = this.configService.getPortal(portalAlias);
        if (!configPortal) {
          issues.push("Portal not found in configuration");
        } else if (targetPath && configPortal.target_path !== targetPath) {
          issues.push(`Config mismatch: expected ${configPortal.target_path}, found ${targetPath}`);
        }
      }

      results.push({
        alias: portalAlias,
        status: issues.length === 0 ? "ok" : "failed",
        issues: issues.length > 0 ? issues : undefined,
      });
    }

    // Log verification
    await this.logActivity("portal.verified", {
      portals_checked: results.length,
      failed: results.filter((r) => r.status === "failed").length,
    });

    return results;
  }

  /**
   * Refresh context card for a portal
   */
  async refresh(alias: string): Promise<void> {
    const symlinkPath = join(this.portalsDir, alias);

    // Check portal exists
    try {
      await Deno.lstat(symlinkPath);
    } catch {
      throw new Error(`Portal '${alias}' not found`);
    }

    // Get target path
    const targetPath = await Deno.readLink(symlinkPath);

    // Regenerate context card
    await this.contextCardGenerator.generate({
      alias,
      path: targetPath,
      techStack: [],
    });

    // Log to activity journal (also outputs to console)
    await this.logActivity("portal.refreshed", {
      alias,
      target: targetPath,
    });
  }

  /**
   * Validate portal alias
   */
  private validateAlias(alias: string): void {
    // Check length
    if (alias.length === 0) {
      throw new Error("Alias cannot be empty");
    }
    if (alias.length > 50) {
      throw new Error("Alias cannot exceed 50 characters");
    }

    // Check for invalid characters
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(alias)) {
      if (/^[0-9]/.test(alias)) {
        throw new Error("Alias cannot start with a number");
      }
      throw new Error("Alias contains invalid characters. Use alphanumeric, dash, underscore only.");
    }

    // Check for reserved names
    if (this.reservedNames.includes(alias)) {
      throw new Error(`Alias '${alias}' is reserved`);
    }
  }

  /**
   * Log activity to database using EventLogger
   */
  private async logActivity(actionType: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.db) return;

    try {
      const userIdentity = await EventLogger.getUserIdentity();
      const logger = new EventLogger({ db: this.db });
      const actionLogger = logger.child({ actor: userIdentity });
      actionLogger.info(actionType, "portal", {
        ...payload,
        via: "cli",
        command: `exoctl ${Deno.args.join(" ")}`,
      });
    } catch (error) {
      // Log errors but don't fail the operation
      console.error("Failed to log activity:", error);
    }
  }
}
