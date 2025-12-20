import { FlowLoader } from "../flows/flow_loader.ts";
import { DependencyResolver } from "../flows/dependency_resolver.ts";
import type { FlowValidator } from "./request_router.ts";

/**
 * FlowValidatorImpl - Validates flow definitions before execution
 * Implements comprehensive validation for flow-aware request routing
 */
export class FlowValidatorImpl implements FlowValidator {
  constructor(
    private flowLoader: FlowLoader,
    private blueprintsPath: string,
  ) {}

  /**
   * Validate a flow by ID
   */
  async validateFlow(flowId: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // Check if flow exists
      const exists = await this.flowLoader.flowExists(flowId);
      if (!exists) {
        return { valid: false, error: `Flow '${flowId}' not found` };
      }

      // Load and validate flow structure
      const flow = await this.flowLoader.loadFlow(flowId);

      // Validate basic flow structure
      if (!flow.steps || flow.steps.length === 0) {
        return { valid: false, error: `Flow '${flowId}' must contain at least one step` };
      }

      // Validate step dependencies
      const resolver = new DependencyResolver(flow.steps);
      try {
        resolver.topologicalSort(); // This will throw if there are cycles
      } catch (error) {
        return {
          valid: false,
          error: `Flow '${flowId}' has invalid dependencies: ${error instanceof Error ? error.message : String(error)}`,
        };
      }

      // Validate agents exist (basic check - could be enhanced)
      for (const step of flow.steps) {
        if (!step.agent || typeof step.agent !== "string") {
          return {
            valid: false,
            error: `Flow '${flowId}' step '${step.id}' has invalid agent: ${step.agent}`,
          };
        }
        // Note: Full agent validation would require loading agent blueprints
        // For now, we just check the agent field is present
      }

      // Validate output configuration if present
      if (flow.output) {
        if (!flow.output.from || !flow.output.format) {
          return {
            valid: false,
            error: `Flow '${flowId}' has invalid output configuration`,
          };
        }

        // Check that output.from references a valid step
        const outputStepExists = flow.steps.some((step) => step.id === flow.output!.from);
        if (!outputStepExists) {
          return {
            valid: false,
            error: `Flow '${flowId}' output.from references non-existent step: ${flow.output.from}`,
          };
        }
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Flow '${flowId}' validation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
