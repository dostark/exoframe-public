# Phase 17: Anthropic-Style Skills Architecture

**Created:** 2026-01-04
**Status:** Planning
**Priority:** High
**Estimated Duration:** 2-3 weeks

---

## Executive Summary

This plan introduces **Skills** as a new abstraction layer in ExoFrame. Skills are
reusable instruction modules that encode domain expertise, procedures, and best
practices. Unlike capabilities (tool permissions), Skills define *how* agents should
approach specific types of work.

**Key Insight from Anthropic's Approach:**
> "Turn your expertise, procedures, and best practices into reusable capabilities
> so Claude can apply them automatically, every time."

Skills bridge the gap between:
- **Capabilities** (what tools an agent CAN use)
- **Blueprints** (agent persona and identity)
- **Task Requirements** (what needs to be done)

---

## Concept Definition

### What is a Skill?

A **Skill** is a declarative instruction module containing:

1. **Trigger Conditions** - When this skill should be activated
2. **Instructions** - Procedural knowledge for the task type
3. **Constraints** - Boundaries and requirements
4. **Output Format** - Expected deliverable structure
5. **Quality Criteria** - How to evaluate success

### Skill vs Capability vs Blueprint

| Aspect | Capability | Skill | Blueprint |
|--------|------------|-------|-----------|
| **Purpose** | Tool permissions | Procedural knowledge | Agent identity |
| **Answers** | "What can I use?" | "How should I work?" | "Who am I?" |
| **Example** | `read_file`, `git_commit` | `tdd-methodology`, `security-audit` | `code-reviewer` |
| **Granularity** | Atomic tool | Composable procedure | Complete persona |
| **Reusability** | Across all agents | Across related tasks | Single agent |
| **Runtime** | Permission check | Context injection | System prompt |

### Skill Composition Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Agent Execution                              │
├─────────────────────────────────────────────────────────────────────┤
│  Blueprint (Who)                                                     │
│  ├── System Prompt: "You are a code reviewer..."                    │
│  └── Capabilities: [read_file, write_file]                          │
│                                                                      │
│  + Skills (How) ─────────────────────────────────────────────────── │
│    ├── tdd-methodology: "Always write tests first..."               │
│    ├── security-audit: "Check OWASP Top 10..."                      │
│    └── exoframe-conventions: "Use initTestDbService()..."           │
│                                                                      │
│  + Task (What) ──────────────────────────────────────────────────── │
│    └── User Request: "Review this authentication PR"                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Current State Analysis

### Existing Mechanisms

| Mechanism | Location | Limitation |
|-----------|----------|------------|
| Agent capabilities | Blueprint frontmatter | Tool-level only, no procedures |
| System prompts | Blueprint body | Monolithic, not composable |
| Flow transforms | Flow definitions | Data transformation, not instruction injection |
| agents/ docs | `agents/` folder | Human-readable, not agent-consumable at runtime |

### Gap Analysis

1. **No dynamic instruction injection** - Agents get static system prompts
2. **No task-based skill routing** - Manual agent selection required
3. **No skill versioning** - Instructions embedded in blueprints
4. **No skill testing** - Can't validate skill effectiveness
5. **Scattered procedural knowledge** - In docs, prompts, templates

---

## Architecture Design

### Skill Definition Format

```yaml
# Blueprints/Skills/tdd-methodology.skill.yaml
---
skill_id: "tdd-methodology"
name: "Test-Driven Development Methodology"
version: "1.0.0"
description: "Enforces TDD workflow: test first, implement, refactor"

triggers:
  - keywords: ["implement", "feature", "add", "create", "build"]
  - task_types: ["feature", "bugfix", "refactor"]
  - file_patterns: ["*.ts", "*.js", "*.py"]

instructions: |
  ## TDD Workflow

  You MUST follow Test-Driven Development:

  1. **Red Phase**: Write a failing test first
     - Define expected behavior before implementation
     - Run test to confirm it fails

  2. **Green Phase**: Write minimal code to pass
     - Only implement what's needed to pass the test
     - No premature optimization

  3. **Refactor Phase**: Improve without changing behavior
     - Clean up code while tests stay green
     - Extract helpers if needed

constraints:
  - "Never write implementation before tests"
  - "Run tests after each change"
  - "Keep test and implementation in sync"

output_requirements:
  - "Test file must exist before implementation"
  - "All tests must pass before completion"

quality_criteria:
  - name: "Test Coverage"
    description: "New code has corresponding tests"
    weight: 40
  - name: "Test-First Evidence"
    description: "Tests written before implementation"
    weight: 30
  - name: "Refactor Quality"
    description: "Code is clean after green phase"
    weight: 30

dependencies: []

compatible_with:
  agents: ["*"]  # All agents
  flows: ["code-review-pipeline", "feature-development"]
```

### Skill Library Structure

```
Blueprints/
├── Agents/           # Agent definitions
├── Flows/            # Multi-agent workflows
└── Skills/           # NEW: Skill definitions
    ├── README.md
    ├── schemas/
    │   └── skill.schema.json
    ├── methodologies/
    │   ├── tdd-methodology.skill.yaml
    │   ├── security-first.skill.yaml
    │   └── documentation-driven.skill.yaml
    ├── domain/
    │   ├── exoframe-conventions.skill.yaml
    │   ├── typescript-patterns.skill.yaml
    │   └── deno-best-practices.skill.yaml
    ├── workflows/
    │   ├── code-review-checklist.skill.yaml
    │   ├── pr-description.skill.yaml
    │   └── commit-message.skill.yaml
    └── quality/
        ├── owasp-security.skill.yaml
        ├── performance-audit.skill.yaml
        └── accessibility-check.skill.yaml
```

### Skill Router

```typescript
// src/services/skill_router.ts

interface SkillMatch {
  skillId: string;
  confidence: number;
  matchedTriggers: string[];
}

class SkillRouter {
  /**
   * Analyze request and return matching skills
   */
  async matchSkills(request: ParsedRequest): Promise<SkillMatch[]> {
    const matches: SkillMatch[] = [];

    for (const skill of this.skills) {
      const confidence = this.calculateMatch(skill, request);
      if (confidence > this.threshold) {
        matches.push({
          skillId: skill.id,
          confidence,
          matchedTriggers: this.getMatchedTriggers(skill, request)
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Build combined instruction context from skills
   */
  buildSkillContext(skills: Skill[]): string {
    return skills.map(s => `## Skill: ${s.name}\n\n${s.instructions}`).join('\n\n---\n\n');
  }
}
```

### Integration with AgentRunner

```typescript
// Enhanced agent execution with skills
class AgentRunner {
  async run(blueprint: Blueprint, request: ParsedRequest): Promise<AgentExecutionResult> {
    // 1. Match relevant skills
    const matchedSkills = await this.skillRouter.matchSkills(request);

    // 2. Load skill definitions
    const skills = await Promise.all(
      matchedSkills.map(m => this.skillLoader.load(m.skillId))
    );

    // 3. Build skill context
    const skillContext = this.skillRouter.buildSkillContext(skills);

    // 4. Inject skills into prompt
    const enhancedPrompt = this.constructPromptWithSkills(
      blueprint,
      request,
      skillContext
    );

    // 5. Execute with skill-enhanced prompt
    const result = await this.modelProvider.generate(enhancedPrompt);

    // 6. Validate against skill quality criteria
    if (this.config.validateSkillCriteria) {
      await this.validateAgainstSkillCriteria(result, skills);
    }

    return this.parseResponse(result);
  }
}
```

### Flow Integration

```typescript
// Flows can specify skills per step
const codeReviewFlow = defineFlow({
  id: "code-review-with-skills",
  steps: [
    {
      agent: "analyzer",
      skills: ["security-first", "performance-audit"],  // NEW
      task: "Analyze changes for issues"
    },
    {
      agent: "reviewer",
      skills: ["code-review-checklist", "exoframe-conventions"],
      task: "Review code quality"
    },
    {
      agent: "judge",
      skills: ["quality-gate"],
      task: "Final verdict"
    }
  ]
});
```

---

## Implementation Plan

### Phase 17.1: Skill Schema & Loader (2 days)

**Goal:** Define skill format and implement loading/validation.

**Tasks:**
1. Create Zod schema for skill definition
2. Implement `SkillLoader` service
3. Add YAML parsing for `.skill.yaml` files
4. Create skill validation CLI command
5. Write foundational tests

**Success Criteria:**
- [ ] `SkillSchema` validates skill structure
- [ ] `SkillLoader.load(skillId)` returns typed Skill
- [ ] Invalid skills produce clear error messages
- [ ] `exoctl skill validate <id>` command works

### Phase 17.2: Skill Router (2 days)

**Goal:** Automatic skill matching based on request analysis.

**Tasks:**
1. Implement trigger matching algorithms
   - Keyword matching (fuzzy)
   - Task type classification
   - File pattern matching
2. Create confidence scoring system
3. Add skill composition (combine multiple skills)
4. Implement conflict resolution (overlapping skills)

**Success Criteria:**
- [ ] Router matches skills with >80% accuracy on test set
- [ ] Confidence scores reflect match quality
- [ ] Multiple skills can be composed
- [ ] Conflicts handled gracefully

### Phase 17.3: AgentRunner Integration (2 days)

**Goal:** Inject skills into agent execution pipeline.

**Tasks:**
1. Add skill injection to `constructPrompt()`
2. Update `AgentRunnerConfig` with skill options
3. Add skill metadata to execution logs
4. Implement skill context budgeting (token limits)

**Success Criteria:**
- [ ] Skills appear in agent prompts
- [ ] Activity logs include matched skills
- [ ] Token budget respects skill context size
- [ ] Backward compatible (no skills = current behavior)

### Phase 17.4: Flow Integration (2 days)

**Goal:** Allow flows to specify skills per step.

**Tasks:**
1. Extend `FlowStepSchema` with `skills` field
2. Update `FlowRunner` to inject skills per step
3. Add skill validation during flow validation
4. Support skill inheritance (flow-level defaults)

**Success Criteria:**
- [ ] Flow steps can specify skill arrays
- [ ] Skills inject correctly per step
- [ ] Invalid skill references caught at validation
- [ ] Flow-level skill defaults work

### Phase 17.5: Core Skill Library (3 days)

**Goal:** Create initial set of production-ready skills.

**Skills to Create:**

| Skill | Category | Purpose |
|-------|----------|---------|
| `tdd-methodology` | Methodology | Test-driven development workflow |
| `security-first` | Methodology | Security-conscious development |
| `exoframe-conventions` | Domain | ExoFrame-specific patterns |
| `typescript-patterns` | Domain | TypeScript best practices |
| `code-review-checklist` | Workflow | Comprehensive review criteria |
| `commit-message` | Workflow | Conventional commit format |
| `owasp-security` | Quality | OWASP Top 10 checks |
| `documentation-driven` | Methodology | Docs-first approach |

**Success Criteria:**
- [ ] 8+ skills created and validated
- [ ] Each skill has tests for trigger matching
- [ ] Skills are documented in README
- [ ] Example usage for each skill

### Phase 17.6: Blueprint Skill Defaults (1 day)

**Goal:** Allow blueprints to specify default skills.

**Tasks:**
1. Add `default_skills` to Blueprint frontmatter
2. Merge blueprint defaults with request-matched skills
3. Add skill override capability (`skip_skills`)
4. Document in Blueprint README

**Example:**
```yaml
---
agent_id: "secure-developer"
name: "Security-Focused Developer"
default_skills: ["security-first", "owasp-security"]
capabilities: ["read_file", "write_file"]
---
```

**Success Criteria:**
- [ ] Blueprint frontmatter supports `default_skills`
- [ ] Defaults merge with request-matched skills
- [ ] Can skip specific skills via request
- [ ] Documentation updated

### Phase 17.7: Skill Testing Framework (2 days)

**Goal:** Enable testing skill effectiveness.

**Tasks:**
1. Create skill test harness
2. Implement skill evaluation metrics
3. Add A/B testing support (with skill vs without)
4. Create skill effectiveness dashboard data

**Success Criteria:**
- [ ] Can run skill effectiveness tests
- [ ] Metrics captured: task success, quality scores
- [ ] A/B comparison available
- [ ] Results stored for analysis

### Phase 17.8: Request-Level Skill Override (1 day)

**Goal:** Allow requests to specify/override skills.

**Request Format:**
```yaml
---
agent: code-reviewer
skills: ["security-first", "performance-audit"]
skip_skills: ["tdd-methodology"]  # Don't apply even if matched
---

Review this authentication module for production readiness.
```

**Success Criteria:**
- [ ] Request frontmatter supports `skills` field
- [ ] Request frontmatter supports `skip_skills` field
- [ ] Manual skills override auto-matched
- [ ] Documentation updated

---

## Skill Definition Best Practices

### Writing Effective Skills

1. **Be Specific, Not Generic**
   ```yaml
   # ❌ Too vague
   instructions: "Write good code"

   # ✅ Specific and actionable
   instructions: |
     1. Check null/undefined handling
     2. Validate input boundaries
     3. Use TypeScript strict mode
   ```

2. **Include Examples**
   ```yaml
   instructions: |
     ## Example

     When reviewing error handling:
     ```typescript
     // ❌ Bad
     catch (e) { console.log(e) }

     // ✅ Good
     catch (error) {
       logger.error("Operation failed", { error, context });
       throw new AppError("OPERATION_FAILED", error);
     }
     ```
   ```

3. **Define Clear Triggers**
   ```yaml
   triggers:
     - keywords: ["security", "auth", "password", "token", "encryption"]
     - task_types: ["security-review", "audit"]
     - file_patterns: ["**/auth/**", "**/security/**"]
   ```

4. **Set Quality Criteria**
   ```yaml
   quality_criteria:
     - name: "Vulnerability Check"
       description: "All OWASP Top 10 categories reviewed"
       weight: 50
     - name: "Remediation Quality"
       description: "Fixes are complete and correct"
       weight: 50
   ```

---

## Migration & Compatibility

### Backward Compatibility

- Agents without skills = current behavior
- Flows without skills = current behavior
- Skills are opt-in enhancement

### Migration Path

1. **Phase A:** Skills available but optional
2. **Phase B:** Auto-matching enabled by default
3. **Phase C:** Core skills pre-loaded for all ExoFrame tasks

### Configuration

```toml
# exo.config.toml
[skills]
enabled = true
auto_match = true
max_skills_per_request = 5
skill_context_budget = 2000  # tokens
```

---

## Success Metrics

1. **Adoption Rate:** % of requests using skills
   - Target: >50% after 30 days

2. **Task Quality Improvement:** A/B test skill vs no-skill
   - Target: >20% improvement in quality scores

3. **Skill Reuse:** Average uses per skill
   - Target: >10 uses per skill per week

4. **Developer Satisfaction:** Skill usefulness rating
   - Target: >4.0/5.0 average rating

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Token budget exceeded | Medium | Medium | Skill context budgeting, truncation |
| Skill conflicts | Low | Medium | Conflict resolution algorithm |
| Performance regression | Medium | Low | Async skill loading, caching |
| Skill drift (outdated) | Medium | Medium | Version control, deprecation |

---

## Related Documents

- [Phase 15: Flow Orchestration Improvements](./phase-15-flow-orchestration-improvements.md)
- [Phase 16: Agent Orchestration Improvements](./phase-16-agent-orchestration-improvements.md)
- [Review-Research-Improvement Pattern](../process/review-research-improvement.md)
- [Anthropic: Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)

---

## Appendix A: Example Skills

### tdd-methodology.skill.yaml

```yaml
skill_id: "tdd-methodology"
name: "Test-Driven Development"
version: "1.0.0"

triggers:
  - keywords: ["implement", "feature", "add", "create", "fix", "bugfix"]
  - task_types: ["feature", "bugfix", "refactor"]

instructions: |
  ## Test-Driven Development Workflow

  You MUST follow the Red-Green-Refactor cycle:

  ### 1. Red Phase (Write Failing Test)
  - Write a test that describes expected behavior
  - Run test to confirm it fails
  - Test name should describe the behavior, not implementation

  ### 2. Green Phase (Make It Pass)
  - Write ONLY enough code to pass the test
  - No additional features or optimizations
  - Focus on correctness, not elegance

  ### 3. Refactor Phase (Clean Up)
  - Improve code structure while tests pass
  - Extract helpers, reduce duplication
  - Run tests after each change

  ## Key Rules
  - Never write production code without a failing test
  - One logical assertion per test
  - Test behavior, not implementation details

constraints:
  - "Test file must be created/modified before implementation"
  - "All tests must pass before marking complete"
  - "No skipped or commented-out tests"

quality_criteria:
  - name: "Test-First Compliance"
    weight: 40
  - name: "Test Coverage"
    weight: 30
  - name: "Test Quality"
    weight: 30
```

### exoframe-conventions.skill.yaml

```yaml
skill_id: "exoframe-conventions"
name: "ExoFrame Project Conventions"
version: "1.0.0"

triggers:
  - keywords: ["exoframe", "test", "service", "helper"]
  - file_patterns: ["src/**", "tests/**"]

instructions: |
  ## ExoFrame Conventions

  ### Test Helpers
  - Use `initTestDbService()` for database tests
  - Use `createMockConfig()` for config mocking
  - Use test context helpers: `ToolRegistryTestHelper`, `GitTestHelper`
  - Always clean up in `finally` blocks

  ### Service Pattern
  - Constructor takes config and dependencies
  - Methods return typed results
  - Use EventLogger for activity tracking
  - Include traceId in all operations

  ### File Organization
  - Services in `src/services/`
  - Tests mirror source structure in `tests/`
  - Schemas in `src/schemas/`
  - Use barrel exports from `mod.ts`

  ### Error Handling
  - Create specific error classes extending Error
  - Include context in error messages
  - Log errors with EventLogger before throwing

  ### Commands
  - Run tests: `deno test`
  - Type check: `deno check src/ tests/`
  - Format: `deno fmt`
  - Lint: `deno lint`

constraints:
  - "Use Deno APIs, not Node.js"
  - "Follow existing patterns in codebase"
  - "Include traceId in all service methods"

compatible_with:
  agents: ["*"]
```

---

## Appendix B: Skill Schema (Zod)

```typescript
// src/schemas/skill_schema.ts

import { z } from "zod";

export const SkillTriggerSchema = z.object({
  keywords: z.array(z.string()).optional(),
  task_types: z.array(z.string()).optional(),
  file_patterns: z.array(z.string()).optional(),
  custom: z.record(z.unknown()).optional(),
});

export const QualityCriterionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  weight: z.number().min(0).max(100),
});

export const SkillSchema = z.object({
  skill_id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().optional(),

  triggers: z.array(SkillTriggerSchema).min(1),
  instructions: z.string().min(10),

  constraints: z.array(z.string()).optional(),
  output_requirements: z.array(z.string()).optional(),
  quality_criteria: z.array(QualityCriterionSchema).optional(),

  dependencies: z.array(z.string()).optional(),
  compatible_with: z.object({
    agents: z.array(z.string()).optional(),
    flows: z.array(z.string()).optional(),
  }).optional(),
});

export type Skill = z.infer<typeof SkillSchema>;
```
