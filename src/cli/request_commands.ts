/**
 * RequestCommands - CLI interface for creating requests to ExoFrame agents
 *
 * This is the PRIMARY interface for human-to-agent communication.
 * It replaces manual file creation with validated, structured request generation.
 */

import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { BaseCommand, type CommandContext } from "./base.ts";

/**
 * Valid priority levels for requests
 */
export type RequestPriority = "low" | "normal" | "high" | "critical";

/**
 * Options for creating a request
 */
export interface RequestOptions {
  agent?: string;
  priority?: RequestPriority;
  portal?: string;
  model?: string;
}

/**
 * Source of request creation
 */
export type RequestSource = "cli" | "file" | "interactive";

/**
 * Metadata returned when a request is created
 */
export interface RequestMetadata {
  trace_id: string;
  filename: string;
  path: string;
  status: "pending";
  priority: RequestPriority;
  agent: string;
  portal?: string;
  model?: string;
  created: string;
  created_by: string;
  source: RequestSource;
}

/**
 * Request entry when listing
 */
export interface RequestEntry {
  trace_id: string;
  filename: string;
  path: string;
  status: string;
  priority: string;
  agent: string;
  portal?: string;
  model?: string;
  created: string;
  created_by: string;
  source: string;
}

/**
 * Result of showing a request
 */
export interface RequestShowResult {
  metadata: RequestEntry;
  content: string;
}

const VALID_PRIORITIES: RequestPriority[] = ["low", "normal", "high", "critical"];

/**
 * RequestCommands provides CLI operations for creating and managing requests.
 * All operations are logged to activity_log with actor='human'.
 */
export class RequestCommands extends BaseCommand {
  private workspaceRequestsDir: string;

  constructor(
    context: CommandContext,
    workspaceRoot: string,
  ) {
    super(context);
    this.workspaceRequestsDir = join(workspaceRoot, "Workspace", "Requests");
  }

  /**
   * Create a new request with the given description
   * @param description The request description/task
   * @param options Optional settings (agent, priority, portal)
   * @param source How the request was created (cli, file, interactive)
   * @returns Request metadata including path and trace_id
   */
  async create(
    description: string,
    options: RequestOptions = {},
    source: RequestSource = "cli",
  ): Promise<RequestMetadata> {
    // Validate description
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      throw new Error("Description cannot be empty");
    }

    // Validate priority
    const priority = options.priority || "normal";
    if (!VALID_PRIORITIES.includes(priority)) {
      throw new Error(`Invalid priority: ${priority}. Must be one of: ${VALID_PRIORITIES.join(", ")}`);
    }

    // Set defaults
    const agent = options.agent || "default";
    const portal = options.portal;

    // Generate unique trace_id
    const trace_id = crypto.randomUUID();
    const shortId = trace_id.slice(0, 8);
    const filename = `request-${shortId}.md`;
    const path = join(this.workspaceRequestsDir, filename);

    // Get user identity
    const created_by = await this.getUserIdentity();
    const created = new Date().toISOString();

    // Build frontmatter
    const frontmatterFields: Record<string, string> = {
      trace_id,
      created,
      status: "pending",
      priority,
      agent,
      source,
      created_by,
    };

    if (portal) {
      frontmatterFields.portal = portal;
    }

    if (options.model) {
      frontmatterFields.model = options.model;
    }

    // Build file content with YAML frontmatter
    const frontmatter = this.serializeFrontmatter(frontmatterFields);
    const content = `${frontmatter}\n\n# Request\n\n${trimmedDescription}\n`;

    // Ensure directory exists
    await ensureDir(this.workspaceRequestsDir);

    // Write file
    await Deno.writeTextFile(path, content);

    // Log activity using EventLogger
    const actionLogger = await this.getActionLogger();
    actionLogger.info("request.created", path, {
      trace_id,
      priority,
      agent,
      portal: portal || null,
      model: options.model || null,
      source,
      created_by,
      description_length: trimmedDescription.length,
      via: "cli",
      command: this.getCommandLineString(),
    }, trace_id);

    return {
      trace_id,
      filename,
      path,
      status: "pending",
      priority,
      agent,
      portal,
      model: options.model,
      created,
      created_by,
      source,
    };
  }

  /**
   * Create a request from a file's content
   * @param filePath Path to file containing the request description
   * @param options Optional settings (agent, priority, portal)
   * @returns Request metadata
   */
  async createFromFile(
    filePath: string,
    options: RequestOptions = {},
  ): Promise<RequestMetadata> {
    // Check file exists
    if (!await exists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read file content
    const content = await Deno.readTextFile(filePath);
    const trimmed = content.trim();

    // Validate not empty
    if (!trimmed) {
      throw new Error("File is empty");
    }

    // Create request with file source
    return this.create(trimmed, options, "file");
  }

  /**
   * List requests in the inbox
   * @param status Optional status filter
   * @returns Array of request entries sorted by created date (newest first)
   */
  async list(status?: string): Promise<RequestEntry[]> {
    const requests: RequestEntry[] = [];

    // Check if directory exists
    if (!await exists(this.workspaceRequestsDir)) {
      return [];
    }

    // Scan directory
    for await (const entry of Deno.readDir(this.workspaceRequestsDir)) {
      if (!entry.isFile || !entry.name.endsWith(".md")) {
        continue;
      }

      const filePath = join(this.workspaceRequestsDir, entry.name);
      const content = await Deno.readTextFile(filePath);
      const frontmatter = this.extractFrontmatter(content);

      // Skip if status filter doesn't match
      if (status && frontmatter.status !== status) {
        continue;
      }

      requests.push({
        trace_id: frontmatter.trace_id || "",
        filename: entry.name,
        path: filePath,
        status: frontmatter.status || "unknown",
        priority: frontmatter.priority || "normal",
        agent: frontmatter.agent || "default",
        portal: frontmatter.portal,
        model: frontmatter.model,
        created: frontmatter.created || "",
        created_by: frontmatter.created_by || "unknown",
        source: frontmatter.source || "unknown",
      });
    }

    // Sort by created date descending (newest first)
    requests.sort((a, b) => {
      const dateA = new Date(a.created).getTime();
      const dateB = new Date(b.created).getTime();
      return dateB - dateA;
    });

    return requests;
  }

  /**
   * Show details of a specific request
   * @param idOrFilename Full trace_id, short trace_id (8 chars), or filename
   * @returns Request metadata and content body
   */
  async show(idOrFilename: string): Promise<RequestShowResult> {
    // Check if directory exists
    if (!await exists(this.workspaceRequestsDir)) {
      throw new Error(`Request not found: ${idOrFilename}`);
    }

    // Try to find the request
    let matchingFile: string | null = null;
    let matchingFrontmatter: Record<string, string> | null = null;

    for await (const entry of Deno.readDir(this.workspaceRequestsDir)) {
      if (!entry.isFile || !entry.name.endsWith(".md")) {
        continue;
      }

      const filePath = join(this.workspaceRequestsDir, entry.name);
      const content = await Deno.readTextFile(filePath);
      const frontmatter = this.extractFrontmatter(content);

      // Match by filename
      if (entry.name === idOrFilename) {
        matchingFile = filePath;
        matchingFrontmatter = frontmatter;
        break;
      }

      // Match by full trace_id
      if (frontmatter.trace_id === idOrFilename) {
        matchingFile = filePath;
        matchingFrontmatter = frontmatter;
        break;
      }

      // Match by short trace_id (first 8 chars)
      if (frontmatter.trace_id && frontmatter.trace_id.startsWith(idOrFilename)) {
        if (matchingFile) {
          // Ambiguous match - multiple requests match the short ID
          throw new Error(`Ambiguous request ID: ${idOrFilename}. Please use a longer ID.`);
        }
        matchingFile = filePath;
        matchingFrontmatter = frontmatter;
        // Continue to check for ambiguity
      }
    }

    if (!matchingFile || !matchingFrontmatter) {
      throw new Error(`Request not found: ${idOrFilename}`);
    }

    // Read full content
    const fullContent = await Deno.readTextFile(matchingFile);

    // Extract body (content after YAML frontmatter)
    const body = fullContent.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();

    return {
      metadata: {
        trace_id: matchingFrontmatter.trace_id || "",
        filename: matchingFile.split("/").pop() || "",
        path: matchingFile,
        status: matchingFrontmatter.status || "unknown",
        priority: matchingFrontmatter.priority || "normal",
        agent: matchingFrontmatter.agent || "default",
        portal: matchingFrontmatter.portal,
        model: matchingFrontmatter.model,
        created: matchingFrontmatter.created || "",
        created_by: matchingFrontmatter.created_by || "unknown",
        source: matchingFrontmatter.source || "unknown",
      },
      content: body,
    };
  }
}
