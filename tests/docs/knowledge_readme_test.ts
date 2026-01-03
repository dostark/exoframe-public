/**
 * Tests for Memory Banks documentation.
 *
 * Success Criteria:
 * - Test 1: Memory Banks documentation exists at docs/Memory_Banks.md
 * - Test 2: Documents Memory structure (Projects, Execution)
 * - Test 3: Documents CLI usage and commands
 * - Test 4: Has descriptive main title
 * - Test 5: Documents directory purposes and usage
 */

import { assert, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "jsr:@std/path@^1.0.0";

async function readMemoryBanksDoc(): Promise<string> {
  const docPath = join(Deno.cwd(), "docs", "Memory_Banks.md");
  return await Deno.readTextFile(docPath);
}

async function docExists(filename: string): Promise<boolean> {
  try {
    const docPath = join(Deno.cwd(), "docs", filename);
    const stat = await Deno.stat(docPath);
    return stat.isFile;
  } catch {
    return false;
  }
}

// ============================================================================
// Documentation Existence Tests
// ============================================================================

Deno.test("Memory Banks documentation exists", async () => {
  const exists = await docExists("Memory_Banks.md");
  assert(exists, "docs/Memory_Banks.md should exist");
});

// ============================================================================
// Memory Banks Documentation Content Tests
// ============================================================================

Deno.test("Memory Banks documentation documents directory structure", async () => {
  const doc = await readMemoryBanksDoc();

  assertStringIncludes(doc, "Projects");
  assertStringIncludes(doc, "Execution");
  assertStringIncludes(doc, "Memory/");
});

Deno.test("Memory Banks documentation documents CLI usage", async () => {
  const doc = await readMemoryBanksDoc();
  assertStringIncludes(doc, "exoctl memory");
});

Deno.test("Memory Banks documentation has main title", async () => {
  const doc = await readMemoryBanksDoc();

  assert(
    doc.startsWith("# ") || doc.includes("\n# "),
    "Memory Banks documentation should have a main title",
  );
});

Deno.test("Memory Banks documentation documents directory purposes", async () => {
  const doc = await readMemoryBanksDoc();
  const lower = doc.toLowerCase();

  // Should explain what each directory is for
  const hasProjects = lower.includes("project");
  const hasExecution = lower.includes("execution");

  assert(hasProjects && hasExecution, "Documentation should document directory purposes");
});
