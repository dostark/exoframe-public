/**
 * Base class for all CLI command handlers
 * Provides common functionality: config, database, user identity, logging
 */

import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "../services/db.ts";

export interface CommandContext {
  config: Config;
  db: DatabaseService;
}

/**
 * Base class for CLI command handlers
 * Provides shared utilities and ensures consistent patterns
 */
export abstract class BaseCommand {
  protected config: Config;
  protected db: DatabaseService;

  constructor(context: CommandContext) {
    this.config = context.config;
    this.db = context.db;
  }

  /**
   * Get user identity from git config or OS username
   * @returns User email or username
   */
  protected async getUserIdentity(): Promise<string> {
    const workspaceRoot = this.config.system.root;

    // Try git config first
    try {
      const gitCmd = new Deno.Command("git", {
        args: ["-C", workspaceRoot, "config", "user.email"],
        stdout: "piped",
        stderr: "piped",
      });
      const { stdout, success } = await gitCmd.output();

      if (success) {
        const email = new TextDecoder().decode(stdout).trim();
        if (email) return email;
      }
    } catch {
      // Git not available or no email configured
    }

    // Fallback to git user.name
    try {
      const gitCmd = new Deno.Command("git", {
        args: ["-C", workspaceRoot, "config", "user.name"],
        stdout: "piped",
        stderr: "piped",
      });
      const { stdout, success } = await gitCmd.output();

      if (success) {
        const name = new TextDecoder().decode(stdout).trim();
        if (name) return name;
      }
    } catch {
      // Git not available
    }

    // Fallback to OS username
    return Deno.env.get("USER") || Deno.env.get("USERNAME") || "unknown";
  }

  /**
   * Parse frontmatter from markdown file (YAML format)
   * @param content File content
   * @returns Frontmatter object
   */
  protected extractFrontmatter(content: string): Record<string, string> {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      return {};
    }

    const frontmatter: Record<string, string> = {};
    const lines = match[1].split("\n");

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;

      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.substring(1, value.length - 1);
      }

      frontmatter[key] = value;
    }

    return frontmatter;
  }

  /**
   * Serialize frontmatter object back to YAML format
   * @param frontmatter Frontmatter object
   * @returns YAML string with --- delimiters
   */
  protected serializeFrontmatter(frontmatter: Record<string, string>): string {
    const lines = ["---"];
    for (const [key, value] of Object.entries(frontmatter)) {
      // Quote values that contain colons, hyphens in UUIDs, or special chars
      const needsQuotes = value.includes(":") ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

      if (needsQuotes) {
        lines.push(`${key}: "${value}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    lines.push("---");
    return lines.join("\n");
  }

  /**
   * Update frontmatter in markdown content
   * @param content Original content
   * @param updates Frontmatter fields to update
   * @returns Updated content
   */
  protected updateFrontmatter(
    content: string,
    updates: Record<string, string>,
  ): string {
    const frontmatter = this.extractFrontmatter(content);
    const updated = { ...frontmatter, ...updates };
    const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
    return this.serializeFrontmatter(updated) + "\n" + body;
  }

  /**
   * Validate that required frontmatter fields exist
   * @param frontmatter Frontmatter object
   * @param required Required field names
   * @param filePath File path for error messages
   * @throws Error if required fields are missing
   */
  protected validateFrontmatter(
    frontmatter: Record<string, string>,
    required: string[],
    filePath: string,
  ): void {
    for (const field of required) {
      if (!frontmatter[field]) {
        throw new Error(
          `Invalid file format: missing required field '${field}' in ${filePath}`,
        );
      }
    }
  }

  /**
   * Format timestamp for display
   * @param isoString ISO 8601 timestamp
   * @returns Human-readable timestamp
   */
  protected formatTimestamp(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString();
  }

  /**
   * Truncate string for display
   * @param str String to truncate
   * @param maxLength Maximum length
   * @returns Truncated string with ellipsis
   */
  protected truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + "...";
  }

  /**
   * Get the full command line that was invoked
   * @returns Array of command arguments (excluding 'deno run' etc.)
   */
  protected getCommandLine(): string[] {
    return Deno.args;
  }

  /**
   * Get the command line as a single string for logging
   * @returns Command line string like "exoctl daemon start --force"
   */
  protected getCommandLineString(): string {
    return `exoctl ${Deno.args.join(" ")}`;
  }
}
