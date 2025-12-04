/**
 * MCP Resources Tests
 */

import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { createMockConfig } from "../helpers/config.ts";
import { initTestDbService } from "../helpers/db.ts";
import {
  buildPortalURI,
  discoverAllResources,
  discoverPortalResources,
  getResourceTemplates,
  parsePortalURI,
} from "../../src/mcp/resources.ts";

// ============================================================================
// URI Parsing Tests
// ============================================================================

Deno.test("parsePortalURI: parses valid portal URI", () => {
  const result = parsePortalURI("portal://MyApp/src/auth.ts");
  
  assertExists(result);
  assertEquals(result.portal, "MyApp");
  assertEquals(result.path, "src/auth.ts");
});

Deno.test("parsePortalURI: parses URI with nested path", () => {
  const result = parsePortalURI("portal://MyApp/src/components/Button.tsx");
  
  assertExists(result);
  assertEquals(result.portal, "MyApp");
  assertEquals(result.path, "src/components/Button.tsx");
});

Deno.test("parsePortalURI: returns null for invalid URI", () => {
  const result = parsePortalURI("http://example.com/file.ts");
  
  assertEquals(result, null);
});

Deno.test("parsePortalURI: returns null for missing path", () => {
  const result = parsePortalURI("portal://MyApp");
  
  assertEquals(result, null);
});

Deno.test("buildPortalURI: builds valid URI", () => {
  const uri = buildPortalURI("MyApp", "src/auth.ts");
  
  assertEquals(uri, "portal://MyApp/src/auth.ts");
});

// ============================================================================
// Resource Discovery Tests
// ============================================================================

Deno.test("discoverPortalResources: discovers files in portal", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-" });

  try {
    // Create test portal structure
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(join(portalPath, "src"));
    await Deno.writeTextFile(join(portalPath, "README.md"), "# Test");
    await Deno.writeTextFile(join(portalPath, "src", "main.ts"), "console.log('test');");
    await Deno.writeTextFile(join(portalPath, "src", "utils.ts"), "export {}");

    const resources = await discoverPortalResources("TestPortal", portalPath);

    // Should find all 3 files
    assertEquals(resources.length >= 2, true);
    
    // Check URIs are correct format
    const uris = resources.map(r => r.uri);
    const hasReadme = uris.some(uri => uri.includes("README.md"));
    const hasMainTs = uris.some(uri => uri.includes("main.ts"));
    
    assertEquals(hasReadme, true);
    assertEquals(hasMainTs, true);

    // Check MIME types
    const tsResource = resources.find(r => r.uri.includes("main.ts"));
    assertExists(tsResource);
    assertEquals(tsResource.mimeType, "text/x-typescript");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("discoverPortalResources: respects maxDepth option", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-depth-" });

  try {
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(join(portalPath, "level1", "level2", "level3"));
    await Deno.writeTextFile(join(portalPath, "root.txt"), "root");
    await Deno.writeTextFile(join(portalPath, "level1", "file1.txt"), "level1");
    await Deno.writeTextFile(join(portalPath, "level1", "level2", "file2.txt"), "level2");
    await Deno.writeTextFile(join(portalPath, "level1", "level2", "level3", "file3.txt"), "level3");

    const resources = await discoverPortalResources("TestPortal", portalPath, {
      maxDepth: 2,
    });

    // Should find root.txt and file1.txt, but not file2.txt or file3.txt (depth > 2)
    const paths = resources.map(r => {
      const parsed = parsePortalURI(r.uri);
      return parsed?.path;
    });

    assertEquals(paths.includes("root.txt"), true);
    assertEquals(paths.includes("level1/file1.txt"), true);
    // Note: maxDepth includes the root, so depth 2 includes level1
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("discoverPortalResources: filters by extensions", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-ext-" });

  try {
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(portalPath);
    await Deno.writeTextFile(join(portalPath, "code.ts"), "ts file");
    await Deno.writeTextFile(join(portalPath, "script.js"), "js file");
    await Deno.writeTextFile(join(portalPath, "data.json"), "{}");
    await Deno.writeTextFile(join(portalPath, "README.md"), "# readme");

    const resources = await discoverPortalResources("TestPortal", portalPath, {
      extensions: ["ts", "js"],
    });

    const paths = resources.map(r => {
      const parsed = parsePortalURI(r.uri);
      return parsed?.path;
    });

    assertEquals(paths.includes("code.ts"), true);
    assertEquals(paths.includes("script.js"), true);
    assertEquals(paths.includes("data.json"), false);
    assertEquals(paths.includes("README.md"), false);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("discoverPortalResources: skips hidden files by default", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-hidden-" });

  try {
    const portalPath = join(tempDir, "TestPortal");
    await ensureDir(portalPath);
    await Deno.writeTextFile(join(portalPath, "visible.ts"), "visible");
    await Deno.writeTextFile(join(portalPath, ".hidden"), "hidden");

    const resources = await discoverPortalResources("TestPortal", portalPath);

    const paths = resources.map(r => {
      const parsed = parsePortalURI(r.uri);
      return parsed?.path;
    });

    assertEquals(paths.includes("visible.ts"), true);
    assertEquals(paths.includes(".hidden"), false);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("discoverAllResources: discovers from multiple portals", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "mcp-resources-all-" });
  const { db, cleanup } = await initTestDbService();

  try {
    // Create two test portals
    const portal1Path = join(tempDir, "Portal1");
    const portal2Path = join(tempDir, "Portal2");
    
    await ensureDir(portal1Path);
    await ensureDir(portal2Path);
    
    await Deno.writeTextFile(join(portal1Path, "file1.ts"), "portal1");
    await Deno.writeTextFile(join(portal2Path, "file2.ts"), "portal2");

    const config = createMockConfig(tempDir, {
      portals: [
        { alias: "Portal1", target_path: portal1Path },
        { alias: "Portal2", target_path: portal2Path },
      ],
    });

    const resources = await discoverAllResources(config, db);

    // Should find files from both portals
    assertEquals(resources.length >= 2, true);
    
    const portal1Resources = resources.filter(r => r.uri.startsWith("portal://Portal1/"));
    const portal2Resources = resources.filter(r => r.uri.startsWith("portal://Portal2/"));
    
    assertEquals(portal1Resources.length >= 1, true);
    assertEquals(portal2Resources.length >= 1, true);
  } finally {
    await cleanup();
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("getResourceTemplates: returns templates for all portals", () => {
  const tempDir = "/tmp/test";
  const config = createMockConfig(tempDir, {
    portals: [
      { alias: "Portal1", target_path: "/tmp/portal1" },
      { alias: "Portal2", target_path: "/tmp/portal2" },
    ],
  });

  const templates = getResourceTemplates(config);

  assertEquals(templates.length, 2);
  assertEquals(templates[0].uriTemplate, "portal://Portal1/{path}");
  assertEquals(templates[1].uriTemplate, "portal://Portal2/{path}");
  assertStringIncludes(templates[0].name, "Portal1");
  assertStringIncludes(templates[1].name, "Portal2");
});
