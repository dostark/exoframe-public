// Given a query and an agent type, return the best matching short_summary + chunks
// Usage: deno run --allow-read scripts/inject_agent_context.ts --query "fix tests" --agent copilot

import { parse } from "https://deno.land/std@0.203.0/yaml/mod.ts";
import { walk } from "https://deno.land/std@0.203.0/fs/mod.ts";

const AGENTS_DIR = ".copilot";

function extractFrontmatter(md: string): string | null {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : null;
}

function scoreDoc(md: string, query: string) {
  const q = query.toLowerCase();
  const text = md.toLowerCase();
  let score = 0;
  if (text.includes(q)) score += 10;
  const tokens = q.split(/\s+/);
  for (const t of tokens) if (text.includes(t)) score += 1;
  return score;
}

async function findBest(agent: string, query: string) {
  let best: { path?: string; fm?: Record<string, unknown>; score: number; md?: string } = { score: 0 };
  for await (const entry of walk(AGENTS_DIR, { exts: [".md"], maxDepth: 3 })) {
    if (!entry.isFile) continue;
    const md = await Deno.readTextFile(entry.path);
    const fmRaw = extractFrontmatter(md) || "";
    const fm = fmRaw ? (parse(fmRaw) as Record<string, unknown>) : {};
    if (String(fm.agent || "") !== agent) continue;
    const s = scoreDoc(md, query);
    if (s > best.score) best = { path: entry.path, fm, score: s, md };
  }
  return best;
}

export async function inject(agent: string, query: string, _maxChunks = 2) {
  const best = await findBest(agent, query);
  if (!best.path) return { found: false };
  const mdBody = best.md!.replace(/^---[\s\S]*?---/, "");
  const paragraph = mdBody.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)[0] || "";
  return {
    found: true,
    path: best.path,
    title: String(best.fm!.title || ""),
    short_summary: String(best.fm!.short_summary || ""),
    snippet: paragraph,
  };
}
async function main() {
  const args = new Map<string, string>();
  for (let i = 0; i < Deno.args.length; i++) {
    if (Deno.args[i].startsWith("--")) {
      const key = Deno.args[i].slice(2);
      const val = Deno.args[i + 1] || "";
      args.set(key, val);
      i++;
    }
  }
  const query = args.get("query") || "";
  const agent = args.get("agent") || "copilot";
  if (!query) {
    console.error("Usage: --query <text> --agent <agent>");
    Deno.exit(2);
  }

  const best = await findBest(agent, query);
  if (!best.path) {
    console.log(JSON.stringify({ found: false }));
    Deno.exit(0);
  }

  const mdBody = best.md!.replace(/^---[\s\S]*?---/, "");
  const paragraph = mdBody.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)[0] || "";
  console.log(
    JSON.stringify({
      found: true,
      path: best.path,
      title: String(best.fm!.title || ""),
      short_summary: String(best.fm!.short_summary || ""),
      snippet: paragraph,
    }),
  );
}

if (import.meta.main) await main();
