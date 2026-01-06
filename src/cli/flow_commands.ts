/**
 * Flow CLI Commands for ExoFrame
 *
 * Provides commands for flow management and execution:
 * - list: Show all available flows
 * - show: Display flow details and dependency graph
 * - run: Execute a flow for a request
 * - plan: Show execution plan without running
 * - history: Show past flow executions
 * - validate: Validate flow definitions
 */

import { Table } from "@cliffy/table";
import { FlowLoader } from "../flows/flow_loader.ts";
import { FlowValidatorImpl } from "../services/flow_validator.ts";
import { EventLogger } from "../services/event_logger.ts";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "../services/db.ts";
import type { IModelProvider } from "../ai/providers.ts";
import { join } from "@std/path";

interface CLIContext {
  config: Config;
  db: DatabaseService;
  provider: IModelProvider;
}

export class FlowCommands {
  private flowLoader: FlowLoader;
  private flowValidator: FlowValidatorImpl;
  private eventLogger: EventLogger;

  constructor(private context: CLIContext) {
    this.flowLoader = new FlowLoader(join(context.config.system.root, context.config.paths.blueprints, "Flows"));
    this.flowValidator = new FlowValidatorImpl(
      this.flowLoader,
      join(context.config.system.root, context.config.paths.blueprints, "Flows"),
    );
    this.eventLogger = new EventLogger({
      db: context.db,
      defaultActor: "cli",
    });
  }

  async listFlows(options: any = {}) {
    try {
      const flows = await this.flowLoader.loadAllFlows();

      if (options.json) {
        console.log(JSON.stringify(
          flows.map((flow) => ({
            id: flow.id,
            name: flow.name,
            description: flow.description,
            version: flow.version,
            steps: flow.steps.length,
          })),
          null,
          2,
        ));
        return;
      }

      if (flows.length === 0) {
        console.log("No flows found");
        return;
      }

      const table = new Table()
        .header(["ID", "Name", "Version", "Steps", "Description"])
        .border(true);

      for (const flow of flows) {
        table.push([
          flow.id,
          flow.name,
          flow.version,
          flow.steps.length.toString(),
          flow.description,
        ]);
      }

      table.render();
    } catch (error) {
      console.error("Error listing flows:", error instanceof Error ? error.message : String(error));
      Deno.exit(1);
    }
  }

  async showFlow(flowId: string, options: any = {}) {
    try {
      const flow = await this.flowLoader.loadFlow(flowId);

      if (options.json) {
        console.log(JSON.stringify(flow, null, 2));
        return;
      }

      console.log(`Flow: ${flow.name} (${flow.id})`);
      console.log(`Version: ${flow.version}`);
      console.log(`Description: ${flow.description}`);
      console.log();

      // Display dependency graph
      console.log("Dependency Graph:");
      const graph = this.renderDependencyGraph(flow);
      console.log(graph);
      console.log();

      // Display steps table
      const stepsTable = new Table()
        .header(["ID", "Agent", "Dependencies", "Description"])
        .border(true);

      for (const step of flow.steps) {
        stepsTable.push([
          step.id,
          step.agent,
          step.dependsOn.length > 0 ? step.dependsOn.join(", ") : "None",
          step.name,
        ]);
      }

      stepsTable.render();

      // Display flow settings
      console.log();
      console.log("Settings:");
      console.log(`  Max Parallelism: ${flow.settings?.maxParallelism || "unlimited"}`);
      console.log(`  Fail Fast: ${flow.settings?.failFast !== false}`);
      console.log(`  Output Format: ${flow.output?.format || "markdown"}`);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.error(`Flow '${flowId}' not found`);
      } else {
        console.error("Error showing flow:", error instanceof Error ? error.message : String(error));
      }
      Deno.exit(1);
    }
  }

  async validateFlow(flowId: string, options: any = {}) {
    try {
      const validation = await this.flowValidator.validateFlow(flowId);

      if (options.json) {
        console.log(JSON.stringify(validation, null, 2));
        return;
      }

      if (validation.valid) {
        console.log(`✅ Flow '${flowId}' is valid`);
      } else {
        console.log(`❌ Flow '${flowId}' validation failed:`);
        console.log(validation.error);
        Deno.exit(1);
      }
    } catch (error) {
      console.error("Error validating flow:", error instanceof Error ? error.message : String(error));
      Deno.exit(1);
    }
  }

  private renderDependencyGraph(flow: any): string {
    // Simple text-based dependency graph
    const lines: string[] = [];
    for (const step of flow.steps) {
      lines.push(`${step.id} (${step.agent})`);
      if (step.dependsOn.length > 0) {
        lines.push(`  ← ${step.dependsOn.join(", ")}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }
}
