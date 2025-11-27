# Building with AI Agents: A Field Guide from the ExoFrame Trenches

_How I learned to stop worrying and love the TDD loop with an AI pair programmer_

## The Grand Experiment

This document chronicles the real-world experience of building ExoFrame—a meta-framework for AI agents to collaborate on software projects—while using AI agents to build it. Yes, the irony is delicious. Think of it as "eating our own dog food before the kitchen is even built."

What started as a design document review turned into a months-long dance of human intent meeting machine precision, with all the stumbles, surprises, and small victories that entails.

## Part I: The Design Review Dance

### The Opening Move: "What do you think?"

**The Setup**: I had three hefty design documents—a white paper, technical spec, and implementation plan—representing weeks of thinking about how autonomous agents should work together on real codebases.

**The Pattern**: Instead of asking the AI to _build_ anything, I started with:

> "Review these design documents. Tell me what's wrong."

**Why This Works**:

- AI agents are surprisingly good at spotting logical inconsistencies when they have context
- You get feedback without committing code
- The agent becomes familiar with your mental model before typing a single line

**What Happened**:
The agent caught things like:

- Missing error handling strategies
- Unclear boundaries between components
- Ambiguous success criteria in the implementation plan

**The Lesson**: Treat the AI like a skeptical senior engineer doing a design review. Don't defend your ideas—let them poke holes. Fix the holes _before_ writing code.

### The Identity Crisis: "Wait, who's making commits?"

**The Conversation**:

```
Me: "I believe that agentId should also be tracked in the event record."
Agent: [searches codebase, finds gaps]
Agent: "You're right. Currently only trace_id is logged. Adding agent_id..."
```

**Why This Matters**:
This wasn't in the original spec. It emerged from asking "what's missing?" after the design phase. The activity journal was tracking _what_ happened but not clearly _who_ did it.

**The Pattern**: Design documents are never complete. Keep asking:

- "What would make debugging easier?"
- "How would I audit this system?"
- "What context would Future Me need?"

**The Result**: Every log entry now carries both `trace_id` (what request) and `agent_id` (which agent), making the activity journal actually useful for debugging multi-agent chaos.

## Part II: The TDD Liturgy

### The Revelation: "Write tests first (no really, this time)"

**The Turning Point**:

```
Me: "Proceed with implementation of step 4.1 of Implementation Plan in TDD manner."
Agent: [writes 14 comprehensive tests]
Agent: [implements ToolRegistry to make tests pass]
Result: All tests green on first full run.
```

**Before TDD**:

- Implementation would drift from spec
- Edge cases discovered in production (or never)
- Refactoring felt like defusing a bomb blindfolded

**After TDD**:

- Tests became the real specification
- Implementation was just "make the red text green"
- Refactoring became boring (in a good way)

**The TDD Pattern with AI**:

1. **You**: "Implement X in TDD manner"
2. **Agent**: Writes comprehensive test suite covering:
   - Happy path (the thing works)
   - Sad path (graceful failures)
   - Security boundaries (path traversal, command injection)
   - Edge cases (empty inputs, duplicates, race conditions)
3. **Agent**: Implements feature to pass tests
4. **You**: Review tests (easier than reviewing implementation!)
5. **Agent**: Fixes issues
6. **Everyone**: Ships with confidence

**Why This Works With AI**:

- AI agents are _excellent_ at writing exhaustive test cases when prompted
- Test code is easier to review than implementation code
- Tests serve as executable documentation
- You catch misunderstandings before they're carved in code

### The Liturgy in Practice: GitService

**The Request**: "Proceed with step 4.2 of Implementation Plan in TDD"

**What The Agent Did**:

1. Read Implementation Plan section 4.2
2. Created 11 test cases covering:
   - Auto-initialize git repos
   - Auto-configure bot identity
   - Branch naming: `feat/{requestId}-{traceId}`
   - Handle duplicate branches (append timestamp)
   - Commit format with `[ExoTrace: {id}]` footer
   - Reject empty commits
   - Activity logging for all git operations
   - Error handling for git command failures
   - Works with existing repos

3. Implemented GitService with:
   - `ensureRepository()`
   - `ensureIdentity()`
   - `createBranch()`
   - `commit()`
   - All operations logged to Activity Journal

4. First test run: 2 failures
   - Identity check was reading global config instead of local
   - Error message didn't match test expectation

5. Fixed both issues

6. Final result: 10/10 tests passing, integrated with 97 existing tests

**Time Investment**: ~15 minutes of iteration

**Traditional Approach Estimate**: 2-3 hours of implementation, debugging, and testing

### The Anti-Pattern: "Just build it"

**What Doesn't Work**:

```
Me: "Add git integration"
Agent: [writes 300 lines of code]
Me: [reviews code, spots issues]
Me: "Actually, can you handle this edge case?"
Agent: [refactors, breaks something else]
[Repeat 5-10 times]
```

**The Problem**:

- Specification was in your head
- Agent guessed at requirements
- Changes cascade unpredictably
- No safety net

**The Fix**: Always start with "in TDD manner"

## Part III: The Performance Tango

### The Non-Blocking Plot Twist

**The Setup**: Activity logging was happening synchronously on every operation.

**The Question**:

```
Me: "Why logging is non-blocking?"
Agent: "Looking at the code... it's actually blocking. Each logActivity()
        call is a synchronous SQLite write."
```

**The Honesty**: The agent didn't pretend. It looked, saw the truth, and admitted the code wasn't doing what the comments claimed.

**The Options Presented**:

1. Fire-and-forget (lose some logs on crash)
2. Batched writes with periodic flush
3. Separate worker thread

**The Decision**:

```
Me: "Go with option 2"
Agent: [implements batched log queue]
Agent: [makes batch settings configurable]
Agent: [updates all tests to account for async flushing]
```

**The Pattern**: When performance matters:

- Ask the agent to _measure_ first (don't assume)
- Have it present tradeoffs (not solutions)
- Make it configurable (don't hardcode)
- Update tests to match new behavior

**The Result**: 10-50x throughput improvement with configurable `batch_flush_ms` and `batch_max_size` settings.

### The Config Philosophy

**The Insight**: Every magic number should be a config option.

**What Got Configured**:

- Batch flush interval (default 100ms)
- Max batch size (default 100 entries)
- Watcher debounce timing
- File stability checks
- Token limits per context file

**The Request Pattern**:

```
Me: "Make batch timeouts 100 ms and 100 entries as default values
     of configuration options"
Agent: [updates schema.ts with validation]
Agent: [updates config sample files]
Agent: [updates tests with new config structure]
```

**Why This Works**: Future users can tune for their workload without touching code.

## Part IV: The Security Paranoia Phase

### The Trust Nobody Approach

**The Requirement**: PathResolver must prevent agents from escaping the workspace sandbox.

**The Test Suite** (Agent-Generated):

```typescript
// Happy path
PathResolver: resolves valid alias path ... ok

// Paranoid path
PathResolver: throws on path traversal attempt ... ok
PathResolver: throws on accessing file outside allowed roots ... ok
```

**The Implementation**: Canonical path resolution with strict boundary checking.

**What This Taught Me**:

- AI agents will write security tests if you ask
- The tests are thorough (path traversal, symlinks, parent directory escapes)
- Security is easier to verify with tests than code review

### The Command Whitelist

**The Requirement**: Agents can run commands, but not dangerous ones.

**The Pattern**:

```typescript
// Allowed
const SAFE_COMMANDS = [
  "echo",
  "git",
  "deno",
  "cat",
  "ls",
  "pwd",
  "node",
  "npm",
  "which",
  "whoami",
];

// Blocked at runtime
if (DANGEROUS_COMMANDS.some((bad) => command.includes(bad))) {
  throw new Error(`Dangerous command blocked: ${dangerous}`);
}
```

**The Test**:

```typescript
ToolRegistry: run_command - blocks dangerous commands ... ok
```

**The Lesson**: Whitelists beat blacklists. Let the AI propose the list, but you verify it's conservative enough.

## Part V: The Refactoring Revelations

### The Decorator Fiasco

**The Discovery**:

```
Me: "Are experimental decorators from tsconfig.json actually used
     anywhere in the code?"
Agent: [searches entire codebase]
Agent: "No. activity_logger.ts was created but never imported anywhere."
```

**The Cleanup**:

- Removed `activity_logger.ts` (unused @LogActivity decorator)
- Removed experimental decorator config from `deno.json`
- Simplified codebase

**The Pattern**: Periodically ask:

- "What code is never called?"
- "What config options are unused?"
- "What dependencies are imported but not needed?"

AI agents excel at searching for "zombie code" because they don't have emotional attachment to code they wrote last week.

### The False Positive Hunt

**The Situation**:

```
Me: "Address #get_errors"
Agent: [runs Deno type checker]
Agent: "No errors found. The VS Code language server is showing
        stale cache false positives."
```

**The Lesson**:

- Different tools report different "errors"
- Run the actual compiler/type checker
- VS Code's real-time checking can lag behind file system changes
- Trust `deno check` over IDE red squiggles

**The Action**: None needed. Agent verified with authoritative source.

## Part VI: The Patterns That Emerged

### Pattern 1: The Refinement Loop (Critical!)

**The Discovery**: Initial implementation steps are always too brief.

**The Pattern**:

```
Me: "Refine all steps of Phase 4 in the Implementation Plan"
Agent: [reads brief bullet points]
Agent: [expands each step with]:
  - Clear success criteria
  - Example inputs/outputs
  - Error cases to handle
  - Dependencies on other steps
  - Acceptance tests
```

**What Makes a Good Step Description**:

❌ **Too Brief** (what we started with):

```markdown
4.1 Tool Registry

- Map LLM function calls to Deno operations
- Provide read, write, list, search, run tools
```

✅ **Well-Refined** (what we ended with):

```markdown
4.1 Tool Registry

**Purpose**: Translate LLM function calls into safe Deno operations

**Success Criteria**:

- Register tools with JSON schemas (name, description, parameters)
- Implement 5 core tools: read_file, write_file, list_directory,
  search_files, run_command
- Validate all file paths through PathResolver (prevent traversal)
- Whitelist safe commands (block rm, dd, chmod, etc.)
- Log all tool executions to Activity Journal with trace_id
- Return structured results with success/error status

**Security Requirements**:

- All file operations must use PathResolver
- Command execution limited to whitelist
- No shell evaluation (use Deno.Command directly)

**Example**:
registry.execute("read_file",
{ path: "@blueprints/agent.md" })
→ { success: true, content: "..." }

**Tests Should Verify**:

- Tool registration with schemas
- Each tool's happy path
- Path traversal rejection
- Command whitelist enforcement
- Activity logging with agent_id
```

**The Refinement Trigger**: Before implementing _any_ phase, ask:

```
"Refine all steps in Phase X with success criteria, examples,
 error cases, and test requirements"
```

**Why This Works**:

- Forces you to think through edge cases up front
- Gives the AI a complete specification
- Tests practically write themselves
- Catches design flaws before coding
- Reduces back-and-forth iterations from ~10 to ~2

**The Rule**: If you can't write clear success criteria, you're not ready to implement.

### Pattern 2: Incremental Specificity (The Zoom Levels)

**Don't Start With**: "Build an AI agent framework"

**Start With**:

1. "Review this design doc" (zoom: 30,000 feet)
2. "Refine Phase 4 steps" (zoom: 10,000 feet)
3. "Add human-in-the-loop to step 4.4" (zoom: 1,000 feet)
4. "Implement step 4.1 in TDD manner" (zoom: ground level)

**Why**: Each step builds context. The AI learns your domain incrementally.

### Pattern 3: The Walking Skeleton (Ship Early, Fill Later)

**The Philosophy**: Get something end-to-end working first, then add features.

**How This Played Out in ExoFrame**:

**Phase 1 - The Skeleton** (Week 1):

1. Basic config loading ✅
2. Database initialization ✅
3. Simple activity logging ✅
4. File watcher (without stability checks) ✅
5. Minimal request parser ✅

**Result**: Could drop a request file, see it detected, parsed, and logged. Zero intelligence, but the pipes worked.

**Phase 2 - Add Meat** (Week 2):

1. Watcher stability verification ✅
2. Batched activity logging ✅
3. Context card generation ✅
4. Path resolver with security ✅

**Phase 3 - Add Organs** (Week 3-4):

1. Tool Registry (safe operations) ✅
2. Git Integration (identity-aware) ✅
3. Execution Loop (in progress)
4. Human review workflow (pending)

**The Walking Skeleton Pattern**:

```
Traditional Approach:
[Complete Feature A] → [Complete Feature B] → [Complete Feature C]
Problem: Can't test integration until month 3

Walking Skeleton:
[Minimal A] → [Minimal B] → [Minimal C] → [Test E2E] → [Enhance A] → ...
Benefit: Integration tested from day 1
```

**How to Apply**:

**❌ Don't**: Build Tool Registry with all 50 planned tools perfectly

**✅ Do**:

1. Build registry with 1 tool (`read_file`)
2. Wire it to execution loop
3. Make one agent use one tool
4. Verify end-to-end
5. Add 4 more tools
6. Add security validation
7. Add activity logging

**The Test**: "Can I demo this to someone?" should be "yes" every week.

**Why This Works with AI**:

- AI is great at adding features to working code
- AI is terrible at debugging integration issues across incomplete systems
- Walking skeleton gives you continuous integration testing
- Each addition is isolated and testable

**ExoFrame Walking Skeleton Timeline**:

| Week | Skeleton Capability                | Demo-able? |
| ---- | ---------------------------------- | ---------- |
| 1    | File drops are detected and logged | ✅ Yes     |
| 2    | Context cards generated from files | ✅ Yes     |
| 3    | Tools execute safely in sandbox    | ✅ Yes     |
| 4    | Git commits with trace IDs         | ✅ Yes     |

**The Rule**: If you can't demo progress weekly, you're not walking—you're building in the dark.

### Pattern 4: The Question->Action Loop

**The Loop**:

1. You ask a question
2. Agent investigates (searches, reads, measures)
3. Agent explains what it found
4. You decide
5. Agent implements

**Example**:

```
Q: "Why is logging non-blocking?"
A: [investigates] "It's not. Here's why..."
Q: "Go with option 2"
A: [implements batched logging]
```

**Why This Works**:

- You stay in control of decisions
- Agent does the research and implementation
- No wasted work on wrong assumptions

### Pattern 5: Test-First Everything

**The Mantra**: "In TDD manner"

**What It Triggers**:

- Agent writes tests covering success criteria
- You review tests (faster than reviewing implementation)
- Agent implements to pass tests
- Refactoring is safe

**Success Rate**: Nearly 100% first-pass correctness when tests are comprehensive.

### Pattern 6: The Configuration Escape Hatch

**The Rule**: Every hardcoded value is a future regret.

**The Pattern**:

```
Me: "Make X configurable"
Agent: [updates schema with validation]
Agent: [updates all instantiation sites]
Agent: [updates test helpers]
Agent: [updates config samples]
```

**What Gets Configured**:

- Timeouts
- Batch sizes
- File paths
- Retry limits
- Token budgets

### Pattern 5: Parallel Investigation

**The Observation**: Agent can read multiple files simultaneously.

**The Pattern**:

```
Agent: [reads schema.ts, db.ts, config_test.ts in parallel]
Agent: "Found batching in db.ts but no config schema. Adding..."
```

**Why It Matters**: Faster context gathering = faster iteration.

### Pattern 7: The Safety Net

**Before Making Changes**:

```
Agent: [runs current test suite]
Status: 97 tests passing
Agent: [implements new feature]
Agent: [runs full suite again]
Status: 107 tests passing (97 old + 10 new)
```

**The Insurance**: You always know if changes broke existing functionality.

## Part VII: The Meta-Lessons

### On Human-AI Collaboration

**What Worked**:

- Treating the AI like a junior engineer with perfect memory and infinite patience
- Asking questions before giving orders
- Letting the AI propose options, human makes decisions
- TDD as shared specification language

**What Didn't Work**:

- Vague requests ("make it better")
- Assuming the AI remembered context from 50 messages ago
- Skipping tests to "move faster"

### On Building AI-Assisted Systems

**The Irony**: Building a framework for AI agents _with_ AI agents revealed:

- Agents need structured output formats (we built Activity Journal)
- Agents need safe tool access (we built ToolRegistry)
- Agents need identity tracking (we added agent_id)
- Humans need review checkpoints (we planned approval workflow)

**The Bootstrap Problem**: You can't fully test an agent framework without agents, but you can TDD the infrastructure they'll need.

### On Documentation

**What Lived**:

- Implementation Plan with clear success criteria
- Test files (executable documentation)
- Activity Journal (audit trail)

**What Died**:

- Comments explaining "why" (code changed, comments didn't)
- Architecture decision records (never updated)

**The Fix**: Keep documentation close to code. Tests are documentation.

### On Trust

**The Progression**:

1. Week 1: "Let me review every line"
2. Week 2: "Let me review the tests"
3. Week 4: "Just run the tests and tell me if they pass"

**The Trust Metric**: Not how smart the AI is, but how good the tests are.

## Part VIII: The Playbook

### For Your Next AI-Assisted Project

#### Phase 1: Design Review (Days 1-3)

1. **Write your design docs** (don't skip this)
   - White paper (the "why")
   - Technical spec (the "what")
   - Implementation plan (the "how")

2. **Agent review session**:
   ```
   You: "Review these three design documents. Tell me what's missing,
        what's ambiguous, and what could go wrong."
   Agent: [comprehensive critique]
   You: [fix issues]
   You: "Review again."
   ```

3. **Iterate until the agent has no more questions**

**Output**: Design docs that are clear enough for a machine to understand.

#### Phase 1.5: Refine Before Building (Critical Step!)

**Before implementing any phase**:

1. **Identify the next phase** from your Implementation Plan

2. **Request refinement**:
   ```
   You: "Refine all steps in Phase X with:
        - Clear success criteria
        - Example inputs/outputs
        - Error cases to handle
        - Test requirements"
   ```

3. **Agent expands each brief step** into a complete specification

4. **You review the refinement**:
   - Are success criteria measurable?
   - Are examples concrete?
   - Are error cases comprehensive?
   - Could someone implement from this alone?

5. **Iterate until each step is implementation-ready**

**Red Flags** (step needs more refinement):

- ❌ "Handle errors appropriately" (too vague)
- ❌ "Implement feature X" (no criteria)
- ❌ "Should be fast" (not measurable)

**Green Lights** (step is ready):

- ✅ "Reject commits with empty working tree, throw Error with message 'nothing to commit'"
- ✅ "Log all git operations to Activity Journal with action type 'git.*' and trace_id"
- ✅ "Branch naming format: feat/{requestId}-{first8charsOfTraceId}"

**The Refinement Checklist**:
For each step, can you answer:

- [ ] What exactly counts as "done"?
- [ ] What's a concrete example of valid input/output?
- [ ] What should happen when things go wrong?
- [ ] How will we test this automatically?
- [ ] What are the security implications?

**Time Investment**: 30-60 minutes of refinement saves 3-6 hours of implementation rework.

**The Rule**: Refinement is not optional. It's the difference between "build a feature" and "build the right feature correctly."

#### Phase 2: Walking Skeleton (Week 1)

**Goal**: End-to-end flow, minimal features

1. **Identify the critical path**:
   ```
   For ExoFrame:
   File drop → Parse → Log → Done
   (Skip: intelligence, tools, git, execution)
   ```

2. **Build the skeleton**:
   ```
   You: "Implement minimal working skeleton:
        - Config loading
        - Database init
        - File watcher (basic)
        - Request parser (no validation)
        - Activity logging (synchronous is fine)"
   ```

3. **Verify end-to-end**:
   ```
   You: "Drop a test file and show me the activity log"
   Agent: [demonstrates]
   ```

4. **Celebrate**: You have something demo-able on day 1

**Why Walking Skeleton First**:

- Integration issues surface immediately
- You can demo progress weekly
- Each feature addition is isolated
- AI debugs working systems better than broken ones

**The Test**: If you can't show a working (but minimal) system in week 1, you're over-engineering.

#### Phase 3: Test-Driven Implementation (Weeks 2-N)

**For Each Feature**:

1. **Ensure step is refined** (see Phase 1.5)

2. **Request TDD implementation**:
   ```
   You: "Implement step X.Y of Implementation Plan in TDD manner"
   ```

3. **Agent produces**:
   - Comprehensive test suite
   - Implementation that passes tests
   - Integration with existing tests

4. **You review**:
   - Read tests (easier than reading implementation)
   - Verify tests match your intent
   - Check security boundaries

5. **Iterate on tests, not implementation**:
   - "Add test for edge case X"
   - "Security test for path traversal"
   - Implementation follows automatically

6. **Run full test suite**:
   ```
   You: "Run all tests"
   Agent: [runs suite]
   Agent: "107 tests passing (97 old + 10 new)"
   ```

**The Rhythm**: Specify → Test → Implement → Verify → Repeat

#### Phase 3: Performance & Refinement

**When Something Feels Slow**:

1. **Question, don't accuse**:
   ```
   You: "Why is logging non-blocking?"
   Agent: [investigates, admits truth]
   Agent: [proposes options with tradeoffs]
   ```

2. **You decide, agent implements**

3. **Make it configurable**:
   ```
   You: "Make batch timing configurable with defaults X and Y"
   Agent: [updates schema, config, tests]
   ```

**When You Spot Code Smell**:

1. **Ask for search**:
   ```
   You: "Are experimental decorators actually used?"
   Agent: [searches codebase]
   Agent: "No, found unused file activity_logger.ts"
   ```

2. **Clean up**:
   ```
   You: "Remove it"
   Agent: [removes file, updates config, runs tests]
   ```

#### Phase 4: Integration & Safety

**Security Checklist**:

- [ ] Path traversal tests exist
- [ ] Command whitelist is conservative
- [ ] Input validation on all external data
- [ ] Error messages don't leak sensitive info

**Ask Agent**:

```
You: "Review security of PathResolver and ToolRegistry.
     What attacks could work?"
Agent: [analyzes, reports findings]
You: [add tests for reported vulnerabilities]
```

### The Anti-Patterns to Avoid

**❌ The Big Bang**:

```
You: "Build an AI agent framework"
Agent: [produces 5000 lines of code]
You: [drowns in review]
```

**✅ The Increment**:

```
You: "Implement step 4.1 in TDD manner"
Agent: [14 tests, clean implementation]
You: [reviews 100 lines]
```

---

**❌ The Assumption**:

```
You: "The logging is too slow, make it async"
Agent: [refactors everything]
Result: Still slow, now has race conditions
```

**✅ The Investigation**:

```
You: "Why is logging slow?"
Agent: [measures, reports]
Agent: [proposes 3 options with tradeoffs]
You: [chooses option 2]
```

---

**❌ The Spec Drift**:

```
You: "Add feature X"
Agent: [implements]
You: "Actually, can you also handle Y?"
Agent: [refactors]
You: "And edge case Z?"
[Repeat 10 times]
```

**✅ The TDD Contract**:

```
You: "Implement X in TDD manner"
Agent: [writes tests including Y and Z]
You: "Good, but also test W"
Agent: [adds test for W]
Agent: [implements to pass all tests]
Result: Feature complete, first try
```

---

**❌ The Comment Rot**:

```typescript
// This function is non-blocking (narrator: it was blocking)
function logActivity() { ... }
```

**✅ The Test Truth**:

```typescript
Deno.test("logActivity batches writes and flushes within 100ms",
  async () => { ... }
);
```

### Pattern 8: Understanding Upstream Dependencies

**The Question**:

```markdown
Me: "Specify what should be in the generated response of the agent"
Agent: [adds XML tags: <thought></thought> and <content></content>]
Me: "Why XML? This format wasn't used before at all."
```

**The Surface Reaction**:
"This seems inconsistent - ExoFrame uses TOML and Markdown everywhere."

**The Actual Context**:

- LLM providers (Anthropic Claude, etc.) already use XML-like tags for structured outputs
- `<thinking>` tags are a common pattern in Claude's extended thinking mode
- Using the same format the LLM naturally produces = less parsing friction
- ExoFrame _services_ may use different formats internally, but _LLM communication_ follows LLM conventions

**The Lesson**:

- **Don't assume inconsistency is wrong** - it might be intentional integration with external systems
- When something seems "out of place," ask _why_ before criticizing
- Upstream dependencies (LLM provider conventions) trump internal consistency
- Different layers can have different format conventions (storage vs. wire format)

**The Right Questions**:

```
❌ "Why are we using XML? We use Markdown everywhere."
✅ "What format do LLM providers use for structured responses?"
✅ "Is this XML format what Claude/GPT already outputs?"
✅ "Would using Markdown require extra transformation?"
```

**Why This Matters**:

- **Integration friction**: Converting XML → Markdown → XML adds complexity
- **LLM native format**: Models are trained on XML-like structure tags
- **Industry convention**: `<thought>` tags are emerging as a standard for Chain-of-Thought
- **Future compatibility**: Other LLM providers will likely adopt similar conventions

**The Pattern**:

```typescript
// LLM generates (native format):
const llmResponse = `
<thought>
I need to analyze the request and check security boundaries...
</thought>
<content>
Here is the proposed solution...
</content>
`;

// Parse using the format LLMs already produce
const parsed = parseStructuredResponse(llmResponse);
// { thought: "...", content: "..." }
```

**The Broader Lesson**:
When integrating with external systems (LLM providers, APIs, databases), prefer _their_ conventions over internal consistency. The boundary layer should speak the external language, even if it differs from your internal format.

**The Rule**: Format choices at integration boundaries should optimize for the external system, not internal aesthetics.

### Pattern 9: Comprehensive Activity Logging

**The Audit Requirement**:

```markdown
Me: "Never forget that any manipulations with files like creation,
modification, copying, moving, removing should always properly
traced in activity table."
```

**The Audit**:

- Searched entire codebase for file operations
- Found `ContextCardGenerator` was writing files but _not_ logging
- Found `DatabaseService` existed but wasn't being used by all modules
- Found `main.ts` had file watcher events but no logging

**The Pattern** (Agent-Implemented):

```typescript
// Centralized logging service
export class DatabaseService {
  logActivity(actor: string, actionType: string, target: string, payload: Record<string, unknown>, traceId?: string) {
    // Logs to activity table with timestamp
  }
}

// Every service that touches files injects DatabaseService
export class ContextCardGenerator {
  constructor(config: Config, db?: Database) {
    this.db = db;
  }

  async generate(info: PortalInfo) {
    await Deno.writeTextFile(cardPath, content);
    // Always log file operations
    this.logActivity(
      isUpdate ? "context_card.updated" : "context_card.created",
      { alias, file_path, tech_stack },
    );
  }
}
```

**The Logging Checklist**: Every module that does ANY of these must inject DatabaseService:

- ✅ `Deno.writeTextFile` → log `*.created` or `*.updated`
- ✅ `Deno.remove` → log `*.deleted`
- ✅ `Deno.rename` → log `*.moved`
- ✅ `Deno.copyFile` → log `*.copied`
- ✅ `Deno.mkdir` → log `directory.created`

**The Verification Pattern**:

```
You: "Check implementation of all current modules including context
     card generator"
Agent: [audits FileWatcher, FrontmatterParser, ContextCardGenerator]
Agent: "Found: ContextCardGenerator writes files but doesn't log. Adding..."
```

**Why This Works**:

- Audit trail for debugging ("Who created this file?")
- Compliance (track all modifications)
- Multi-agent coordination (see what other agents did)
- User transparency (show what the system is doing)

**The Implementation**:

1. Created `src/services/db.ts` as central logging service
2. Updated all file-writing services to inject `Database?` (optional for tests)
3. Added logging calls after every file operation
4. Added test coverage for logging behavior

**The Result**: Complete audit trail. Every file touch is logged with:

- `actor` (which service/agent)
- `action_type` (created/updated/deleted)
- `target` (file path or identifier)
- `payload` (metadata like size, content summary)
- `timestamp` (when it happened)

### Pattern 10: Timestamp Precision

**The Requirement**:

```markdown
Me: "The activity table must contain astro time of when the event
has happened."
```

**The Problem**:

- Database schema had `timestamp DATETIME DEFAULT (datetime('now'))`
- This works for _database insertion time_
- But doesn't capture _application event time_ precisely
- Difference matters for distributed systems or batch operations

**The Fix**:

```typescript
// Before: Relied on DB default
this.db.exec(
  `INSERT INTO activity (id, trace_id, actor, action_type, target, payload)
   VALUES (?, ?, ?, ?, ?, ?)`,
  [activityId, traceId, actor, actionType, target, JSON.stringify(payload)],
);

// After: Explicit timestamp from application
const timestamp = new Date().toISOString();
this.db.exec(
  `INSERT INTO activity (id, trace_id, actor, action_type, target, payload, timestamp)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [activityId, traceId, actor, actionType, target, JSON.stringify(payload), timestamp],
);
```

**Where This Was Applied**:

- `src/services/db.ts` (DatabaseService)
- `src/services/context_card_generator.ts`
- `src/parsers/markdown.ts` (FrontmatterParser)

**Why Explicit Timestamps Matter**:

- **Batch operations**: Log 100 events, all get same DB insertion time but different event times
- **Distributed agents**: Event happened on Agent A at T1, logged to DB at T2
- **Replay/debugging**: Need exact event sequence, not when DB saw it
- **Auditing**: Legal/compliance requires event time, not log time

**The Lesson**:

- Database defaults are convenient but may not capture what you need
- Activity timestamps should reflect _when the event happened_, not _when it was logged_
- ISO 8601 format (`new Date().toISOString()`) is portable and sortable
- This matters more as the system scales

**The Testing Pattern**:

```typescript
Deno.test("ContextCardGenerator: logs activity with timestamp", async () => {
  const beforeTime = new Date().toISOString();
  await generator.generate({ alias: "Test", path: "/test", techStack: [] });
  const afterTime = new Date().toISOString();

  const rows = db.prepare("SELECT timestamp FROM activity").all();
  const loggedTime = rows[0].timestamp;

  // Timestamp is between before and after (proves it's application time)
  assert(loggedTime >= beforeTime && loggedTime <= afterTime);
});
```

### Pattern 11: Incremental Elaboration (The Zooming Technique)

**The Discovery**: Implementation descriptions are _never_ detailed enough on first pass.

**The Multi-Stage Refinement**:

**Stage 1: Initial Write** (Too vague)

```markdown
### Step 3.2: The Agent Runtime

- Implement AgentRunner
- Success: Can execute requests
```

**Stage 2: First Elaboration** (Better, but still gaps)

```markdown
You: "Elaborate step 3.2 of Implementation Plan"
Agent: [adds problem statement, solution, example code, checklist]

### Step 3.2: The Agent Runtime

**Problem**: Need to combine Blueprint + Request
**Solution**: AgentRunner class with run() method
**Checklist**: [3 items]
**Success Criteria**: [4 tests]
```

**Stage 3: User Questions Refinement** (Filling gaps)

```markdown
You: "Specify what should be in the generated response of the agent"
Agent: [adds response format specification]
Agent: [updates checklist with parsing logic]
Agent: [adds test for response parsing]
```

**The Elaboration Trajectory**:

```
Brief bullet → Detailed spec → User questions → Even more detail → Implementation

"Build X" → "Build X with Y requirements" → "What about Z?" → "X with Y and Z" → Code
```

**The Pattern**:

1. **Initial Plan**: High-level steps (1-2 sentences each)
2. **First Elaboration**: Add problem/solution/criteria (triggered by user)
3. **User Discovers Gaps**: "Wait, what about response format?"
4. **Second Elaboration**: Agent fills specific gaps
5. **Implementation**: Now spec is complete enough

**Why This Works**:

- You can't know all requirements up front
- Implementation reveals questions
- Iterative refinement is faster than trying to be perfect initially
- Each round adds 20-30% more clarity

**The Question Triggers** (patterns that drive elaboration):

- "Specify what should be in X"
- "How will we handle Y?"
- "What format should Z use?"
- "Why did you choose A instead of B?"
- "Does this match our existing patterns?"

**The Meta-Lesson**:
Refinement isn't a phase—it's a continuous process. Be ready to elaborate:

- _Before_ implementation (planned refinement)
- _During_ design review (answering questions)
- _After_ user feedback (filling gaps)

**The Efficiency Gain**:

- Trying to write perfect spec up front: 4 hours, still has gaps
- Iterative elaboration: 30min + 15min + 10min = 55min, more complete

**The Rule**: Treat implementation plans as living documents that grow in detail as understanding deepens.

## Part IX: The Human Skills That Matter

### What AI Didn't Replace

**1. Product Vision**

- AI can critique, but you decide _what to build_
- The Implementation Plan came from human insight
- The "why" still requires human judgment

**2. Architectural Taste**

- "Should this be batched?" requires understanding tradeoffs
- AI proposes options, you choose based on values (latency vs. throughput)

**3. Security Paranoia**

- AI will implement security if you specify it
- You must _remember to ask_ for security tests
- The whitelist mindset comes from experience

**4. The Question**

- Good questions unlock good answers
- "Why is this slow?" beats "Make it faster"
- "What's missing?" beats "Looks good"

**5. The Refinement Instinct**

- Knowing when specs are too vague
- Pushing for concrete examples before coding
- Asking "How would we test this?" up front

### What AI Amplified

**1. Implementation Speed**

- TDD cycle: 5-10x faster with AI
- Boilerplate: instant
- Test coverage: more comprehensive than I'd write alone
- Refinement: AI can expand brief specs into detailed requirements

**2. Consistency**

- AI doesn't forget to log actions
- Error handling patterns stay uniform
- Code style is consistent
- Naming conventions enforced naturally

**3. Exhaustive Testing**

- AI writes edge cases I'd skip ("too unlikely")
- Security tests I'd forget
- Integration tests for every permutation

**4. Refactoring Courage**

- With comprehensive tests, changes are safe
- AI handles tedious parts (updating all call sites)
- You focus on design decisions

## Conclusion: The New Collaboration Model

### What We Built

**ExoFrame**: A meta-framework where AI agents collaborate on codebases using:

- Activity Journal (audit trail)
- Tool Registry (safe function calling)
- Git Integration (identity-aware commits)
- Execution Loop (lease-based coordination)
- Human checkpoints (approve/reject/request-changes)

**Built With**: The same patterns it enables. We ate our own dog food before the kitchen passed inspection.

### What We Learned

**The Partnership**:

- Humans: vision, taste, questions, decisions
- AI: investigation, implementation, testing, consistency
- Together: faster than either alone

**The Process**:

- TDD isn't optional, it's the contract
- Questions beat commands
- Configuration beats hardcoding
- Tests are the real documentation

**The Surprise**:
Building a system for AI agents _with_ AI agents revealed exactly what agents need:

- Structured communication (Activity Journal)
- Safe tools (ToolRegistry with validation)
- Identity (agent_id tracking)
- Human oversight (approval workflow)

### The Future

**For Developers**:
This playbook isn't ExoFrame-specific. Apply it to:

- Web applications
- CLI tools
- Infrastructure automation
- Any software you'd normally build

**The Shift**:
From "I write code with AI assistance"
To "I architect systems that AI implements"

Your job isn't writing lines—it's asking the right questions, making the right decisions, and verifying the results with tests.

### The Meta-Achievement

We set out to build a framework for humans and AI to collaborate on software projects.

We succeeded by proving the collaboration works _while building the collaboration framework itself_.

The system we built to enable AI-human teamwork was built by AI-human teamwork.

That's not just irony—it's validation.

---

## Appendix: Quick Reference

### The Essential Patterns

| Pattern                       | Command                                                | Result                                         |
| ----------------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| **Design Review**             | "Review these docs. What's wrong?"                     | AI critiques design pre-implementation         |
| **Refinement**                | "Refine Phase X steps with success criteria"           | Expands brief specs into detailed requirements |
| **Walking Skeleton**          | "Build minimal end-to-end flow"                        | Demo-able system from day 1                    |
| **TDD Feature**               | "Implement step X in TDD manner"                       | Tests first, implementation follows            |
| **Coverage Target**           | "Implement in TDD manner. Achieve 70% branch coverage" | Measurable test quality                        |
| **Performance Investigation** | "Why is X slow?"                                       | Measurement, not guessing                      |
| **Configuration**             | "Make X configurable"                                  | Replaces magic numbers with schema             |
| **Security Audit**            | "What attacks could work on Y?"                        | AI proposes vulnerabilities to test            |
| **Code Archaeology**          | "Is X actually used anywhere?"                         | Find zombie code                               |
| **Test Deduplication**        | "Check if there are test duplications"                 | Consolidate scattered tests                    |
| **Activity Logging Audit**    | "Verify every CLI command is traced in activity log"   | Complete audit trail                           |
| **Full Verification**         | "Run all tests"                                        | Verify nothing broke                           |

### The Question Templates

**Before Implementing**:

- "Refine all steps in Phase X with success criteria, examples, and test requirements"
- "What's missing from this spec?"
- "What edge cases should we handle?"
- "What could go wrong?"
- "How would we test this?"

**During Implementation**:

- "Why is X behaving like Y?"
- "What are the tradeoffs between options A, B, C?"
- "How should we test this?"
- "What does 'done' look like for this feature?"

**After Implementation**:

- "What did we forget to test?"
- "What could be simplified?"
- "What's no longer used?"

### Pattern 12: Coverage-Driven TDD

**The Target**: Minimum 70% branch coverage on all new features.

**The Request Pattern**:

```
You: "Proceed with implementation in TDD manner. Try to achieve 70% in branch coverage."
Agent: [writes comprehensive test suite]
Agent: [implements feature]
Agent: [runs coverage report]
Agent: "Branch coverage: 84.2%"
```

**Real Results from ExoFrame**:

| Feature         | Tests | Branch Coverage |
| --------------- | ----- | --------------- |
| Portal Commands | 31    | 84.2%           |
| MissionReporter | 28    | 83.3%           |
| GitService      | 11    | 78.4%           |
| ToolRegistry    | 14    | 82.1%           |

**The Coverage Request**:

```
You: "Run tests with coverage for src/cli/portal_commands.ts"
Agent: [runs deno test --coverage]
Agent: [generates lcov report]
Agent: "Branch coverage: 84.2% (target: 70%)"
```

**Why Branch Coverage Matters**:

- Line coverage misses untested branches (if/else paths)
- Branch coverage catches conditional logic gaps
- 70% minimum ensures edge cases are tested
- Higher coverage = safer refactoring

**The Coverage Improvement Loop**:

```
1. Run coverage report
2. Identify uncovered branches
3. Add tests for those branches
4. Verify coverage increased
5. Repeat until target met
```

**The Anti-Pattern**:

```
❌ "Add tests to improve coverage" (vague)
✅ "Add test for the else branch on line 145 where config is undefined"
```

### Pattern 13: Test Organization and Deduplication

**The Discovery**:

```
You: "Run all tests"
Agent: [runs tests]
Agent: "Found 305 tests"
You: "Check if there is some tests duplications"
Agent: [searches test files]
Agent: "Found duplicate tests in tests/daemon_commands_test.ts and 
        tests/cli/daemon_commands_test.ts"
```

**The Problem**:

- Tests scattered across multiple locations
- Same functionality tested twice
- Inconsistent test patterns

**The Solution**:

```
You: "Move unique tests from tests/foo_test.ts to tests/cli/foo_test.ts 
     and delete the duplicate file"
Agent: [identifies unique tests]
Agent: [merges into canonical location]
Agent: [removes duplicate file]
Agent: [runs full test suite to verify]
```

**The Result**:

```
Before: 305 tests (with duplicates)
After:  278 tests (consolidated, all passing)
```

**The Test Organization Pattern**:

```
tests/
├── cli/                    # CLI command tests
│   ├── daemon_commands_test.ts
│   ├── portal_commands_test.ts
│   └── plan_commands_test.ts
├── helpers/                # Test utilities
│   ├── config.ts
│   └── db.ts
├── services/               # Service unit tests
│   ├── db_test.ts
│   └── git_service_test.ts
└── integration/            # E2E tests
```

**The Deduplication Checklist**:

1. Search for similar test file names across directories
2. Compare test case names for duplicates
3. Identify unique vs. redundant tests
4. Merge unique cases into canonical location
5. Delete duplicate files
6. Run full suite to verify nothing broke

### Pattern 14: CLI Activity Logging Audit

**The Audit Trigger**:

```
You: "Verify that every exoctl CLI command call correctly traced in activity log"
Agent: [creates comprehensive audit report]
```

**The Audit Report Format**:

```markdown
## CLI Activity Logging Verification Report

### Commands with Complete Logging ✅

| Command | Actions Logged |
| plan create | plan.created |
| portal add | portal.added |
| changeset apply | changeset.applied |

### Commands Missing Logging ❌

| Command | Issue |
| daemon start | No logging |
| daemon stop | No logging |
| daemon restart | No logging |
```

**The Fix Pattern**:

```
You: "Yes, update daemon commands"
Agent: [adds logDaemonActivity() helper]
Agent: [adds daemon.started, daemon.stopped, daemon.restarted events]
Agent: [updates tests to verify logging]
```

**The Activity Logging Checklist**:

Every CLI command that modifies state must log:

- ✅ `command.action` event type (e.g., `daemon.started`)
- ✅ Actor: `"human"` for CLI operations
- ✅ Via: `"cli"` in payload
- ✅ Timestamp: ISO 8601 format
- ✅ Relevant context (PID, file paths, method)

**The Verification Test Pattern**:

```typescript
it("should log daemon.started to activity journal", async () => {
  await daemonCommands.start();
  await db.waitForFlush();

  const logs = db.instance.prepare(
    "SELECT * FROM activity WHERE action_type = ?",
  ).all("daemon.started");

  assertEquals(logs.length, 1);
  const payload = JSON.parse(logs[0].payload);
  assertExists(payload.pid);
  assertEquals(payload.via, "cli");
  assertExists(payload.timestamp);
});
```

**Why This Matters**:

- Complete audit trail for all user actions
- Debugging multi-step operations
- Compliance and accountability
- Understanding system behavior

### Pattern 15: Test Database Setup

**The Discovery**:

```
Agent: [runs tests]
Error: "no such table: activity"
```

**The Problem**:

- Test was querying activity table
- Test setup didn't initialize the table
- Other tests worked because they used `initTestDbService()`

**The Lesson**: When adding tests that use database features, ensure proper setup.

**The Helper Pattern**:

```typescript
// tests/helpers/db.ts
export async function initTestDbService(): Promise<{
  db: DatabaseService;
  tempDir: string;
  cleanup: () => Promise<void>;
}> {
  const tempDir = await Deno.makeTempDir({ prefix: "exo-test-" });
  const config = createMockConfig(tempDir);
  const db = new DatabaseService(config);

  // Initialize required tables
  db.instance.exec(`
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      agent_id TEXT,
      action_type TEXT NOT NULL,
      target TEXT,
      payload TEXT NOT NULL,
      timestamp DATETIME DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_activity_trace ON activity(trace_id);
  `);

  return { db, tempDir, cleanup: async () => { ... } };
}
```

**The Test Setup Pattern**:

```typescript
// Option 1: Use shared helper
const { db, cleanup } = await initTestDbService();

// Option 2: Inline table creation (for specific tests)
beforeEach(async () => {
  db = new DatabaseService(config);
  db.instance.exec(`
    CREATE TABLE IF NOT EXISTS activity (...);
  `);
});
```

**The Database Test Checklist**:

- ✅ Initialize required tables in test setup
- ✅ Use in-memory database for isolation (`:memory:`)
- ✅ Clean up temp directories in `afterEach`
- ✅ Wait for async operations (`db.waitForFlush()`)
- ✅ Use shared helpers for common setup

### The Test Checklist

Every feature needs tests for:

- ✅ Happy path (works as expected)
- ✅ Sad path (fails gracefully)
- ✅ Edge cases (empty, null, huge, tiny)
- ✅ Security boundaries (injection, traversal, escalation)
- ✅ Error handling (network, filesystem, validation)
- ✅ Integration (works with existing code)
- ✅ Performance (meets requirements)
- ✅ Activity logging (operations traced)

### The Success Metrics

**You know it's working when**:

- Implementation steps have concrete success criteria before coding
- You can demo working features every week
- You review tests, not implementation
- Changes don't break existing functionality
- Security tests exist before vulnerabilities
- Configuration options grow over time
- Tests serve as documentation
- You trust the test suite
- Branch coverage meets targets (70%+ minimum)
- All CLI commands have activity logging
- No duplicate test files exist

**You know it's not working when**:

- Specs say "implement X" without explaining what "done" means
- First demo is in month 3
- You're rewriting implementations repeatedly
- Tests are added after bugs are found
- Changes cascade unpredictably
- You're afraid to refactor
- Comments contradict code
- Manual testing is required
- Coverage is unknown or unmeasured
- Operations happen without audit trail

### The Refinement Red Flags vs. Green Lights

**❌ Needs Refinement**:

- "Handle errors appropriately"
- "Make it fast"
- "Implement feature X"
- "Add validation"
- "Should be secure"

**✅ Implementation-Ready**:

- "Throw Error with message 'nothing to commit' when working tree is clean"
- "Batch writes with 100ms flush interval (configurable via config.database.batch_flush_ms)"
- "Implement read_file tool that validates paths through PathResolver and logs to Activity Journal"
- "Reject inputs with zod schema, return validation errors in structured format"
- "Whitelist commands: [echo, git, deno], block all others including rm, dd, chmod"

**The Test**: If you can't write a test case from the description, it needs refinement.

---

_Written from the trenches of the ExoFrame project, where the builders were also the users, and the documentation wrote itself (with a little help from the AI we were building the framework for)._

_The recursion continues._
