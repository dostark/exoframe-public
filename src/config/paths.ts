import { join } from "@std/path";

export interface ExoPaths {
  workspace: string;
  runtime: string;
  memory: string;
  portals: string;
  blueprints: string;
}

export function getDefaultPaths(root: string): ExoPaths {
  return {
    workspace: join(root, "Workspace"),
    runtime: join(root, ".exo"),
    memory: join(root, "Memory"),
    portals: join(root, "Portals"),
    blueprints: join(root, "Blueprints"),
  };
}
