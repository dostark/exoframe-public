import { dirname, join, resolve } from "jsr:@std/path@1";
import { Flow } from "../schemas/flow.ts";

/**
 * FlowLoader handles loading and managing flow definitions from the file system.
 * Loads TypeScript flow files from the /Blueprints/Flows/ directory.
 */
export class FlowLoader {
  private flowsDir: string;

  constructor(flowsDir: string) {
    this.flowsDir = flowsDir;
  }

  /**
   * Load all flow files from the flows directory.
   * Only loads files ending with .flow.ts and ignores invalid files.
   */
  async loadAllFlows(): Promise<Flow[]> {
    const flows: Flow[] = [];

    try {
      // Read all files in the flows directory
      const entries = [];
      for await (const entry of Deno.readDir(this.flowsDir)) {
        if (entry.isFile && entry.name.endsWith(".flow.ts")) {
          entries.push(entry.name);
        }
      }

      // Load each flow file
      for (const fileName of entries) {
        try {
          const flowId = fileName.replace(".flow.ts", "");
          const flow = await this.loadFlow(flowId);
          flows.push(flow);
        } catch (error) {
          console.warn(`Failed to load flow from ${fileName}:`, error instanceof Error ? error.message : String(error));
          // Continue loading other flows
        }
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // Directory doesn't exist, return empty array
        return [];
      }
      throw error;
    }

    return flows;
  }

  /**
   * Load a specific flow by its ID.
   * The flow file should be named {flowId}.flow.ts
   */
  async loadFlow(flowId: string): Promise<Flow> {
    const fileName = `${flowId}.flow.ts`;
    const filePath = join(this.flowsDir, fileName);

    try {
      // Read the original file content so we can rewrite imports that reference the project's src/
      const originalContent = await Deno.readTextFile(filePath);

      // Rewrite imports that reference "src/" so they resolve to the repository's src directory
      let rewrittenContent = originalContent.replace(/from\s+(['"])([^'"\n]*src\/[^'"\n]+)\1/g, (m, q, spec) => {
        const idx = spec.indexOf("src/");
        const relAfterSrc = spec.slice(idx + 4); // path after src/
        const absPath = join(Deno.cwd(), "src", relAfterSrc);
        return `from ${q}file://${absPath}${q}`;
      });

      // Rewrite relative imports (./ or ../) to absolute file URLs so that they resolve from the temp file
      const fileDir = dirname(filePath);
      rewrittenContent = rewrittenContent.replace(/from\s+(['"])(\.\.?\/[^'"\n]+)\1/g, (m, q, spec) => {
        const resolvedPath = resolve(fileDir, spec);
        return `from ${q}file://${resolvedPath}${q}`;
      });

      // Write rewritten content to a temp file so that imports resolve correctly during dynamic import
      const tempDir = await Deno.makeTempDir({ prefix: "exo-flow-" });
      const tempFilePath = join(tempDir, fileName);
      await Deno.writeTextFile(tempFilePath, rewrittenContent);

      // Dynamically import the temp file
      const module = await import(`file://${tempFilePath}`);

      // Cleanup temp directory (best-effort)
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch {
        // ignore cleanup errors
      }

      if (!module.default) {
        throw new Error(`Flow file ${fileName} does not export a default flow definition`);
      }

      // The default export should be a Flow object created by defineFlow
      const flow: Flow = module.default;

      // Validate that the flow ID matches the filename
      if (flow.id !== flowId) {
        throw new Error(`Flow ID '${flow.id}' does not match filename '${flowId}'`);
      }

      return flow;
    } catch (error) {
      // Normalize error messages so callers can assert on the standard message format
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Failed to load flow '${flowId}': ${error instanceof Error ? error.message : String(error)}`);
      }
      throw new Error(`Failed to load flow '${flowId}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if a flow exists without loading it.
   */
  async flowExists(flowId: string): Promise<boolean> {
    const fileName = `${flowId}.flow.ts`;
    const filePath = join(this.flowsDir, fileName);

    try {
      const stat = await Deno.stat(filePath);
      return stat.isFile;
    } catch {
      return false;
    }
  }

  /**
   * Get a list of available flow IDs.
   */
  async listFlowIds(): Promise<string[]> {
    const flowIds: string[] = [];

    try {
      for await (const entry of Deno.readDir(this.flowsDir)) {
        if (entry.isFile && entry.name.endsWith(".flow.ts")) {
          const flowId = entry.name.replace(".flow.ts", "");
          flowIds.push(flowId);
        }
      }
    } catch {
      // Directory doesn't exist, return empty array
    }

    return flowIds;
  }
}
