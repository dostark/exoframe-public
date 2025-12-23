import { join } from "@std/path";
import { exists } from "@std/fs";
import type { Blueprint } from "./agent_runner.ts";

/** Load an agent blueprint file from a blueprints directory. */
export async function loadBlueprint(blueprintsPath: string, agentId: string): Promise<Blueprint | null> {
  const blueprintPath = join(blueprintsPath, `${agentId}.md`);
  if (!await exists(blueprintPath)) return null;
  try {
    const content = await Deno.readTextFile(blueprintPath);
    return { systemPrompt: content, agentId };
  } catch (err) {
    console.error(`Failed to load blueprint ${agentId}:`, err);
    return null;
  }
}

/** Build a ParsedRequest used by AgentRunner. */
export function buildParsedRequest(body: string, frontmatter: Record<string, any>, requestId: string, traceId: string) {
  return {
    userPrompt: body.trim(),
    context: {
      priority: frontmatter.priority,
      source: frontmatter.source,
    },
    requestId,
    traceId,
  };
}
