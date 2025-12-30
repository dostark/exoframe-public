// Usage: deno run --allow-read scripts/inspect_embeddings.ts --query "foo" --top 5
import { parse } from "https://deno.land/std@0.203.0/flags/mod.ts";

function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}

function norm(a: number[]) {
  let s = 0;
  for (const v of a) s += v * v;
  return Math.sqrt(s);
}

function cosine(a: number[], b: number[]) {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

async function sha256Bytes(text: string) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

async function mockVector(text: string, dim = 64) {
  const digest = await sha256Bytes(text);
  const vec: number[] = [];
  for (let i = 0; i < dim; i++) vec.push(digest[i % digest.length] / 255);
  return vec;
}

async function main() {
  const args = parse(Deno.args);
  const dir = String(args.dir || "agents/embeddings");
  const topN = Number(args.top || 5);
  const asJson = Boolean(args.json || args.j);

  // read query: --query / --q is text; --query-file accepts JSON { vector: [...] } or { text: '...' } or a raw array
  async function readQuery(): Promise<number[]> {
    const qtext = String(args.query || args.q || "");
    if (qtext) return await mockVector(qtext);
    if (args["query-file"]) {
      const p = String(args["query-file"]);
      const raw = await Deno.readTextFile(p);
      try {
        const obj = JSON.parse(raw) as Record<string, unknown>;
        if (Array.isArray(obj)) return obj as number[];
        if (obj.vector && Array.isArray(obj.vector)) return obj.vector as number[];
        if (obj.text && typeof obj.text === "string") return await mockVector(obj.text as string);
      } catch (_e) {
        // try parsing as raw array
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) return arr as number[];
        } catch (e) {
          console.error(`Invalid query-file content: ${e}`);
          Deno.exit(2);
        }
      }
      console.error("query-file must contain { vector: [...] } or { text: '...' } or be a raw array");
      Deno.exit(2);
    }

    console.error("Usage: --query '...' or --query-file <path> [--top N] [--dir <path>] [--json]");
    Deno.exit(1);
  }

  const qvec = await readQuery();

  // load embedding files from manifest or fallback to scanning directory
  let files: string[] = [];
  try {
    const manifestPath = `${dir}/manifest.json`;
    try {
      const raw = await Deno.readTextFile(manifestPath).catch(() => "");
      if (raw) {
        const manifest = JSON.parse(raw) as Record<string, unknown>;
        const idx = (manifest.index as Array<Record<string, unknown>> | undefined) || [];
        for (const e of idx) {
          if (typeof e.embeddingFile === "string") files.push(e.embeddingFile as string);
        }
      }
    } catch {
      // ignore manifest parse errors and fallback to directory walk
    }

    if (files.length === 0) {
      for await (
        const entry of (await import("https://deno.land/std@0.203.0/fs/mod.ts")).walk(dir, {
          exts: [".json"],
          maxDepth: 1,
        })
      ) {
        if (!entry.isFile) continue;
        if (entry.name === "manifest.json") continue;
        files.push(entry.path);
      }
    }
  } catch (e) {
    console.error(`Error listing embedding files in ${dir}: ${e}`);
    Deno.exit(2);
  }

  const results: Array<{ score: number; file: string; text?: string }> = [];
  for (const f of files) {
    try {
      const raw = await Deno.readTextFile(f);
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const vecs = (obj.vecs as Array<Record<string, unknown>> | undefined) || [];
      for (const v of vecs) {
        const vector = v.vector as number[] | undefined;
        const text = v.text as string | undefined;
        if (!vector || !Array.isArray(vector)) continue;
        const score = cosine(qvec, vector);
        results.push({ score, file: f, text: text?.slice(0, 200) });
      }
    } catch (e) {
      // ignore parse/read errors for individual files
    }
  }

  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, topN);

  if (asJson) {
    console.log(JSON.stringify(topResults, null, 2));
  } else {
    for (const s of topResults) {
      console.log(`${s.score.toFixed(6)}  ${s.file}  "${s.text ?? ""}"`);
    }
  }
}

if (import.meta.main) await main();

export {};
