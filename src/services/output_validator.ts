/**
 * Structured Output Validator
 *
 * Phase 16.2 implementation: Reliable structured output with schema validation and repair.
 *
 * Features:
 * - Multiple output schemas (Plan, Evaluation, Analysis, etc.)
 * - XML tag extraction (<thought>, <content>)
 * - JSON parsing with common error repair
 * - LLM-based repair for complex failures
 * - Validation metrics tracking
 */

import { z, ZodError, ZodType, ZodTypeDef } from "zod";
import { Plan, PlanSchema, PlanStepSchema } from "../schemas/plan_schema.ts";

// ============================================================================
// Output Type Registry
// ============================================================================

/**
 * Supported output format types
 */
export type OutputFormat =
  | "xml_tagged"
  | "json"
  | "json_in_content"
  | "plain"
  | "markdown";

/**
 * Registry of output schemas for different agent types
 */
export const OutputSchemas = {
  plan: PlanSchema,
  planStep: PlanStepSchema,

  /**
   * Evaluation result schema (for quality-judge and similar agents)
   */
  evaluation: z.object({
    score: z.number().min(0).max(10),
    verdict: z.enum(["pass", "fail", "needs_improvement"]),
    reasoning: z.string().min(1),
    suggestions: z.array(z.string()).optional(),
    criteria: z.record(z.object({
      score: z.number().min(0).max(10),
      feedback: z.string(),
    })).optional(),
  }),

  /**
   * Analysis result schema (for code analysis, review agents)
   */
  analysis: z.object({
    summary: z.string().min(1),
    findings: z.array(z.object({
      type: z.enum(["issue", "suggestion", "note", "warning", "error"]),
      severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      message: z.string(),
      location: z.string().optional(),
      fix: z.string().optional(),
    })),
    metrics: z.record(z.union([z.string(), z.number()])).optional(),
  }),

  /**
   * Simple response schema (basic structured output)
   */
  simpleResponse: z.object({
    answer: z.string().min(1),
    confidence: z.number().min(0).max(1).optional(),
    sources: z.array(z.string()).optional(),
  }),

  /**
   * Tool call schema (for agents that invoke tools)
   */
  toolCall: z.object({
    tool: z.string().min(1),
    arguments: z.record(z.unknown()),
    reasoning: z.string().optional(),
  }),

  /**
   * Multi-step action schema (for complex workflows)
   */
  actionSequence: z.object({
    actions: z.array(z.object({
      type: z.string(),
      target: z.string().optional(),
      params: z.record(z.unknown()).optional(),
      condition: z.string().optional(),
    })).min(1),
    fallback: z.string().optional(),
  }),
} as const;

export type OutputSchemaName = keyof typeof OutputSchemas;

// ============================================================================
// Parsed Output Types
// ============================================================================

/**
 * Result of parsing XML-tagged output
 */
export interface ParsedXMLOutput {
  thought: string;
  content: string;
  raw: string;
}

/**
 * Result of structured output validation
 */
export interface ValidationResult<T> {
  success: boolean;
  value?: T;
  errors?: ValidationError[];
  repairAttempted: boolean;
  repairSucceeded: boolean;
  raw: string;
  parsed?: ParsedXMLOutput;
}

/**
 * Detailed validation error
 */
export interface ValidationError {
  path: string[];
  message: string;
  code: string;
  expected?: string;
  received?: string;
}

/**
 * Validation metrics for tracking
 */
export interface ValidationMetrics {
  totalAttempts: number;
  successfulValidations: number;
  repairAttempts: number;
  successfulRepairs: number;
  failuresByErrorType: Record<string, number>;
}

// ============================================================================
// JSON Repair Utilities
// ============================================================================

/**
 * Common JSON errors and their repair functions
 */
const JSON_REPAIR_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  repair: (input: string) => string;
}> = [
  {
    // Remove markdown code blocks
    name: "markdown_code_block",
    pattern: /^```(?:json)?\s*([\s\S]*?)\s*```$/,
    repair: (input) => input.replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1"),
  },
  {
    // Remove trailing commas in objects
    name: "trailing_comma_object",
    pattern: /,(\s*})/g,
    repair: (input) => input.replace(/,(\s*})/g, "$1"),
  },
  {
    // Remove trailing commas in arrays
    name: "trailing_comma_array",
    pattern: /,(\s*])/g,
    repair: (input) => input.replace(/,(\s*])/g, "$1"),
  },
  {
    // Fix single quotes to double quotes
    name: "single_quotes",
    pattern: /'([^']*)'(?=\s*:)/g,
    repair: (input) => input.replace(/'([^']*)'(?=\s*:)/g, '"$1"'),
  },
  {
    // Fix unquoted keys
    name: "unquoted_keys",
    pattern: /(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    repair: (input) => input.replace(/(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":'),
  },
  {
    // Remove comments (// style)
    name: "line_comments",
    pattern: /\/\/[^\n]*/g,
    repair: (input) => input.replace(/\/\/[^\n]*/g, ""),
  },
  {
    // Remove comments (/* */ style)
    name: "block_comments",
    pattern: /\/\*[\s\S]*?\*\//g,
    repair: (input) => input.replace(/\/\*[\s\S]*?\*\//g, ""),
  },
  {
    // Fix escaped quotes in strings
    name: "escaped_quotes",
    pattern: /\\'/g,
    repair: (input) => input.replace(/\\'/g, "'"),
  },
  {
    // Remove newlines inside strings (common LLM error)
    name: "newlines_in_strings",
    pattern: /"[^"]*\n[^"]*"/g,
    repair: (input) => {
      // This is complex - only apply if simple case
      return input.replace(/"([^"]*)\n([^"]*)"/g, (_, p1, p2) => {
        return `"${p1}\\n${p2}"`;
      });
    },
  },
  {
    // Extract JSON object from surrounding text
    name: "extract_json_object",
    pattern: /\{[\s\S]*\}/,
    repair: (input) => {
      const match = input.match(/\{[\s\S]*\}/);
      return match ? match[0] : input;
    },
  },
];

/**
 * Attempt to repair common JSON errors
 */
function repairJSON(input: string): { repaired: string; appliedRepairs: string[] } {
  let repaired = input.trim();
  const appliedRepairs: string[] = [];

  for (const { name, pattern, repair } of JSON_REPAIR_PATTERNS) {
    if (pattern.test(repaired)) {
      const before = repaired;
      repaired = repair(repaired);
      if (before !== repaired) {
        appliedRepairs.push(name);
      }
    }
  }

  return { repaired, appliedRepairs };
}

// ============================================================================
// Output Validator Class
// ============================================================================

/**
 * Configuration for OutputValidator
 */
export interface OutputValidatorConfig {
  /** Enable automatic JSON repair attempts */
  autoRepair?: boolean;

  /** Maximum repair attempts before giving up */
  maxRepairAttempts?: number;

  /** Function to call LLM for repair (optional) */
  llmRepairFn?: (content: string, schema: string, error: string) => Promise<string>;
}

/**
 * OutputValidator provides structured output parsing and validation
 */
export class OutputValidator {
  private config: Required<Omit<OutputValidatorConfig, "llmRepairFn">> & {
    llmRepairFn?: OutputValidatorConfig["llmRepairFn"];
  };

  private metrics: ValidationMetrics = {
    totalAttempts: 0,
    successfulValidations: 0,
    repairAttempts: 0,
    successfulRepairs: 0,
    failuresByErrorType: {},
  };

  constructor(config: OutputValidatorConfig = {}) {
    this.config = {
      autoRepair: config.autoRepair ?? true,
      maxRepairAttempts: config.maxRepairAttempts ?? 3,
      llmRepairFn: config.llmRepairFn,
    };
  }

  // ==========================================================================
  // XML Tag Parsing
  // ==========================================================================

  /**
   * Parse XML-tagged response (<thought>, <content>)
   */
  parseXMLTags(raw: string): ParsedXMLOutput {
    if (raw == null) {
      return { thought: "", content: "", raw: "" };
    }

    const responseStr = String(raw);
    const thoughtRegex = /<thought>([\s\S]*?)<\/thought>/i;
    const contentRegex = /<content>([\s\S]*?)<\/content>/i;

    const thoughtMatch = responseStr.match(thoughtRegex);
    const contentMatch = responseStr.match(contentRegex);

    let thought = "";
    let content = "";

    if (thoughtMatch) {
      thought = thoughtMatch[1].trim();
    }

    if (contentMatch) {
      content = contentMatch[1].trim();
    }

    // Fallback: if no tags found, treat whole response as content
    if (!thoughtMatch && !contentMatch) {
      content = responseStr;
    }

    return { thought, content, raw: responseStr };
  }

  // ==========================================================================
  // JSON Validation
  // ==========================================================================

  /**
   * Validate content against a Zod schema
   */
  validate<T>(
    content: string,
    schema: ZodType<T, ZodTypeDef, unknown>,
  ): ValidationResult<T> {
    this.metrics.totalAttempts++;
    const result: ValidationResult<T> = {
      success: false,
      repairAttempted: false,
      repairSucceeded: false,
      raw: content,
    };

    // Step 1: Try direct JSON parse
    let parsed: unknown;
    let parseError: Error | null = null;

    try {
      parsed = JSON.parse(content.trim());
    } catch (e) {
      parseError = e as Error;
    }

    // Step 2: If parse failed and autoRepair enabled, try repairs
    if (parseError && this.config.autoRepair) {
      result.repairAttempted = true;
      this.metrics.repairAttempts++;

      const { repaired, appliedRepairs } = repairJSON(content);

      if (appliedRepairs.length > 0) {
        try {
          parsed = JSON.parse(repaired);
          result.repairSucceeded = true;
          this.metrics.successfulRepairs++;
        } catch {
          // Repair didn't help
          this.trackError("json_parse_error");
        }
      }
    }

    // Step 3: If still no parsed value, return error
    if (parsed === undefined) {
      result.errors = [{
        path: [],
        message: `Invalid JSON: ${parseError?.message || "Unknown error"}`,
        code: "invalid_json",
      }];
      return result;
    }

    // Step 4: Validate against schema
    try {
      result.value = schema.parse(parsed);
      result.success = true;
      this.metrics.successfulValidations++;
      return result;
    } catch (e) {
      if (e instanceof ZodError) {
        result.errors = e.errors.map((err) => ({
          path: err.path.map(String),
          message: err.message,
          code: err.code,
          expected: "expected" in err ? String(err.expected) : undefined,
          received: "received" in err ? String(err.received) : undefined,
        }));
        this.trackError(`schema_${e.errors[0]?.code || "unknown"}`);
      } else {
        result.errors = [{
          path: [],
          message: String(e),
          code: "unknown_error",
        }];
        this.trackError("unknown_error");
      }
      return result;
    }
  }

  /**
   * Validate content using a named schema from the registry
   */
  validateWithSchema<K extends OutputSchemaName>(
    content: string,
    schemaName: K,
  ): ValidationResult<z.infer<(typeof OutputSchemas)[K]>> {
    const schema = OutputSchemas[schemaName];
    // Use type assertion since we know OutputSchemas[K] matches the expected type
    return this.validate(
      content,
      schema as unknown as ZodType<z.infer<(typeof OutputSchemas)[K]>, ZodTypeDef, unknown>,
    );
  }

  // ==========================================================================
  // Combined Parsing & Validation
  // ==========================================================================

  /**
   * Parse XML tags and validate content against a schema
   */
  parseAndValidate<T>(
    raw: string,
    schema: ZodType<T, ZodTypeDef, unknown>,
  ): ValidationResult<T> {
    const parsed = this.parseXMLTags(raw);
    const result = this.validate(parsed.content, schema);
    result.parsed = parsed;
    result.raw = raw;
    return result;
  }

  /**
   * Parse XML tags and validate using a named schema
   */
  parseAndValidateWithSchema<K extends OutputSchemaName>(
    raw: string,
    schemaName: K,
  ): ValidationResult<z.infer<(typeof OutputSchemas)[K]>> {
    const schema = OutputSchemas[schemaName];
    // Use type assertion since we know OutputSchemas[K] matches the expected type
    return this.parseAndValidate(
      raw,
      schema as unknown as ZodType<z.infer<(typeof OutputSchemas)[K]>, ZodTypeDef, unknown>,
    );
  }

  // ==========================================================================
  // LLM-Based Repair
  // ==========================================================================

  /**
   * Attempt to repair content using LLM
   */
  async repairWithLLM<T>(
    content: string,
    schema: ZodType<T, ZodTypeDef, unknown>,
    errors: ValidationError[],
  ): Promise<ValidationResult<T>> {
    if (!this.config.llmRepairFn) {
      throw new Error("LLM repair function not configured");
    }

    const schemaDescription = this.describeSchema(schema);
    const errorDescription = errors
      .map((e) => `- ${e.path.join(".")}: ${e.message}`)
      .join("\n");

    const repairedContent = await this.config.llmRepairFn(
      content,
      schemaDescription,
      errorDescription,
    );

    const result = this.validate(repairedContent, schema);
    result.repairAttempted = true;
    result.repairSucceeded = result.success;

    if (result.success) {
      this.metrics.successfulRepairs++;
    }

    return result;
  }

  /**
   * Generate a human-readable schema description for LLM repair
   */
  private describeSchema<T>(
    schema: ZodType<T, ZodTypeDef, unknown>,
  ): string {
    // Get schema description from Zod's internal structure
    // Using unknown cast to safely access Zod internal structure
    const def = schema._def as unknown as Record<string, unknown>;

    if ("typeName" in def) {
      switch (def.typeName) {
        case "ZodObject": {
          const shapeFn = (def as unknown as { shape: () => Record<string, ZodType<unknown>> }).shape;
          if (typeof shapeFn === "function") {
            const shape = shapeFn();
            const fields = Object.entries(shape)
              .map(([key, val]) => `  "${key}": ${this.describeSchema(val)}`)
              .join(",\n");
            return `{\n${fields}\n}`;
          }
          return "object";
        }
        case "ZodArray": {
          const typeProp = (def as unknown as { type?: ZodType<unknown> }).type;
          if (typeProp) {
            return `Array<${this.describeSchema(typeProp)}>`;
          }
          return "Array<unknown>";
        }
        case "ZodString":
          return "string";
        case "ZodNumber":
          return "number";
        case "ZodBoolean":
          return "boolean";
        case "ZodEnum": {
          const values = (def as unknown as { values?: string[] }).values;
          if (values) {
            return `enum(${values.join(" | ")})`;
          }
          return "enum";
        }
        case "ZodOptional": {
          const innerType = (def as unknown as { innerType?: ZodType<unknown> }).innerType;
          if (innerType) {
            return `optional(${this.describeSchema(innerType)})`;
          }
          return "optional(unknown)";
        }
        default:
          return "unknown";
      }
    }

    return "unknown";
  }

  // ==========================================================================
  // Metrics
  // ==========================================================================

  /**
   * Get current validation metrics
   */
  getMetrics(): ValidationMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset validation metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalAttempts: 0,
      successfulValidations: 0,
      repairAttempts: 0,
      successfulRepairs: 0,
      failuresByErrorType: {},
    };
  }

  private trackError(errorType: string): void {
    this.metrics.failuresByErrorType[errorType] = (this.metrics.failuresByErrorType[errorType] || 0) + 1;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an OutputValidator with default settings
 */
export function createOutputValidator(
  config?: OutputValidatorConfig,
): OutputValidator {
  return new OutputValidator(config);
}

/**
 * Create an OutputValidator configured for plan validation
 */
export function createPlanValidator(): OutputValidator {
  return new OutputValidator({
    autoRepair: true,
    maxRepairAttempts: 3,
  });
}

// ============================================================================
// Type Exports
// ============================================================================

export type Evaluation = z.infer<typeof OutputSchemas.evaluation>;
export type Analysis = z.infer<typeof OutputSchemas.analysis>;
export type SimpleResponse = z.infer<typeof OutputSchemas.simpleResponse>;
export type ToolCall = z.infer<typeof OutputSchemas.toolCall>;
export type ActionSequence = z.infer<typeof OutputSchemas.actionSequence>;

// Re-export plan types
export type { Plan };
export { PlanSchema, PlanStepSchema };
