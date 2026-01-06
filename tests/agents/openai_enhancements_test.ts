// Unit tests to verify Step 10.6 OpenAI enhancements are properly implemented
// Usage: deno test --allow-read tests/.copilot/openai_enhancements_test.ts

import { assert, assertExists } from "https://deno.land/std@0.203.0/assert/mod.ts";
import { parse } from "https://deno.land/std@0.203.0/yaml/mod.ts";

Deno.test("OpenAI enhancements: verify required files exist", async () => {
  const files = [
    ".copilot/providers/openai.md",
    ".copilot/providers/openai-rag.md",
    ".copilot/cross-reference.md",
    ".copilot/prompts/openai-quickstart.md",
    ".copilot/prompts/openai-rag-context-injection.md",
    ".copilot/prompts/openai-tdd-workflow.md",
    ".copilot/prompts/openai-debugging-systematic.md",
  ];

  for (const file of files) {
    const stat = await Deno.stat(file);
    assert(stat.isFile, `${file} should exist and be a file`);
  }
});

Deno.test("OpenAI enhancements: verify openai.md required sections", async () => {
  const md = await Deno.readTextFile(".copilot/providers/openai.md");

  assert(md.includes("Key points"), "Should have Key points");
  assert(/Canonical prompt \(short\)/.test(md), "Should have Canonical prompt (short)");
  assert(/Examples/i.test(md), "Should have Examples");
  assert(md.includes("Do / Don't"), "Should have Do / Don't");

  // Medium priority guardrails
  assert(md.includes("Output format (required)"), "Should define output format contract");
  assert(md.includes("Ask-when-ambiguous rule"), "Should define ask-when-ambiguous rule");
  assert(md.includes("Examples (by level)"), "Should include multi-level examples");
});

Deno.test("OpenAI enhancements: verify openai-rag.md structure", async () => {
  const md = await Deno.readTextFile(".copilot/providers/openai-rag.md");

  assert(md.includes("Key points"), "Should have Key points");
  assert(md.includes("## Overview"), "Should have Overview section");
  assert(md.includes("## RAG Workflow"), "Should have RAG Workflow section");
  assert(md.includes("## Tools"), "Should have Tools section");
  assert(md.includes("Canonical prompt (short)"), "Should have Canonical prompt (short)");
  assert(md.includes("## Examples"), "Should have Examples section");
  assert(md.includes("Examples (by level)"), "Should include multi-level examples");
  assert(md.includes("## Do / Don't"), "Should have Do / Don't section");

  // Tool references
  assert(md.includes("scripts/inspect_embeddings.ts"), "Should reference inspect_embeddings tool");
  assert(md.includes("scripts/inject_agent_context.ts"), "Should reference inject_agent_context tool");
});

Deno.test("OpenAI enhancements: verify frontmatter schema + short_summary limits", async () => {
  const files = [
    ".copilot/providers/openai.md",
    ".copilot/providers/openai-rag.md",
    ".copilot/prompts/openai-quickstart.md",
    ".copilot/prompts/openai-rag-context-injection.md",
    ".copilot/prompts/openai-tdd-workflow.md",
    ".copilot/prompts/openai-debugging-systematic.md",
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
    assert(summary.length <= 200, `${filePath} short_summary should be ≤200 chars, got ${summary.length}`);
  }
});

Deno.test("OpenAI enhancements: verify manifest includes openai-rag", async () => {
  const manifestText = await Deno.readTextFile(".copilot/manifest.json");
  const manifest = JSON.parse(manifestText);

  assert(Array.isArray(manifest.docs), "Manifest should have docs array");

  const paths = manifest.docs.map((d: { path: string }) => d.path);
  assert(paths.includes(".copilot/providers/openai-rag.md"), "Manifest should include openai-rag.md");

  const openaiRagDoc = manifest.docs.find((d: { path: string }) => d.path === ".copilot/providers/openai-rag.md");
  assertExists(openaiRagDoc, "openai-rag.md should be in manifest");
  assert(Array.isArray(openaiRagDoc.chunks), "openai-rag.md should have chunks array");
  assert(openaiRagDoc.chunks.length > 0, "openai-rag.md should have at least 1 chunk");
});

Deno.test("OpenAI enhancements: verify embeddings generated", async () => {
  const embeddingFiles = [
    ".copilot/embeddings/openai.md.json",
    ".copilot/embeddings/openai-rag.md.json",
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

Deno.test("OpenAI enhancements: verify chunks were generated", async () => {
  const patterns = [
    "openai.md.chunk",
    "openai-rag.md.chunk",
  ];

  for (const pattern of patterns) {
    let found = false;
    for await (const entry of Deno.readDir(".copilot/chunks")) {
      if (!entry.isFile) continue;
      if (!entry.name.startsWith(pattern)) continue;
      found = true;
      const content = await Deno.readTextFile(`.copilot/chunks/${entry.name}`);
      assert(content.length > 0, `Chunk file ${entry.name} should not be empty`);
    }
    assert(found, `Should have at least one chunk file matching ${pattern}`);
  }
});

Deno.test("OpenAI enhancements: verify context injection works", async () => {
  const { inject } = await import("../../scripts/inject_agent_context.ts");

  const ragResult = await inject("openai", "OpenAI RAG context injection", 4);
  assert(ragResult.found, "Should find RAG-related OpenAI doc");
  assert(
    (ragResult.path || "").includes(".copilot/providers/openai") ||
      (ragResult.path || "").includes(".copilot/prompts/openai-"),
    "Should return an OpenAI agent doc or OpenAI prompt template",
  );
  assert(
    (ragResult.snippet || "").toLowerCase().includes("rag") ||
      (ragResult.snippet || "").toLowerCase().includes("inject"),
    "Injected snippet should mention RAG or injection",
  );
});
