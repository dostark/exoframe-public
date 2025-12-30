// Build optional embeddings for agent docs (provider-agnostic + mock mode)
// Usage (mock): deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock
// Usage (openai): deno run --allow-read --allow-write --allow-env scripts/build_agents_embeddings.ts --mode openai

import { parse } from "https://deno.land/std@0.203.0/yaml/mod.ts";
import { walk } from "https://deno.land/std@0.203.0/fs/mod.ts";
import { createHash } from "https://deno.land/std@0.203.0/hash/mod.ts";

const AGENTS_DIR = "agents";
const OUT_DIR = `${AGENTS_DIR}/embeddings`;

function extractFrontmatter(md: string): string | null {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : null;
}

function chunkText(text: string, size = 800): string[] {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
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

function mockVector(text: string, dim = 64): number[] {
  // deterministic mock vector using SHA-256 derived values
  const h = createHash("sha256");
  h.update(text);
  const digest = h.digest();
  const vec: number[] = [];
  for (let i = 0; i < dim; i++) {
    vec.push(digest[i % digest.length] / 255);
  }
  return vec;
}

async function buildMock() {
  await Deno.mkdir(OUT_DIR, { recursive: true });
  const index: Record<string, unknown>[] = [];

  for await (const entry of walk(AGENTS_DIR, { exts: [".md"], maxDepth: 3 })) {
    if (!entry.isFile) continue;
    const md = await Deno.readTextFile(entry.path);
    const fmRaw = extractFrontmatter(md) || "";
    const fm = fmRaw ? (parse(fmRaw) as Record<string, unknown>) : {};
    const body = md.replace(/^---[\s\S]*?---/, "");
    const chunks = chunkText(body, 800).slice(0, 16);
    const vecs = chunks.map((c) => ({ text: c.slice(0, 2000), vector: mockVector(c, 64) }));
    const outPath = `${OUT_DIR}/${entry.name}.json`;
    await Deno.writeTextFile(outPath, JSON.stringify({ path: entry.path, title: fm.title ?? entry.name, vecs }, null, 2));
    index.push({ path: entry.path, title: fm.title, embeddingFile: outPath });
  }

  await Deno.writeTextFile(`${OUT_DIR}/manifest.json`, JSON.stringify({ generated_at: new Date().toISOString(), index }, null, 2));
  console.log(`Built mock embeddings to ${OUT_DIR}`);
}

async function buildOpenAI() {
  const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_KEY) {
    console.error("OPENAI_API_KEY is required for openai mode");
    Deno.exit(2);
  }

  await Deno.mkdir(OUT_DIR, { recursive: true });
  const index: Record<string, unknown>[] = [];

  for await (const entry of walk(AGENTS_DIR, { exts: [".md"], maxDepth: 3 })) {
    if (!entry.isFile) continue;
    const md = await Deno.readTextFile(entry.path);
    const fmRaw = extractFrontmatter(md) || "";
    const fm = fmRaw ? (parse(fmRaw) as Record<string, unknown>) : {};
    const body = md.replace(/^---[\s\S]*?---/, "");
    const chunks = chunkText(body, 1000).slice(0, 8);

    const vecs: { text: string; vector: number[] }[] = [];
    for (const c of chunks) {
      // call OpenAI embeddings API — optional and gated behind env
      const resp = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ input: c, model: "text-embedding-3-small" }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        console.error("OpenAI error:", text);
        Deno.exit(2);
      }
      const data = await resp.json();
      const vector = data.data[0].embedding as number[];
      vecs.push({ text: c.slice(0, 2000), vector });
    }

    const outPath = `${OUT_DIR}/${entry.name}.json`;
    await Deno.writeTextFile(outPath, JSON.stringify({ path: entry.path, title: fm.title ?? entry.name, vecs }, null, 2));
    index.push({ path: entry.path, title: fm.title, embeddingFile: outPath });
  }

  await Deno.writeTextFile(`${OUT_DIR}/manifest.json`, JSON.stringify({ generated_at: new Date().toISOString(), index }, null, 2));
  console.log(`Built OpenAI embeddings to ${OUT_DIR}`);
}

async function main() {
  const args = Object.fromEntries(Deno.args.reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1] || ""]);
    return acc;
  }, [] as string[][]));

  const mode = (args["mode"] || "mock").toLowerCase();
  if (mode === "mock") await buildMock();
  else if (mode === "openai") await buildOpenAI();
  else {
    console.error("Unknown mode: use --mode mock|openai");
    Deno.exit(2);
  }
}

if (import.meta.main) await main();
