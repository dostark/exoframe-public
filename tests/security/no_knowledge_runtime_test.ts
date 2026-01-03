import { assertEquals } from "jsr:@std/assert@^1.0.0";
import { walk } from "https://deno.land/std@0.201.0/fs/mod.ts";
import { extname, join } from "https://deno.land/std@0.201.0/path/mod.ts";

Deno.test("Security: No runtime code should reference 'Knowledge' path", async () => {
  const repoRoot = Deno.cwd();
  const scannedFiles: string[] = [];
  const offenders: Array<{ path: string; line: number; text: string }> = [];

  for await (const entry of walk(repoRoot, { includeDirs: false })) {
    // Only check runtime and script files (src, scripts, templates)
    if (
      !entry.path.startsWith(join(repoRoot, "src")) &&
      !entry.path.startsWith(join(repoRoot, "scripts")) &&
      !entry.path.startsWith(join(repoRoot, "templates"))
    ) {
      continue;
    }

    const ext = extname(entry.path).toLowerCase();
    if (![".ts", ".js", ".sh", ".md", "", ".json"].includes(ext)) {
      continue;
    }

    scannedFiles.push(entry.path);

    try {
      const content = await Deno.readTextFile(entry.path);
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("Knowledge")) {
          offenders.push({ path: entry.path.replace(repoRoot + "/", ""), line: i + 1, text: line.trim() });
        }
      }
    } catch {
      // Skip unreadable files in some environments; CI should have read access
      // If files are unreadable in CI, this test will surface that separately
    }
  }

  if (offenders.length > 0) {
    console.error("Found 'Knowledge' references in runtime files:");
    for (const o of offenders.slice(0, 20)) {
      console.error(`${o.path}:${o.line}: ${o.text}`);
    }
  }

  assertEquals(offenders.length, 0);
});
