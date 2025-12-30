// Usage: deno run --allow-read scripts/verify_manifest_fresh.ts
import { generateManifestObject } from "./build_agents_index.ts";

function normalize(obj: any) {
  // remove generated_at and sort docs by path for deterministic comparison
  const copy = JSON.parse(JSON.stringify(obj));
  delete copy.generated_at;
  if (Array.isArray(copy.docs)) {
    copy.docs.sort((a: any, b: any) => String(a.path).localeCompare(String(b.path)));
    for (const d of copy.docs) {
      if (Array.isArray(d.chunks)) d.chunks.sort();
    }
  }
  return copy;
}

async function main() {
  const generated = await generateManifestObject();
  let existingText = "";
  try {
    existingText = await Deno.readTextFile("agents/manifest.json");
  } catch (_e) {
    console.error("Existing manifest.json not found: agents/manifest.json");
    Deno.exit(2);
  }
  const existing = JSON.parse(existingText);

  const a = normalize(generated);
  const b = normalize(existing);

  const sa = JSON.stringify(a, null, 2);
  const sb = JSON.stringify(b, null, 2);

  if (sa !== sb) {
    console.error(
      "agents/manifest.json is out of date with current agents/ sources. Run scripts/build_agents_index.ts and commit the updated manifest.",
    );
    Deno.exit(1);
  }

  console.log("agents/manifest.json is up-to-date.");
}

if (import.meta.main) await main();

export {};
