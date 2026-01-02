// Unit tests to verify Step 10.5 Claude enhancements are properly implemented
// Usage: deno test --allow-read tests/agents/claude_enhancements_test.ts

import { assert, assertExists } from "https://deno.land/std@0.203.0/assert/mod.ts";
import { parse } from "https://deno.land/std@0.203.0/yaml/mod.ts";

Deno.test("Claude enhancements: verify all required files exist", async () => {
  // Verify all enhanced files were created
  const files = [
    "agents/providers/claude.md",
    "agents/providers/claude-rag.md",
    "agents/cross-reference.md",
    "agents/README.md",
  ];

  for (const file of files) {
    const stat = await Deno.stat(file);
    assert(stat.isFile, `${file} should exist and be a file`);
  }
});

Deno.test("Claude enhancements: verify all sections exist in claude.md", async () => {
  const claudeMd = await Deno.readTextFile("agents/providers/claude.md");

  // Verify required sections
  assert(claudeMd.includes("## Task-Specific System Prompts"), "Should have Task-Specific System Prompts section");
  assert(claudeMd.includes("### TDD Workflow"), "Should have TDD Workflow section");
  assert(claudeMd.includes("### Refactoring"), "Should have Refactoring section");
  assert(claudeMd.includes("### Debugging"), "Should have Debugging section");
  assert(claudeMd.includes("### Documentation"), "Should have Documentation section");
  assert(claudeMd.includes("## Thinking Protocol for Complex Tasks"), "Should have Thinking Protocol section");
  assert(claudeMd.includes("## Tool-Use Patterns for Claude"), "Should have Tool-Use Patterns section");
  assert(claudeMd.includes("## Common Pitfalls with ExoFrame"), "Should have Common Pitfalls section");

  // Verify examples
  assert(claudeMd.includes("initTestDbService"), "Should reference initTestDbService helper");
  assert(claudeMd.includes("createCliTestContext"), "Should reference createCliTestContext helper");
  assert(claudeMd.includes("<thinking>"), "Should include thinking tag example");

  // Verify at least 8 common pitfalls
  const pitfallsSection = claudeMd.split("## Common Pitfalls with ExoFrame")[1];
  const pitfallCount = (pitfallsSection.match(/###\s+\d+\./g) || []).length;
  assert(pitfallCount >= 8, `Should have at least 8 common pitfalls, found ${pitfallCount}`);
});

Deno.test("Claude enhancements: verify all sections exist in claude-rag.md", async () => {
  const ragMd = await Deno.readTextFile("agents/providers/claude-rag.md");

  // Verify required sections
  assert(ragMd.includes("## RAG Workflow"), "Should have RAG Workflow section");
  assert(ragMd.includes("## Tools"), "Should have Tools section");
  assert(ragMd.includes("### Inspect Embeddings"), "Should have Inspect Embeddings section");
  assert(ragMd.includes("### Automatic Context Injection"), "Should have Automatic Context Injection section");
  assert(ragMd.includes("## Token Budget Strategies"), "Should have Token Budget Strategies section");
  assert(ragMd.includes("## Semantic Search Quality"), "Should have Semantic Search Quality section");
  assert(ragMd.includes("## Example: Multi-Step Task with RAG"), "Should have Multi-Step Example section");
  assert(ragMd.includes("## Best Practices"), "Should have Best Practices section");

  // Verify tool references
  assert(ragMd.includes("scripts/inspect_embeddings.ts"), "Should reference inspect_embeddings script");
  assert(ragMd.includes("scripts/inject_agent_context.ts"), "Should reference inject_agent_context script");
  assert(ragMd.includes("scripts/build_agents_embeddings.ts"), "Should reference build_agents_embeddings script");

  // Verify token budget table or strategy
  assert(ragMd.includes("200k"), "Should mention Claude's 200k context window");
  assert(ragMd.includes("4-6 chunks") || ragMd.includes("4-6"), "Should recommend 4-6 chunks");
});

Deno.test("Claude enhancements: verify cross-reference.md structure", async () => {
  const crossRefMd = await Deno.readTextFile("agents/cross-reference.md");

  // Verify required sections
  assert(crossRefMd.includes("## Task → Agent Doc Quick Reference"), "Should have task mapping table");
  assert(crossRefMd.includes("## Search by Topic"), "Should have topic search section");
  assert(crossRefMd.includes("## Workflow Examples"), "Should have workflow examples section");

  // Verify it includes key task types
  assert(crossRefMd.includes("Write unit tests"), "Should map 'Write unit tests' task");
  assert(crossRefMd.includes("Refactor code"), "Should map 'Refactor code' task");
  assert(crossRefMd.includes("Debug"), "Should map debugging tasks");
  assert(crossRefMd.includes("Security"), "Should map security tasks");
  assert(crossRefMd.includes("RAG"), "Should map RAG/embeddings tasks");

  // Verify it links to other docs
  assert(crossRefMd.includes("[tests/testing.md]"), "Should link to testing.md");
  assert(crossRefMd.includes("[source/exoframe.md]"), "Should link to exoframe.md");
  assert(crossRefMd.includes("[providers/claude.md]"), "Should link to claude.md");
  assert(crossRefMd.includes("[providers/claude-rag.md]"), "Should link to claude-rag.md");
});

Deno.test("Claude enhancements: verify README.md has Quick Start Guide", async () => {
  const readmeMd = await Deno.readTextFile("agents/README.md");

  // Verify Quick Start Guide section exists
  assert(readmeMd.includes("How to Add a New Agent Doc"), "Should have 'How to Add a New Agent Doc' section");

  // Verify it includes the 7 steps
  assert(readmeMd.includes("1. Create File in Appropriate Subfolder"), "Should have step 1");
  assert(readmeMd.includes("2. Add YAML Frontmatter"), "Should have step 2");
  assert(readmeMd.includes("3. Include Required Sections"), "Should have step 3");
  assert(readmeMd.includes("4. Regenerate Manifest"), "Should have step 4");
  assert(readmeMd.includes("5. Build Embeddings"), "Should have step 5");
  assert(readmeMd.includes("6. Validate"), "Should have step 6");
  assert(readmeMd.includes("7. Test Retrieval"), "Should have step 7");

  // Verify frontmatter template
  assert(readmeMd.includes("agent:"), "Should include frontmatter template with agent field");
  assert(readmeMd.includes("scope:"), "Should include frontmatter template with scope field");
  assert(readmeMd.includes("short_summary:"), "Should include frontmatter template with short_summary field");

  // Verify common mistakes section
  assert(readmeMd.includes("Common Mistakes to Avoid"), "Should have Common Mistakes section");
});

Deno.test("Claude enhancements: verify frontmatter schema compliance", async () => {
  const files = [
    "agents/providers/claude.md",
    "agents/providers/claude-rag.md",
    "agents/cross-reference.md",
  ];

  for (const filePath of files) {
    const content = await Deno.readTextFile(filePath);
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    assertExists(fmMatch, `${filePath} should have YAML frontmatter`);

    const fm = parse(fmMatch[1]) as Record<string, unknown>;

    // Verify required fields
    assert(fm.agent, `${filePath} should have 'agent' field`);
    assert(fm.scope, `${filePath} should have 'scope' field`);
    assert(fm.title, `${filePath} should have 'title' field`);
    assert(fm.short_summary, `${filePath} should have 'short_summary' field`);
    assert(fm.version, `${filePath} should have 'version' field`);

    // Verify short_summary length
    const summary = fm.short_summary as string;
    assert(summary.length <= 200, `${filePath} short_summary should be ≤200 chars, got ${summary.length}`);
  }
});

Deno.test("Claude enhancements: verify version updates", async () => {
  const claudeMd = await Deno.readTextFile("agents/providers/claude.md");
  const fmMatch = claudeMd.match(/^---\n([\s\S]*?)\n---/);
  assertExists(fmMatch);

  const fm = parse(fmMatch[1]) as Record<string, unknown>;

  // claude.md should be updated to v0.2 or higher (was expanded significantly)
  const version = fm.version as string;
  assert(version !== "0.1", "claude.md version should be updated from 0.1");
});

Deno.test("Claude enhancements: verify manifest includes new docs", async () => {
  const manifestText = await Deno.readTextFile("agents/manifest.json");
  const manifest = JSON.parse(manifestText);

  // Verify manifest structure
  assert(manifest.docs, "Manifest should have 'docs' array");
  assert(Array.isArray(manifest.docs), "Manifest 'docs' should be an array");

  // Verify new docs are in manifest
  const paths = manifest.docs.map((d: { path: string }) => d.path);
  assert(paths.includes("agents/providers/claude-rag.md"), "Manifest should include claude-rag.md");
  assert(paths.includes("agents/cross-reference.md"), "Manifest should include cross-reference.md");

  // Verify updated docs have chunks
  const claudeRagDoc = manifest.docs.find((d: { path: string }) => d.path === "agents/providers/claude-rag.md");
  assertExists(claudeRagDoc, "claude-rag.md should be in manifest");
  assert(Array.isArray(claudeRagDoc.chunks), "claude-rag.md should have chunks array");
  assert(claudeRagDoc.chunks.length > 0, "claude-rag.md should have at least 1 chunk");

  const crossRefDoc = manifest.docs.find((d: { path: string }) => d.path === "agents/cross-reference.md");
  assertExists(crossRefDoc, "cross-reference.md should be in manifest");
  assert(Array.isArray(crossRefDoc.chunks), "cross-reference.md should have chunks array");
  assert(crossRefDoc.chunks.length > 0, "cross-reference.md should have at least 1 chunk");
});

Deno.test("Claude enhancements: verify embeddings were generated", async () => {
  // Verify embedding files exist for new docs
  const embeddingFiles = [
    "agents/embeddings/claude-rag.md.json",
    "agents/embeddings/cross-reference.md.json",
  ];

  for (const file of embeddingFiles) {
    const stat = await Deno.stat(file);
    assert(stat.isFile, `${file} should exist`);

    // Verify embedding file structure
    const content = await Deno.readTextFile(file);
    const embeddingData = JSON.parse(content);
    assert(embeddingData.path, "Embedding file should have 'path' field");
    assert(embeddingData.title, "Embedding file should have 'title' field");
    assert(Array.isArray(embeddingData.vecs), "Embedding file should have 'vecs' array");
    assert(embeddingData.vecs.length > 0, "Embedding file should have at least 1 vector");

    // Verify vector structure
    const firstVec = embeddingData.vecs[0];
    assert(firstVec.text, "Vector should have 'text' field");
    assert(Array.isArray(firstVec.vector), "Vector should have 'vector' array");
    assert(firstVec.vector.length === 64, "Vector should be 64-dimensional");
  }
});

Deno.test("Claude enhancements: verify chunks were generated", async () => {
  // Verify chunk files exist for new docs
  const chunkPatterns = [
    "agents/chunks/claude-rag.md.chunk",
    "agents/chunks/cross-reference.md.chunk",
  ];

  for (const pattern of chunkPatterns) {
    // Find at least one chunk file matching the pattern
    let found = false;
    for await (const entry of Deno.readDir("agents/chunks")) {
      if (entry.name.startsWith(pattern.replace("agents/chunks/", ""))) {
        found = true;
        // Verify chunk file is not empty
        const content = await Deno.readTextFile(`agents/chunks/${entry.name}`);
        assert(content.length > 0, `Chunk file ${entry.name} should not be empty`);
      }
    }
    assert(found, `Should have at least one chunk file matching ${pattern}`);
  }
});

Deno.test("Claude enhancements: verify context injection works", async () => {
  // This is a functional test of the inject_agent_context script
  // We'll test that it can find the new docs

  const { inject } = await import("../../scripts/inject_agent_context.ts");

  // Test RAG query
  const ragResult = await inject("claude", "RAG embeddings semantic search", 4);
  assert(ragResult.found, "Should find RAG-related doc");
  assert(ragResult.path?.includes("claude-rag.md"), "Should return claude-rag.md for RAG query");

  // Test cross-reference query
  const crossRefResult = await inject("general", "task mapping quick reference", 4);
  assert(crossRefResult.found, "Should find cross-reference doc");
  assert(
    crossRefResult.path?.includes("cross-reference.md") || crossRefResult.path?.includes("README.md"),
    "Should return cross-reference.md or README.md for task mapping query",
  );

  // Test TDD query
  const tddResult = await inject("claude", "TDD test patterns", 4);
  assert(tddResult.found, "Should find TDD-related doc");
  assert(
    tddResult.path?.includes("testing.md") || tddResult.path?.includes("exoframe.md") ||
      tddResult.path?.includes("claude.md"),
    "Should return testing/exoframe/claude doc for TDD query",
  );
});

Deno.test("Claude enhancements: verify no sensitive data in docs", async () => {
  // Verify that docs don't contain actual secrets (validation should have caught this)
  const files = [
    "agents/providers/claude.md",
    "agents/providers/claude-rag.md",
    "agents/cross-reference.md",
  ];

  const secretPatterns = [
    /AKIA[A-Z0-9]{16}/, // AWS access key
    /sk-[a-zA-Z0-9]{32,}/, // OpenAI API key pattern
    /ghp_[a-zA-Z0-9]{36}/, // GitHub personal access token
    /ghs_[a-zA-Z0-9]{36}/, // GitHub secret
  ];

  for (const file of files) {
    const content = await Deno.readTextFile(file);
    for (const pattern of secretPatterns) {
      assert(!pattern.test(content), `${file} should not contain actual secrets matching ${pattern}`);
    }
  }
});
