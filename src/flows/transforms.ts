/**
 * Built-in transform functions for flow inter-step communication
 *
 * Transforms allow steps to receive inputs from multiple sources and apply
 * transformations to combine, filter, or restructure data before execution.
 */

/**
 * Passthrough transform - returns input unchanged
 */
export function passthrough(input: string): string {
  return input;
}

/**
 * Merge multiple outputs as markdown sections
 * Creates a combined document with each input as a separate section
 */
export function mergeAsContext(inputs: string[]): string {
  if (inputs.length === 0) {
    return "";
  }

  return inputs
    .map((input, index) => `## Step ${index + 1}\n${input}`)
    .join("\n\n");
}

/**
 * Extract a specific markdown section from input
 * Finds content between ## SectionName and next ## or end of document
 */
export function extractSection(input: string, sectionName: string): string {
  const lines = input.split("\n");
  let inSection = false;
  const sectionContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ") && line.includes(sectionName)) {
      inSection = true;
      continue;
    }

    if (inSection && line.startsWith("## ")) {
      // Found next section, stop
      break;
    }

    if (inSection) {
      sectionContent.push(line);
    }
  }

  if (!inSection) {
    throw new Error(`Section '${sectionName}' not found`);
  }

  // Remove leading/trailing empty lines
  while (sectionContent.length > 0 && sectionContent[0].trim() === "") {
    sectionContent.shift();
  }
  while (sectionContent.length > 0 && sectionContent[sectionContent.length - 1].trim() === "") {
    sectionContent.pop();
  }

  return sectionContent.join("\n");
}

/**
 * Append original request to step output
 * Useful for maintaining context across steps
 */
export function appendToRequest(request: string, stepOutput: string): string {
  const requestPart = request ? `Original: ${request}` : "Original:";
  const outputPart = stepOutput ? `Step Output: ${stepOutput}` : "Step Output:";
  return `${requestPart}\n\n${outputPart}`;
}

/**
 * Extract field from JSON string using dot notation
 * Supports nested objects and arrays (e.g., "user.profile.age", "items.0.name")
 */
export function jsonExtract(input: string, fieldPath: string): any {
  let data: any;
  try {
    data = JSON.parse(input);
  } catch (error) {
    throw new Error(`Invalid JSON input: ${(error as Error).message}`);
  }

  const path = fieldPath.split(".");
  let current = data;

  for (const segment of path) {
    if (current === null || current === undefined) {
      throw new Error(`Field '${fieldPath}' not found`);
    }

    // Handle array indices
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      const index = parseInt(segment, 10);
      if (index >= current.length) {
        throw new Error(`Field '${fieldPath}' not found`);
      }
      current = current[index];
    } else if (typeof current === "object" && segment in current) {
      current = current[segment];
    } else {
      throw new Error(`Field '${fieldPath}' not found`);
    }
  }

  return current;
}

/**
 * Fill template with context variables
 * Replaces {{variable}} placeholders with values from context object
 */
export function templateFill(template: string, context: Record<string, any>): string {
  let result = template;

  // Find all {{variable}} patterns
  const variablePattern = /\{\{(\w+)\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = variablePattern.exec(template)) !== null) {
    const variable = match[1];
    if (!variables.includes(variable)) {
      variables.push(variable);
    }
  }

  // Replace each variable
  for (const variable of variables) {
    if (!(variable in context)) {
      throw new Error(`Missing context variable: ${variable}`);
    }
    const placeholder = `{{${variable}}}`;
    const value = String(context[variable]);
    result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), value);
  }

  return result;
}
