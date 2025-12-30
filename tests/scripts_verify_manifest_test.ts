import { assert } from "https://deno.land/std@0.203.0/assert/mod.ts";
import { generateManifestObject } from "../scripts/build_agents_index.ts";

function normalize(obj: any) {
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

Deno.test("verify manifest matches generated manifest", async () => {
  const generated = await generateManifestObject();
  const existingText = await Deno.readTextFile("agents/manifest.json");
  const existing = JSON.parse(existingText);

  const a = normalize(generated);
  const b = normalize(existing);

  assert(JSON.stringify(a) === JSON.stringify(b), "manifest.json must match generated manifest");
});
