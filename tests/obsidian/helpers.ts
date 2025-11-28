/**
 * Shared helper functions for Obsidian-related tests.
 */

/**
 * Read Dashboard from templates (dev) or Knowledge (deployed)
 */
export async function readDashboard(): Promise<string> {
  try {
    return await Deno.readTextFile("Knowledge/Dashboard.md");
  } catch {
    return await Deno.readTextFile("templates/Knowledge_Dashboard.md");
  }
}

/**
 * Check if Dashboard exists in either location
 */
export async function dashboardExists(): Promise<boolean> {
  try {
    await Deno.stat("Knowledge/Dashboard.md");
    return true;
  } catch {
    try {
      await Deno.stat("templates/Knowledge_Dashboard.md");
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Check if a template file exists for the Knowledge folder
 */
export async function templateExists(filename: string): Promise<boolean> {
  try {
    await Deno.stat(`templates/Knowledge_${filename}`);
    return true;
  } catch {
    return false;
  }
}
