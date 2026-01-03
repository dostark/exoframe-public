/**
 * Shared helper functions for documentation tests.
 */

/**
 * Read the User Guide document
 */
export async function readUserGuide(): Promise<string> {
  return await Deno.readTextFile("docs/ExoFrame_User_Guide.md");
}

/**
 * Check if a template file exists
 */
export async function templateExists(filename: string): Promise<boolean> {
  try {
    await Deno.stat(`templates/${filename}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read any documentation file from docs/
 */
export async function readDoc(filename: string): Promise<string> {
  return await Deno.readTextFile(`docs/${filename}`);
}
