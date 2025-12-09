/**
 * Plan Executor Service
 *
 * Orchestrates the execution of high-level plan steps by:
 * 1. Iterating through plan steps
 * 2. Prompting the LLM to generate executable actions (TOML) for each step
 * 3. Executing those actions via ToolRegistry
 * 4. Committing changes to git
 */

import { parse as parseToml } from "@std/toml";
import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "./db.ts";
import type { IModelProvider } from "../ai/providers.ts";
import { ToolRegistry } from "./tool_registry.ts";
import { GitService } from "./git_service.ts";
import { EventLogger } from "./event_logger.ts";

export interface PlanStep {
  number: number;
  title: string;
  content: string;
}

export interface PlanContext {
  trace_id: string;
  request_id: string;
  agent: string;
  frontmatter: Record<string, unknown>;
  steps: PlanStep[];
}

interface PlanAction {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
}

export class PlanExecutor {
  private logger: EventLogger;

  constructor(
    private config: Config,
    private llmProvider: IModelProvider,
    private db: DatabaseService,
  ) {
    this.logger = new EventLogger({
      db,
      defaultActor: "system",
    });
  }

  /**
   * Execute a plan
   */
  async execute(planPath: string, context: PlanContext): Promise<string | null> {
    const traceId = context.trace_id;
    const requestId = context.request_id;
    const agentId = context.agent;

    this.logger.info("plan.execution_started", planPath, {
      trace_id: traceId,
      request_id: requestId,
      step_count: context.steps.length,
    });

    try {
      // Initialize Git
      const git = new GitService({
        config: this.config,
        db: this.db,
        traceId,
        agentId,
      });

      await git.ensureRepository();
      await git.ensureIdentity();

      // Ensure feature branch exists
      const _branchName = await git.createBranch({
        requestId,
        traceId,
      });

      // Initialize ToolRegistry
      const toolRegistry = new ToolRegistry({
        config: this.config,
        db: this.db,
        traceId,
        agentId,
      });

      // Execute each step
      let lastCommitSha: string | null = null;
      for (const step of context.steps) {
        const stepSha = await this.executeStep(step, context, toolRegistry, git);
        if (stepSha) {
          lastCommitSha = stepSha;
        }
      }

      // Final commit if any changes pending
      try {
        const sha = await git.commit({
          message: `Complete plan: ${requestId}`,
          description: `Executed by agent ${agentId}`,
          traceId,
        });

        this.logger.info("plan.execution_completed", planPath, {
          trace_id: traceId,
          commit_sha: sha,
        });

        return sha;
      } catch (error) {
        if (error instanceof Error && error.message.includes("nothing to commit")) {
          this.logger.info("plan.execution_completed", planPath, {
            trace_id: traceId,
            status: "completed",
            last_commit: lastCommitSha,
          });
          return lastCommitSha;
        }
        throw error;
      }
    } catch (error) {
      this.logger.error("plan.execution_failed", planPath, {
        error: error instanceof Error ? error.message : String(error),
        trace_id: traceId,
      });
      throw error;
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: PlanStep,
    context: PlanContext,
    toolRegistry: ToolRegistry,
    git: GitService,
  ): Promise<string | null> {
    this.logger.info("step.started", `Step ${step.number}`, {
      title: step.title,
      trace_id: context.trace_id,
    });

    // Construct prompt for the agent
    const prompt = this.constructStepPrompt(step, context);

    // Ask LLM for actions
    const response = await this.llmProvider.generate(prompt, {
      temperature: 0.2, // Low temperature for deterministic tool usage
      max_tokens: 2000,
    });

    // Parse actions
    const actions = this.parseActions(response);

    if (actions.length === 0) {
      this.logger.warn("step.no_actions", `Step ${step.number}`, {
        trace_id: context.trace_id,
        response_preview: response.slice(0, 100),
      });
      return null;
    }

    // Execute actions
    for (const action of actions) {
      try {
        this.logger.debug("action.executing", action.tool, {
          params: action.params,
          trace_id: context.trace_id,
        });

        const result = await toolRegistry.execute(action.tool, action.params);

        if (!result.success) {
          throw new Error(result.error || "Tool execution failed");
        }

        this.logger.debug("action.completed", action.tool, {
          result_preview: JSON.stringify(result).slice(0, 100),
          trace_id: context.trace_id,
        });
      } catch (error) {
        this.logger.error("action.failed", action.tool, {
          error: error instanceof Error ? error.message : String(error),
          trace_id: context.trace_id,
        });
        throw error; // Fail the step if an action fails
      }
    }

    // Commit after each step
    try {
      const sha = await git.commit({
        message: `Step ${step.number}: ${step.title}`,
        description: step.content,
        traceId: context.trace_id,
      });

      this.logger.info("step.completed", `Step ${step.number}`, {
        trace_id: context.trace_id,
      });

      return sha;
    } catch {
      // Ignore "nothing to commit" between steps
      this.logger.info("step.completed_no_changes", `Step ${step.number}`, {
        trace_id: context.trace_id,
      });
      return null;
    }
  }

  /**
   * Construct prompt for step execution
   */
  private constructStepPrompt(step: PlanStep, context: PlanContext): string {
    return `You are an autonomous coding agent executing a plan.

CONTEXT:
Request ID: ${context.request_id}
Trace ID: ${context.trace_id}
Current Branch: feat/${context.request_id}

PLAN OVERVIEW:
${context.steps.map((s) => `${s.number}. ${s.title}`).join("\n")}

CURRENT TASK:
Step ${step.number}: ${step.title}
${step.content}

INSTRUCTIONS:
1. Analyze the current task.
2. Determine which tools to use. Available tools:
   - read_file(path)
   - write_file(path, content)
   - run_command(command, args)
   - list_directory(path)
   - search_files(query, path)
3. Output the tool calls in TOML format within \`\`\`toml\`\`\` blocks.

EXAMPLE OUTPUT:
\`\`\`toml
[[actions]]
tool = "write_file"
[actions.params]
path = "src/hello.ts"
content = "console.log('Hello');"

[[actions]]
tool = "run_command"
[actions.params]
command = "deno"
args = ["check", "src/hello.ts"]
\`\`\`

Generate the TOML actions now.`;
  }

  /**
   * Parse TOML actions from response
   */
  private parseActions(response: string): PlanAction[] {
    const actions: PlanAction[] = [];
    const codeBlockRegex = /```toml\n([\s\S]*?)\n```/g;
    let match;

    while ((match = codeBlockRegex.exec(response)) !== null) {
      try {
        const block = match[1];
        const parsed = parseToml(block) as any;

        if (parsed.actions && Array.isArray(parsed.actions)) {
          for (const action of parsed.actions) {
            if (action.tool && action.params) {
              actions.push({
                tool: action.tool,
                params: action.params,
                description: action.description,
              });
            }
          }
        } else if (parsed.tool && parsed.params) {
          // Single action format
          actions.push({
            tool: parsed.tool,
            params: parsed.params,
            description: parsed.description,
          });
        }
      } catch (e) {
        console.error("Failed to parse TOML block:", e);
      }
    }

    return actions;
  }
}
