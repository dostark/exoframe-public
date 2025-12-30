import { assert } from "https://deno.land/std@0.203.0/assert/mod.ts";

Deno.test("build mock embeddings produces manifest and files", async () => {
  // run the script in mock mode
  const p = Deno.run({ cmd: ["deno", "run", "--allow-read", "--allow-write", "scripts/build_agents_embeddings.ts", "--mode", "mock"], stdout: "piped", stderr: "piped" });
  const status = await p.status();
  const out = new TextDecoder().decode(await p.output());
  const err = new TextDecoder().decode(await p.stderrOutput());
  p.close();
  if (!status.success) {
    throw new Error(`script failed: ${err}`);
  }

  const manifest = JSON.parse(await Deno.readTextFile("agents/embeddings/manifest.json"));
  assert(manifest.generated_at, "manifest should have generated_at");
  assert(Array.isArray(manifest.index), "manifest.index should be an array");
  // ensure there's at least one embedding file referenced
  assert(manifest.index.length > 0, "manifest.index should contain at least one doc");
  const first = manifest.index[0];
  assert(first.embeddingFile, "first index entry should have embeddingFile");
  const fileExists = await Deno.stat(first.embeddingFile).then(() => true).catch(() => false);
  assert(fileExists, "embedding file should exist");
});