/**
 * Integration Test: Ollama Plan Generation with JSON Format
 *
 * Tests real-world plan generation using Ollama's llama3.2 model
 * with the new JSON plan format introduced in Step 6.7.
 *
 * Prerequisites:
 * - Ollama must be running locally (http://localhost:11434)
 * - llama3.2 model must be pulled: `ollama pull llama3.2`
 *
 * To run: deno test tests/integration/17_ollama_json_plan_test.ts --allow-all --no-check
 */

import { assert, assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@^1";
import { join } from "@std/path";
import { OllamaProvider } from "../../src/ai/providers.ts";
import { AgentRunner } from "../../src/services/agent_runner.ts";
import { PlanWriter, type RequestMetadata } from "../../src/services/plan_writer.ts";
import { PlanAdapter } from "../../src/services/plan_adapter.ts";
import { initTestDbService } from "../helpers/db.ts";

// ============================================================================
// Test Configuration
// ============================================================================

const OLLAMA_MODEL = "llama3.2";
const OLLAMA_BASE_URL = Deno.env.get("OLLAMA_BASE_URL") || "http://localhost:11434";

/**
 * Check if Ollama is running and model is available
 */
async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return false;

    const data = await response.json();
    const models = data.models || [];
    return models.some((m: { name: string }) => m.name.includes("llama3.2") || m.name.includes("llama3"));
  } catch {
    return false;
  }
}

/**
 * Create a test blueprint (plain object, not using Schema types)
 */
function createJSONPlanBlueprint() {
  return {
    agentId: "ollama-test",
    name: "Ollama Test",
    model: `ollama:${OLLAMA_MODEL}`,
    systemPrompt: `You are a coding assistant. When I ask for a plan, respond ONLY with valid JSON in this exact format:

{
  "title": "plan title",
  "description": "what it does",
  "steps": [
    {"step": 1, "title": "step 1", "description": "what step 1 does"},
    {"step": 2, "title": "step 2", "description": "what step 2 does"}
  ]
}

IMPORTANT: Respond with ONLY the JSON, nothing else. Do not include explanations before or after.`,
    capabilities: [],
  };
}

/**
 * Create a test request
 */
function createTestRequest() {
  return {
    traceId: crypto.randomUUID(),
    requestId: "test-ollama-request",
    userPrompt: `Create a simple plan to add a login endpoint with password hashing.`,
    context: {},
  };
}

// ============================================================================
// Integration Tests
// ============================================================================

Deno.test({
  name: "Ollama Integration: Generate JSON plan with llama3.2",
  ignore: !(await isOllamaAvailable()),
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  console.log(`\n🦙 Testing Ollama with ${OLLAMA_MODEL} at ${OLLAMA_BASE_URL}\n`);

  // Setup test environment
  const { db, config: _config, tempDir, cleanup } = await initTestDbService();

  try {
    // Create provider and services
    const provider = new OllamaProvider({
      model: OLLAMA_MODEL,
      baseUrl: OLLAMA_BASE_URL,
    });

    const runner = new AgentRunner(provider, { db });
    const blueprint = createJSONPlanBlueprint();
    const request = createTestRequest();

    // Step 1: Generate plan with LLM
    console.log("📝 Generating plan with Ollama...");
    const startTime = Date.now();
    const agentResult = await runner.run(blueprint, request);
    const duration = Date.now() - startTime;

    console.log(`\n📄 Raw response:\n${agentResult.raw.substring(0, 1000)}\n`);
    console.log(`⏱️  Generation took ${duration}ms`);
    console.log(`💭 Thought length: ${agentResult.thought.length} chars`);
    console.log(`📄 Content length: ${agentResult.content.length} chars`);

    // Verify content (thought is optional for simpler models)
    assertExists(agentResult.content, "Should have content section");
    assert(agentResult.content.length > 0, "Content should not be empty");

    // Step 2: Validate JSON with PlanAdapter
    console.log("\n✅ Validating JSON with PlanAdapter...");
    const adapter = new PlanAdapter();

    let plan;
    try {
      plan = adapter.parse(agentResult.content);
      console.log(`✅ JSON validation passed!`);
      console.log(`   Title: ${plan.title}`);
      console.log(`   Steps: ${plan.steps.length}`);
      console.log(`   Duration: ${plan.estimatedDuration || "not specified"}`);
    } catch (error) {
      console.error("❌ JSON validation failed:");
      console.error("   Error:", (error as Error).message);
      console.error("   Content preview:", agentResult.content.substring(0, 500));
      throw error;
    }

    // Verify plan structure
    assertExists(plan.title, "Plan should have title");
    assertExists(plan.description, "Plan should have description");
    assertExists(plan.steps, "Plan should have steps");
    assert(plan.steps.length > 0, "Plan should have at least one step");
    assert(plan.title.length >= 1 && plan.title.length <= 300, "Title should be 1-300 chars");

    // Verify steps
    plan.steps.forEach((step, index) => {
      assertEquals(step.step, index + 1, `Step ${index + 1} should have correct step number`);
      assert(step.title.length >= 1 && step.title.length <= 200, `Step ${step.step} title should be 1-200 chars`);
      assert(step.description.length >= 1, `Step ${step.step} should have description`);
    });

    // Step 3: Convert to markdown with PlanAdapter
    console.log("\n📝 Converting to markdown...");
    const markdown = adapter.toMarkdown(plan);
    assertExists(markdown, "Should generate markdown");
    assert(markdown.length > 0, "Markdown should not be empty");
    assertStringIncludes(markdown, "##", "Markdown should include headers");
    assertStringIncludes(markdown, plan.title, "Markdown should include plan title");

    // Step 4: Write plan with PlanWriter
    console.log("\n💾 Writing plan with PlanWriter...");
    const planDir = join(tempDir, "Inbox", "Plans");
    await Deno.mkdir(planDir, { recursive: true });

    const planWriter = new PlanWriter({
      plansDirectory: planDir,
      includeReasoning: true,
      generateWikiLinks: false,
      knowledgeRoot: tempDir,
      systemRoot: join(tempDir, "System"),
      db,
    });

    const metadata: RequestMetadata = {
      traceId: request.traceId,
      requestId: request.requestId,
      createdAt: new Date(),
      contextFiles: [],
      contextWarnings: [],
    };

    const writeResult = await planWriter.writePlan(agentResult, metadata);
    assertExists(writeResult.planPath, "Should have plan path");
    assert(writeResult.planPath.endsWith("_plan.md"), "Plan file should end with _plan.md");

    console.log(`✅ Plan written to: ${writeResult.planPath}`);

    // Step 5: Verify written plan file
    const planContent = await Deno.readTextFile(writeResult.planPath);

    // Checkfrontmatter
    assertStringIncludes(planContent, `trace_id: "${request.traceId}"`, "Should include trace_id");
    assertStringIncludes(planContent, `request_id: "${request.requestId}"`, "Should include request_id");
    assertStringIncludes(planContent, "status: review", "Should have review status");

    // Check content sections (Reasoning is optional if no thought provided)
    assertStringIncludes(planContent, "## Execution Steps", "Should include Execution Steps section");
    assertStringIncludes(planContent, plan.title, "Should include plan title");

    // Verify all steps are present
    plan.steps.forEach((step) => {
      assertStringIncludes(planContent, step.title, `Should include step: ${step.title}`);
    });

    console.log("\n✅ All validations passed!");
    console.log(`\n📊 Summary:`);
    console.log(`   Model: ${OLLAMA_MODEL}`);
    console.log(`   Generation time: ${duration}ms`);
    console.log(`   Plan title: "${plan.title}"`);
    console.log(`   Steps: ${plan.steps.length}`);
    console.log(`   JSON validation: ✅`);
    console.log(`   Markdown conversion: ✅`);
    console.log(`   File written: ✅`);
  } finally {
    await cleanup();
  }
});

Deno.test({
  name: "Ollama Integration: Handle invalid JSON gracefully",
  ignore: !(await isOllamaAvailable()),
  sanitizeResources: false,
  sanitizeOps: false,
}, () => {
  const adapter = new PlanAdapter();

  // Test malformed JSON
  const invalidJSON = "{title: 'Missing quotes'}";

  try {
    adapter.parse(invalidJSON);
    throw new Error("Should have thrown PlanValidationError");
  } catch (error) {
    assertStringIncludes((error as Error).message, "not valid JSON", "Should report JSON parse error");
  }

  // Test JSON missing required fields
  const missingFields = JSON.stringify({ title: "Test" });

  try {
    adapter.parse(missingFields);
    throw new Error("Should have thrown PlanValidationError");
  } catch (error) {
    assertStringIncludes((error as Error).message, "does not match required schema", "Should report schema violation");
  }

  console.log("✅ Invalid JSON handling verified");
});

// ============================================================================
// Skip Message for CI/Local without Ollama
// ============================================================================

if (!(await isOllamaAvailable())) {
  console.log(`
⚠️  Ollama tests skipped - Ollama not available

To run these tests:
1. Install Ollama: https://ollama.ai
2. Start Ollama: ollama serve
3. Pull model: ollama pull ${OLLAMA_MODEL}
4. Run tests: deno test tests/integration/17_ollama_json_plan_test.ts --allow-all --no-check

Current configuration:
- Model: ${OLLAMA_MODEL}
- Base URL: ${OLLAMA_BASE_URL}
`);
}
