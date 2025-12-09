/**
 * Tests for PlanSchema - JSON schema validation for LLM plan output
 * Implements Step 6.7 of the ExoFrame Implementation Plan
 *
 * Success Criteria:
 * - PlanSchema validates plans with all fields
 * - PlanSchema validates minimal plans (required fields only)
 * - PlanSchema rejects missing required fields
 * - PlanStepSchema validates steps with all fields
 * - PlanStepSchema validates minimal steps
 * - PlanStepSchema rejects invalid step numbers
 * - PlanStepSchema validates tools enum
 */

import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";
import { assertEquals, assertExists } from "jsr:@std/assert@^1";
import { ZodError } from "zod";

// Import schemas (will create these)
import { Plan, PlanSchema, PlanStep, PlanStepSchema } from "../../src/schemas/plan_schema.ts";

describe("PlanStepSchema", () => {
  describe("Valid Steps", () => {
    it("should validate step with all optional fields", () => {
      const stepData = {
        step: 1,
        title: "Create User Database Schema",
        description: "Create migration file for users table with columns: id, email, password_hash, created_at",
        tools: ["write_file", "run_command"],
        successCriteria: [
          "Migration file created in db/migrations/",
          "Schema includes unique constraint on email",
          "Password stored as hash, not plaintext",
        ],
        dependencies: [2, 3],
        rollback: "Drop users table",
      };

      const result = PlanStepSchema.safeParse(stepData);
      assertEquals(result.success, true);
      if (result.success) {
        const step: PlanStep = result.data;
        assertEquals(step.step, 1);
        assertEquals(step.title, "Create User Database Schema");
        assertEquals(step.description.includes("migration file"), true);
        assertEquals(step.tools?.length, 2);
        assertEquals(step.successCriteria?.length, 3);
        assertEquals(step.dependencies?.length, 2);
        assertEquals(step.rollback, "Drop users table");
      }
    });

    it("should validate minimal step (required fields only)", () => {
      const stepData = {
        step: 1,
        title: "Simple Step",
        description: "This is a simple step with no optional fields",
      };

      const result = PlanStepSchema.safeParse(stepData);
      assertEquals(result.success, true);
      if (result.success) {
        assertEquals(result.data.step, 1);
        assertEquals(result.data.title, "Simple Step");
        assertEquals(result.data.tools, undefined);
        assertEquals(result.data.successCriteria, undefined);
      }
    });
  });

  describe("Invalid Steps", () => {
    it("should reject step with invalid step number (zero)", () => {
      const stepData = {
        step: 0,
        title: "Invalid Step",
        description: "Step number cannot be zero",
      };

      const result = PlanStepSchema.safeParse(stepData);
      assertEquals(result.success, false);
      if (!result.success) {
        assertExists(result.error);
      }
    });

    it("should reject step with negative step number", () => {
      const stepData = {
        step: -1,
        title: "Invalid Step",
        description: "Step number cannot be negative",
      };

      const result = PlanStepSchema.safeParse(stepData);
      assertEquals(result.success, false);
    });

    it("should reject step with non-integer step number", () => {
      const stepData = {
        step: 1.5,
        title: "Invalid Step",
        description: "Step number must be integer",
      };

      const result = PlanStepSchema.safeParse(stepData);
      assertEquals(result.success, false);
    });

    it("should reject step with invalid tool enum value", () => {
      const stepData = {
        step: 1,
        title: "Invalid Tools",
        description: "Tools must be from valid enum",
        tools: ["invalid_tool", "write_file"],
      };

      const result = PlanStepSchema.safeParse(stepData);
      assertEquals(result.success, false);
    });

    it("should reject step with empty title", () => {
      const stepData = {
        step: 1,
        title: "",
        description: "Title cannot be empty",
      };

      const result = PlanStepSchema.safeParse(stepData);
      assertEquals(result.success, false);
    });

    it("should reject step with empty description", () => {
      const stepData = {
        step: 1,
        title: "Valid Title",
        description: "",
      };

      const result = PlanStepSchema.safeParse(stepData);
      assertEquals(result.success, false);
    });

    it("should reject step with title exceeding 200 characters", () => {
      const stepData = {
        step: 1,
        title: "A".repeat(201),
        description: "Title too long",
      };

      const result = PlanStepSchema.safeParse(stepData);
      assertEquals(result.success, false);
    });
  });

  describe("Tools Enum Validation", () => {
    it("should accept all valid tool values", () => {
      const validTools = ["read_file", "write_file", "run_command", "list_directory", "search_files"];

      const stepData = {
        step: 1,
        title: "Tool Test",
        description: "Testing all valid tools",
        tools: validTools,
      };

      const result = PlanStepSchema.safeParse(stepData);
      assertEquals(result.success, true);
      if (result.success) {
        assertEquals(result.data.tools?.length, 5);
      }
    });
  });
});

describe("PlanSchema", () => {
  describe("Valid Plans", () => {
    it("should validate plan with all optional fields", () => {
      const planData = {
        title: "Implement Authentication System",
        description: "Add user authentication with JWT tokens, password hashing, and protected routes",
        steps: [
          {
            step: 1,
            title: "Create User Database Schema",
            description: "Create migration file for users table",
            tools: ["write_file", "run_command"],
            successCriteria: ["Migration file created"],
          },
          {
            step: 2,
            title: "Implement Password Hashing",
            description: "Create utility functions for password hashing",
            tools: ["write_file"],
            dependencies: [1],
          },
        ],
        estimatedDuration: "2-3 hours",
        risks: [
          "JWT secret must be kept secure",
          "Database migration may fail if users table exists",
        ],
      };

      const result = PlanSchema.safeParse(planData);
      assertEquals(result.success, true);
      if (result.success) {
        const plan: Plan = result.data;
        assertEquals(plan.title, "Implement Authentication System");
        assertEquals(plan.steps.length, 2);
        assertEquals(plan.estimatedDuration, "2-3 hours");
        assertEquals(plan.risks?.length, 2);
      }
    });

    it("should validate minimal plan (required fields only)", () => {
      const planData = {
        title: "Simple Plan",
        description: "A simple plan with minimal fields",
        steps: [
          {
            step: 1,
            title: "Single Step",
            description: "Do the thing",
          },
        ],
      };

      const result = PlanSchema.safeParse(planData);
      assertEquals(result.success, true);
      if (result.success) {
        assertEquals(result.data.title, "Simple Plan");
        assertEquals(result.data.steps.length, 1);
        assertEquals(result.data.estimatedDuration, undefined);
        assertEquals(result.data.risks, undefined);
      }
    });
  });

  describe("Invalid Plans", () => {
    it("should reject plan with missing title", () => {
      const planData = {
        description: "Missing title",
        steps: [
          {
            step: 1,
            title: "Step",
            description: "Description",
          },
        ],
      };

      const result = PlanSchema.safeParse(planData);
      assertEquals(result.success, false);
      if (!result.success) {
        const errors = result.error as ZodError;
        const titleError = errors.errors.find((e) => e.path.includes("title"));
        assertExists(titleError);
      }
    });

    it("should reject plan with missing description", () => {
      const planData = {
        title: "Has Title",
        steps: [
          {
            step: 1,
            title: "Step",
            description: "Description",
          },
        ],
      };

      const result = PlanSchema.safeParse(planData);
      assertEquals(result.success, false);
      if (!result.success) {
        const errors = result.error as ZodError;
        const descError = errors.errors.find((e) => e.path.includes("description"));
        assertExists(descError);
      }
    });

    it("should reject plan with missing steps", () => {
      const planData = {
        title: "Has Title",
        description: "Has description but no steps",
      };

      const result = PlanSchema.safeParse(planData);
      assertEquals(result.success, false);
      if (!result.success) {
        const errors = result.error as ZodError;
        const stepsError = errors.errors.find((e) => e.path.includes("steps"));
        assertExists(stepsError);
      }
    });

    it("should reject plan with empty steps array", () => {
      const planData = {
        title: "Empty Steps",
        description: "Steps array is empty",
        steps: [],
      };

      const result = PlanSchema.safeParse(planData);
      assertEquals(result.success, false);
    });

    it("should reject plan with empty title", () => {
      const planData = {
        title: "",
        description: "Valid description",
        steps: [
          {
            step: 1,
            title: "Step",
            description: "Description",
          },
        ],
      };

      const result = PlanSchema.safeParse(planData);
      assertEquals(result.success, false);
    });

    it("should reject plan with title exceeding 300 characters", () => {
      const planData = {
        title: "A".repeat(301),
        description: "Valid description",
        steps: [
          {
            step: 1,
            title: "Step",
            description: "Description",
          },
        ],
      };

      const result = PlanSchema.safeParse(planData);
      assertEquals(result.success, false);
    });

    it("should reject plan with more than 50 steps", () => {
      const steps = Array.from({ length: 51 }, (_, i) => ({
        step: i + 1,
        title: `Step ${i + 1}`,
        description: `Description ${i + 1}`,
      }));

      const planData = {
        title: "Too Many Steps",
        description: "This plan has too many steps",
        steps,
      };

      const result = PlanSchema.safeParse(planData);
      assertEquals(result.success, false);
    });
  });
});
