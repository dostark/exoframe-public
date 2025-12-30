import { assert, assertExists } from "https://deno.land/std@0.203.0/assert/mod.ts";

// This test writes a temporary embedding file into agents/embeddings and a temporary manifest
// then runs the inspect script with a query that should match the vector exactly (score ~1.0).

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

Deno.test("inspect script returns the top match for identical vector", async () => {
  const tmpFile = "agents/embeddings/tmp_inspect_test.json";
  const manifestPath = "agents/embeddings/manifest.json";

  // backup original manifest if exists
  let originalManifest: string | null = null;
  try {
    originalManifest = await Deno.readTextFile(manifestPath);
  } catch (_e) {
    originalManifest = null;
  }

  const qtext = "unique-inspect-test-query";
  const vector = await mockVector(qtext);
  const sample = {
    path: "docs/tmp.md",
    title: "tmp test",
    vecs: [
      { text: "match-me", vector },
    ],
  };

  // write embedding file
  await Deno.writeTextFile(tmpFile, JSON.stringify(sample, null, 2));

  // write manifest referencing it
  const manifest = {
    generated_at: new Date().toISOString(),
    index: [{ path: sample.path, title: sample.title, embeddingFile: tmpFile }],
  };
  await Deno.writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));

  // run the script
  const cmd = new Deno.Command("deno", {
    args: ["run", "--no-check", "--allow-read", "scripts/inspect_embeddings.ts", "--query", qtext, "--top", "1"],
    stdout: "piped",
    stderr: "piped",
    stdin: "null",
  });

  const result = await cmd.output();
  const stdout = new TextDecoder().decode(result.stdout);
  const stderr = new TextDecoder().decode(result.stderr);

  if (result.code !== 0) {
    console.error(stdout);
    console.error(stderr);
    throw new Error("inspect script failed");
  }

  // should mention our tmp file and produce a near-1.0 score
  assert(stdout.includes("tmp_inspect_test.json"), `expected stdout to include our tmp file: ${stdout}`);

  // parse the score value at start of the first line
  const firstLine = stdout.split("\n").find(Boolean) || "";
  const scoreStr = firstLine.split(/\s+/)[0];
  const score = Number(scoreStr);
  assert(!Number.isNaN(score), `expected numeric score, got: ${scoreStr}`);
  assert(score > 0.999, `expected score close to 1.0, got: ${score}`);

  // cleanup: remove tmp file and restore manifest
  await Deno.remove(tmpFile);
  if (originalManifest !== null) {
    await Deno.writeTextFile(manifestPath, originalManifest);
  } else {
    await Deno.remove(manifestPath);
  }
});
