import { assert, assertExists } from "https://deno.land/std@0.203.0/assert/mod.ts";
import { join } from "https://deno.land/std@0.203.0/path/mod.ts";

Deno.test("build precomputed embeddings copies files and writes manifest", async () => {
  // create temp dir with a single precomputed embedding file
  const tmp = await Deno.makeTempDir();
  const sample = {
    path: "agents/tests/testing.md",
    title: "ExoFrame Test Development Guidelines",
    vecs: [
      { text: "snippet 1", vector: new Array(64).fill(0.123) },
    ],
  };
  const outFile = join(tmp, "testing.md.json");
  await Deno.writeTextFile(outFile, JSON.stringify(sample, null, 2));

  const cmd = new Deno.Command("deno", {
    args: [
      "run",
      "--no-check",
      "--allow-read",
      "--allow-write",
      "scripts/build_agents_embeddings.ts",
      "--mode",
      "precomputed",
      "--dir",
      tmp,
    ],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  });
  const result = await cmd.output();
  const stdout = new TextDecoder().decode(result.stdout);
  const stderr = new TextDecoder().decode(result.stderr);
  if (result.code !== 0) {
    console.error(stdout);
    console.error(stderr);
    throw new Error("precomputed script failed");
  }

  // assert manifest exists
  assertExists("agents/embeddings/manifest.json");
  const manifest = JSON.parse(await Deno.readTextFile("agents/embeddings/manifest.json"));
  assert(Array.isArray(manifest.index) && manifest.index.length > 0, "manifest should have index entries");

  // ensure the copied file exists
  const first = manifest.index.find((i: any) => i.embeddingFile && i.embeddingFile.includes("testing.md.json"));
  assert(first, "manifest should reference testing.md.json");
  assertExists(first.embeddingFile);

  // cleanup: remove created tmp dir
  await Deno.remove(tmp, { recursive: true });
});
