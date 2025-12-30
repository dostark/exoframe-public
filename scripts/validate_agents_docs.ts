// Simple validation script for agents/ docs
// Usage: deno run --allow-read scripts/validate_agents_docs.ts

import { parse } from "https://deno.land/std@0.203.0/yaml/mod.ts";
import { walk } from "https://deno.land/std@0.203.0/fs/mod.ts";

const AGENTS_DIR = "agents";
const REQUIRED_KEYS = ["agent", "scope", "title", "short_summary", "version"];

function extractFrontmatter(md: string): string | null {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : null;
}

async function validateFile(path: string): Promise<string[]> {
  const errors: string[] = [];
  const content = await Deno.readTextFile(path);
  const fmRaw = extractFrontmatter(content);
  if (!fmRaw) {
    errors.push(`${path}: missing YAML frontmatter`);
    return errors;
  }
  let fm;
  try {
    fm = parse(fmRaw) as Record<string, unknown>;
  } catch (e) {
    errors.push(`${path}: frontmatter YAML parse error: ${e}`);
    return errors;
  }
  for (const k of REQUIRED_KEYS) {
    if (!fm[k]) errors.push(`${path}: missing required frontmatter key '${k}'`);
  }

  // quick safety check for obvious secrets
  const secretRegex = /(AKIA|AIza|SECRET|api_key|pass(word)?|token\s*[:=])/i;
  if (secretRegex.test(content)) {
    errors.push(`${path}: potential secret/token found (CI will fail on secrets)`);
  }

  // presence of a canonical prompt or examples
  if (!/Canonical prompt|Examples|Example prompt/i.test(content)) {
    errors.push(`${path}: missing 'Canonical prompt' or 'Examples' section`);
  }

  return errors;
}

async function main() {
  const errors: string[] = [];
  try {
    for await (const entry of walk(AGENTS_DIR, { exts: [".md"], maxDepth: 3 })) {
      if (entry.isFile) {
        const fileErrors = await validateFile(entry.path);
        errors.push(...fileErrors);
      }
    }
  } catch (e) {
    console.error("Error scanning agents/ directory:", e);
    Deno.exit(2);
  }

  if (errors.length) {
    console.error("Validation failed with the following issues:");
    for (const e of errors) console.error(` - ${e}`);
    Deno.exit(1);
  }

  console.log("All agent docs passed validation.");
}

if (import.meta.main) await main();

export { extractFrontmatter, validateFile };
