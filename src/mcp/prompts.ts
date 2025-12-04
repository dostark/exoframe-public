/**
 * MCP Prompts
 *
 * Provides prompt templates for common ExoFrame operations.
 * Prompts guide LLM agents through structured workflows.
 */

import type { Config } from "../config/schema.ts";
import type { DatabaseService } from "../services/db.ts";

// ============================================================================
// Types
// ============================================================================

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: MCPPromptArgument[];
}

export interface MCPPromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface MCPPromptMessage {
  role: "user" | "assistant";
  content: {
    type: "text";
    text: string;
  };
}

export interface MCPPromptResult {
  description?: string;
  messages: MCPPromptMessage[];
}

// ============================================================================
// Prompt Definitions
// ============================================================================

/**
 * Get all available prompts
 */
export function getPrompts(): MCPPrompt[] {
  return [
    {
      name: "execute_plan",
      description: "Execute an approved ExoFrame plan with guided steps",
      arguments: [
        {
          name: "plan_id",
          description: "UUID of the approved plan to execute",
          required: true,
        },
        {
          name: "portal",
          description: "Target portal name where plan will be executed",
          required: true,
        },
      ],
    },
    {
      name: "create_changeset",
      description: "Create a changeset for code changes with git integration",
      arguments: [
        {
          name: "portal",
          description: "Portal name where changes will be made",
          required: true,
        },
        {
          name: "description",
          description: "Description of the changeset purpose",
          required: true,
        },
        {
          name: "trace_id",
          description: "Request trace ID for tracking",
          required: true,
        },
      ],
    },
  ];
}

/**
 * Get a specific prompt definition
 */
export function getPrompt(name: string): MCPPrompt | null {
  const prompts = getPrompts();
  return prompts.find((p) => p.name === name) || null;
}

/**
 * Generate prompt messages for execute_plan
 */
export function generateExecutePlanPrompt(
  args: { plan_id: string; portal: string },
  db: DatabaseService,
): MCPPromptResult {
  const { plan_id, portal } = args;

  // Log prompt generation
  db.logActivity(
    "mcp.prompts",
    "mcp.prompts.execute_plan",
    plan_id,
    {
      portal,
    },
  );

  const messages: MCPPromptMessage[] = [
    {
      role: "user",
      content: {
        type: "text",
        text: `You are executing an ExoFrame plan in portal "${portal}".

**Plan ID:** ${plan_id}

**Your Task:**
1. Read the plan from the Knowledge system
2. Verify the plan is approved and not already executed
3. Execute each action in the plan sequentially:
   - Use read_file to understand current code
   - Use write_file to make changes
   - Use git_status to verify changes
   - Use git_commit to commit each logical unit
4. Update the plan execution log as you progress
5. Handle errors gracefully and report failures

**Available Tools:**
- read_file(portal, path) - Read files from portal
- write_file(portal, path, content) - Write files to portal
- list_directory(portal, path) - List directory contents
- git_status(portal) - Check git status
- git_create_branch(portal, branch) - Create feature branch
- git_commit(portal, message, files?) - Commit changes

**Guidelines:**
- Always read files before modifying them
- Commit frequently with descriptive messages
- Include trace_id in commit messages: "feat: description [${plan_id}]"
- Verify changes with git_status before committing
- Report progress and any issues encountered

Begin executing the plan.`,
      },
    },
  ];

  return {
    description: `Execute plan ${plan_id} in portal ${portal}`,
    messages,
  };
}

/**
 * Generate prompt messages for create_changeset
 */
export function generateCreateChangesetPrompt(
  args: { portal: string; description: string; trace_id: string },
  db: DatabaseService,
): MCPPromptResult {
  const { portal, description, trace_id } = args;

  // Log prompt generation
  db.logActivity(
    "mcp.prompts",
    "mcp.prompts.create_changeset",
    trace_id,
    {
      portal,
      description,
    },
  );

  const messages: MCPPromptMessage[] = [
    {
      role: "user",
      content: {
        type: "text",
        text: `You are creating a changeset in portal "${portal}".

**Changeset Description:** ${description}

**Trace ID:** ${trace_id}

**Your Task:**
1. Create a feature branch for this changeset:
   - Use git_create_branch(portal, "feat/${trace_id}")
2. Make the necessary code changes:
   - Read existing files to understand context
   - Write modified files with your changes
3. Verify your changes:
   - Use git_status to see what changed
   - Review the diff mentally
4. Commit the changeset:
   - Use git_commit with a descriptive message
   - Include trace_id in message: "feat: ${description} [${trace_id}]"

**Available Tools:**
- read_file(portal, path) - Read files from portal
- write_file(portal, path, content) - Write files to portal  
- list_directory(portal, path) - List directory contents
- git_status(portal) - Check git status
- git_create_branch(portal, branch) - Create feature branch
- git_commit(portal, message, files?) - Commit changes

**Guidelines:**
- Always create a feature branch before making changes
- Read files first to understand existing code
- Make focused, atomic changes
- Write clear commit messages explaining the change
- Include the trace_id in all commit messages
- Test your changes mentally before committing

Begin creating the changeset.`,
      },
    },
  ];

  return {
    description: `Create changeset: ${description}`,
    messages,
  };
}

/**
 * Generate prompt messages based on prompt name and arguments
 */
export function generatePrompt(
  name: string,
  args: Record<string, unknown>,
  _config: Config,
  db: DatabaseService,
): MCPPromptResult | null {
  switch (name) {
    case "execute_plan":
      return generateExecutePlanPrompt(
        args as { plan_id: string; portal: string },
        db,
      );
    case "create_changeset":
      return generateCreateChangesetPrompt(
        args as { portal: string; description: string; trace_id: string },
        db,
      );
    default:
      return null;
  }
}
