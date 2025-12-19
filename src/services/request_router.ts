import { FlowRunner } from "../flows/flow_runner.ts";
import { AgentRunner, type Blueprint, type ParsedRequest } from "./agent_runner.ts";
import { EventLogger } from "./event_logger.ts";
import { join } from "jsr:@std/path";
import { exists } from "jsr:@std/fs";

/**
 * RequestRouter - Routes requests to appropriate execution engine
 * Implements Step 7.6 of the ExoFrame Implementation Plan
 *
 * Routing Priority:
 * 1. flow: <id> → FlowRunner (multi-agent)
 * 2. agent: <id> → AgentRunner (single-agent)
 * 3. Neither → Default agent
 */

export interface RoutingDecision {
  type: "flow" | "agent";
  flowId?: string;
  agentId?: string;
  result: any;
}

export class RoutingError extends Error {
  constructor(message: string, public readonly requestId?: string) {
    super(message);
    this.name = "RoutingError";
  }
}

export interface FlowValidator {
  validateFlow(flowId: string): Promise<{valid: boolean, error?: string}>;
}

/**
 * RequestRouter handles routing decisions for incoming requests
 */
export class RequestRouter {
  constructor(
    private flowRunner: FlowRunner,
    private agentRunner: AgentRunner,
    private flowValidator: FlowValidator,
    private eventLogger: EventLogger,
    private defaultAgentId: string,
    private blueprintsPath: string
  ) {}

  /**
   * Route a request to the appropriate execution engine
   */
  async route(request: {
    traceId: string;
    requestId: string;
    frontmatter: Record<string, any>;
    body: string;
  }): Promise<RoutingDecision> {
    const { traceId, requestId, frontmatter } = request;
    const flowId = frontmatter.flow;
    const agentId = frontmatter.agent;

    // Check for conflicting fields
    if (flowId && agentId) {
      this.eventLogger.log({
        action: "request.routing.error",
        target: requestId,
        payload: {
          error: "Request cannot specify both 'flow' and 'agent' fields",
          field: "conflict",
          value: `${flowId}/${agentId}`,
        },
        traceId,
      });
      throw new RoutingError(
        "Request cannot specify both 'flow' and 'agent' fields",
        requestId
      );
    }

    // Route to flow if specified
    if (flowId) {
      return await this.routeToFlow(flowId, request);
    }

    // Route to agent if specified
    if (agentId) {
      return await this.routeToAgent(agentId, request);
    }

    // Route to default agent
    return await this.routeToDefaultAgent(request);
  }

  private async routeToFlow(flowId: string, request: any): Promise<RoutingDecision> {
    const { traceId, requestId } = request;

    // Log routing decision
    this.eventLogger.log({
      action: "request.routing.flow",
      target: requestId,
      payload: { flowId },
      traceId,
    });

    // Validate flow
    const validation = await this.flowValidator.validateFlow(flowId);
    if (!validation.valid) {
      this.eventLogger.log({
        action: "request.flow.validation.failed",
        target: flowId,
        payload: { error: validation.error },
        traceId,
      });
      throw new RoutingError(validation.error!, requestId);
    }

    // Log successful validation
    this.eventLogger.log({
      action: "request.flow.validated",
      target: flowId,
      payload: {},
      traceId,
    });

    // Execute flow
    const result = await this.flowRunner.execute(
      { id: flowId } as any, // Flow object will be loaded by FlowRunner
      {
        userPrompt: request.body,
        traceId,
        requestId,
      }
    );

    return {
      type: "flow",
      flowId,
      result,
    };
  }

  private async routeToAgent(agentId: string, request: any): Promise<RoutingDecision> {
    const { traceId, requestId, body } = request;

    // Log routing decision
    this.eventLogger.log({
      action: "request.routing.agent",
      target: requestId,
      payload: { agentId },
      traceId,
    });

    // Load blueprint
    const blueprint = await this.loadBlueprint(agentId);
    if (!blueprint) {
      throw new RoutingError(`Agent blueprint not found: ${agentId}`, requestId);
    }

    // Create parsed request
    const parsedRequest: ParsedRequest = {
      userPrompt: body,
      context: {},
      traceId,
      requestId,
    };

    // Execute agent
    const result = await this.agentRunner.run(blueprint, parsedRequest);

    return {
      type: "agent",
      agentId,
      result,
    };
  }

  private async routeToDefaultAgent(request: any): Promise<RoutingDecision> {
    const { traceId, requestId } = request;

    // Log routing decision
    this.eventLogger.log({
      action: "request.routing.default",
      target: requestId,
      payload: { defaultAgentId: this.defaultAgentId },
      traceId,
    });

    // Load default blueprint
    const blueprint = await this.loadBlueprint(this.defaultAgentId);
    if (!blueprint) {
      throw new RoutingError(`Default agent blueprint not found: ${this.defaultAgentId}`, requestId);
    }

    // Create parsed request
    const parsedRequest: ParsedRequest = {
      userPrompt: request.body,
      context: {},
      traceId,
      requestId,
    };

    // Execute default agent
    const result = await this.agentRunner.run(blueprint, parsedRequest);

    return {
      type: "agent",
      agentId: this.defaultAgentId,
      result,
    };
  }

  /**
   * Load an agent blueprint from the blueprints directory
   */
  protected async loadBlueprint(agentId: string): Promise<Blueprint | null> {
    const blueprintPath = join(this.blueprintsPath, `${agentId}.md`);

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
      // Log error but don't throw - let caller handle null return
      console.error(`Failed to load blueprint ${agentId}:`, error);
      return null;
    }
  }
}
