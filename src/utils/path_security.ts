import { join } from "@std/path";

/**
 * Secure path resolution and validation utilities
 */
export class PathSecurity {
  /**
   * Normalize and validate a path for security
   */
  static normalizePath(path: string): string {
    // Remove null bytes and other dangerous characters
    path = path.replace(/\0/g, "");

    // Normalize path separators and resolve . and ..
    const normalized = path
      .replace(/\\/g, "/") // Normalize separators
      .replace(/\/+/g, "/") // Remove duplicate slashes
      .split("/")
      .filter((segment) => segment !== ".") // Remove current dir references
      .join("/");

    // Detect and prevent directory traversal
    if (normalized.includes("..")) {
      throw new PathTraversalError(`Path traversal detected: ${path}`);
    }

    return normalized;
  }

  /**
   * Securely resolve a path within allowed roots
   */
  static async resolveWithinRoots(
    inputPath: string,
    allowedRoots: string[],
    rootDir: string,
  ): Promise<string> {
    // Normalize the input path
    const normalizedPath = this.normalizePath(inputPath);

    // Convert to absolute path
    const absolutePath = normalizedPath.startsWith("/") ? normalizedPath : join(rootDir, normalizedPath);

    // Get canonical real path
    let realPath: string;
    try {
      realPath = await Deno.realPath(absolutePath);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // For non-existing files, validate the parent directory
        const parentDir = join(absolutePath, "..");
        const realParent = await Deno.realPath(parentDir);

        // Ensure the target path is still within allowed roots
        const targetPath = join(realParent, absolutePath.split("/").pop() || "");

        if (!this.isWithinRoots(targetPath, allowedRoots)) {
          throw new PathAccessError(`Path outside allowed roots: ${inputPath}`);
        }

        return absolutePath; // Return unresolved path for file creation
      }
      throw error;
    }

    // Validate the real path is within allowed roots
    if (!this.isWithinRoots(realPath, allowedRoots)) {
      throw new PathAccessError(`Path resolves outside allowed roots: ${inputPath} -> ${realPath}`);
    }

    return realPath;
  }

  /**
   * Check if a path is within any of the allowed roots
   */
  private static isWithinRoots(path: string, allowedRoots: string[]): boolean {
    return allowedRoots.some((root) => {
      const normalizedRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
      const normalizedPath = path.replace(/\\/g, "/");

      // Allow exact match for root directory, or path starting with root/
      return normalizedPath === normalizedRoot || normalizedPath.startsWith(normalizedRoot + "/");
    });
  }
}

export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathTraversalError";
  }
}

export class PathAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathAccessError";
  }
}
