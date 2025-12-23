/**
 * Tests for MockLLMProvider (Testing Strategy §3.1)
 *
 * MockLLMProvider provides deterministic LLM responses for testing without API calls.
 *
 * Mock Strategies:
 * - recorded: Replay real responses based on prompt hash lookup
 * - scripted: Return responses in order (sequence)
 * - pattern: Match prompt patterns and generate responses
 * - failing: Always throw error (for error handling tests)
 * - slow: Add artificial delay (for timeout tests)
 */

import { assert, assertEquals, assertExists, assertRejects, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import { IModelProvider } from "../../src/ai/providers.ts";

import {
  MockLLMError,
  MockLLMProvider,
  type PatternMatcher,
  type RecordedResponse,
} from "../../src/ai/providers/mock_llm_provider.ts";

// ...existing code...
