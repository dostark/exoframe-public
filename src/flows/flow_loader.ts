import { join } from "jsr:@std/path@1";
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
      // Dynamically import the flow file
      const module = await import(`file://${filePath}`);

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
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Flow not found: ${flowId}`);
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
