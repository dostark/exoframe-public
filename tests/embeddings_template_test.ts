import { assert, assertEquals, assertExists } from "https://deno.land/std@0.203.0/assert/mod.ts";

Deno.test("example precomputed template is valid JSON and contains required keys", async () => {
  const raw = await Deno.readTextFile(".copilot/embeddings/example_precomputed_template.json");
  const obj = JSON.parse(raw) as Record<string, unknown>;

  assertExists(obj.path, "template should include 'path'");
  assert(Array.isArray(obj.vecs), "template should include 'vecs' array");
  const vecs = obj.vecs as Array<Record<string, unknown>>;
  assert(vecs.length > 0, "vecs should not be empty");

  const first = vecs[0];
  assertExists(first.text, "each vec entry should include text");
  assert(Array.isArray(first.vector), "each vec entry should include a vector array");

  // ensure vectors are numeric
  const vector = first.vector as unknown[];
  assert(vector.length > 0, "vector should have at least one dimension");
  for (const v of vector) {
    assertEquals(typeof v, "number", "vector dimensions should be numbers");
  }
});
