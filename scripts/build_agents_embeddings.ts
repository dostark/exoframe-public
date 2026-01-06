// Build optional embeddings for agent docs (provider-agnostic + mock mode)
// Usage (mock): deno run --allow-read --allow-write scripts/build_agents_embeddings.ts --mode mock
// Usage (openai): deno run --allow-read --allow-write --allow-env scripts/build_agents_embeddings.ts --mode openai

import { parse } from "https://deno.land/std@0.203.0/yaml/mod.ts";
import { walk } from "https://deno.land/std@0.203.0/fs/mod.ts";

const AGENTS_DIR = ".copilot";
const OUT_DIR = `${AGENTS_DIR}/embeddings`;

function extractFrontmatter(md: string): string | null {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : null;
}

function chunkText(text: string, size = 800): string[] {
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

async function sha256Bytes(text: string) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

async function mockVector(text: string, dim = 64): Promise<number[]> {
  // deterministic mock vector using SHA-256 derived values
  const digest = await sha256Bytes(text);
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
    const vecs: { text: string; vector: number[] }[] = [];
    for (const c of chunks) {
      const vector = await mockVector(c, 64);
      vecs.push({ text: c.slice(0, 2000), vector });
    }
    const outPath = `${OUT_DIR}/${entry.name}.json`;
    await Deno.writeTextFile(
      outPath,
      JSON.stringify({ path: entry.path, title: fm.title ?? entry.name, vecs }, null, 2),
    );
    index.push({ path: entry.path, title: fm.title, embeddingFile: outPath });
  }

  await Deno.writeTextFile(
    `${OUT_DIR}/manifest.json`,
    JSON.stringify({ generated_at: new Date().toISOString(), index }, null, 2),
  );
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
    await Deno.writeTextFile(
      outPath,
      JSON.stringify({ path: entry.path, title: fm.title ?? entry.name, vecs }, null, 2),
    );
    index.push({ path: entry.path, title: fm.title, embeddingFile: outPath });
  }

  await Deno.writeTextFile(
    `${OUT_DIR}/manifest.json`,
    JSON.stringify({ generated_at: new Date().toISOString(), index }, null, 2),
  );
  console.log(`Built OpenAI embeddings to ${OUT_DIR}`);
}

async function buildPrecomputed(dir: string) {
  // Copy & validate precomputed embedding files from `dir` into OUT_DIR
  try {
    const stat = await Deno.stat(dir).catch(() => null);
    if (!stat || !stat.isDirectory) {
      console.error(`Precomputed dir not found or not a directory: ${dir}`);
      Deno.exit(2);
    }

    await Deno.mkdir(OUT_DIR, { recursive: true });
    const index: Record<string, unknown>[] = [];

    for await (const entry of walk(dir, { exts: [".json"], maxDepth: 1 })) {
      if (!entry.isFile) continue;
      const raw = await Deno.readTextFile(entry.path);
      let obj;
      try {
        obj = JSON.parse(raw) as Record<string, unknown>;
      } catch (e) {
        console.error(`Invalid JSON in precomputed file ${entry.path}: ${e}`);
        Deno.exit(2);
      }
      if (!obj.path || !obj.vecs) {
        console.error(`Precomputed file ${entry.path} missing required keys (path, vecs)`);
        Deno.exit(2);
      }
      // validate vecs shape minimally
      if (!Array.isArray(obj.vecs)) {
        console.error(`Precomputed file ${entry.path}: vecs must be an array`);
        Deno.exit(2);
      }
      const outPath = `${OUT_DIR}/${entry.name}`;
      await Deno.writeTextFile(outPath, JSON.stringify(obj, null, 2));
      index.push({ path: obj.path, title: obj.title ?? entry.name, embeddingFile: outPath });
    }

    await Deno.writeTextFile(
      `${OUT_DIR}/manifest.json`,
      JSON.stringify({ generated_at: new Date().toISOString(), index }, null, 2),
    );
    console.log(`Copied precomputed embeddings to ${OUT_DIR}`);
  } catch (e) {
    console.error(`Error processing precomputed embeddings: ${e}`);
    Deno.exit(2);
  }
}

async function main() {
  const args = Object.fromEntries(Deno.args.reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1] || ""]);
    return acc;
  }, [] as string[][]));

  const mode = (args["mode"] || "mock").toLowerCase();
  if (mode === "mock") await buildMock();
  else if (mode === "openai") await buildOpenAI();
  else if (mode === "precomputed") {
    const dir = args["dir"] || Deno.env.get("PRECOMPUTED_EMB_DIR") || "";
    if (!dir) {
      console.error("--mode precomputed requires --dir <path> or PRECOMPUTED_EMB_DIR env var");
      Deno.exit(2);
    }
    await buildPrecomputed(dir);
  } else {
    console.error("Unknown mode: use --mode mock|openai|precomputed");
    Deno.exit(2);
  }
}

if (import.meta.main) await main();
