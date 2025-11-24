import { join } from "@std/path";
import type { Database } from "@db/sqlite";
import type { Config } from "../config/schema.ts";

export interface PortalInfo {
  alias: string;
  path: string;
  techStack: string[];
}

export class ContextCardGenerator {
  private config: Config;
  private db?: Database;

  constructor(config: Config, db?: Database) {
    this.config = config;
    this.db = db;
  }

  async generate(info: PortalInfo): Promise<void> {
    const { system, paths } = this.config;
    const portalsDir = join(system.root, paths.knowledge, "Portals");

    // Ensure directory exists
    await Deno.mkdir(portalsDir, { recursive: true });

    // Sanitize alias for filename
    // Replace spaces with underscores, remove non-alphanumeric chars (except _ and -)
    const safeAlias = info.alias.replace(/[^a-zA-Z0-9_-]/g, "_");
    const cardPath = join(portalsDir, `${safeAlias}.md`);

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
      const activityId = crypto.randomUUID();
      const traceId = crypto.randomUUID(); // New trace for this action
      const timestamp = new Date().toISOString();

      this.db.exec(
        `INSERT INTO activity (id, trace_id, actor, action_type, target, payload, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          activityId,
          traceId,
          "context_card_generator",
          actionType,
          payload.alias as string,
          JSON.stringify(payload),
          timestamp,
        ],
      );
    } catch (error) {
      console.error("Failed to log activity:", error);
    }
  }
}
