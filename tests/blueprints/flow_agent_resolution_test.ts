/**
 * Flow Agent Resolution Tests
 * Phase 18: Blueprint Modernization
 *
 * Validates all flows reference agents that exist.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { parse as parseYaml } from "https://deno.land/std@0.224.0/yaml/mod.ts";

const BLUEPRINTS_DIR = "./Blueprints/Agents";
const EXAMPLES_DIR = "./Blueprints/Agents/examples";
const FLOWS_DIR = "./Blueprints/Flows";

interface BlueprintFrontmatter {
  agent_id: string;
}

/**
 * Parse YAML frontmatter from a markdown file
 */
function parseFrontmatter(content: string): BlueprintFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  return parseYaml(match[1]) as BlueprintFrontmatter;
}

/**
 * Get all agent IDs from blueprints
 */
async function getAllAgentIds(): Promise<Set<string>> {
  const agentIds = new Set<string>();

  const dirs = [BLUEPRINTS_DIR, EXAMPLES_DIR];

  for (const dir of dirs) {
    try {
      for await (const entry of Deno.readDir(dir)) {
        if (entry.isFile && entry.name.endsWith(".md") && entry.name !== "README.md") {
          const content = await Deno.readTextFile(join(dir, entry.name));
          const frontmatter = parseFrontmatter(content);
          if (frontmatter?.agent_id) {
            agentIds.add(frontmatter.agent_id);
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return agentIds;
}

/**
 * Extract agent references from a flow file
 */
async function getFlowAgentRefs(flowPath: string): Promise<string[]> {
  const content = await Deno.readTextFile(flowPath);

  // Match agent: "agent-name" patterns
  const agentRefs: string[] = [];
  const regex = /agent:\s*["']([^"']+)["']/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    agentRefs.push(match[1]);
  }

  return agentRefs;
}

// ============================================================================
// Flow Agent Resolution Tests
// ============================================================================

Deno.test("Flow validation: code_review.flow.ts resolves all agents", async () => {
  const agentIds = await getAllAgentIds();
  const flowPath = join(FLOWS_DIR, "code_review.flow.ts");
  const flowAgents = await getFlowAgentRefs(flowPath);

  for (const agent of flowAgents) {
    assertEquals(
      agentIds.has(agent),
      true,
      `code_review.flow.ts references "${agent}" but no blueprint exists`,
    );
  }
});

Deno.test("Flow validation: feature_development.flow.ts resolves all agents", async () => {
  const agentIds = await getAllAgentIds();
  const flowPath = join(FLOWS_DIR, "feature_development.flow.ts");
  const flowAgents = await getFlowAgentRefs(flowPath);

  for (const agent of flowAgents) {
    assertEquals(
      agentIds.has(agent),
      true,
      `feature_development.flow.ts references "${agent}" but no blueprint exists`,
    );
  }
});

Deno.test("Flow validation: documentation.flow.ts resolves all agents", async () => {
  const agentIds = await getAllAgentIds();
  const flowPath = join(FLOWS_DIR, "documentation.flow.ts");
  const flowAgents = await getFlowAgentRefs(flowPath);

  for (const agent of flowAgents) {
    assertEquals(
      agentIds.has(agent),
      true,
      `documentation.flow.ts references "${agent}" but no blueprint exists`,
    );
  }
});

// ============================================================================
// Flow defaultSkills Tests
// ============================================================================

Deno.test("Flow validation: code_review.flow.ts has defaultSkills", async () => {
  const flowPath = join(FLOWS_DIR, "code_review.flow.ts");
  const content = await Deno.readTextFile(flowPath);

  const hasDefaultSkills = content.includes("defaultSkills:");
  assertEquals(
    hasDefaultSkills,
    true,
    "code_review.flow.ts should have defaultSkills defined",
  );
});

Deno.test("Flow validation: feature_development.flow.ts has defaultSkills", async () => {
  const flowPath = join(FLOWS_DIR, "feature_development.flow.ts");
  const content = await Deno.readTextFile(flowPath);

  const hasDefaultSkills = content.includes("defaultSkills:");
  assertEquals(
    hasDefaultSkills,
    true,
    "feature_development.flow.ts should have defaultSkills defined",
  );
});

Deno.test("Flow validation: documentation.flow.ts has defaultSkills", async () => {
  const flowPath = join(FLOWS_DIR, "documentation.flow.ts");
  const content = await Deno.readTextFile(flowPath);

  const hasDefaultSkills = content.includes("defaultSkills:");
  assertEquals(
    hasDefaultSkills,
    true,
    "documentation.flow.ts should have defaultSkills defined",
  );
});

// ============================================================================
// Comprehensive Agent Coverage Test
// ============================================================================

Deno.test("Flow validation: all flow-referenced agents exist", async () => {
  const agentIds = await getAllAgentIds();

  const flowFiles = [];
  for await (const entry of Deno.readDir(FLOWS_DIR)) {
    if (entry.isFile && entry.name.endsWith(".flow.ts")) {
      flowFiles.push(join(FLOWS_DIR, entry.name));
    }
  }

  const missingAgents: { flow: string; agent: string }[] = [];

  for (const flowPath of flowFiles) {
    const flowAgents = await getFlowAgentRefs(flowPath);
    for (const agent of flowAgents) {
      if (!agentIds.has(agent)) {
        missingAgents.push({ flow: flowPath, agent });
      }
    }
  }

  assertEquals(
    missingAgents.length,
    0,
    `Missing agents: ${JSON.stringify(missingAgents, null, 2)}`,
  );
});
