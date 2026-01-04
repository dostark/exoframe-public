# Phase 17: Anthropic-Style Skills Architecture

**Created:** 2026-01-04
**Status:** Planning
**Priority:** High
**Estimated Duration:** 2-3 weeks
**Parent Phase:** [Phase 12.5: Memory Banks Enhanced](./phase-12.5-memory-bank-enhanced.md)

---

## Executive Summary

This plan introduces **Skills** as a specialized type of **Procedural Memory** within
ExoFrame's Memory Bank system. Skills encode domain expertise, procedures, and best
practices as reusable instruction modules that agents can apply automatically.

**Key Insight from Anthropic's Approach:**
> "Turn your expertise, procedures, and best practices into reusable capabilities
> so Claude can apply them automatically, every time."

### Why Skills Belong in Memory

Skills are fundamentally **procedural memory** - "how to do things." Integrating
with the Memory Bank system provides:

| Benefit | Description |
|---------|-------------|
| **Unified Storage** | Skills live in `Memory/Skills/` alongside other memory types |
| **Semantic Search** | Leverage existing Memory Bank search infrastructure |
| **Learning Integration** | Skills can evolve from execution learnings |
| **Approval Workflow** | Reuse pending → approved pattern from learnings |
| **CLI Integration** | `exoctl memory skill` commands fit existing UX |

### Memory Type Hierarchy

```
Memory/
├── Projects/{portal}/     # Declarative: project facts, decisions
├── Execution/{trace-id}/  # Episodic: what happened
├── Global/                # Cross-project learnings
└── Skills/                # NEW: Procedural memory (how to do things)
    ├── core/              # Built-in skills (tdd, security, etc.)
    ├── project/           # Project-specific skills
    └── learned/           # Skills derived from executions
```

Skills bridge the gap between:
- **Capabilities** (what tools an agent CAN use)
- **Blueprints** (agent persona and identity)
- **Task Requirements** (what needs to be done)
- **Learnings** (what we've discovered works)

---

## Concept Definition

### What is a Skill?

A **Skill** is a specialized Memory entry containing procedural knowledge:

1. **Trigger Conditions** - When this skill should be activated
2. **Instructions** - Procedural knowledge for the task type
3. **Constraints** - Boundaries and requirements
4. **Output Format** - Expected deliverable structure
5. **Quality Criteria** - How to evaluate success

### Memory Type Comparison

| Aspect | Learning | Pattern | Skill |
|--------|----------|---------|-------|
| **Memory Type** | Episodic | Declarative | Procedural |
| **Answers** | "What happened?" | "What exists?" | "How to do it?" |
| **Example** | "TDD reduced bugs by 40%" | "Repository Pattern" | "TDD Methodology" |
| **Scope** | Global/Project | Project | Global/Project |
| **Source** | Execution/User | User/Agent | User/Agent/Learned |
| **Evolution** | Static after approval | Updated manually | Can improve over time |

### Skill vs Capability vs Blueprint

| Aspect | Capability | Skill | Blueprint |
|--------|------------|-------|-----------|
| **Purpose** | Tool permissions | Procedural knowledge | Agent identity |
| **Answers** | "What can I use?" | "How should I work?" | "Who am I?" |
| **Example** | `read_file`, `git_commit` | `tdd-methodology`, `security-audit` | `code-reviewer` |
| **Granularity** | Atomic tool | Composable procedure | Complete persona |
| **Reusability** | Across all agents | Across related tasks | Single agent |
| **Runtime** | Permission check | Context injection | System prompt |
| **Storage** | Blueprint frontmatter | Memory/Skills/ | Blueprints/Agents/ |

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

### Existing Memory Mechanisms

| Mechanism | Location | Purpose | Limitation |
|-----------|----------|---------|------------|
| **Learnings** | `Memory/Global/` | Insights from executions | Descriptive, not prescriptive |
| **Patterns** | `Memory/Projects/*/patterns.md` | Code patterns found | Static, no triggers |
| **Decisions** | `Memory/Projects/*/decisions.md` | Architectural choices | Historical, not actionable |
| **agents/ docs** | `agents/` folder | Human guidance | Not runtime-consumable |

### Gap Analysis

1. **No procedural memory type** - Learnings are observations, not instructions
2. **No trigger-based retrieval** - Memory search is semantic, not task-aware
3. **No skill composition** - Can't combine multiple procedures
4. **No learning-to-skill pipeline** - Can't evolve learnings into skills
5. **Scattered procedural knowledge** - In docs, prompts, templates (not Memory)

### Integration Opportunity

The Memory Bank already has:
- ✅ Semantic search (`searchByKeyword`, `searchByTags`)
- ✅ Approval workflow (`pending` → `approved`)
- ✅ Scoping (`global` vs `project`)
- ✅ CLI interface (`exoctl memory`)
- ✅ Activity logging integration

Skills can reuse all of this infrastructure!

---

## Architecture Design

### Skills as Memory Extension

Skills extend the existing Memory Bank schema:

```typescript
// src/schemas/memory_bank.ts (extended)

/**
 * Skill - Procedural memory for how to accomplish tasks
 *
 * Unlike Learnings (observations) or Patterns (structures),
 * Skills are actionable instructions that agents apply.
 */
export const SkillSchema = z.object({
  // === Memory Bank Standard Fields ===
  id: z.string().uuid(),
  created_at: z.string().datetime(),
  source: z.enum(["user", "agent", "learned"]),  // "learned" = derived from executions
  source_id: z.string().optional(),

  scope: z.enum(["global", "project"]),
  project: z.string().optional(),

  status: z.enum(["draft", "active", "deprecated"]),

  // === Skill-Specific Fields ===
  skill_id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string(),

  // Trigger conditions for automatic matching
  triggers: z.object({
    keywords: z.array(z.string()).optional(),
    task_types: z.array(z.string()).optional(),
    file_patterns: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),

  // The procedural knowledge itself
  instructions: z.string().min(10),

  // Constraints and quality criteria
  constraints: z.array(z.string()).optional(),
  output_requirements: z.array(z.string()).optional(),
  quality_criteria: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    weight: z.number().min(0).max(100),
  })).optional(),

  // Compatibility
  compatible_with: z.object({
    agents: z.array(z.string()).default(["*"]),
    flows: z.array(z.string()).optional(),
  }).optional(),

  // Evolution tracking
  derived_from: z.array(z.string()).optional(),  // Learning IDs this skill came from
  effectiveness_score: z.number().min(0).max(100).optional(),
  usage_count: z.number().default(0),
});
```

### Storage Structure

```
Memory/
├── Projects/{portal}/
├── Execution/{trace-id}/
├── Global/
│   ├── learnings.json
│   └── index.json
└── Skills/                    # NEW
    ├── index.json             # Skill registry with triggers
    ├── core/                  # Built-in skills (shipped with ExoFrame)
    │   ├── tdd-methodology.skill.md
    │   ├── security-first.skill.md
    │   └── code-review.skill.md
    ├── project/{portal}/      # Project-specific skills
    │   └── {skill-id}.skill.md
    └── learned/               # Auto-derived from learnings
        └── {skill-id}.skill.md
```

### Skill File Format (Markdown with Frontmatter)

```markdown
<!-- Memory/Skills/core/tdd-methodology.skill.md -->
---
skill_id: "tdd-methodology"
name: "Test-Driven Development Methodology"
version: "1.0.0"
scope: "global"
status: "active"
source: "user"

triggers:
  keywords: ["implement", "feature", "add", "create", "build"]
  task_types: ["feature", "bugfix", "refactor"]
  file_patterns: ["*.ts", "*.js", "*.py"]
  tags: ["development", "testing"]

constraints:
  - "Never write implementation before tests"
  - "Run tests after each change"

quality_criteria:
  - name: "Test Coverage"
    weight: 40
  - name: "Test-First Evidence"
    weight: 30
  - name: "Refactor Quality"
    weight: 30

compatible_with:
  agents: ["*"]
---

# TDD Methodology

You MUST follow Test-Driven Development:

## 1. Red Phase (Write Failing Test)
- Write a test that describes expected behavior
- Run test to confirm it fails
- Test name should describe the behavior, not implementation

## 2. Green Phase (Make It Pass)
- Write ONLY enough code to pass the test
- No additional features or optimizations
- Focus on correctness, not elegance

## 3. Refactor Phase (Clean Up)
- Improve code structure while tests pass
- Extract helpers, reduce duplication
- Run tests after each change

## Key Rules
- Never write production code without a failing test
- One logical assertion per test
- Test behavior, not implementation details
```

### MemoryBankService Extension

```typescript
// src/services/memory_bank.ts (extended)

export class MemoryBankService {
  // ... existing methods ...

  // ===== Skill Operations =====

  /**
   * Get skill by ID
   */
  async getSkill(skillId: string): Promise<Skill | null> {
    // Check core skills first
    const corePath = join(this.skillsDir, "core", `${skillId}.skill.md`);
    if (await exists(corePath)) {
      return this.loadSkillFile(corePath);
    }

    // Check learned skills
    const learnedPath = join(this.skillsDir, "learned", `${skillId}.skill.md`);
    if (await exists(learnedPath)) {
      return this.loadSkillFile(learnedPath);
    }

    return null;
  }

  /**
   * Search skills by triggers
   */
  async matchSkills(request: {
    keywords?: string[];
    taskType?: string;
    filePaths?: string[];
    tags?: string[];
  }): Promise<SkillMatch[]> {
    const index = await this.loadSkillIndex();
    const matches: SkillMatch[] = [];

    for (const entry of index.skills) {
      const score = this.calculateTriggerMatch(entry.triggers, request);
      if (score > 0.3) {  // Confidence threshold
        matches.push({
          skillId: entry.skill_id,
          confidence: score,
          matchedTriggers: this.getMatchedTriggers(entry.triggers, request),
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Create skill from learnings
   */
  async deriveSkillFromLearnings(
    learningIds: string[],
    skillDraft: Partial<Skill>
  ): Promise<Skill> {
    const learnings = await Promise.all(
      learningIds.map(id => this.getLearning(id))
    );

    // Create skill with derived_from reference
    const skill: Skill = {
      ...skillDraft,
      id: crypto.randomUUID(),
      source: "learned",
      derived_from: learningIds,
      status: "draft",  // Requires approval
    } as Skill;

    await this.saveSkill(skill, "learned");
    return skill;
  }

  /**
   * Build skill context for agent injection
   */
  async buildSkillContext(skillIds: string[]): Promise<string> {
    const skills = await Promise.all(
      skillIds.map(id => this.getSkill(id))
    );

    return skills
      .filter(Boolean)
      .map(s => `## Skill: ${s!.name}\n\n${s!.instructions}`)
      .join('\n\n---\n\n');
  }
}
```

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

### Phase 17.1: Memory Bank Skill Schema (2 days)

**Goal:** Extend Memory Bank schema with Skill type.

**Tasks:**
1. Add `SkillSchema` to `src/schemas/memory_bank.ts`
2. Create `Memory/Skills/` directory structure
3. Add skill index schema (`Memory/Skills/index.json`)
4. Create skill file parser (markdown + frontmatter)
5. Write schema validation tests

**Success Criteria:**
- [ ] `SkillSchema` validates skill structure
- [ ] Skills stored in `Memory/Skills/` alongside other memory
- [ ] Skill index maintains trigger lookup data
- [ ] Tests cover schema validation edge cases

### Phase 17.2: MemoryBankService Skill Operations (2 days)

**Goal:** Add skill CRUD operations to MemoryBankService.

**Tasks:**
1. Implement `getSkill(skillId)` method
2. Implement `listSkills(filters)` method
3. Implement `createSkill(skill)` method
4. Implement `updateSkill(skillId, updates)` method
5. Add skill index rebuild on changes

**Success Criteria:**
- [ ] All CRUD operations work with Activity logging
- [ ] Skill index stays synchronized
- [ ] Tests cover all operations
- [ ] Backward compatible (no breaking changes)

### Phase 17.3: Skill Trigger Matching (2 days)

**Goal:** Implement trigger-based skill retrieval.

**Tasks:**
1. Implement `matchSkills(request)` in MemoryBankService
2. Add keyword matching (exact + fuzzy)
3. Add task type classification
4. Add file pattern matching (glob)
5. Add tag-based matching
6. Create confidence scoring algorithm

**Success Criteria:**
- [ ] `matchSkills()` returns ranked skill matches
- [ ] Confidence scores reflect match quality
- [ ] Multiple trigger types compose correctly
- [ ] Performance acceptable (<100ms for 100 skills)

### Phase 17.4: AgentRunner Integration (2 days)

**Goal:** Inject skills into agent execution pipeline.

**Tasks:**
1. Add `memoryBank.buildSkillContext()` call to `constructPrompt()`
2. Update `AgentRunnerConfig` with skill options
3. Add skill metadata to execution logs
4. Implement skill context budgeting (token limits)

**Success Criteria:**
- [ ] Skills appear in agent prompts
- [ ] Activity logs include matched skills
- [ ] Token budget respects skill context size
- [ ] Backward compatible (no skills = current behavior)

### Phase 17.5: Flow Integration (2 days)

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

### Phase 17.6: CLI Integration (1 day)

**Goal:** Add skill management to `exoctl memory` command tree.

**Commands:**
```bash
exoctl memory skill list                    # List all skills
exoctl memory skill show <skill-id>         # Show skill details
exoctl memory skill create <skill-id>       # Create new skill
exoctl memory skill validate <skill-id>     # Validate skill
exoctl memory skill match "<request>"       # Test trigger matching
exoctl memory skill derive <learning-ids>   # Derive skill from learnings
```

**Success Criteria:**
- [ ] All commands implemented and tested
- [ ] Help text for each command
- [ ] Output formatting consistent with other memory commands

### Phase 17.7: Core Skill Library (3 days)

**Goal:** Create initial set of production-ready skills in `Memory/Skills/core/`.

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
- [ ] 8+ skills created in `Memory/Skills/core/`
- [ ] Each skill has tests for trigger matching
- [ ] Skills are documented in README
- [ ] Example usage for each skill

### Phase 17.8: Learning-to-Skill Pipeline (2 days)

**Goal:** Enable deriving skills from accumulated learnings.

**Tasks:**
1. Implement `deriveSkillFromLearnings()` in MemoryBankService
2. Create skill suggestion algorithm (cluster related learnings)
3. Add CLI command for skill derivation
4. Create draft → active approval workflow

**Success Criteria:**
- [ ] Can create skill draft from learning IDs
- [ ] Derived skills reference source learnings
- [ ] Approval workflow matches learning workflow
- [ ] Tests cover derivation logic

### Phase 17.9: Blueprint Skill Defaults (1 day)

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

- [Phase 12.5: Memory Banks Enhanced](./phase-12.5-memory-bank-enhanced.md) - Parent memory architecture
- [Phase 15: Flow Orchestration Improvements](./phase-15-flow-orchestration-improvements.md)
- [Phase 16: Agent Orchestration Improvements](./phase-16-agent-orchestration-improvements.md)
- [Review-Research-Improvement Pattern](../process/review-research-improvement.md)
- [Anthropic: Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)

---

## Appendix A: Learning-to-Skill Evolution

### How Learnings Become Skills

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Learning → Skill Pipeline                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Executions ──────▶ Learnings ──────▶ Clusters ──────▶ Skills           │
│       │                 │                 │               │              │
│       ▼                 ▼                 ▼               ▼              │
│  "TDD reduced      [Learning 1]     Related          Draft skill        │
│   bugs by 40%"     [Learning 2]     learnings        with triggers,     │
│                    [Learning 3]     grouped          instructions       │
│                                                                          │
│                                           │                              │
│                                           ▼                              │
│                                     User Approval                        │
│                                           │                              │
│                                           ▼                              │
│                                     Active Skill                         │
│                                   Memory/Skills/learned/                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Example: Deriving a Skill

```bash
# 1. User notices pattern in learnings
$ exoctl memory learning list --tags=testing
ID         Title                           Category
─────────────────────────────────────────────────────
abc-123    TDD reduced bugs in auth module  pattern
def-456    Test-first caught edge case      insight
ghi-789    Refactoring safe with tests      insight

# 2. Derive skill from learnings
$ exoctl memory skill derive abc-123 def-456 ghi-789 \
    --name "TDD Methodology" \
    --triggers.keywords "implement,feature,add"

Created draft skill: tdd-methodology (status: draft)
Source learnings: abc-123, def-456, ghi-789

# 3. Review and activate
$ exoctl memory skill show tdd-methodology
$ exoctl memory skill activate tdd-methodology

Skill activated: tdd-methodology
```

---

## Appendix B: Example Skills

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
