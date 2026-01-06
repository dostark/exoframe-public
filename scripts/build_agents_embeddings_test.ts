import { assert } from "https://deno.land/std@0.203.0/assert/mod.ts";

Deno.test("build mock embeddings produces manifest and files", async () => {
  // run the script in mock mode
  const cmd = new Deno.Command("deno", {
    args: [
      "run",
      "--no-check",
      "--allow-read",
      "--allow-write",
      "scripts/build_agents_embeddings.ts",
      "--mode",
      "mock",
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const result = await cmd.output();
  const _out = new TextDecoder().decode(result.stdout);
  const err = new TextDecoder().decode(result.stderr);
  if (result.code !== 0) {
    throw new Error(`script failed: ${err}`);
  }

  const manifest = JSON.parse(await Deno.readTextFile(".copilot/embeddings/manifest.json"));
  assert(manifest.generated_at, "manifest should have generated_at");
  assert(Array.isArray(manifest.index), "manifest.index should be an array");
  // ensure there's at least one embedding file referenced
  assert(manifest.index.length > 0, "manifest.index should contain at least one doc");
  const first = manifest.index[0];
  assert(first.embeddingFile, "first index entry should have embeddingFile");
  const fileExists = await Deno.stat(first.embeddingFile).then(() => true).catch(() => false);
  assert(fileExists, "embedding file should exist");
});
