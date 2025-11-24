import { join } from "@std/path";
import type { Config } from "../config/schema.ts";

export class PathResolver {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Resolves a portal alias path (e.g., "@Blueprints/agent.md") to an absolute system path.
   * Enforces security boundaries to prevent path traversal.
   */
  async resolve(aliasPath: string): Promise<string> {
    if (!aliasPath.startsWith("@")) {
      throw new Error("Path must start with a portal alias (e.g., @Blueprints/)");
    }

    // Split alias and relative path
    // e.g. "@Blueprints/agent.md" -> ["@Blueprints", "agent.md"]
    // e.g. "@Blueprints/" -> ["@Blueprints", ""]
    const parts = aliasPath.split("/");
    const alias = parts[0];
    const relativePath = parts.slice(1).join("/");

    const root = this.resolveAliasRoot(alias);

    // Construct the full potential path
    const fullPath = join(root, relativePath);

    // Validate security
    return await this.validatePath(fullPath, [root]);
  }

  private resolveAliasRoot(alias: string): string {
    const { system, paths } = this.config;

    // Map aliases to config paths
    // We resolve these relative to system.root
    switch (alias) {
      case "@Inbox":
        return join(system.root, paths.inbox);
      case "@Knowledge":
        return join(system.root, paths.knowledge);
      case "@System":
        return join(system.root, paths.system);
      case "@Blueprints":
        return join(system.root, paths.blueprints);
      default:
        throw new Error(`Unknown portal alias: ${alias}`);
    }
  }

  /**
   * Validates that a path is within allowed roots.
   * Uses Deno.realPath to resolve symlinks and .. segments.
   */
  private async validatePath(path: string, allowedRoots: string[]): Promise<string> {
    // 1. Resolve the physical path (follows symlinks, resolves ..)
    const realPath = await Deno.realPath(path);

    // 2. Check if it starts with any allowed root
    const isAllowed = allowedRoots.some((root) => {
      // Ensure root ends with separator to prevent partial matches
      // e.g. /foo/bar vs /foo/bar_baz
      // But we also want to allow the root itself
      return realPath === root || realPath.startsWith(root + "/");
    });

    if (!isAllowed) {
      throw new Error(`Access denied: Path ${path} resolves to ${realPath}, which is outside allowed roots.`);
    }

    return realPath;
  }
}
