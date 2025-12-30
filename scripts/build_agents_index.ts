// Build a simple manifest.json and pre-chunk files for fast retrieval
// Usage: deno run --allow-read --allow-write scripts/build_agents_index.ts

import { parse } from "https://deno.land/std@0.203.0/yaml/mod.ts";
import { walk } from "https://deno.land/std@0.203.0/fs/mod.ts";

const AGENTS_DIR = "agents";
const OUT_MANIFEST = `${AGENTS_DIR}/manifest.json`;
const CHUNKS_DIR = `${AGENTS_DIR}/chunks`;

function extractFrontmatter(md: string): string | null {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : null;
}

function chunkText(text: string, size = 800): string[] {
  // naive chunking by whole paragraphs
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if ((current + "\n\n" + p).length > size) {
      if (current) chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function main() {
  const docs = [] as Record<string, unknown>[];
  await Deno.mkdir(CHUNKS_DIR, { recursive: true });
  for await (const entry of walk(AGENTS_DIR, { exts: [".md"], maxDepth: 3 })) {
    if (!entry.isFile) continue;
    const md = await Deno.readTextFile(entry.path);
    const fmRaw = extractFrontmatter(md);
    if (!fmRaw) continue;
    const fm = parse(fmRaw) as Record<string, unknown>;
    const short_summary = String(fm["short_summary"] ?? "");
    const chunks = chunkText(md.replace(/^---[\s\S]*?---/, ""));
    const chunkPaths: string[] = [];
    chunks.slice(0, 8).forEach((c, idx) => {
      const p = `${CHUNKS_DIR}/${entry.name}.chunk${idx}.txt`;
      Deno.writeTextFileSync(p, c);
      chunkPaths.push(p);
    });

    docs.push({
      path: entry.path,
      agent: fm["agent"],
      scope: fm["scope"],
      title: fm["title"],
      short_summary,
      version: fm["version"],
      topics: fm["topics"],
      chunks: chunkPaths,
    });
  }

  const manifest = { generated_at: new Date().toISOString(), docs };
  await Deno.writeTextFile(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`Wrote manifest to ${OUT_MANIFEST}`);
}

if (import.meta.main) await main();
