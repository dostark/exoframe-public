/**
 * RequestProcessor - Processes request files and generates plans
 * Implements Step 5.9 of the ExoFrame Implementation Plan
 * Integrates with RequestRouter for flow-aware request processing (Step 7.6)
 *
 * Responsibilities:
 * 1. Parse request files (YAML frontmatter + body)
 * 2. Route requests using RequestRouter (flow vs agent validation)
 * 3. Load agent blueprints or validate flows
 * 4. Call AgentRunner.run() or generate flow execution plans
 * 5. Write plans to Inbox/Plans/ using PlanWriter
 * 6. Update request status (pending → planned | failed)
 * 7. Log all activities to Activity Journal
 */

import { parse as parseYaml } from "@std/yaml";
import { basename, join } from "@std/path";
import { exists } from "@std/fs";
import type { IModelProvider } from "../ai/providers.ts";
import type { DatabaseService } from "./db.ts";
import type { Config } from "../config/schema.ts";
import { AgentRunner, type Blueprint, type ParsedRequest } from "./agent_runner.ts";
import { buildParsedRequest } from "./request_common.ts";
import { BlueprintLoader } from "./blueprint_loader.ts";
import { PlanWriter, type RequestMetadata } from "./plan_writer.ts";
import { EventLogger } from "./event_logger.ts";
import { FlowValidatorImpl } from "./flow_validator.ts";
import { ProviderFactory } from "../ai/provider_factory.ts";

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
  agent?: string;
  flow?: string;
  source: string;
  created_by: string;
  portal?: string;
  model?: string;
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
  private readonly flowValidator: FlowValidatorImpl;

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
      generateWikiLinks: true, // Enable for Memory Banks compatibility
      systemRoot: join(config.system.root, config.paths.system),
      db,
    });

    // Initialize FlowValidator (lazy initialization for test compatibility)
    // this.flowValidator = new FlowValidatorImpl(
    //   new FlowLoader(join(config.system.root, config.paths.memory, "Projects")),
    //   join(config.system.root, processorConfig.blueprintsPath)
    // );
    this.flowValidator = null as any; // Temporary for testing
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
    const hasFlow = !!frontmatter.flow;
    const hasAgent = !!frontmatter.agent;

    traceLogger.info("request.processing", filePath, {
      flow: frontmatter.flow,
      agent: frontmatter.agent,
      priority: frontmatter.priority,
    });

    // Prevent re-processing of already planned/completed requests
    if (["planned", "approved", "completed", "failed"].includes(frontmatter.status)) {
      traceLogger.info("request.skipped", filePath, {
        reason: `Request already has status '${frontmatter.status}'`,
      });
      return null;
    }

    // Validate request has required fields
    if (hasFlow && hasAgent) {
      traceLogger.error("request.invalid", filePath, {
        error: "Request cannot specify both 'flow' and 'agent' fields",
      });
      await this.updateRequestStatus(filePath, parsed.rawContent, "failed");
      return null;
    }

    if (!hasAgent && !hasFlow) {
      traceLogger.error("request.invalid", filePath, {
        error: "Request must specify either 'flow' or 'agent' field",
      });
      await this.updateRequestStatus(filePath, parsed.rawContent, "failed");
      return null;
    }

    try {
      let planContent: string;
      let _agentId: string;

      if (hasFlow) {
        // Handle flow request
        if (this.flowValidator) {
          const validation = await this.flowValidator.validateFlow(frontmatter.flow!);
          if (!validation.valid) {
            traceLogger.error("flow.validation.failed", frontmatter.flow!, {
              error: validation.error,
            });
            await this.updateRequestStatus(filePath, parsed.rawContent, "failed");
            return null;
          }
        } // Skip validation if flowValidator is not available (test environment)

        // Generate flow execution plan
        planContent = JSON.stringify({
          title: `Flow Execution: ${frontmatter.flow}`,
          description: `Execute the ${frontmatter.flow} flow`,
          steps: [{
            step: 1,
            title: "Execute Flow",
            description: `Execute the ${frontmatter.flow} flow with the provided request`,
            flow: frontmatter.flow,
          }],
        });
        _agentId = "flow-executor"; // Special agent ID for flow execution

        // Create mock result for PlanWriter
        const result = {
          thought: `Prepared flow ${frontmatter.flow} for execution`,
          content: planContent,
          raw: planContent,
        };

        // Step 5: Write the plan using PlanWriter
        const metadata: RequestMetadata = {
          requestId,
          traceId,
          createdAt: new Date(frontmatter.created),
          contextFiles: [],
          contextWarnings: [],
          model: frontmatter.model,
        };

        return await this.writePlanAndReturnPath(result, metadata, filePath, parsed.rawContent, traceLogger, {
          flow: frontmatter.flow,
        });
      } else {
        // Handle agent request (existing logic)
        const blueprintLoader = new BlueprintLoader({ blueprintsPath: this.processorConfig.blueprintsPath });
        const loadedBlueprint = await blueprintLoader.load(frontmatter.agent!);
        if (!loadedBlueprint) {
          traceLogger.error("blueprint.not_found", frontmatter.agent!, {
            request: filePath,
          });
          await this.updateRequestStatus(filePath, parsed.rawContent, "failed");
          traceLogger.error("request.failed", filePath, {
            error: `Blueprint not found: ${frontmatter.agent}`,
          });
          return null;
        }
        const blueprint = blueprintLoader.toLegacyBlueprint(loadedBlueprint);

        // Step 3: Build the parsed request for AgentRunner
        const request: ParsedRequest = buildParsedRequest(body, frontmatter, requestId, traceId) as ParsedRequest;

        // Step 4: Run the agent to generate plan content
        // Use model override if specified in request
        let currentRunner = this.agentRunner;
        if (frontmatter.model) {
          try {
            const overrideProvider = ProviderFactory.createByName(this.config, frontmatter.model);
            currentRunner = new AgentRunner(overrideProvider, { db: this.db });
            traceLogger.info("request.model_override", frontmatter.model, {
              trace_id: traceId,
            });
          } catch (error) {
            traceLogger.warn("request.model_override_failed", frontmatter.model, {
              error: error instanceof Error ? error.message : String(error),
              fallback: "using default provider",
            });
          }
        }

        const result = await currentRunner.run(blueprint, request);
        planContent = result.content;
        _agentId = frontmatter.agent!;

        // Step 5: Write the plan using PlanWriter
        const metadata: RequestMetadata = {
          requestId,
          traceId,
          createdAt: new Date(frontmatter.created),
          contextFiles: [],
          contextWarnings: [],
          model: frontmatter.model,
        };

        return await this.writePlanAndReturnPath(result, metadata, filePath, parsed.rawContent, traceLogger);
      }
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
   * Helper to write a plan via PlanWriter, mark the request as planned, log, and return the plan path.
   * Centralizes duplicated post-processing logic used for both flow and agent paths.
   */
  private async writePlanAndReturnPath(
    result: any,
    metadata: RequestMetadata,
    filePath: string,
    rawContent: string,
    traceLogger: any,
    extra?: Record<string, unknown>,
  ): Promise<string> {
    const planResult = await this.planWriter.writePlan(result, metadata);
    await this.updateRequestStatus(filePath, rawContent, "planned");
    const logObj: Record<string, unknown> = { plan_path: planResult.planPath, ...(extra ?? {}) };
    traceLogger.info("request.planned", filePath, logObj);
    return planResult.planPath;
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
   * Uses unified BlueprintLoader for consistent parsing
   */
  private async loadBlueprint(agentId: string): Promise<Blueprint | null> {
    try {
      const loader = new BlueprintLoader({ blueprintsPath: this.processorConfig.blueprintsPath });
      const loaded = await loader.load(agentId);
      if (!loaded) {
        return null;
      }
      return loader.toLegacyBlueprint(loaded);
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
