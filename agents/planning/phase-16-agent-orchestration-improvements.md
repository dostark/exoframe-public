# Phase 16: Agent Orchestration Improvements

**Created:** 2025-01-20
**Status:** Planning
**Priority:** High
**Estimated Duration:** 2-3 weeks

---

## Executive Summary

This plan addresses weaknesses in ExoFrame's single-agent orchestration patterns.
While Flows handle multi-agent pipelines, the direct agent execution model
(Blueprints/Agents) lacks modern patterns that improve agent reliability,
self-correction, and output quality.

---

## Current State Analysis

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Request Processing                          │
├─────────────────────────────────────────────────────────────────┤
│  RequestProcessor → RequestRouter → AgentRunner / FlowRunner    │
│                                          ↓                      │
│                                   LLM Provider                  │
│                                          ↓                      │
│                               XML Response Parser               │
│                            (<thought> / <content>)              │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| AgentRunner | `src/services/agent_runner.ts` | Blueprint + Request → LLM → Parse |
| AgentExecutor | `src/services/agent_executor.ts` | MCP-based execution with tools |
| PlanExecutor | `src/services/plan_executor.ts` | ReAct-style step execution |
| RequestRouter | `src/services/request_router.ts` | Routes to flow/agent/default |
| Blueprints | `Blueprints/Agents/` | Agent definitions (TOML + markdown) |

### Current Agent Templates (2 total)

1. **pipeline-agent.md.template** - Systematic 5-step processing
2. **collaborative-agent.md.template** - Flow integration placeholder

---

## Identified Weaknesses

### 1. No Self-Reflection/Critique Mechanism

**Problem:** Agents produce output in a single pass without self-evaluation.
Modern agents use "Reflexion" patterns to critique and improve their own outputs.

**Impact:** Quality varies; no automatic improvement loops.

**Evidence:**
```typescript
// agent_runner.ts - Single-pass execution
const rawResponse = await this.modelProvider.generate(combinedPrompt);
const result = this.parseResponse(rawResponse); // Direct return, no review
```

### 2. Weak Structured Output Validation

**Problem:** Output parsing relies on regex for `<thought>` and `<content>` tags.
No JSON schema validation, no fallback to repair malformed outputs.

**Impact:** Failures when LLM doesn't follow expected format.

**Evidence:**
```typescript
// agent_runner.ts - Regex-only parsing
const thoughtRegex = /<thought>([\s\S]*?)<\/thought>/i;
const contentRegex = /<content>([\s\S]*?)<\/content>/i;
// Fallback: treat entire response as content (loses structure)
```

### 3. No Retry/Recovery Logic

**Problem:** Failed LLM calls throw immediately. No automatic retry with
adjusted prompts or temperature.

**Impact:** Transient failures cause complete request failure.

**Evidence:**
```typescript
// agent_runner.ts - Single attempt
const rawResponse = await this.modelProvider.generate(combinedPrompt);
// No retry logic
```

### 4. Limited Tool Use Patterns

**Problem:** Tool execution in PlanExecutor follows a simple loop without:
- Tool result reflection (did this tool call achieve its purpose?)
- Multi-turn tool conversations
- Parallel tool execution for independent operations

**Impact:** Inefficient tool use, no validation of tool results.

**Evidence:**
```typescript
// plan_executor.ts - Execute and move on
for (const action of actions) {
  const result = await toolRegistry.execute(action.tool, action.params);
  if (!result.success) throw new Error(result.error);
  // No reflection: "Did this achieve what I needed?"
}
```

### 5. No Memory Between Requests

**Problem:** Each request is stateless. Agent cannot reference:
- Past decisions on similar problems
- User preferences learned over time
- Project-specific conventions discovered

**Impact:** Agents repeat mistakes; no learning curve.

**Evidence:**
```typescript
// agent_runner.ts - Fresh context each time
const parsedRequest: ParsedRequest = {
  userPrompt: body,
  context: {}, // Empty context, no historical reference
  traceId,
  requestId,
};
```

### 6. Minimal Blueprint Templates

**Problem:** Only 2 templates exist:
- pipeline-agent: 5-step systematic process
- collaborative-agent: Placeholder for flow integration

Missing patterns:
- Reflexive agent (self-critique)
- Research agent (web/RAG integration)
- Judge agent (quality evaluation)
- Specialist agents (code review, security, etc.)

### 7. No Confidence/Uncertainty Signals

**Problem:** Agents don't express confidence levels. User cannot tell if
agent is 95% confident or making a wild guess.

**Impact:** False sense of certainty; hidden uncertainty.

### 8. Inconsistent Blueprint Loading

**Problem:** Two different blueprint loading implementations:
- `AgentExecutor.loadBlueprint()` - Parses YAML frontmatter
- `request_common.loadBlueprint()` - Returns entire file as systemPrompt

**Impact:** Blueprints behave differently depending on execution path.

**Evidence:**
```typescript
// agent_executor.ts - Parses frontmatter
const frontmatter = parseYaml(frontmatterMatch[1]);
const systemPrompt = content.slice(frontmatterMatch[0].length).trim();

// request_common.ts - No parsing
return { systemPrompt: content, agentId }; // Entire file becomes prompt!
```

---

## Improvement Plan

### Phase 16.1: Unified Blueprint Loading (1 day)

**Goal:** Consistent blueprint parsing across all execution paths.

**Tasks:**
1. Create `BlueprintLoader` service with TOML/YAML frontmatter parsing
2. Extract capabilities, model, provider from frontmatter
3. Update AgentRunner, AgentExecutor, RequestRouter to use shared loader
4. Add validation with Zod schema

**Success Criteria:**
- [ ] Single `BlueprintLoader.load(agentId)` method
- [ ] Returns typed `Blueprint` with all fields
- [ ] All execution paths use same loader
- [ ] Tests cover malformed frontmatter handling

### Phase 16.2: Structured Output Validation (2 days)

**Goal:** Reliable structured output with schema validation and repair.

**Tasks:**
1. Define output schemas (Zod) for different response types
2. Implement schema-aware parser with fallback repair
3. Add output format instructions to blueprint template
4. Use LLM for repair when validation fails

**Success Criteria:**
- [ ] JSON schema validation for structured outputs
- [ ] Automatic repair attempt on validation failure
- [ ] Metrics on validation success rate
- [ ] Tests for malformed output handling

### Phase 16.3: Retry & Recovery System (1 day)

**Goal:** Graceful handling of transient LLM failures.

**Tasks:**
1. Add configurable retry policy (count, backoff, conditions)
2. Implement exponential backoff with jitter
3. Adjust temperature/prompt on retry
4. Log retry attempts for debugging

**Success Criteria:**
- [ ] Configurable `retry_policy` in config
- [ ] 3 retry attempts by default with exponential backoff
- [ ] Different retry strategies for different error types
- [ ] Metrics on retry frequency and success

### Phase 16.4: Reflexion Pattern Implementation (3 days)

**Goal:** Agents self-critique and improve outputs before finalizing.

**Architecture:**
```
┌────────────┐     ┌────────────┐     ┌────────────┐
│   Draft    │────▶│  Critique  │────▶│  Refine    │
│  Response  │     │   (Self)   │     │  Response  │
└────────────┘     └────────────┘     └────────────┘
                         │
                         ▼
                  ┌────────────┐
                  │   Decide   │
                  │ Good/Retry │
                  └────────────┘
```

**Tasks:**
1. Create `ReflexiveAgent` wrapper around AgentRunner
2. Implement critique prompt template
3. Add refinement loop with iteration limit
4. Extract confidence signals from critique

**New Template: reflexive-agent.md.template**

**Success Criteria:**
- [ ] `ReflexiveAgent.run()` with configurable iterations
- [ ] Critique extracts: issues found, severity, suggestions
- [ ] Refinement incorporates critique feedback
- [ ] Early exit when critique finds no issues
- [ ] Metrics on iterations before acceptance

### Phase 16.5: Tool Result Reflection (2 days)

**Goal:** Agents evaluate tool results before proceeding.

**Tasks:**
1. Add reflection step after each tool call in PlanExecutor
2. Ask LLM: "Did this tool call achieve its purpose?"
3. Allow re-try with different parameters if reflection fails
4. Implement parallel tool execution for independent calls

**Success Criteria:**
- [ ] Tool reflection prompt template
- [ ] Automatic retry on unsatisfactory tool result
- [ ] Parallel execution for independent tools
- [ ] Metrics on tool retry frequency

### Phase 16.6: Session Memory Integration (2 days)

**Goal:** Agents can reference relevant past context.

**Architecture:**
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Request    │────▶│   Memory    │────▶│  Enhanced   │
│   Input     │     │   Lookup    │     │   Request   │
└─────────────┘     │  (Semantic) │     └─────────────┘
                    └─────────────┘
                          │
                    ┌─────┴─────┐
                    │  Memory   │
                    │   Bank    │
                    └───────────┘
```

**Tasks:**
1. Integrate with existing Memory Bank service
2. Add semantic search for relevant past interactions
3. Include relevant memories in agent context
4. Allow agents to write to memory post-execution

**Success Criteria:**
- [ ] Automatic memory lookup before agent execution
- [ ] Top-K relevant memories injected into context
- [ ] Agent can save insights to memory
- [ ] Memory lookup is optional/configurable

### Phase 16.7: Confidence Scoring (1 day)

**Goal:** Agents express confidence in their outputs.

**Tasks:**
1. Add confidence score to agent output schema
2. Create confidence extraction prompt
3. Propagate confidence to plan outputs
4. Flag low-confidence outputs for human review

**Success Criteria:**
- [ ] Confidence score (0-100) in agent results
- [ ] Confidence reasoning extracted from response
- [ ] Low-confidence alerts in logs
- [ ] Human review trigger for confidence < threshold

### Phase 16.8: New Agent Templates (2 days)

**Goal:** Rich template library for common agent patterns.

**Templates to Create:**

1. **reflexive-agent.md.template** - Self-critique pattern
2. **research-agent.md.template** - Information gathering with citations
3. **judge-agent.md.template** - Quality evaluation (LLM-as-a-Judge)
4. **specialist-agent.md.template** - Domain-focused (code review, security, etc.)
5. **conversational-agent.md.template** - Multi-turn dialogue

**Success Criteria:**
- [ ] 5 new templates created
- [ ] Each template has inline documentation
- [ ] Example agents created from each template
- [ ] README updated with template descriptions

---

## Implementation Priority

| Phase | Name | Priority | Effort | Dependencies |
|-------|------|----------|--------|--------------|
| 16.1 | Unified Blueprint Loading | **Critical** | 1 day | None |
| 16.2 | Structured Output Validation | High | 2 days | 16.1 |
| 16.3 | Retry & Recovery | High | 1 day | None |
| 16.4 | Reflexion Pattern | **Critical** | 3 days | 16.1, 16.2 |
| 16.5 | Tool Result Reflection | Medium | 2 days | 16.4 |
| 16.6 | Session Memory | Medium | 2 days | None |
| 16.7 | Confidence Scoring | Medium | 1 day | 16.2 |
| 16.8 | New Templates | High | 2 days | 16.4 |

**Recommended Order:** 16.1 → 16.3 → 16.2 → 16.4 → 16.7 → 16.8 → 16.5 → 16.6 → 16.9

---

### Phase 16.9: Documentation Update (1 day)

**Goal:** Update user-facing documentation to reflect new Agent capabilities.

**Files to Update:**

| File | Updates Required |
|------|------------------|
| `docs/ExoFrame_User_Guide.md` | Agent section: reflexion, confidence, session memory |
| `docs/Building_with_AI_Agents.md` | New agent patterns, template guide |
| `docs/ExoFrame_Implementation_Plan.md` | Phase 16 completion status |
| `Blueprints/Agents/README.md` | New templates, configuration options |

**Tasks:**
1. Document Reflexion pattern configuration
2. Add confidence scoring interpretation guide
3. Document session memory usage
4. Update template catalog with new templates
5. Add troubleshooting for retry/recovery
6. Include best practices for template selection

**Success Criteria:**
- [ ] User guide has complete Agent feature documentation
- [ ] Each new template has usage example
- [ ] Configuration reference updated
- [ ] Migration guide for existing agents (if needed)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Reflexion increases latency | Medium | Make optional, configurable iterations |
| Memory lookup adds overhead | Low | Async lookup, caching |
| Complex templates confuse users | Medium | Clear documentation, examples |
| Blueprint loading change breaks existing | High | Backward-compatible parsing |

---

## Success Metrics

1. **Output Quality:** Reflexive agents produce higher quality outputs
   - Measure: A/B test reflexive vs single-pass on code review task

2. **Reliability:** Retry system reduces failed requests
   - Target: < 5% permanent failures (vs current ~10%)

3. **User Confidence:** Confidence scores correlate with actual quality
   - Measure: Human ratings vs confidence scores

4. **Template Adoption:** New templates are used by developers
   - Target: > 50% of new agents use templates

---

## Related Documents

- [Phase 15: Flow Orchestration Improvements](./phase-15-flow-orchestration-improvements.md)
- [Building with AI Agents](../../docs/Building_with_AI_Agents.md)
- [ExoFrame Implementation Plan](../../docs/ExoFrame_Implementation_Plan.md)

---

## Appendix A: State-of-the-Art Agent Patterns

### Reflexion (Shinn et al., 2023)

Agent generates response, self-critiques, refines in loop until satisfied.
Key insight: LLMs can identify their own mistakes when prompted to critique.

### ReAct (Yao et al., 2023)

Interleaves reasoning and action. After each tool call, agent reasons about
the result before deciding next action. Already partially implemented in
PlanExecutor but without result reflection.

### Chain-of-Thought (Wei et al., 2022)

Explicit reasoning steps before answer. ExoFrame uses `<thought>` tags
but doesn't enforce or validate the reasoning quality.

### Constitutional AI (Anthropic)

Self-critique against principles. Agent checks if output violates rules
and revises. Could be used for security/safety validation.

### Tool-Use Reflection (OpenAI)

After tool calls, evaluate: "Did I get what I needed? Should I try again
with different parameters?" Currently missing in ExoFrame.

---

## Appendix B: Blueprint Loading Inconsistency Details

### Current Behavior Comparison

**Via AgentExecutor (MCP path):**
```typescript
// Parses frontmatter, extracts fields
return {
  name: agentName,
  model: frontmatter.model,          // ✓ Extracted
  provider: frontmatter.provider,    // ✓ Extracted
  capabilities: frontmatter.capabilities, // ✓ Extracted
  systemPrompt: bodyAfterFrontmatter, // ✓ Clean prompt
};
```

**Via request_common.ts (direct path):**
```typescript
// No parsing, entire file becomes prompt
return {
  systemPrompt: entireFileContent,  // ✗ Includes frontmatter!
  agentId: agentId,
};
```

This means the same blueprint produces different behavior depending on
which execution path processes it!

---

## Appendix C: Proposed Blueprint Schema (Zod)

```typescript
const BlueprintSchema = z.object({
  // Metadata (from frontmatter)
  agent_id: z.string(),
  name: z.string(),
  model: z.string().default("anthropic:claude-opus-4.5"),
  provider: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  version: z.string().default("1.0.0"),
  created: z.string().datetime().optional(),
  created_by: z.string().optional(),

  // Content (from body)
  systemPrompt: z.string(),

  // Optional extensions
  reflexive: z.boolean().default(false),
  max_reflexion_iterations: z.number().default(3),
  confidence_required: z.number().min(0).max(100).optional(),
  memory_enabled: z.boolean().default(false),
});
```

---

## Appendix D: Reflexive Agent Prompt Template

```markdown
---
agent_id: "{{agent_id}}"
name: "{{name}}"
model: "{{model}}"
reflexive: true
max_reflexion_iterations: 3
confidence_required: 80
---

# {{name}}

## Role
{{role_description}}

## Instructions
{{instructions}}

## Self-Critique Protocol

After generating your initial response, you MUST critique it:

1. **Accuracy Check:** Are all facts correct? Any hallucinations?
2. **Completeness Check:** Did I address all requirements?
3. **Quality Check:** Is the output well-structured and clear?
4. **Safety Check:** Any security, privacy, or ethical issues?

Rate your confidence (0-100) and list any issues found.

If confidence < {{confidence_required}} OR issues found:
- Address each issue in a refined response
- Repeat critique until satisfied or max iterations reached

## Output Format

<thought>
[Your reasoning process]
</thought>

<critique>
Confidence: [0-100]
Issues:
- [Issue 1]
- [Issue 2]
Suggestions:
- [Suggestion 1]
</critique>

<content>
[Your response to the user]
</content>
```
