import { dirname, join } from "@std/path";
import { ensureDir } from "@std/fs/ensure-dir";
import type { DatabaseService } from "./db.ts";
import type { Config } from "../config/schema.ts";

export interface PortalInfo {
  alias: string;
  path: string;
  techStack: string[];
}

export class ContextCardGenerator {
  private config: Config;
  private db?: DatabaseService;

  constructor(config: Config, db?: DatabaseService) {
    this.config = config;
    this.db = db;
  }

  async generate(info: PortalInfo): Promise<void> {
    const { system } = this.config;
    // Put portal documentation in Memory/Projects (replaces legacy portal storage)
    const portalsDir = join(system.root, "Memory", "Projects");

    // Ensure directory exists
    await Deno.mkdir(portalsDir, { recursive: true });

    // Sanitize alias for filename
    // Replace spaces with underscores, remove non-alphanumeric chars (except _ and -)
    const safeAlias = info.alias.replace(/[^a-zA-Z0-9_-]/g, "_");
    const cardPath = join(portalsDir, `${safeAlias}`, "portal.md");

    let userNotes = "";
    let isUpdate = false;

    // Try to read existing file to preserve notes
    try {
      const existingContent = await Deno.readTextFile(cardPath);
      isUpdate = true;
      // Extract content after "## User Notes"
      const match = existingContent.match(/## User Notes\n([\s\S]*)/);
      if (match && match[1]) {
        userNotes = match[1].trim();
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
      // If not found, userNotes remains empty
    }

    // Construct new content
    const content = [
      `# Portal: ${info.alias}`,
      `- **Path**: \`${info.path}\``,
      `- **Tech Stack**: ${info.techStack.join(", ")}`,
      ``,
      `## User Notes`,
      ``,
      userNotes || "Add your notes here...",
      ``,
    ].join("\n");

    // Ensure directory exists
    await ensureDir(dirname(cardPath));
    await Deno.writeTextFile(cardPath, content);

    // Log activity
    this.logActivity(isUpdate ? "context_card.updated" : "context_card.created", {
      alias: info.alias,
      file_path: cardPath,
      tech_stack: info.techStack,
    });
  }

  private logActivity(actionType: string, payload: Record<string, unknown>) {
    if (!this.db) return;

    try {
      this.db.logActivity(
        "system",
        actionType,
        payload.alias as string,
        payload,
        undefined, // No specific trace_id for context card operations
        null, // No agent_id (system operation)
      );
    } catch (error) {
      console.error("Failed to log activity:", error);
    }
  }
}
