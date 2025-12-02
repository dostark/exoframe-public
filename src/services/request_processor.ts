/**
 * RequestProcessor - Processes request files and generates plans
 * Implements Step 5.9 of the ExoFrame Implementation Plan
 *
 * Responsibilities:
 * 1. Parse request files (YAML frontmatter + body)
 * 2. Load agent blueprints from Blueprints/Agents/
 * 3. Call AgentRunner.run() to generate plan content
 * 4. Write plans to Inbox/Plans/ using PlanWriter
 * 5. Update request status (pending → planned | failed)
 * 6. Log all activities to Activity Journal
 */

import { parse as parseYaml } from "@std/yaml";
import { basename, join } from "@std/path";
import { exists } from "@std/fs";
import type { IModelProvider } from "../ai/providers.ts";
import type { DatabaseService } from "./db.ts";
import type { Config } from "../config/schema.ts";
import { AgentRunner, type Blueprint, type ParsedRequest } from "./agent_runner.ts";
import { PlanWriter, type RequestMetadata } from "./plan_writer.ts";
import { EventLogger } from "./event_logger.ts";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Configuration for RequestProcessor
 */
export interface RequestProcessorConfig {
  /** Path to Inbox directory (contains Requests/ and Plans/) */
  inboxPath: string;

  /** Path to agent blueprints directory */
  blueprintsPath: string;

  /** Whether to include agent reasoning in plans */
  includeReasoning: boolean;
}

/**
 * Parsed request frontmatter (YAML format)
 */
interface RequestFrontmatter {
  trace_id: string;
  created: string;
  status: string;
  priority: string;
  agent: string;
  source: string;
  created_by: string;
  portal?: string;
}

/**
 * Result of parsing a request file
 */
interface ParsedRequestFile {
  frontmatter: RequestFrontmatter;
  body: string;
  rawContent: string;
}

// ============================================================================
// RequestProcessor Implementation
// ============================================================================

/**
 * RequestProcessor handles the request-to-plan pipeline:
 * 1. Detect request file → Parse frontmatter → Load blueprint
 * 2. Run agent → Generate plan → Write to Inbox/Plans/
 * 3. Update request status → Log activities
 */
export class RequestProcessor {
  private readonly agentRunner: AgentRunner;
  private readonly planWriter: PlanWriter;
  private readonly plansDir: string;
  private readonly logger: EventLogger;

  constructor(
    private readonly config: Config,
    private readonly provider: IModelProvider,
    private readonly db: DatabaseService,
    private readonly processorConfig: RequestProcessorConfig,
  ) {
    // Initialize EventLogger for this service
    this.logger = new EventLogger({
      db,
      defaultActor: "agent:request-processor",
    });

    // Initialize AgentRunner
    this.agentRunner = new AgentRunner(provider, { db });

    // Initialize PlanWriter
    this.plansDir = join(processorConfig.inboxPath, "Plans");
    this.planWriter = new PlanWriter({
      plansDirectory: this.plansDir,
      includeReasoning: processorConfig.includeReasoning,
      generateWikiLinks: true,
      knowledgeRoot: join(config.system.root, config.paths.knowledge),
      systemRoot: join(config.system.root, config.paths.system),
      db,
    });
  }

  /**
   * Process a request file and generate a plan
   * @param filePath - Absolute path to the request file
   * @returns Path to generated plan, or null if processing failed
   */
  async process(filePath: string): Promise<string | null> {
    // Step 1: Parse the request file
    const parsed = await this.parseRequestFile(filePath);
    if (!parsed) {
      return null;
    }

    const { frontmatter, body } = parsed;
    const traceId = frontmatter.trace_id;
    const requestId = basename(filePath, ".md");

    // Create trace-specific logger
    const traceLogger = this.logger.child({ traceId });

    // Log processing start
    traceLogger.info("request.processing", filePath, {
      agent: frontmatter.agent,
      priority: frontmatter.priority,
    });

    try {
      // Step 2: Load the agent blueprint
      const blueprint = await this.loadBlueprint(frontmatter.agent);
      if (!blueprint) {
        traceLogger.error("blueprint.not_found", frontmatter.agent, {
          request: filePath,
        });
        await this.updateRequestStatus(filePath, parsed.rawContent, "failed");
        traceLogger.error("request.failed", filePath, {
          error: `Blueprint not found: ${frontmatter.agent}`,
        });
        return null;
      }

      // Step 3: Build the parsed request for AgentRunner
      const request: ParsedRequest = {
        userPrompt: body.trim(),
        context: {
          priority: frontmatter.priority,
          source: frontmatter.source,
        },
        requestId,
        traceId,
      };

      // Step 4: Run the agent to generate plan content
      const result = await this.agentRunner.run(blueprint, request);

      // Step 5: Write the plan using PlanWriter
      const metadata: RequestMetadata = {
        requestId,
        traceId,
        createdAt: new Date(frontmatter.created),
        contextFiles: [],
        contextWarnings: [],
      };

      const planResult = await this.planWriter.writePlan(result, metadata);

      // Step 6: Update request status to "planned"
      await this.updateRequestStatus(filePath, parsed.rawContent, "planned");

      // Log successful completion
      traceLogger.info("request.planned", filePath, {
        plan_path: planResult.planPath,
      });

      return planResult.planPath;
    } catch (error) {
      // Handle errors gracefully
      traceLogger.error("request.failed", filePath, {
        error: error instanceof Error ? error.message : String(error),
      });

      await this.updateRequestStatus(filePath, parsed.rawContent, "failed");

      return null;
    }
  }

  /**
   * Parse a request file and extract frontmatter and body
   */
  private async parseRequestFile(filePath: string): Promise<ParsedRequestFile | null> {
    // Check file exists
    if (!await exists(filePath)) {
      this.logger.error("file.not_found", filePath, {});
      return null;
    }

    try {
      const content = await Deno.readTextFile(filePath);

      // Extract YAML frontmatter between --- delimiters
      const yamlMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      if (!yamlMatch) {
        this.logger.error("frontmatter.invalid", filePath, {
          error: "Missing or malformed --- delimiters",
        });
        return null;
      }

      const yamlContent = yamlMatch[1];
      const body = yamlMatch[2] || "";

      // Parse YAML
      const frontmatter = parseYaml(yamlContent) as unknown as RequestFrontmatter;

      // Validate required fields
      if (!frontmatter.trace_id) {
        this.logger.error("frontmatter.missing_trace_id", filePath, {});
        return null;
      }

      return {
        frontmatter,
        body,
        rawContent: content,
      };
    } catch (error) {
      this.logger.error("file.parse_failed", filePath, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Load an agent blueprint from the blueprints directory
   */
  private async loadBlueprint(agentId: string): Promise<Blueprint | null> {
    const blueprintPath = join(this.processorConfig.blueprintsPath, `${agentId}.md`);

    if (!await exists(blueprintPath)) {
      return null;
    }

    try {
      const content = await Deno.readTextFile(blueprintPath);
      return {
        systemPrompt: content,
        agentId,
      };
    } catch (error) {
      this.logger.error("blueprint.load_failed", agentId, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Update the status field in a request file's YAML frontmatter
   */
  private async updateRequestStatus(
    filePath: string,
    originalContent: string,
    newStatus: string,
  ): Promise<void> {
    try {
      // Replace the status field in the YAML frontmatter
      const updatedContent = originalContent.replace(
        /^(status:\s*).+$/m,
        `$1${newStatus}`,
      );

      await Deno.writeTextFile(filePath, updatedContent);
    } catch (error) {
      this.logger.error("request.status_update_failed", filePath, {
        new_status: newStatus,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
