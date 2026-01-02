// Unit tests to verify Step 10.8 self-improvement loop is properly implemented
// Usage: deno test --allow-read tests/agents/self_improvement_process_test.ts

import { assert, assertExists } from "https://deno.land/std@0.203.0/assert/mod.ts";
import { parse } from "https://deno.land/std@0.203.0/yaml/mod.ts";

const REQUIRED_FILES = [
  "agents/process/self-improvement.md",
  "agents/prompts/self-improvement-loop.md",
  "agents/cross-reference.md",
  "agents/prompts/README.md",
  "agents/providers/claude.md",
  "agents/providers/openai.md",
  "agents/providers/google.md",
];

Deno.test("Self-improvement loop: verify required files exist", async () => {
  for (const file of REQUIRED_FILES) {
    const stat = await Deno.stat(file);
    assert(stat.isFile, `${file} should exist and be a file`);
  }
});

Deno.test("Self-improvement loop: verify process doc and template have required sections", async () => {
  const processMd = await Deno.readTextFile("agents/process/self-improvement.md");
  assert(processMd.includes("Key points"), "process doc should have Key points");
  assert(processMd.includes("Canonical prompt (short)"), "process doc should have Canonical prompt (short)");
  assert(processMd.includes("Examples"), "process doc should have Examples");
  assert(
    processMd.includes("Do / Don't") || processMd.includes("Do / Don’t"),
    "process doc should have Do / Don't",
  );

  const promptMd = await Deno.readTextFile("agents/prompts/self-improvement-loop.md");
  assert(promptMd.includes("Key points"), "template should have Key points");
  assert(promptMd.includes("Canonical prompt (short)"), "template should have Canonical prompt (short)");
  assert(promptMd.includes("Examples"), "template should have Examples");
  assert(promptMd.includes("## Template"), "template should include a Template section");
});

Deno.test("Self-improvement loop: verify frontmatter schema + short_summary limits", async () => {
  const files = [
    "agents/process/self-improvement.md",
    "agents/prompts/self-improvement-loop.md",
  ];

  for (const filePath of files) {
    const content = await Deno.readTextFile(filePath);
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    assertExists(fmMatch, `${filePath} should have YAML frontmatter`);

    const fm = parse(fmMatch[1]) as Record<string, unknown>;

    assert(fm.agent, `${filePath} should have agent`);
    assert(fm.scope, `${filePath} should have scope`);
    assert(fm.title, `${filePath} should have title`);
    assert(fm.short_summary, `${filePath} should have short_summary`);
    assert(fm.version, `${filePath} should have version`);

    const summary = fm.short_summary as string;
    assert(summary.length <= 200, `${filePath} short_summary should be <=200 chars, got ${summary.length}`);
  }
});

Deno.test("Self-improvement loop: verify provider docs reference common process", async () => {
  const providers = [
    "agents/providers/claude.md",
    "agents/providers/openai.md",
    "agents/providers/google.md",
  ];

  for (const providerPath of providers) {
    const md = await Deno.readTextFile(providerPath);
    assert(
      md.includes("agents/process/self-improvement.md"),
      `${providerPath} should reference agents/process/self-improvement.md`,
    );
    assert(
      md.includes("agents/prompts/self-improvement-loop.md"),
      `${providerPath} should reference agents/prompts/self-improvement-loop.md`,
    );
  }
});

Deno.test("Self-improvement loop: verify discovery docs mention the process", async () => {
  const crossRef = await Deno.readTextFile("agents/cross-reference.md");
  assert(
    crossRef.includes("Instruction gaps / self-improvement"),
    "cross-reference should include self-improvement mapping row",
  );
  assert(
    crossRef.includes("process/self-improvement.md") &&
      crossRef.includes("prompts/self-improvement-loop.md"),
    "cross-reference should link to process and template",
  );

  const promptsReadme = await Deno.readTextFile("agents/prompts/README.md");
  assert(
    promptsReadme.includes("self-improvement-loop.md"),
    "prompts README should include self-improvement-loop.md",
  );
});

Deno.test("Self-improvement loop: verify manifest includes new docs", async () => {
  const manifestText = await Deno.readTextFile("agents/manifest.json");
  const manifest = JSON.parse(manifestText);

  assert(Array.isArray(manifest.docs), "Manifest should have docs array");

  const paths = manifest.docs.map((d: { path: string }) => d.path);
  assert(paths.includes("agents/process/self-improvement.md"), "Manifest should include process doc");
  assert(paths.includes("agents/prompts/self-improvement-loop.md"), "Manifest should include prompt template");

  const processDoc = manifest.docs.find((d: { path: string }) => d.path === "agents/process/self-improvement.md");
  assertExists(processDoc, "process doc should be in manifest");
  assert(Array.isArray(processDoc.chunks), "process doc should have chunks array");
  assert(processDoc.chunks.length > 0, "process doc should have at least 1 chunk");
});

Deno.test("Self-improvement loop: verify embeddings generated", async () => {
  const embeddingFiles = [
    "agents/embeddings/self-improvement.md.json",
    "agents/embeddings/self-improvement-loop.md.json",
  ];

  for (const file of embeddingFiles) {
    const stat = await Deno.stat(file);
    assert(stat.isFile, `${file} should exist`);

    const content = await Deno.readTextFile(file);
    const embeddingData = JSON.parse(content);
    assert(embeddingData.path, "Embedding file should have path");
    assert(embeddingData.title, "Embedding file should have title");
    assert(Array.isArray(embeddingData.vecs), "Embedding file should have vecs array");
    assert(embeddingData.vecs.length > 0, "Embedding file should have at least 1 vector");

    const firstVec = embeddingData.vecs[0];
    assert(firstVec.text, "Vector should have text");
    assert(Array.isArray(firstVec.vector), "Vector should have vector array");
    assert(firstVec.vector.length === 64, "Vector should be 64-dimensional");
  }
});

Deno.test("Self-improvement loop: verify chunks were generated", async () => {
  const patterns = [
    "self-improvement.md.chunk",
    "self-improvement-loop.md.chunk",
  ];

  for (const pattern of patterns) {
    let found = false;
    for await (const entry of Deno.readDir("agents/chunks")) {
      if (!entry.isFile) continue;
      if (!entry.name.startsWith(pattern)) continue;
      found = true;
      const content = await Deno.readTextFile(`agents/chunks/${entry.name}`);
      assert(content.length > 0, `Chunk file ${entry.name} should not be empty`);
    }
    assert(found, `Should have at least one chunk file matching ${pattern}`);
  }
});
